import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  doc,
  TABLE,
  recentSignals,
  recentDays,
  recentIncidents,
  recentLooks,
  watchersOf,
  openIncident,
  logAccess,
} from "./shared/db.mjs";
import { authorise } from "./shared/auth.mjs";
import { ok, bad, bearer } from "./shared/http.mjs";
import { startOfLocalDay, localDate, formatLocalTime, minutesToClock } from "./shared/time.mjs";
import {
  expectedByMinutes,
  firstWakingSignal,
  isLearning,
  stepsToday,
  MIN_SAMPLES,
} from "./shared/baseline.mjs";
import { describe, isCritical } from "./shared/severity.mjs";

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

const DAY_MS = 86_400_000;

/**
 * Seven days as a row, oldest first, aligned to her calendar so a day we never
 * saw shows as a gap rather than silently collapsing the week.
 */
function buildWeek(days, now, tz) {
  const byDate = new Map(days.map((d) => [d.sk.slice(4), d]));

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() - (6 - i) * DAY_MS);
    const key = localDate(date, tz);
    const record = byDate.get(key);

    return {
      date: key,
      label: new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "narrow" }).format(date),
      status: record ? (record.firstActivityAt ? "normal" : "quiet") : "unknown",
      narrative: record?.narrative ?? null,
    };
  });
}

/**
 * "Ashwin looked in on you this morning." Built from the same access ledger
 * that lets her audit who read her data, which is the nicer half of the same
 * fact.
 */
async function buildFamily(memberId, tz) {
  const [looks, watchers] = await Promise.all([
    recentLooks(memberId, 20),
    watchersOf(memberId),
  ]);

  const latestByActor = new Map();
  for (const look of looks) {
    if (look.action?.startsWith("viewed") && !latestByActor.has(look.actor)) {
      latestByActor.set(look.actor, look.at);
    }
  }

  // The ledger keys on name, so two people called the same thing collapse into
  // one row rather than appearing twice with identical timestamps.
  const byName = new Map();
  for (const w of watchers) {
    const name = w.name ?? "Family";
    const at = latestByActor.get(name) ?? null;
    const existing = byName.get(name);
    if (!existing || (at && at > (existing.lastLookedAt ?? ""))) {
      byName.set(name, {
        name,
        lastLookedAt: at,
        lastLookedLabel: at ? formatLocalTime(at, tz) : null,
      });
    }
  }

  return [...byName.values()];
}

/** What the system actually did. An invisible safety net is an untrusted one. */
const summariseIncident = (incident, name) => ({
  incidentId: incident.incidentId,
  at: incident.openedAt,
  what: incident.reason ?? describe(incident.severity, name),
  severity: incident.severity ?? null,
  outcome:
    incident.status === "resolved"
      ? incident.resolvedBy
        ? `Stood down by ${incident.resolvedBy}`
        : "She answered, and you were never told"
      : incident.status === "escalated"
        ? "Escalated to you and the neighbour"
        : "Checking now",
  lastRung: incident.lastRung ?? null,
});

export async function handler(event) {
  const memberId = event?.queryStringParameters?.memberId;
  if (!memberId) return bad(400, "memberId is required");

  const auth = await authorise(memberId, bearer(event));
  if (!auth) return bad(403, "not linked to this person");

  const { member, actor, role } = auth;
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

  const steps = stepsToday(signals);

  const expectedBy = expectedByMinutes(member.baseline);
  const [days, incidents] = await Promise.all([
    recentDays(memberId, 8),
    recentIncidents(memberId, 5),
  ]);

  if (role !== "self") await logAccess(memberId, actor, "viewed pulse");

  // Her side of it. The app should open on the people who care about her, not
  // on her own status, or there is no reason to open it twice.
  const family =
    role === "self" ? await buildFamily(memberId, tz) : null;

  return ok({
    name: member.name,
    // The watcher gets a sentence and a verdict. Never the raw signal list.
    // || rather than ??, so a blank clock falls through to the other clock
    // instead of reporting "no signal yet" about a phone in active use.
    pulse: phrase(minutesAgo(member.lastWakingAt || member.lastSeenAt)),
    lastSeenAt: member.lastSeenAt ?? null,
    lastWakingAt: member.lastWakingAt ?? null,
    // Null on an ordinary day. The screen stays quiet unless there is something
    // to say, which is the entire point of the product.
    concern: incident ? describe(incident.severity, member.name) : null,
    severity: incident?.severity ?? null,
    critical: incident ? isCritical(incident.severity) : false,
    firstActivityAt: first ? formatLocalTime(first.at, tz) : null,
    steps,
    today: day.Item?.narrative ?? null,
    status: incident
      ? isCritical(incident.severity)
        ? "critical"
        : "checking"
      : first
        ? "normal"
        : "quiet",
    family,
    week: buildWeek(days, now, tz),
    incidents: incidents.map((i) => summariseIncident(i, member.name)),
    // Her number, so the family can call straight from the alert instead of
    // hunting for the dialler while anxious.
    phone: member.phone ?? null,
    localContact: member.localContact ?? null,
    learning: isLearning(member.baseline),
    learningProgress: `${member.baseline?.samples?.length ?? 0}/${MIN_SAMPLES}`,
    // Her actual routine, not the worry threshold. The two-hour grace is the
    // system's business and showing it here read as though she sleeps till 9.
    usuallyUpBy:
      member.baseline?.firstActivityMedian == null
        ? null
        : minutesToClock(member.baseline.firstActivityMedian),
    worryAfter: expectedBy == null ? null : minutesToClock(expectedBy),
    travelUntil: member.travelUntil ?? null,
  });
}
