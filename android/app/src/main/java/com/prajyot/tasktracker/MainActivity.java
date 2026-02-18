package com.prajyot.tasktracker;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import androidx.appcompat.app.AlertDialog;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";
    private static final int REQUEST_EXACT_ALARM = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register plugin BEFORE calling super.onCreate()
        registerPlugin(ExactAlarmPlugin.class);
        Log.d(TAG, "🔵 ExactAlarmPlugin registered before super.onCreate()");
        
        super.onCreate(savedInstanceState);
        
        // Initialize Firebase
        FirebaseApp.initializeApp(this);
        Log.d("FCM_TEST", "🔥 Firebase initialized");

        // Force FCM token fetch
        FirebaseMessaging.getInstance().getToken()
            .addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    Log.e("FCM_TEST", "❌ Token fetch failed", task.getException());
                    return;
                }
                String token = task.getResult();
                Log.d("FCM_TEST", "✅ FCM TOKEN: " + token);
            });

        // Check exact alarm permission on startup
        checkExactAlarmPermission();
    }

    private void checkExactAlarmPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            
            if (alarmManager != null && !alarmManager.canScheduleExactAlarms()) {
                Log.w(TAG, "⚠️ Exact alarm permission NOT granted");
                new android.os.Handler().postDelayed(this::showPermissionDialog, 2000);
            } else {
                Log.d(TAG, "✅ Exact alarm permission already granted");
            }
        }
    }

    private void showPermissionDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Permission Required")
            .setMessage("Streakly needs permission to send notifications at exact times.\n\n" +
                       "This ensures your task reminders fire on time, even when the app is closed.\n\n" +
                       "Please enable \"Alarms & reminders\" permission in the next screen.")
            .setPositiveButton("Open Settings", (dialog, which) -> openAlarmSettings())
            .setNegativeButton("Later", (dialog, which) -> {
                Log.d(TAG, "User declined permission request");
                dialog.dismiss();
            })
            .setCancelable(false)
            .show();
    }

    private void openAlarmSettings() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivityForResult(intent, REQUEST_EXACT_ALARM);
                Log.d(TAG, "📱 Opened exact alarm settings (method 1)");
                return;
            }
        } catch (Exception e) {
            Log.w(TAG, "Method 1 failed: " + e.getMessage());
        }

        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
            Log.d(TAG, "📱 Opened app settings (method 2)");
            return;
        } catch (Exception e) {
            Log.w(TAG, "Method 2 failed: " + e.getMessage());
        }

        try {
            Intent intent = new Intent(Settings.ACTION_SETTINGS);
            startActivity(intent);
            Log.d(TAG, "📱 Opened general settings (method 3)");
        } catch (Exception e) {
            Log.e(TAG, "❌ All methods failed: " + e.getMessage());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        
        if (requestCode == REQUEST_EXACT_ALARM) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (alarmManager != null && alarmManager.canScheduleExactAlarms()) {
                    Log.d(TAG, "✅ Permission granted by user!");
                } else {
                    Log.w(TAG, "⚠️ Permission still not granted");
                }
            }
        }
    }
}