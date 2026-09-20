import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import {
  doc,
  TABLE,
  getMember,
  putItem,
  memberKey,
  newIncidentId,
  INCIDENT_TTL_DAYS,
} from "./shared/db.mjs";
import { ok, bad, parseBody, bearer } from "./shared/http.mjs";
import { updateBaseline } from "./shared/baseline.mjs";
import { describe } from "./shared/severity.mjs";
import { narrate } from "./shared/narrate.mjs";
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

/**
 * Plausible past days, so the week strip has something true-shaped to show.
 * These are fixtures and say so; only today is written live. Seeding a week of
 * model calls would cost six Bedrock invocations to show the judge one thing.
 */
const SEED_DAYS = [
  { back: 6, at: '7:20 am', tail: 'a walk before the heat' },
  { back: 5, at: '7:35 am', tail: 'a trip to the shop' },
  { back: 4, quiet: true },
  { back: 3, at: '7:15 am', tail: '1,100 steps' },
  { back: 2, at: '7:40 am', tail: 'phone on charge by evening' },
  { back: 1, at: '7:25 am', tail: 'a trip to the shop' },
];

/** The name is hers, not a placeholder. A seeded week that calls everyone Amma reads as broken. */
const seededNarrative = (day, name) =>
  day.quiet
    ? `Quiet day for ${name} - the phone barely moved. Probably nothing.`
    : `${name}'s day looked normal - up around ${day.at}, ${day.tail}.`;

/**
 * Today's sentence is written by Bedrock during the demo, not canned. The whole
 * claim of the product is that a person reads one honest sentence; a judge who
 * only ever sees fixture text has not seen the product work.
 */
async function narrateToday(member) {
  const summary = {
    weekday: new Intl.DateTimeFormat('en-IN', { timeZone: member.tz, weekday: 'long' }).format(
      new Date()
    ),
    firstActivityAt: '7:30 am',
    steps: 1800,
    transactions: 1,
    charged: true,
    lastSeenAt: '9:10 pm',
  };
  const { text, source } = await narrate(summary, member.name);
  return { summary, text, source };
}

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
  const today = await narrateToday(member);

  await Promise.all([
    ...SEED_DAYS.map((day) =>
      putItem({
        pk: `MEM#${member.memberId}`,
        sk: `DAY#${localDate(new Date(now - day.back * DAY_MS), member.tz)}`,
        narrative: seededNarrative(day, member.name),
        firstActivityAt: day.quiet ? null : day.at,
        steps: day.quiet ? 0 : 900,
        seeded: true,
        createdAt: new Date().toISOString(),
      })
    ),
    putItem({
      pk: `MEM#${member.memberId}`,
      sk: `DAY#${localDate(new Date(now), member.tz)}`,
      ...today.summary,
      narrative: today.text,
      createdAt: new Date().toISOString(),
    }),
  ]);

  return {
    seeded: baseline.samples.length,
    days: SEED_DAYS.length + 1,
    usuallyUpAt: baseline.firstActivityMedian,
    today: today.text,
    // Named honestly so a fallback can never pass as the model's work.
    writtenBy: today.source,
  };
}

async function forceAnomaly(member, waitSeconds, severity = "late") {
  const at = new Date();
  const incidentId = newIncidentId(at);
  const now = at.toISOString();

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
    ttl: Math.floor(at.getTime() / 1000) + INCIDENT_TTL_DAYS * 24 * 3600,
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
