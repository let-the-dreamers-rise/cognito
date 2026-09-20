import {
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
} from "@aws-sdk/client-sfn";
import {
  listParents,
  putItem,
  openIncident,
  setIncidentStatus,
  newIncidentId,
  INCIDENT_TTL_DAYS,
} from "./shared/db.mjs";
import { localMinutes, startOfLocalDay } from "./shared/time.mjs";
import { expectedByMinutes } from "./shared/baseline.mjs";
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

  // lastWakingAt already holds the latest signal only a person could make, so
  // asking whether one happened today is a comparison, not a query. Reading a
  // day of signals per member per sweep was the single largest cost and the
  // first thing that would have failed at scale.
  const severity = assess({
    member,
    now,
    expectedBy: expectedByMinutes(member.baseline),
    nowMinutes: localMinutes(now, tz),
    sawWakingToday: Boolean(
      member.lastWakingAt && member.lastWakingAt >= startOfLocalDay(now, tz)
    ),
  });

  if (!severity) return { memberId: member.memberId, skipped: "nothing wrong" };
  if (travelling && !isCritical(severity)) {
    return { memberId: member.memberId, skipped: "travel mode", severity };
  }

  const existing = await openIncident(member.memberId, now);

  // An open incident is not a reason to stay quiet if things have got worse.
  // A late morning that becomes a two-day silence must be raised again.
  if (existing && !isWorse(severity, existing.severity)) {
    return { memberId: member.memberId, skipped: "already checking", severity };
  }

  // It has got worse. Retire the running ladder before starting a sterner one,
  // or two executions nudge, ring and text the neighbour independently for a
  // single absence - which is the cry-wolf behaviour this design exists to
  // avoid.
  if (existing) {
    await setIncidentStatus(member.memberId, existing.incidentId, "superseded", {
      supersededBy: severity,
    });
    if (existing.executionArn) {
      await sfn
        .send(
          new StopExecutionCommand({
            executionArn: existing.executionArn,
            cause: `Superseded by a more serious assessment: ${severity}`,
          })
        )
        .catch((err) => console.error("could not stop superseded execution", err));
    }
  }

  const incidentId = newIncidentId(now);
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
    supersedes: existing?.incidentId ?? null,
    ttl: Math.floor(now.getTime() / 1000) + INCIDENT_TTL_DAYS * 24 * 3600,
  });

  const execution = await sfn.send(
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

  // Recorded so a later, more serious assessment can stop this ladder rather
  // than run a second one alongside it.
  await setIncidentStatus(member.memberId, incidentId, "open", {
    executionArn: execution.executionArn,
  });

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
