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

/**
 * Every rung of the ladder. The order matters more than the code: we ask her
 * first, twice, before anyone else is told anything at all. Most mornings the
 * first rung ends it and the family never learns there was a question.
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

  async notifyChild(member) {
    const watchers = await watchersOf(member.memberId);
    const usually =
      member.baseline?.firstActivityMedian != null
        ? ` She's usually up by ${minutesToClock(member.baseline.firstActivityMedian)}.`
        : "";

    await pushToExpo(
      watchers.map((w) => ({
        to: w.pushToken,
        title: `${member.name} hasn't picked up her phone today`,
        body: `${usually.trim()} Want to call?`.trim(),
        data: { action: "call", memberId: member.memberId },
        sound: "default",
      }))
    );
    return { rung: "notifyChild", watchers: watchers.length };
  },

  /**
   * The rung nobody else builds. The family is a thousand kilometres away and
   * can do nothing; the neighbour is forty feet away and can knock.
   */
  async notifyLocal(member) {
    const contact = member.localContact;
    const result = await sendSms(
      contact?.phone,
      `${member.name} hasn't used her phone today and isn't answering. ` +
        `If you are nearby, could you knock? - Sab Theek`
    );
    return { rung: "notifyLocal", contact: contact?.name ?? null, ...result };
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
  const { action, memberId, incidentId } = event;

  if (action === "check") return checkResponded(memberId, incidentId);

  const member = await getMember(memberId);
  if (!member) return { error: "unknown member" };

  if (action === "escalated") {
    await setIncidentStatus(memberId, incidentId, "escalated");
    return { rung: "escalated" };
  }

  const rung = RUNGS[action];
  if (!rung) return { error: `unknown rung: ${action}` };

  const result = await rung(member);
  await setIncidentStatus(memberId, incidentId, "open", { lastRung: action });
  return result;
}
