import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  console.warn('expo-notifications is not installed. Reminders will be unavailable.');
}

const SETTINGS_KEY = '@reminder_settings';
const NOTIFICATION_IDENTIFIER_PREFIX = 'expense-reminder-';

export const isNotificationsSupported = Notifications !== null;

export interface ReminderSettings {
  enabled: boolean;
  count: 1 | 2 | 3;
  times: string[]; // "HH:MM" format, e.g. ["09:00", "20:00"]
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  count: 2,
  times: ['09:00', '20:00'],
};

// Configure notification handler (how notifications appear when app is in foreground)
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true, // Legacy compatibility
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true, // Play sound if user enabled it
      shouldSetBadge: false,
    }),
  });
}

/** Request notification permission from the user. Returns true if granted. */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Notifications) return false;

  // On Android, we MUST set up at least one notification channel before requesting permission
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('expense-reminders', {
        name: 'Expense Reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#18633f',
        enableLights: true,
        enableVibration: true,
      });
      await Notifications.setNotificationChannelAsync('transaction-review', {
        name: 'Smart Transaction Detection',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#18633f',
        enableLights: true,
        enableVibration: true,
      });
    } catch (e) {
      console.warn('Failed to configure Android notification channel:', e);
    }
  }

  if (Platform.OS === 'android' && Platform.Version < 33) {
    // Android < 13 doesn't need runtime permission for notifications
    return true;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.warn('Error requesting notification permissions:', e);
    return false;
  }
}

/** Schedules a test notification to fire in 10 seconds. */
export async function scheduleTestNotification(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `${NOTIFICATION_IDENTIFIER_PREFIX}test`,
      content: {
        title: '🧪 Spendly Test Notification',
        body: 'Success! Your expense reminders are configured correctly.',
        data: { route: '/quick-log' },
        sound: true,
        ...(Platform.OS === 'android' && {
          channelId: 'expense-reminders',
          color: '#18633f',
          priority: Notifications.AndroidNotificationPriority.MAX,
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
        repeats: false,
      } as any,
    });
  } catch (e) {
    console.warn('Error scheduling test notification:', e);
  }
}

/** Load saved reminder settings from AsyncStorage */
export async function loadReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_REMINDER_SETTINGS;
    return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

/** Save reminder settings to AsyncStorage */
export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Cancel all previously scheduled expense reminders */
export async function cancelAllReminders(): Promise<void> {
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter((n: any) =>
      n.identifier.startsWith(NOTIFICATION_IDENTIFIER_PREFIX)
    );
    await Promise.all(ours.map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch (e) {
    console.warn('Error cancelling reminders:', e);
  }
}

/** Parse "HH:MM" string into { hour, minute } */
function parseTime(time: string): { hour: number; minute: number } {
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return {
    hour: isNaN(h) ? 0 : h,
    minute: isNaN(m) ? 0 : m,
  };
}

/**
 * Schedule daily recurring reminders at the given times.
 * Cancels any existing reminders first.
 */
export async function scheduleReminders(times: string[]): Promise<void> {
  if (!Notifications) return;

  await cancelAllReminders();

  for (let i = 0; i < times.length; i++) {
    const { hour, minute } = parseTime(times[i]);

    try {
      // Schedule repeating daily alarm using the correct platform-specific trigger input
      const trigger: any = Platform.select({
        ios: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour,
          minute,
          repeats: true,
        },
        android: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        },
      });

      await Notifications.scheduleNotificationAsync({
        identifier: `${NOTIFICATION_IDENTIFIER_PREFIX}daily-${i}`,
        content: {
          title: '💰 Time to log your expenses!',
          body: "Don't forget to record what you spent. Tap to log now.",
          data: { route: '/quick-log' },
          sound: true,
          ...(Platform.OS === 'android' && {
            channelId: 'expense-reminders',
            color: '#18633f',
            priority: Notifications.AndroidNotificationPriority.MAX,
          }),
        },
        trigger,
      });
    } catch (e) {
      console.warn(`Error scheduling reminder at index ${i}:`, e);
    }
  }
}

/** Apply settings: if enabled, schedule reminders; if disabled, cancel all */
export async function applyReminderSettings(settings: ReminderSettings): Promise<void> {
  if (!Notifications) {
    await saveReminderSettings(settings);
    return;
  }
  if (settings.enabled) {
    const activeTimes = settings.times.slice(0, settings.count);
    await scheduleReminders(activeTimes);
    
    // Explicitly cancel any leftover indices if reminder count was reduced (e.g. from 2 to 1)
    for (let i = settings.count; i < 3; i++) {
      try {
        await Notifications.cancelScheduledNotificationAsync(`${NOTIFICATION_IDENTIFIER_PREFIX}daily-${i}`);
      } catch (e) {
        // Ignore if it wasn't scheduled
      }
    }
  } else {
    await cancelAllReminders();
  }
  await saveReminderSettings(settings);
}

const DETECT_NOTIFICATION_PREFIX = 'transaction-review-';

/** Schedule daily recurring reminder for pending transaction reviews */
export async function scheduleReviewReminder(timeStr: string): Promise<void> {
  if (!Notifications) return;

  await cancelReviewReminder();

  const { hour, minute } = parseTime(timeStr);

  try {
    const trigger: any = Platform.select({
      ios: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      },
      android: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });

    await Notifications.scheduleNotificationAsync({
      identifier: `${DETECT_NOTIFICATION_PREFIX}daily`,
      content: {
        title: '🔍 Review your smart transactions',
        body: 'You have bank or UPI transactions waiting for review. Tap to approve.',
        data: { route: '/pending-transactions' },
        sound: true,
        ...(Platform.OS === 'android' && {
          channelId: 'transaction-review',
          color: '#18633f',
          priority: Notifications.AndroidNotificationPriority.MAX,
        }),
      },
      trigger,
    });
  } catch (e) {
    console.warn('Error scheduling review reminder:', e);
  }
}

/** Cancel daily recurring reminder for pending reviews */
export async function cancelReviewReminder(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(`${DETECT_NOTIFICATION_PREFIX}daily`);
  } catch (e) {
    console.warn('Error cancelling review reminder:', e);
  }
}
