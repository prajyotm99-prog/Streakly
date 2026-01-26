import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { MOTIVATIONAL_QUOTES } from './quotes';

export const initPushNotifications = async () => {
  console.log('🔥 initPushNotifications called');

  if (!Capacitor.isNativePlatform()) {
    console.log('❌ Not a native platform');
    return;
  }

  const permStatus = await PushNotifications.requestPermissions();
  console.log('🔐 Permission status:', permStatus);

  if (permStatus.receive !== 'granted') {
    console.log('❌ Push permission not granted');
    return;
  }

  await PushNotifications.register();
  console.log('📡 PushNotifications.register() called');

  PushNotifications.addListener('registration', token => {
    console.log('✅ FCM TOKEN:', token.value);
  });

  PushNotifications.addListener('registrationError', err => {
    console.error('❌ Registration error:', err);
  });

  PushNotifications.addListener('pushNotificationReceived', notification => {
    console.log('📩 Push received:', notification);
  });

  PushNotifications.addListener(
    'pushNotificationActionPerformed',
    notification => {
      console.log('👉 Push action:', notification);
    }
  );
};

export async function scheduleDailyMotivation() {
  if (!Capacitor.isNativePlatform()) return;

  const quote =
    MOTIVATIONAL_QUOTES[
      Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)
    ];

  await LocalNotifications.schedule({
    notifications: [
      {
        id: 1001,
        title: 'Keep your streaks alive 🔥',
        body: quote,
        schedule: {
          hour: 9,
          minute: 0,
          repeats: true,
        },
      },
    ],
  });

  console.log('📢 Daily motivation scheduled:', quote);
}
