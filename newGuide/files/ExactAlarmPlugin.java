package com.prajyot.tasktracker;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.util.Log;

/**
 * v3.8: Capacitor plugin for exact alarm scheduling
 * Bridges JS to native AlarmManager for reliable time-based notifications
 */
@CapacitorPlugin(name = "ExactAlarm")
public class ExactAlarmPlugin extends Plugin {
    private static final String TAG = "ExactAlarmPlugin";
    private ExactAlarmScheduler scheduler;

    @Override
    public void load() {
        scheduler = new ExactAlarmScheduler(getContext());
        Log.d(TAG, "ExactAlarm plugin loaded");
    }

    /**
     * Schedule an exact alarm for a time-based task
     * @param call Contains: time (millis), taskId, taskName
     */
    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            Long timeMillis = call.getLong("time");
            String taskId = call.getString("taskId");
            String taskName = call.getString("taskName");

            if (timeMillis == null || taskId == null || taskName == null) {
                call.reject("Missing required parameters: time, taskId, taskName");
                return;
            }

            boolean success = scheduler.scheduleExactAlarm(timeMillis, taskId, taskName);
            
            if (success) {
                Log.d(TAG, "Scheduled alarm for task: " + taskName + " at " + timeMillis);
                call.resolve();
            } else {
                call.reject("Failed to schedule alarm");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error scheduling alarm", e);
            call.reject("Error: " + e.getMessage());
        }
    }

    /**
     * Cancel an exact alarm for a specific task
     * @param call Contains: taskId
     */
    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            String taskId = call.getString("taskId");
            
            if (taskId == null) {
                call.reject("Missing taskId");
                return;
            }

            scheduler.cancelExactAlarm(taskId);
            Log.d(TAG, "Cancelled alarm for task: " + taskId);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling alarm", e);
            call.reject("Error: " + e.getMessage());
        }
    }

    /**
     * Check if exact alarm permission is granted
     */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean granted = scheduler.hasExactAlarmPermission();
        call.resolve(new com.getcapacitor.JSObject().put("granted", granted));
    }
}
