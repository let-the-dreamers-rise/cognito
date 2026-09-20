import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});

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
export function fallbackNarrative(summary, name) {
  if (!summary.firstActivityAt) {
    return `Quiet day for ${name} - the phone barely moved. Probably nothing, but you might call.`;
  }
  const parts = [`up around ${summary.firstActivityAt}`];
  if (summary.transactions > 0) parts.push("a trip to the shop");
  if (summary.steps > 0) parts.push(`${summary.steps.toLocaleString("en-IN")} steps`);
  if (summary.charged) parts.push("phone on charge by evening");
  return `${name}'s ${summary.weekday} looked normal - ${parts.join(", ")}.`;
}

/**
 * Returns the sentence and, honestly, which of the two wrote it. The caller
 * surfaces that rather than letting a fallback pass as the model's work.
 */
export async function narrate(summary, name, modelId = process.env.BEDROCK_MODEL_ID) {
  if (!modelId) return { text: fallbackNarrative(summary, name), source: "fallback" };
  try {
    const res = await bedrock.send(
      new ConverseCommand({
        modelId,
        system: [{ text: PROMPT }],
        messages: [{ role: "user", content: [{ text: facts(summary, name) }] }],
        inferenceConfig: { maxTokens: 120, temperature: 0.4 },
      })
    );
    const text = res.output?.message?.content?.[0]?.text?.trim();
    if (text) return { text, source: "bedrock" };
    return { text: fallbackNarrative(summary, name), source: "fallback" };
  } catch (err) {
    console.error("bedrock unavailable, using fallback", err);
    return { text: fallbackNarrative(summary, name), source: "fallback" };
  }
}
