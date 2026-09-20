/**
 * How worried to be, and therefore how politely to behave.
 *
 * Two clocks matter, and conflating them was the original mistake:
 *
 *   lastSeenAt   - any signal at all. Proves the phone is on and has network.
 *   lastWakingAt - a signal only a person makes. Proves someone is there.
 *
 * A phone that is on but untouched for a day is more alarming than one that is
 * simply switched off, because the switched-off phone has an ordinary
 * explanation and the untouched one does not.
 */
export const SEVERITY = {
  LATE: 'late',
  SILENT_12H: 'silent12',
  DEVICE_DARK: 'deviceDark',
  CRITICAL_24H: 'critical24',
  CRITICAL_48H: 'critical48',
};

/** At or above this we stop asking her politely and tell the family at once. */
export const CRITICAL = new Set([SEVERITY.CRITICAL_24H, SEVERITY.CRITICAL_48H]);

export const isCritical = (severity) => CRITICAL.has(severity);

/** Seconds between rungs. Urgency shortens the wait. */
export function waitSecondsFor(severity) {
  if (severity === SEVERITY.CRITICAL_48H) return 60;
  if (severity === SEVERITY.CRITICAL_24H) return 300;
  if (severity === SEVERITY.DEVICE_DARK) return 600;
  if (severity === SEVERITY.SILENT_12H) return 600;
  return 1200;
}

const hoursSince = (iso, now) =>
  iso ? (now.getTime() - new Date(iso).getTime()) / 3600000 : Infinity;

/**
 * How long we must have known someone before we are willing to say anything is
 * wrong. Without this an unset clock reads as infinitely stale and a member who
 * enrolled ten minutes ago is assessed as two days silent on the next sweep.
 */
export const MIN_OBSERVATION_HOURS = 2;

/**
 * Returns a severity, or null when there is nothing to raise. Long silences are
 * checked first: someone who has not touched their phone in two days is not
 * merely late this morning.
 */
export function assess({ member, now, expectedBy, nowMinutes, sawWakingToday }) {
  // A settling period. We have no evidence about a member we have only just met,
  // and absence of evidence is exactly what this system would otherwise read as
  // evidence of absence.
  const knownForHours = hoursSince(member.createdAt, now);
  if (knownForHours < MIN_OBSERVATION_HOURS) return null;

  // Fall back to enrolment so an unset clock means "nothing since we met",
  // rather than "nothing, ever, infinitely far back".
  //
  // Deliberately || and not ??. A clock can reach here as an empty string, and
  // ?? only catches null and undefined - so a blank clock would sail past the
  // fallback into hoursSince, read as Infinity, and assess the quietest member
  // in the system as two days silent on the very next sweep.
  const sinceWaking = hoursSince(member.lastWakingAt || member.createdAt, now);
  const sinceDevice = hoursSince(member.lastSeenAt || member.createdAt, now);

  if (sinceWaking >= 48) return SEVERITY.CRITICAL_48H;
  if (sinceWaking >= 24) return SEVERITY.CRITICAL_24H;
  if (sinceDevice >= 12) return SEVERITY.DEVICE_DARK;
  if (sinceWaking >= 12) return SEVERITY.SILENT_12H;

  const late =
    !sawWakingToday && expectedBy != null && nowMinutes > Math.min(expectedBy, 1439);
  return late ? SEVERITY.LATE : null;
}

/** Plain words for the family. Never jargon, never a severity code. */
export function describe(severity, name) {
  switch (severity) {
    case SEVERITY.CRITICAL_48H:
      return `${name} has not touched her phone in two days.`;
    case SEVERITY.CRITICAL_24H:
      return `${name} has not touched her phone since yesterday.`;
    case SEVERITY.DEVICE_DARK:
      return `${name}'s phone has been off or out of signal for over 12 hours.`;
    case SEVERITY.SILENT_12H:
      return `${name} has not picked up her phone in over 12 hours.`;
    case SEVERITY.LATE:
      return `${name} has not picked up her phone today.`;
    default:
      return `${name}'s day looks ordinary.`;
  }
}
