package com.prajyot.tasktracker;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

public class ExactAlarmReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "TASK_CHANNEL";

    @Override
    public void onReceive(Context context, Intent intent) {

        String taskId = intent.getStringExtra("taskId");
        String taskName = intent.getStringExtra("taskName");

        if (taskId == null || taskName == null) {
            return; // Safety guard
        }

        // 🔔 Ensure notification channel exists
        createNotificationChannel(context);

        // Open app intent
        Intent openIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (openIntent != null) {
            openIntent.putExtra("taskId", taskId);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }

        PendingIntent openPending = PendingIntent.getActivity(
                context,
                taskId.hashCode(),
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(context, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_notification)
                        .setContentTitle(taskName)
                        .setContentText("Have you completed it?")
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setAutoCancel(true)
                        .setContentIntent(openPending)
                        .setCategory(NotificationCompat.CATEGORY_REMINDER)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        manager.notify(taskId.hashCode(), builder.build());
    }

    private void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Task Reminders",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Time-based task reminders");

            NotificationManager manager =
                    context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
