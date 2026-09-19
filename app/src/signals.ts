import { AppState } from 'react-native';
import * as Battery from 'expo-battery';
import { Pedometer } from 'expo-sensors';
import { sendSignals } from './api';

type Signal = { type: string; at?: string; steps?: number };

/**
 * The whole collector. It reports that an ordinary day is happening, and
 * nothing about what the day contained. No location, no message content, no
 * per-app usage: adding those would not change the daily verdict.
 */
export async function collect(): Promise<Signal[]> {
  const at = new Date().toISOString();
  const signals: Signal[] = [{ type: 'heartbeat', at }];

  try {
    const state = await Battery.getBatteryStateAsync();
    if (state === Battery.BatteryState.CHARGING) signals.push({ type: 'charging', at });
  } catch {
    // Battery state is a nicety, never a reason to drop the heartbeat.
  }

  try {
    const available = await Pedometer.isAvailableAsync();
    if (available) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { steps } = await Pedometer.getStepCountAsync(start, new Date());
      if (steps > 0) signals.push({ type: 'steps', at, steps });
    }
  } catch {
    // Step counting is unavailable on web and some devices.
  }

  return signals;
}

export async function reportNow(memberId: string, token: string, extra: Signal[] = []) {
  const signals = [...(await collect()), ...extra];
  return sendSignals(memberId, token, signals);
}

/** Foreground reporting. The background task is registered separately on Android. */
export function watchForeground(memberId: string, token: string) {
  const onChange = (next: string) => {
    if (next === 'active') {
      reportNow(memberId, token, [{ type: 'interaction' }]).catch(() => {});
    }
  };

  const sub = AppState.addEventListener('change', onChange);
  reportNow(memberId, token, [{ type: 'interaction' }]).catch(() => {});

  const timer = setInterval(() => {
    reportNow(memberId, token).catch(() => {});
  }, 5 * 60 * 1000);

  return () => {
    sub.remove();
    clearInterval(timer);
  };
}
