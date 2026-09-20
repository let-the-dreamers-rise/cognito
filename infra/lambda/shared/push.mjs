import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({});
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Expo delivers the app pushes; SNS carries SMS to the local contact, who will
 * not have the app installed. Failures here must never fail an escalation.
 */
export async function pushToExpo(messages) {
  // Expo has shipped both spellings. Matching only one of them would drop every
  // message silently and report a rung as delivered to nobody.
  const valid = messages.filter(
    (m) => m.to?.startsWith("ExponentPushToken") || m.to?.startsWith("ExpoPushToken")
  );
  if (valid.length === 0) {
    return { requested: 0, delivered: 0, failed: 0, skipped: messages.length };
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valid),
    });

    // Expo answers 200 even when it threw the message away. The per-message
    // ticket carries the truth, and not reading it meant a rung could report
    // success having reached nobody - so the family was told "escalated" when
    // no phone had ever buzzed.
    const body = await res.json().catch(() => null);
    const tickets = body?.data ?? [];
    const failures = tickets.filter((t) => t?.status === "error");

    for (const failure of failures) {
      console.error(
        "expo rejected a push",
        JSON.stringify({ error: failure?.details?.error, message: failure?.message })
      );
    }

    const delivered = tickets.length > 0 ? tickets.length - failures.length : 0;
    return {
      requested: valid.length,
      delivered,
      failed: failures.length,
      skipped: messages.length - valid.length,
      status: res.status,
    };
  } catch (err) {
    console.error("expo push failed", err);
    return { requested: valid.length, delivered: 0, failed: valid.length, error: String(err) };
  }
}

export async function sendSms(phone, message) {
  if (!phone) return { sent: false, reason: "no phone on record" };
  try {
    await sns.send(
      new PublishCommand({ PhoneNumber: phone, Message: message })
    );
    return { sent: true };
  } catch (err) {
    console.error("sns sms failed", err);
    return { sent: false, error: String(err) };
  }
}
