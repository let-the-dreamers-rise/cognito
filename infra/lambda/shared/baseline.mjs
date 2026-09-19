import { localMinutes } from "./time.mjs";

/** Signals that prove a person is up and moving, as opposed to a phone sitting on a table. */
const WAKING_SIGNALS = new Set([
  "interaction",
  "steps",
  "transaction",
  "checkin",
  "callme",
]);

export const isWakingSignal = (signal) => WAKING_SIGNALS.has(signal.type);

/** How many days of history before we trust the baseline enough to raise an incident. */
export const MIN_SAMPLES = 4;

/** Grace on top of the learned wake time, so an ordinary lie-in is never an incident. */
export const DEFAULT_GRACE_MINUTES = 120;

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * The baseline is deliberately one number: the time this person usually first
 * touches the world. Deviation from self, never from a population.
 */
export function updateBaseline(baseline, firstActivityMinutes) {
  const prior = baseline?.samples ?? [];
  const samples = [...prior, firstActivityMinutes].slice(-21);
  return {
    samples,
    firstActivityMedian: median(samples),
    updatedAt: new Date().toISOString(),
  };
}

export function isLearning(baseline) {
  return (baseline?.samples?.length ?? 0) < MIN_SAMPLES;
}

/**
 * The only question this system asks: by now, on an ordinary day, would we have
 * heard something? Returns null while still learning.
 */
export function expectedByMinutes(baseline, graceMinutes = DEFAULT_GRACE_MINUTES) {
  if (isLearning(baseline) || baseline?.firstActivityMedian == null) return null;
  return baseline.firstActivityMedian + graceMinutes;
}

export function firstWakingSignal(signals, tz) {
  const waking = signals
    .filter(isWakingSignal)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (waking.length === 0) return null;
  return { at: waking[0].at, minutes: localMinutes(new Date(waking[0].at), tz) };
}
