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

const sfn = new SFNClient({});
const LADDER_ARN = process.env.LADDER_ARN;
const STEP_WAIT_SECONDS = Number(process.env.STEP_WAIT_SECONDS ?? 1200);

/**
 * Runs on a fixed interval and asks one question per person: by now, on an
 * ordinary day for this particular person, would we have heard something?
 *
 * Nothing here reacts to an event. The whole system turns on the absence of one,
 * which is why it needs a clock rather than a handler.
 */
async function evaluate(member) {
  const now = new Date();
  const tz = member.tz;

  if (member.travelUntil && member.travelUntil > now.toISOString()) {
    return { memberId: member.memberId, skipped: "travel mode" };
  }

  const expectedBy = expectedByMinutes(member.baseline);
  if (expectedBy == null) {
    return { memberId: member.memberId, skipped: "still learning routine" };
  }

  const nowMinutes = localMinutes(now, tz);
  if (nowMinutes < Math.min(expectedBy, 1439)) {
    return { memberId: member.memberId, skipped: "too early to worry" };
  }

  const signals = await recentSignals(member.memberId, startOfLocalDay(now, tz));
  if (firstWakingSignal(signals, tz)) {
    return { memberId: member.memberId, skipped: "already up today" };
  }

  if (await openIncident(member.memberId)) {
    return { memberId: member.memberId, skipped: "already checking" };
  }

  const incidentId = randomUUID();
  await putItem({
    pk: `MEM#${member.memberId}`,
    sk: `INC#${incidentId}`,
    incidentId,
    memberId: member.memberId,
    status: "open",
    reason: "no activity by the usual time",
    expectedByMinutes: expectedBy,
    openedAt: now.toISOString(),
  });

  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: LADDER_ARN,
      name: `inc-${incidentId}`,
      input: JSON.stringify({
        memberId: member.memberId,
        incidentId,
        waitSeconds: STEP_WAIT_SECONDS,
      }),
    })
  );

  return { memberId: member.memberId, opened: incidentId };
}

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
