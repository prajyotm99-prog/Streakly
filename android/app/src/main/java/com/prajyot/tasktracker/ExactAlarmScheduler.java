package com.prajyot.tasktracker;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

public class ExactAlarmScheduler {

    private static final String TAG = "ExactAlarm";

    /**
     * Schedules an exact alarm for a task
     */
    public static void schedule(
            Context context,
            long triggerAtMillis,
            String taskId,
            String taskName
    ) {

        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager == null) {
            Log.e(TAG, "❌ AlarmManager is null");
            return;
        }

        // Android 12+ exact alarm permission check
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!alarmManager.canScheduleExactAlarms()) {
                Log.e(TAG, "❌ Exact alarm permission NOT granted");
                openExactAlarmSettings(context);
                return;
            } else {
                Log.d(TAG, "✅ Exact alarm permission granted");
            }
        }

        Intent intent = new Intent(context, ExactAlarmReceiver.class);
        intent.putExtra("taskId", taskId);
        intent.putExtra("taskName", taskName);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                taskId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Cancel existing alarm first (prevents duplicates)
        alarmManager.cancel(pendingIntent);

        // Schedule exact alarm
        alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAtMillis,
                pendingIntent
        );

        Log.d(TAG, "⏰ Exact alarm scheduled for " + taskName + " at " + 
                   new java.util.Date(triggerAtMillis));
    }

    /**
     * Cancels a scheduled alarm for a task
     */
    public static void cancel(Context context, String taskId) {
        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager == null) return;

        Intent intent = new Intent(context, ExactAlarmReceiver.class);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                taskId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        alarmManager.cancel(pendingIntent);
        Log.d(TAG, "🛑 Alarm cancelled for taskId=" + taskId);
    }

    /**
     * v3.7.1: Opens the exact alarm settings page for the app
     */
    public static void openExactAlarmSettings(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                Log.d(TAG, "📱 Opened exact alarm settings page");
            } catch (Exception e) {
                Log.e(TAG, "❌ Could not open settings: " + e.getMessage());
                
                // Fallback: open general app settings
                try {
                    Intent fallbackIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    fallbackIntent.setData(Uri.parse("package:" + context.getPackageName()));
                    fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(fallbackIntent);
                    Log.d(TAG, "📱 Opened app settings (fallback)");
                } catch (Exception e2) {
                    Log.e(TAG, "❌ Could not open any settings: " + e2.getMessage());
                }
            }
        }
    }

    /**
     * v3.7.1: Checks if exact alarm permission is granted
     */
    public static boolean hasExactAlarmPermission(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager alarmManager =
                    (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            
            if (alarmManager != null) {
                boolean canSchedule = alarmManager.canScheduleExactAlarms();
                Log.d(TAG, canSchedule ? 
                      "✅ Has exact alarm permission" : 
                      "❌ Missing exact alarm permission");
                return canSchedule;
            }
        }
        
        // Android 11 and below - permission not required
        return true;
    }
}