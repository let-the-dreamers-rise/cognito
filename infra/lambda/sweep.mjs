import { randomUUID } from "node:crypto";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import {
  listParents,
  recentSignals,
  putItem,
  openIncident,
} from "./shared/db.mjs";
import { localMinutes, startOfLocalDay } from "./shared/time.mjs";
import { expectedByMinutes, firstWakingSignal } from "./shared/baseline.mjs";
import { assess, waitSecondsFor, isCritical, describe } from "./shared/severity.mjs";

const sfn = new SFNClient({});
const LADDER_ARN = process.env.LADDER_ARN;

/**
 * Runs on a fixed interval and asks one question per person: given what we know
 * of this particular person, is anything wrong right now?
 *
 * Nothing here reacts to an event. The whole system turns on the absence of
 * one, which is why it needs a clock rather than a handler.
 */
async function evaluate(member) {
  const now = new Date();
  const tz = member.tz;

  // Travel mode is suspended for the long silences. A trip explains a late
  // morning; it does not explain two days without touching a phone.
  const travelling = member.travelUntil && member.travelUntil > now.toISOString();

  const signals = await recentSignals(member.memberId, startOfLocalDay(now, tz));
  const severity = assess({
    member,
    now,
    expectedBy: expectedByMinutes(member.baseline),
    nowMinutes: localMinutes(now, tz),
    sawWakingToday: Boolean(firstWakingSignal(signals, tz)),
  });

  if (!severity) return { memberId: member.memberId, skipped: "nothing wrong" };
  if (travelling && !isCritical(severity)) {
    return { memberId: member.memberId, skipped: "travel mode", severity };
  }

  const existing = await openIncident(member.memberId);

  // An open incident is not a reason to stay quiet if things have got worse.
  // A late morning that becomes a two-day silence must be raised again.
  if (existing && !isWorse(severity, existing.severity)) {
    return { memberId: member.memberId, skipped: "already checking", severity };
  }

  const incidentId = randomUUID();
  await putItem({
    pk: `MEM#${member.memberId}`,
    sk: `INC#${incidentId}`,
    incidentId,
    memberId: member.memberId,
    status: "open",
    severity,
    reason: describe(severity, member.name),
    lastWakingAt: member.lastWakingAt ?? null,
    lastSeenAt: member.lastSeenAt ?? null,
    openedAt: now.toISOString(),
  });

  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: LADDER_ARN,
      name: `inc-${incidentId}`,
      input: JSON.stringify({
        memberId: member.memberId,
        incidentId,
        severity,
        waitSeconds: waitSecondsFor(severity),
      }),
    })
  );

  return { memberId: member.memberId, opened: incidentId, severity };
}

const RANK = ["late", "silent12", "deviceDark", "critical24", "critical48"];
const isWorse = (next, current) =>
  RANK.indexOf(next) > RANK.indexOf(current ?? "late");

export async function handler() {
  const parents = await listParents();
  const results = await Promise.all(
    parents.map((m) =>
      evaluate(m).catch((err) => {
        console.error("sweep failed for member", m.memberId, err);
        return { memberId: m.memberId, error: String(err) };
      })
    )
  );

  console.log(JSON.stringify({ checked: parents.length, results }));
  return { checked: parents.length, results };
}
