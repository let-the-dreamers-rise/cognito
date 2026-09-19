import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  doc,
  TABLE,
  getMember,
  watchersOf,
  setIncidentStatus,
} from "./shared/db.mjs";
import { pushToExpo, sendSms } from "./shared/push.mjs";
import { minutesToClock } from "./shared/time.mjs";
import { describe, isCritical } from "./shared/severity.mjs";

/**
 * Every rung of the ladder. For an ordinary late morning the order matters more
 * than the code: we ask her first, twice, and most days the first rung ends it
 * without the family ever learning there was a question.
 *
 * That politeness is wrong above a threshold. A day of silence is not a social
 * situation, so the state machine skips these rungs entirely and goes straight
 * to the people who can physically reach her.
 */
const RUNGS = {
  async nudge(member) {
    await pushToExpo([
      {
        to: member.pushToken,
        title: "Good morning",
        body: "Tap to say you're up.",
        data: { action: "checkin" },
      },
    ]);
    return { rung: "nudge" };
  },

  async ring(member) {
    await pushToExpo([
      {
        to: member.pushToken,
        title: "Still there?",
        body: "Just tap once and we'll leave you alone.",
        data: { action: "checkin" },
        sound: "default",
        priority: "high",
        // Elderly phones live on silent. This rung is allowed to break through.
        channelId: "checkin-urgent",
      },
    ]);
    return { rung: "ring" };
  },

  async notifyChild(member, severity) {
    const watchers = await watchersOf(member.memberId);
    const critical = isCritical(severity);
    const usually =
      member.baseline?.firstActivityMedian != null
        ? `She is usually up by ${minutesToClock(member.baseline.firstActivityMedian)}.`
        : "";

    await pushToExpo(
      watchers.map((w) => ({
        to: w.pushToken,
        title: describe(severity, member.name),
        body: critical
          ? "We have already asked her and had no answer. Please call her now."
          : `${usually} Want to call?`.trim(),
        data: { action: "call", memberId: member.memberId, severity },
        sound: "default",
        priority: "high",
        // A two-day silence is allowed to wake the phone up properly.
        channelId: critical ? "critical" : "default",
      }))
    );
    return { rung: "notifyChild", watchers: watchers.length, severity };
  },

  /**
   * The rung nobody else builds. The family is a thousand kilometres away and
   * can do nothing; the neighbour is forty feet away and can knock.
   */
  async notifyLocal(member, severity) {
    const contact = member.localContact;
    const result = await sendSms(
      contact?.phone,
      `${describe(severity, member.name)} She is not answering. ` +
        `If you are nearby, could you knock on her door? - Sab Theek`
    );
    return { rung: "notifyLocal", contact: contact?.name ?? null, severity, ...result };
  },
};

async function checkResponded(memberId, incidentId) {
  const res = await doc.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `MEM#${memberId}`, sk: `INC#${incidentId}` },
    })
  );
  return { responded: res.Item?.status !== "open", status: res.Item?.status ?? "gone" };
}

export async function handler(event) {
  const { action, memberId, incidentId, severity } = event;

  if (action === "check") return checkResponded(memberId, incidentId);

  const member = await getMember(memberId);
  if (!member) return { error: "unknown member" };

  if (action === "escalated") {
    await setIncidentStatus(memberId, incidentId, "escalated");
    return { rung: "escalated", severity };
  }

  const rung = RUNGS[action];
  if (!rung) return { error: `unknown rung: ${action}` };

  const result = await rung(member, severity);
  await setIncidentStatus(memberId, incidentId, "open", { lastRung: action });
  return result;
}
