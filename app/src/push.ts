import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

/**
 * A tap that launched the app from cold is the common case - she is not holding
 * the phone at nine in the morning. But the last response is replayed on every
 * cold start, and replaying a stale one would stand down a real incident, so
 * only a recent tap counts.
 */
const TAP_IS_FRESH_MS = 10 * 60 * 1000;

/**
 * Channels exist so the serious cases can behave differently from the ordinary
 * ones. Elderly phones live on silent, so the check-in and critical channels
 * are allowed to override that; the daily sentence is not.
 */
async function ensureChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Daily',
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  await Notifications.setNotificationChannelAsync('checkin-urgent', {
    name: 'Check in',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
  });

  await Notifications.setNotificationChannelAsync('critical', {
    name: 'Something is wrong',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    bypassDnd: true,
  });
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Returns an Expo push token, or null on web and wherever permission is
 * refused. A missing token must never block enrolment.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    await ensureChannels();

    const existing = await Notifications.getPermissionsAsync();
    const status =
      existing.status === 'granted'
        ? existing.status
        : (await Notifications.requestPermissionsAsync()).status;

    if (status !== 'granted') return null;

    // Passing this explicitly rather than letting the library hunt for it. When
    // the lookup fails it throws, the catch below swallows it, and the result is
    // a member who is enrolled and can never be reached - the exact silent
    // failure this product exists to prevent.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('no EAS projectId in app config; push cannot be registered');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data ?? null;
  } catch (err) {
    console.warn('push registration unavailable', err);
    return null;
  }
}

/**
 * Tapping the nudge is the whole point of the nudge: one tap and the ladder
 * stands down before the family is ever told.
 */
export function onNotificationTap(handler: (action: string) => void) {
  const fire = (response: Notifications.NotificationResponse) => {
    const action = response.notification.request.content.data?.action;
    if (typeof action === 'string') handler(action);
  };

  const sub = Notifications.addNotificationResponseReceivedListener(fire);

  // The listener only sees taps that arrive while the app is already running.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) return;
      const at = response.notification.date;
      if (typeof at === 'number' && Date.now() - at > TAP_IS_FRESH_MS) return;
      fire(response);
    })
    .catch(() => {});

  return () => sub.remove();
}
