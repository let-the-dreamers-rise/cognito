/** Signal shapes as they are stored, narrowed to what the pure helpers read. */
export type StoredSignal = {
  type: string;
  at: string;
  steps?: number;
};

export type Baseline = {
  samples: number[];
  firstActivityMedian: number | null;
  updatedAt?: string;
};

export const MIN_SAMPLES: number;
export const DEFAULT_GRACE_MINUTES: number;

export function isWakingSignal(signal: { type: string }): boolean;
export function median(values: number[]): number | null;

/** Returns a new baseline; never mutates the one passed in. */
export function updateBaseline(
  baseline: Baseline | null | undefined,
  firstActivityMinutes: number
): Baseline;

export function isLearning(baseline: Baseline | null | undefined): boolean;

/** Null while still learning, meaning nothing may be raised yet. */
export function expectedByMinutes(
  baseline: Baseline | null | undefined,
  graceMinutes?: number
): number | null;

/** The day's step count is the largest running total, never the sum. */
export function stepsToday(signals: StoredSignal[]): number;

export function firstWakingSignal(
  signals: StoredSignal[],
  tz: string
): { at: string; minutes: number } | null;
