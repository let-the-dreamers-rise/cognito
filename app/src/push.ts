import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

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

    const token = await Notifications.getExpoPushTokenAsync();
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
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const action = response.notification.request.content.data?.action;
    if (typeof action === 'string') handler(action);
  });
  return () => sub.remove();
}
