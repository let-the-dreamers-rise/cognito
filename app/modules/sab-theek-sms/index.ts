import { NativeModulesProxy } from 'expo-modules-core';
import { Platform } from 'react-native';

type SabTheekSmsModule = {
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  /** Returns timestamps only. The module never reads a message body. */
  getTransactionTimestamps(sinceEpochMs: number): Promise<number[]>;
};

const native = (NativeModulesProxy as Record<string, unknown>)
  .SabTheekSms as SabTheekSmsModule | undefined;

export const isAvailable = () => Platform.OS === 'android' && native != null;

export async function hasPermission(): Promise<boolean> {
  if (!isAvailable()) return false;
  return native!.hasPermission();
}

export async function requestPermission(): Promise<boolean> {
  if (!isAvailable()) return false;
  return native!.requestPermission();
}

/**
 * The only thing this module can ever return: the times at which a bank or UPI
 * sender messaged this phone. No amount, no merchant, no text. A transaction at
 * 8:15am means she got up, got dressed, walked out and spoke to someone - which
 * is more than any wearable could tell you, and less than any tracker would.
 */
export async function getTransactionTimestamps(sinceEpochMs: number): Promise<number[]> {
  if (!isAvailable()) return [];
  try {
    return await native!.getTransactionTimestamps(sinceEpochMs);
  } catch {
    return [];
  }
}
