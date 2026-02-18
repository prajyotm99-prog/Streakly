package com.prajyot.tasktracker;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * v3.8.1: OnePlus Fix - Uses setExact() for compatibility
 * Works on devices that don't properly expose SCHEDULE_EXACT_ALARM permission
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
     * Schedules an exact alarm for a specific task
     * v3.8.1: Uses setExact() for OnePlus compatibility
     */
    public boolean scheduleExactAlarm(long triggerAtMillis, String taskId, String taskName) {
        try {
            Log.d(TAG, "Scheduling exact alarm for task: " + taskName);

            // Create intent for the receiver
            Intent intent = new Intent(context, ExactAlarmReceiver.class);
            intent.setAction("com.prajyot.tasktracker.EXACT_ALARM");
            intent.putExtra("taskId", taskId);
            intent.putExtra("taskName", taskName);

            // Create pending intent with unique request code
            int requestCode = taskId.hashCode();
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Schedule alarm using setExact (works without permission on most devices)
            if (alarmManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    // Android 6+: Use setExactAndAllowWhileIdle if permission available
                    // Fall back to setExact if not
                    try {
                        alarmManager.setExactAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            triggerAtMillis,
                            pendingIntent
                        );
                        Log.d(TAG, "Alarm scheduled with setExactAndAllowWhileIdle");
                    } catch (SecurityException e) {
                        // Permission not available, use setExact
                        Log.w(TAG, "SCHEDULE_EXACT_ALARM not available, using setExact");
                        alarmManager.setExact(
                            AlarmManager.RTC_WAKEUP,
                            triggerAtMillis,
                            pendingIntent
                        );
                        Log.d(TAG, "Alarm scheduled with setExact (fallback)");
                    }
                } else {
                    // Android 5 and below
                    alarmManager.set(
                        AlarmManager.RTC_WAKEUP,
                        triggerAtMillis,
                        pendingIntent
                    );
                    Log.d(TAG, "Alarm scheduled with set() (legacy)");
                }

                Log.d(TAG, "Scheduled exact alarm: task=" + taskName + 
                           ", time=" + triggerAtMillis + 
                           ", requestCode=" + requestCode);
                return true;
            } else {
                Log.e(TAG, "AlarmManager is null");
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error scheduling exact alarm", e);
            return false;
        }
    }

    /**
     * Cancels an exact alarm for a specific task
     */
    public void cancelExactAlarm(String taskId) {
        try {
            Log.d(TAG, "Cancelling exact alarm for task: " + taskId);

            Intent intent = new Intent(context, ExactAlarmReceiver.class);
            intent.setAction("com.prajyot.tasktracker.EXACT_ALARM");

            int requestCode = taskId.hashCode();
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );

            if (pendingIntent != null && alarmManager != null) {
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
                Log.d(TAG, "Cancelled exact alarm: taskId=" + taskId + 
                           ", requestCode=" + requestCode);
            } else {
                Log.d(TAG, "No alarm found to cancel for taskId: " + taskId);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling exact alarm", e);
        }
    }

    /**
     * Checks if exact alarm permission is available
     * v3.8.1: Returns true even without permission (setExact works regardless)
     */
    public boolean hasExactAlarmPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+: Check if permission is granted
            try {
                return alarmManager != null && alarmManager.canScheduleExactAlarms();
            } catch (Exception e) {
                // Permission check failed, assume true (we'll use setExact fallback)
                Log.w(TAG, "Permission check failed, assuming available", e);
                return true;
            }
        }
        // Android 11 and below: Permission not required
        return true;
    }
}
