package com.prajyot.tasktracker;

import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

/**
 * v3.7.1: Capacitor plugin for scheduling exact alarms
 */
@CapacitorPlugin(name = "ExactAlarm")
public class ExactAlarmPlugin extends Plugin {

    private static final String TAG = "ExactAlarmPlugin";

    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            Long time = call.getLong("time");
            String taskId = call.getString("taskId");
            String taskName = call.getString("taskName");

            if (time == null || taskId == null || taskName == null) {
                call.reject("Missing required parameters");
                return;
            }

            Log.d(TAG, "📞 JS called schedule() for: " + taskName);

            ExactAlarmScheduler.schedule(
                    getContext(),
                    time,
                    taskId,
                    taskName
            );

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "❌ Error: " + e.getMessage());
            call.reject("Failed to schedule: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            String taskId = call.getString("taskId");

            if (taskId == null) {
                call.reject("Missing taskId");
                return;
            }

            Log.d(TAG, "📞 JS called cancel() for: " + taskId);

            ExactAlarmScheduler.cancel(getContext(), taskId);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "❌ Error: " + e.getMessage());
            call.reject("Failed to cancel: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        try {
            boolean granted = ExactAlarmScheduler.hasExactAlarmPermission(getContext());

            JSObject ret = new JSObject();
            ret.put("granted", granted);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "❌ Error: " + e.getMessage());
            call.reject("Failed to check permission: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            ExactAlarmScheduler.openExactAlarmSettings(getContext());

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "❌ Error: " + e.getMessage());
            call.reject("Failed to open settings: " + e.getMessage());
        }
    }
}