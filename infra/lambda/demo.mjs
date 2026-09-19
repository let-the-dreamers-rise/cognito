import { randomUUID } from "node:crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { doc, TABLE, getMember, putItem, memberKey } from "./shared/db.mjs";
import { ok, bad, parseBody, bearer } from "./shared/http.mjs";
import { updateBaseline } from "./shared/baseline.mjs";

const sfn = new SFNClient({});
const LADDER_ARN = process.env.LADDER_ARN;

/**
 * Demo controls. A real escalation waits twenty minutes a rung, which is correct
 * for a morning and useless on camera, so the wait is an input to the execution
 * rather than baked into the state machine.
 */
const DEMO_WAIT_SECONDS = 12;

/** Four plausible mornings, so the baseline is real rather than "still learning". */
const SEED_WAKE_MINUTES = [440, 455, 430, 465, 445, 450];

async function seedBaseline(member) {
  const baseline = SEED_WAKE_MINUTES.reduce(
    (acc, minutes) => updateBaseline(acc, minutes),
    member.baseline
  );

  await doc.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: memberKey(member.memberId),
      UpdateExpression: "SET baseline = :b",
      ExpressionAttributeValues: { ":b": baseline },
    })
  );

  return { seeded: baseline.samples.length, usuallyUpAt: baseline.firstActivityMedian };
}

async function forceAnomaly(member, waitSeconds) {
  const incidentId = randomUUID();
  const now = new Date().toISOString();

  await putItem({
    pk: `MEM#${member.memberId}`,
    sk: `INC#${incidentId}`,
    incidentId,
    memberId: member.memberId,
    status: "open",
    reason: "no activity by the usual time",
    openedAt: now,
    demo: true,
  });

  const execution = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: LADDER_ARN,
      name: `demo-${incidentId}`,
      input: JSON.stringify({
        memberId: member.memberId,
        incidentId,
        waitSeconds: waitSeconds ?? DEMO_WAIT_SECONDS,
      }),
    })
  );

  return { incidentId, executionArn: execution.executionArn };
}

export async function handler(event) {
  const body = parseBody(event);
  if (body === null) return bad(400, "invalid JSON body");

  const member = await getMember(body.memberId);
  if (!member) return bad(404, "unknown member");
  if (member.deviceToken !== bearer(event)) return bad(403, "bad device token");

  const path = event?.rawPath ?? "";

  try {
    if (path.endsWith("/demo/seed")) return ok(await seedBaseline(member));
    if (path.endsWith("/demo/anomaly")) {
      return ok(await forceAnomaly(member, body.waitSeconds));
    }
    return bad(404, "unknown demo route");
  } catch (err) {
    console.error("demo route failed", err);
    return bad(500, "demo action failed");
  }
}
