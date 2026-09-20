import type { Baseline } from './baseline.d.mts';

export type SeverityCode =
  | 'late'
  | 'silent12'
  | 'deviceDark'
  | 'critical24'
  | 'critical48';

export const SEVERITY: {
  LATE: 'late';
  SILENT_12H: 'silent12';
  DEVICE_DARK: 'deviceDark';
  CRITICAL_24H: 'critical24';
  CRITICAL_48H: 'critical48';
};

export const CRITICAL: ReadonlySet<string>;

/** At or above this the polite rungs are skipped entirely. */
export function isCritical(severity: string | null | undefined): boolean;

/** Seconds between rungs. Urgency shortens the wait. */
export function waitSecondsFor(severity: string | null | undefined): number;

export type AssessInput = {
  member: {
    name?: string;
    baseline?: Baseline | null;
    /** Any signal at all: proves the phone is on. */
    lastSeenAt?: string | null;
    /** A signal only a person makes: proves someone is there. */
    lastWakingAt?: string | null;
  };
  now: Date;
  expectedBy: number | null;
  nowMinutes: number;
  sawWakingToday: boolean;
};

/** Null when there is nothing to raise. */
export function assess(input: AssessInput): SeverityCode | null;

/** Plain words for the family. Never a code, never a count. */
export function describe(severity: string | null | undefined, name: string): string;
