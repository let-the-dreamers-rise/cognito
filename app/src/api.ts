import { API_URL } from './config';

export type Session = {
  role: 'parent' | 'watcher';
  memberId: string;
  deviceToken: string;
  pairCode?: string;
  memberName?: string;
};

export type WeekDay = {
  date: string;
  label: string;
  status: 'normal' | 'quiet' | 'unknown';
  narrative: string | null;
};

export type IncidentSummary = {
  incidentId: string;
  at: string;
  what: string;
  severity: string | null;
  outcome: string;
  lastRung: string | null;
};

export type LocalContact = { name: string; phone: string };

export type FamilyMember = {
  name: string;
  lastLookedAt: string | null;
  lastLookedLabel: string | null;
};

export type Pulse = {
  name: string;
  pulse: string;
  lastSeenAt: string | null;
  lastWakingAt: string | null;
  /** Null on an ordinary day. The screen stays quiet unless there is something to say. */
  concern: string | null;
  severity: string | null;
  critical: boolean;
  firstActivityAt: string | null;
  steps: number;
  today: string | null;
  status: 'normal' | 'checking' | 'quiet' | 'critical';
  learning: boolean;
  learningProgress: string;
  usuallyUpBy: string | null;
  worryAfter: string | null;
  travelUntil: string | null;
  /** Only present on her own device. */
  family: FamilyMember[] | null;
  week: WeekDay[];
  incidents: IncidentSummary[];
  phone: string | null;
  localContact: LocalContact | null;
};

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  if (!API_URL) throw new Error('API_URL is not set. Deploy the stack, then set EXPO_PUBLIC_API_URL.');

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const enrolParent = (name: string, pushToken: string | null) =>
  call<Session & { pairCode: string }>('/enroll/parent', {
    method: 'POST',
    body: { name, pushToken },
  });

export const enrolWatcher = (pairCode: string, name: string, pushToken: string | null) =>
  call<Session>('/enroll/watcher', {
    method: 'POST',
    body: { pairCode, name, pushToken },
  });

export const getPulse = (memberId: string, token: string) =>
  call<Pulse>(`/pulse?memberId=${encodeURIComponent(memberId)}`, { token });

export const sendSignals = (
  memberId: string,
  token: string,
  signals: { type: string; at?: string; steps?: number }[]
) => call<{ stored: number }>('/signals', { method: 'POST', body: { memberId, signals }, token });

export const updateSettings = (memberId: string, token: string, patch: Record<string, unknown>) =>
  call('/settings', { method: 'POST', body: { memberId, ...patch }, token });

/** "I have spoken to her." Faster than waiting for her phone to prove it. */
export const resolveIncident = (memberId: string, token: string, how = 'spoke to her') =>
  call<{ resolved: string | null; by: string }>('/resolve', {
    method: 'POST',
    body: { memberId, how },
    token,
  });

export const seedBaseline = (memberId: string, token: string) =>
  call<{ seeded: number }>('/demo/seed', { method: 'POST', body: { memberId }, token });

export const triggerQuietMorning = (
  memberId: string,
  token: string,
  severity = 'late',
  waitSeconds = 12
) =>
  call<{ incidentId: string }>('/demo/anomaly', {
    method: 'POST',
    body: { memberId, severity, waitSeconds },
    token,
  });
