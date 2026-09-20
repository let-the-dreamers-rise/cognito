import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { loadSession } from './session';
import { reportNow } from './signals';

export const REPORT_TASK = 'sabtheek.report';

/**
 * Android's floor is fifteen minutes and Doze will stretch it well past that on
 * an idle phone. That is acceptable, because the question this answers is
 * "has the phone been used today", not "is it in her hand right now". What is
 * not acceptable is the alternative: without this, signals only flow while the
 * app is open, and the entire claim that she does not have to do anything is
 * false.
 */
const INTERVAL_SECONDS = 15 * 60;

// Defined at module scope so the task exists whenever the bundle is evaluated,
// including when Android wakes the app headlessly with no screen on top.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(REPORT_TASK, async () => {
    try {
      const session = await loadSession();
      // Only her phone reports. A watcher's device has nothing to say.
      if (!session || session.role !== 'parent') {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
      await reportNow(session.memberId, session.deviceToken);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/** Returns whether the phone will actually report on its own. */
export async function startBackgroundReporting(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return false;

    if (await TaskManager.isTaskRegisteredAsync(REPORT_TASK)) return true;

    await BackgroundFetch.registerTaskAsync(REPORT_TASK, {
      minimumInterval: INTERVAL_SECONDS,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    return true;
  } catch (err) {
    console.warn('background reporting unavailable', err);
    return false;
  }
}
