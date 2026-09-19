import { randomUUID } from "node:crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { doc, TABLE, getMember, putItem, memberKey } from "./shared/db.mjs";
import { ok, bad, parseBody, bearer } from "./shared/http.mjs";
import { updateBaseline } from "./shared/baseline.mjs";
import { describe } from "./shared/severity.mjs";
import { localDate } from "./shared/time.mjs";

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

const DAY_MS = 86_400_000;

/** Plausible past days, so the week strip has something true-shaped to show. */
const SEED_DAYS = [
  { back: 6, narrative: "Amma's day looked normal - up around 7:20, a walk before the heat." },
  { back: 5, narrative: "Amma's day looked normal - up around 7:35, a trip to the shop." },
  { back: 4, narrative: "Quiet day - the phone barely moved. Probably nothing.", quiet: true },
  { back: 3, narrative: "Amma's day looked normal - up around 7:15, 1,100 steps." },
  { back: 2, narrative: "Amma's day looked normal - up around 7:40, phone on charge by evening." },
  { back: 1, narrative: "Amma's day looked normal - up around 7:25, a trip to the shop." },
  // Today, so both sides have the same sentence to show before the nightly
  // summary has had a chance to run. The real job overwrites this at 21:00.
  { back: 0, narrative: "Amma's day looked normal - up around 7:30, out to the shop, back by nine." },
];

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

  const now = Date.now();
  await Promise.all(
    SEED_DAYS.map((day) =>
      putItem({
        pk: `MEM#${member.memberId}`,
        sk: `DAY#${localDate(new Date(now - day.back * DAY_MS), member.tz)}`,
        narrative: day.narrative,
        firstActivityAt: day.quiet ? null : "7:30 am",
        steps: day.quiet ? 0 : 900,
        seeded: true,
        createdAt: new Date().toISOString(),
      })
    )
  );

  return {
    seeded: baseline.samples.length,
    days: SEED_DAYS.length,
    usuallyUpAt: baseline.firstActivityMedian,
  };
}

async function forceAnomaly(member, waitSeconds, severity = "late") {
  const incidentId = randomUUID();
  const now = new Date().toISOString();

  await putItem({
    pk: `MEM#${member.memberId}`,
    sk: `INC#${incidentId}`,
    incidentId,
    memberId: member.memberId,
    status: "open",
    severity,
    reason: describe(severity, member.name),
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
        severity,
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
      return ok(await forceAnomaly(member, body.waitSeconds, body.severity));
    }
    return bad(404, "unknown demo route");
  } catch (err) {
    console.error("demo route failed", err);
    return bad(500, "demo action failed");
  }
}
