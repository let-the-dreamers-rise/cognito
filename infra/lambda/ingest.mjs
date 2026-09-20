import { randomUUID } from "node:crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  doc,
  TABLE,
  getMember,
  putItem,
  memberKey,
  openIncident,
  setIncidentStatus,
  watchersOf,
  SIGNAL_TTL_DAYS,
} from "./shared/db.mjs";
import { ok, bad, parseBody, bearer } from "./shared/http.mjs";
import { isWakingSignal } from "./shared/baseline.mjs";
import { pushToExpo } from "./shared/push.mjs";

/**
 * The only signal types this system will accept. A transaction signal carries a
 * timestamp and nothing else: no amount, no merchant, no message body. The
 * native SMS module discards the text on the device before this is ever called.
 */
const ACCEPTED = new Set([
  "heartbeat",
  "interaction",
  "steps",
  "charging",
  "transaction",
  "checkin",
  "callme",
]);

/**
 * Device clocks drift, and a timestamp in the future is not a harmless quirk
 * here: lastWakingAt ahead of now makes every elapsed-hours calculation
 * negative, so no severity ever fires again and the member goes permanently
 * unwatched. Clamp rather than reject, because a skewed clock is still a
 * phone someone is using.
 */
const sanitise = (signal, nowIso) => {
  const claimed = signal.at ?? nowIso;
  return {
    type: signal.type,
    at: claimed > nowIso ? nowIso : claimed,
    // steps is the only numeric detail we keep, and only as a running day total.
    steps: signal.type === "steps" ? Number(signal.steps ?? 0) : undefined,
  };
};

export async function handler(event) {
  const body = parseBody(event);
  if (body === null) return bad(400, "invalid JSON body");

  const { memberId, signals } = body;
  if (!memberId || !Array.isArray(signals)) {
    return bad(400, "memberId and signals[] are required");
  }

  const member = await getMember(memberId);
  if (!member) return bad(404, "unknown member");
  if (member.deviceToken !== bearer(event)) return bad(403, "bad device token");

  const nowIso = new Date().toISOString();
  const accepted = signals
    .filter((s) => ACCEPTED.has(s?.type))
    .map((s) => sanitise(s, nowIso))
    .slice(0, 100);

  if (accepted.length === 0) return ok({ stored: 0 });

  const expiresAt =
    Math.floor(Date.now() / 1000) + SIGNAL_TTL_DAYS * 24 * 3600;

  // A heartbeat's only job is to move lastSeenAt, which the profile update
  // below already does. Nothing ever reads the rows, and at one every five
  // minutes they were ninety percent of everything this table stored.
  await Promise.all(
    accepted
      .filter((signal) => signal.type !== "heartbeat")
      .map((signal) =>
        putItem({
          pk: `MEM#${memberId}`,
          sk: `SIG#${signal.at}#${randomUUID().slice(0, 8)}`,
          ...signal,
          ttl: expiresAt,
        })
      )
  );

  const waking = accepted.filter(isWakingSignal);

  // Two clocks, deliberately separate. lastSeenAt proves the phone is alive;
  // lastWakingAt proves a person is. A phone that keeps checking in while
  // nobody touches it is the case that matters most, and only the second
  // clock can see it.
  const latestAny = accepted.reduce(
    (max, s) => (s.at > max ? s.at : max),
    member.lastSeenAt ?? ""
  );
  const latestWaking = waking.reduce(
    (max, s) => (s.at > max ? s.at : max),
    member.lastWakingAt ?? ""
  );

  // Only write a clock we actually have. Writing an empty string here is how a
  // blank clock gets into the table in the first place, and a blank clock reads
  // as infinitely stale downstream.
  const sets = [];
  const values = {};
  if (latestAny) {
    sets.push("lastSeenAt = :l");
    values[":l"] = latestAny;
  }
  if (latestWaking) {
    sets.push("lastWakingAt = :w");
    values[":w"] = latestWaking;
  }

  if (sets.length > 0) {
    await doc.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: memberKey(memberId),
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeValues: values,
      })
    );
  }

  // Any sign of life closes an open incident. This is how the escalation ladder
  // learns it can stand down without the watcher ever being told.
  let resolved = null;
  if (waking.length > 0) {
    const incident = await openIncident(memberId);
    if (incident) {
      await setIncidentStatus(memberId, incident.incidentId, "resolved", {
        resolvedBy: waking[0].type,
      });
      resolved = incident.incidentId;
    }
  }

  // She pressed the button. Elderly parents hold back from calling because
  // "he must be busy"; this removes the hesitation without her placing a call.
  if (accepted.some((s) => s.type === "callme")) {
    const watchers = await watchersOf(memberId);
    await pushToExpo(
      watchers.map((w) => ({
        to: w.pushToken,
        title: `${member.name} would like a call`,
        body: "No hurry, and nothing is wrong.",
        data: { action: "callme", memberId },
        sound: "default",
      }))
    );
  }

  return ok({ stored: accepted.length, resolvedIncident: resolved });
}
