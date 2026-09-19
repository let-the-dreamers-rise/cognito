import { API_URL } from './config';

export type Session = {
  role: 'parent' | 'watcher';
  memberId: string;
  deviceToken: string;
  pairCode?: string;
  memberName?: string;
};

export type Pulse = {
  name: string;
  pulse: string;
  lastSeenAt: string | null;
  firstActivityAt: string | null;
  steps: number;
  today: string | null;
  status: 'normal' | 'checking' | 'quiet';
  learning: boolean;
  learningProgress: string;
  usuallyUpBy: string | null;
  travelUntil: string | null;
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

export const seedBaseline = (memberId: string, token: string) =>
  call<{ seeded: number }>('/demo/seed', { method: 'POST', body: { memberId }, token });

export const triggerQuietMorning = (memberId: string, token: string, waitSeconds = 12) =>
  call<{ incidentId: string }>('/demo/anomaly', {
    method: 'POST',
    body: { memberId, waitSeconds },
    token,
  });
