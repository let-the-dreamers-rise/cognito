import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  doc,
  TABLE,
  listParents,
  recentSignals,
  watchersOf,
  putItem,
  memberKey,
} from "./shared/db.mjs";
import { pushToExpo } from "./shared/push.mjs";
import {
  startOfLocalDay,
  localDate,
  formatLocalTime,
} from "./shared/time.mjs";
import {
  firstWakingSignal,
  updateBaseline,
  isLearning,
  stepsToday,
} from "./shared/baseline.mjs";

const bedrock = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID;

const PROMPT = `You write one sentence a day for someone whose parent lives alone far away.

Rules:
- Exactly one sentence, under 25 words. Warm, plain, unhurried.
- Report only the facts given. Never invent an activity, a mood, or a health claim.
- Never use the words monitor, track, detect, alert, or data.
- If the facts are thin, say so honestly rather than reassuring falsely.

Write the sentence and nothing else.`;

function facts(summary, name) {
  const lines = [`Name: ${name}`, `Day: ${summary.weekday}`];
  if (summary.firstActivityAt) lines.push(`First picked up her phone: ${summary.firstActivityAt}`);
  if (summary.steps > 0) lines.push(`Steps: ${summary.steps}`);
  if (summary.transactions > 0) lines.push(`Paid for something at a shop: ${summary.transactions} time(s)`);
  if (summary.charged) lines.push("Phone was put on charge in the evening, as usual");
  if (summary.lastSeenAt) lines.push(`Last used her phone: ${summary.lastSeenAt}`);
  if (!summary.firstActivityAt) lines.push("No sign of her using the phone at all today");
  return lines.join("\n");
}

/** If Bedrock is unreachable the day still gets its sentence. The demo never dies here. */
function fallbackNarrative(summary, name) {
  if (!summary.firstActivityAt) {
    return `Quiet day for ${name} - the phone barely moved. Probably nothing, but you might call.`;
  }
  const parts = [`up around ${summary.firstActivityAt}`];
  if (summary.transactions > 0) parts.push("a trip to the shop");
  if (summary.steps > 0) parts.push(`${summary.steps.toLocaleString("en-IN")} steps`);
  if (summary.charged) parts.push("phone on charge by evening");
  return `${name}'s ${summary.weekday} looked normal - ${parts.join(", ")}.`;
}

async function narrate(summary, name) {
  if (!MODEL_ID) return fallbackNarrative(summary, name);
  try {
    const res = await bedrock.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: PROMPT }],
        messages: [{ role: "user", content: [{ text: facts(summary, name) }] }],
        inferenceConfig: { maxTokens: 120, temperature: 0.4 },
      })
    );
    const text = res.output?.message?.content?.[0]?.text?.trim();
    return text || fallbackNarrative(summary, name);
  } catch (err) {
    console.error("bedrock unavailable, using fallback", err);
    return fallbackNarrative(summary, name);
  }
}

async function summariseMember(member) {
  const now = new Date();
  const tz = member.tz;
  const signals = await recentSignals(member.memberId, startOfLocalDay(now, tz));
  const first = firstWakingSignal(signals, tz);

  const summary = {
    weekday: new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long" }).format(now),
    firstActivityAt: first ? formatLocalTime(first.at, tz) : null,
    steps: stepsToday(signals),
    transactions: signals.filter((s) => s.type === "transaction").length,
    charged: signals.some((s) => s.type === "charging"),
    lastSeenAt: member.lastSeenAt ? formatLocalTime(member.lastSeenAt, tz) : null,
  };

  const narrative = await narrate(summary, member.name);

  await putItem({
    pk: `MEM#${member.memberId}`,
    sk: `DAY#${localDate(now, tz)}`,
    ...summary,
    narrative,
    createdAt: now.toISOString(),
  });

  // Only a day we actually saw teaches the baseline anything.
  if (first) {
    const baseline = updateBaseline(member.baseline, first.minutes);
    await doc.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: memberKey(member.memberId),
        UpdateExpression: "SET baseline = :b",
        ExpressionAttributeValues: { ":b": baseline },
      })
    );
  }

  const watchers = await watchersOf(member.memberId);
  await pushToExpo(
    watchers.map((w) => ({
      to: w.pushToken,
      title: isLearning(member.baseline) ? "Still learning her routine" : "Today",
      body: narrative,
      data: { action: "daily", memberId: member.memberId },
    }))
  );

  return { memberId: member.memberId, narrative };
}

export async function handler() {
  const parents = await listParents();
  const results = await Promise.all(
    parents.map((m) =>
      summariseMember(m).catch((err) => {
        console.error("summary failed for", m.memberId, err);
        return { memberId: m.memberId, error: String(err) };
      })
    )
  );
  console.log(JSON.stringify({ summarised: results.length, results }));
  return { summarised: results.length };
}
