package com.prajyot.tasktracker;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * v3.8: AlarmManager scheduler for exact time-based notifications
 * Uses setExactAndAllowWhileIdle for reliable triggering even when:
 * - App is killed
 * - Device is in Doze mode
 * - Screen is locked
 */
public class ExactAlarmScheduler {
    private static final String TAG = "ExactAlarmScheduler";
    private final Context context;
    private final AlarmManager alarmManager;

    public ExactAlarmScheduler(Context context) {
        this.context = context;
        this.alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    }

    /**
     * Schedule an exact alarm using setExactAndAllowWhileIdle
     * @param triggerAtMillis When to fire (System.currentTimeMillis() + offset)
     * @param taskId Unique task identifier
     * @param taskName Task name for notification
     * @return true if scheduled successfully
     */
    public boolean scheduleExactAlarm(long triggerAtMillis, String taskId, String taskName) {
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager not available");
            return false;
        }

        try {
            // Create intent for the broadcast receiver
            Intent intent = new Intent(context, ExactAlarmReceiver.class);
            intent.setAction("com.prajyot.tasktracker.EXACT_ALARM");
            intent.putExtra("taskId", taskId);
            intent.putExtra("taskName", taskName);

            // Use taskId.hashCode() as request code to ensure uniqueness
            int requestCode = taskId.hashCode();

            // Create PendingIntent with FLAG_IMMUTABLE (required for Android 12+)
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Schedule using setExactAndAllowWhileIdle
            // This bypasses Doze mode restrictions
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAtMillis,
                pendingIntent
            );

            Log.i(TAG, String.format(
                "Scheduled exact alarm: task=%s, time=%d, requestCode=%d",
                taskName, triggerAtMillis, requestCode
            ));

            return true;
        } catch (SecurityException e) {
            Log.e(TAG, "Exact alarm permission not granted", e);
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule alarm", e);
            return false;
        }
    }

    /**
     * Cancel an exact alarm for a specific task
     * @param taskId Task identifier
     */
    public void cancelExactAlarm(String taskId) {
        if (alarmManager == null) {
            return;
        }

        try {
            Intent intent = new Intent(context, ExactAlarmReceiver.class);
            intent.setAction("com.prajyot.tasktracker.EXACT_ALARM");
            
            int requestCode = taskId.hashCode();
            
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );

            if (pendingIntent != null) {
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
                Log.i(TAG, "Cancelled alarm for task: " + taskId);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling alarm", e);
        }
    }

    /**
     * Check if SCHEDULE_EXACT_ALARM permission is granted (Android 12+)
     * @return true if permission is granted or not required
     */
    public boolean hasExactAlarmPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (alarmManager != null) {
                return alarmManager.canScheduleExactAlarms();
            }
            return false;
        }
        // Permission not required on Android < 12
        return true;
    }
}
