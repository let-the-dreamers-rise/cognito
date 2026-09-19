export const DEFAULT_TZ = "Asia/Kolkata";

/** Minutes past local midnight for an instant, in the member's own timezone. */
export function localMinutes(date, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Local calendar date (YYYY-MM-DD) for an instant. */
export function localDate(date, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Start of the member's local day, as an ISO instant. */
export function startOfLocalDay(date, tz = DEFAULT_TZ) {
  const minutes = localMinutes(date, tz);
  return new Date(date.getTime() - minutes * 60_000).toISOString();
}

export function formatLocalTime(iso, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function minutesToClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}
