import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({});
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Expo delivers the app pushes; SNS carries SMS to the local contact, who will
 * not have the app installed. Failures here must never fail an escalation.
 */
export async function pushToExpo(messages) {
  const valid = messages.filter((m) => m.to?.startsWith("ExponentPushToken"));
  if (valid.length === 0) return { sent: 0, skipped: messages.length };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valid),
    });
    return { sent: valid.length, status: res.status };
  } catch (err) {
    console.error("expo push failed", err);
    return { sent: 0, error: String(err) };
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
