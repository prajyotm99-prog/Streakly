package com.prajyot.tasktracker;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * v3.8: BroadcastReceiver for exact alarm notifications
 * This fires even when:
 * - App is completely killed
 * - No WebView is loaded
 * - Device is locked
 * 
 * Must NOT depend on Capacitor, JS runtime, or any app state
 */
public class ExactAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "ExactAlarmReceiver";
    private static final String CHANNEL_ID = "streakly_exact_alarms";
    private static final int NOTIFICATION_ID_BASE = 10000;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !"com.prajyot.tasktracker.EXACT_ALARM".equals(intent.getAction())) {
            return;
        }

        String taskId = intent.getStringExtra("taskId");
        String taskName = intent.getStringExtra("taskName");

        if (taskId == null || taskName == null) {
            Log.e(TAG, "Missing task data in alarm intent");
            return;
        }

        Log.i(TAG, "Exact alarm fired for task: " + taskName);

        // Create notification channel (safe to call multiple times)
        createNotificationChannel(context);

        // Build and show notification immediately
        showNotification(context, taskId, taskName);
    }

    /**
     * Create notification channel with HIGH priority
     * Required for Android 8.0+ (API 26)
     */
    private void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = 
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            
            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Task Reminders",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Time-based task notifications");
                channel.enableVibration(true);
                channel.setShowBadge(true);
                
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Build and display notification
     * Tapping opens the app with taskId passed via intent
     */
    private void showNotification(Context context, String taskId, String taskName) {
        try {
            NotificationManager manager = 
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            
            if (manager == null) {
                Log.e(TAG, "NotificationManager not available");
                return;
            }

            // Intent to open app when notification is tapped
            Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
            
            if (launchIntent != null) {
                launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                launchIntent.putExtra("taskId", taskId);
                launchIntent.putExtra("fromNotification", true);
            }

            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                taskId.hashCode(),
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Build notification
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle("⏰ " + taskName + " time")
                .setContentText("Have you completed it?")
                .setSmallIcon(getNotificationIcon(context))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

            // Use taskId hash to generate unique notification ID
            int notificationId = NOTIFICATION_ID_BASE + Math.abs(taskId.hashCode() % 10000);
            
            manager.notify(notificationId, builder.build());
            
            Log.i(TAG, "Notification shown for task: " + taskName);
        } catch (Exception e) {
            Log.e(TAG, "Error showing notification", e);
        }
    }

    /**
     * Get notification icon resource ID
     * Falls back to app icon if ic_notification doesn't exist
     */
    private int getNotificationIcon(Context context) {
        int iconId = context.getResources()
            .getIdentifier("ic_notification", "drawable", context.getPackageName());
        
        if (iconId == 0) {
            // Fallback to app icon
            iconId = context.getApplicationInfo().icon;
        }
        
        return iconId;
    }
}
