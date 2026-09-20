import { requireOptionalNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';

type SabTheekSmsModule = {
  hasPermission(): Promise<boolean>;
  /** Returns timestamps only. The module never reads a message body. */
  getTransactionTimestamps(sinceEpochMs: number): Promise<number[]>;
};

/**
 * NativeModulesProxy is deprecated and does not resolve under the new
 * architecture, which this app enables. It returned undefined, isAvailable()
 * reported false, and the collector's catch swallowed it - so the signal could
 * appear to work while never once firing.
 */
const native = requireOptionalNativeModule<SabTheekSmsModule>('SabTheekSms');

export const isAvailable = () => Platform.OS === 'android' && native != null;

export async function hasPermission(): Promise<boolean> {
  if (!isAvailable()) return false;
  return native!.hasPermission();
}

/**
 * Nothing called this before, which meant READ_SMS was never granted, which
 * meant getTransactionTimestamps returned an empty list on every real phone
 * forever - the strongest signal in the product, silently never firing.
 *
 * The wording matters as much as the call. Asking a 70-year-old for access to
 * her messages with no explanation is how you get a refusal, so the dialog says
 * what is read and what is not.
 */
export async function requestPermission(): Promise<boolean> {
  if (!isAvailable()) return false;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    {
      title: 'Let your family know your day has started',
      message:
        'Sab Theek notes only the time a bank or UPI message arrives. It never reads what the message says, and the text never leaves your phone.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    }
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
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
