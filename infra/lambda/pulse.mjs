import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  doc,
  TABLE,
  getMember,
  recentSignals,
  watchersOf,
  openIncident,
  logAccess,
} from "./shared/db.mjs";
import { ok, bad, bearer } from "./shared/http.mjs";
import { startOfLocalDay, localDate, formatLocalTime, minutesToClock } from "./shared/time.mjs";
import {
  expectedByMinutes,
  firstWakingSignal,
  isLearning,
  MIN_SAMPLES,
} from "./shared/baseline.mjs";

const minutesAgo = (iso) =>
  iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60_000) : null;

/** Plain words, because "last heartbeat 14m" is telemetry and this is reassurance. */
function phrase(minutes) {
  if (minutes == null) return "No signal from her phone yet";
  if (minutes < 2) return "Her phone was in her hand a moment ago";
  if (minutes < 60) return `Her phone was last picked up ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Her phone was last picked up about ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "No activity for over a day";
}

async function authorise(event, memberId) {
  const token = bearer(event);
  if (!token) return null;

  const member = await getMember(memberId);
  if (!member) return null;
  if (member.deviceToken === token) return { member, actor: "self" };

  const watchers = await watchersOf(memberId);
  const watcher = watchers.find((w) => w.deviceToken === token);
  return watcher ? { member, actor: watcher.name ?? "Family" } : null;
}

export async function handler(event) {
  const memberId = event?.queryStringParameters?.memberId;
  if (!memberId) return bad(400, "memberId is required");

  const auth = await authorise(event, memberId);
  if (!auth) return bad(403, "not linked to this person");

  const { member, actor } = auth;
  const tz = member.tz;
  const now = new Date();

  const signals = await recentSignals(memberId, startOfLocalDay(now, tz));
  const first = firstWakingSignal(signals, tz);
  const incident = await openIncident(memberId);

  const day = await doc.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `MEM#${memberId}`, sk: `DAY#${localDate(now, tz)}` },
    })
  );

  const steps = signals
    .filter((s) => s.type === "steps")
    .reduce((sum, s) => sum + (s.steps ?? 0), 0);

  const expectedBy = expectedByMinutes(member.baseline);

  if (actor !== "self") await logAccess(memberId, actor, "viewed pulse");

  return ok({
    name: member.name,
    // The watcher gets a sentence and a verdict. Never the raw signal list.
    pulse: phrase(minutesAgo(member.lastSeenAt)),
    lastSeenAt: member.lastSeenAt ?? null,
    firstActivityAt: first ? formatLocalTime(first.at, tz) : null,
    steps,
    today: day.Item?.narrative ?? null,
    status: incident ? "checking" : first ? "normal" : "quiet",
    learning: isLearning(member.baseline),
    learningProgress: `${member.baseline?.samples?.length ?? 0}/${MIN_SAMPLES}`,
    usuallyUpBy: expectedBy == null ? null : minutesToClock(expectedBy),
    travelUntil: member.travelUntil ?? null,
  });
}
