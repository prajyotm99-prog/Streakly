# v3.8 Reliable Exact Time Notifications - Implementation Guide

## 🎯 What This Does
Makes time-based task alarms fire EXACTLY at the scheduled time, even when:
- App is completely killed
- Screen is locked
- Device is in Doze mode
- After device reboot

## 📁 Files Created

### Native Android (Java)
Place in `android/app/src/main/java/com/prajyot/tasktracker/`:
1. **ExactAlarmPlugin.java** - Capacitor plugin bridge
2. **ExactAlarmScheduler.java** - AlarmManager wrapper
3. **ExactAlarmReceiver.java** - BroadcastReceiver for notifications

### TypeScript/JS
Place in `src/`:
1. **ExactAlarm.ts** - Plugin TypeScript interface
2. **web.ts** - Web platform stub (no-op)

### Updated Files
1. **PushNotifications.js** - Now uses ExactAlarm plugin instead of LocalNotifications for time-based tasks

## 🔧 Integration Steps

### Step 1: Add Native Files
```bash
# Copy Java files to your Android project
cp android/ExactAlarmPlugin.java android/app/src/main/java/com/prajyot/tasktracker/
cp android/ExactAlarmScheduler.java android/app/src/main/java/com/prajyot/tasktracker/
cp android/ExactAlarmReceiver.java android/app/src/main/java/com/prajyot/tasktracker/
```

**IMPORTANT:** All three Java files already have the correct package declaration:
```java
package com.prajyot.tasktracker;
```

### Step 2: Update AndroidManifest.xml
Add the following inside `<manifest>` tag (before `<application>`):
```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

Add inside `<application>` tag:
```xml
<receiver 
    android:name=".ExactAlarmReceiver"
    android:enabled="true"
    android:exported="false">
    <intent-filter>
        <action android:name="com.prajyot.tasktracker.EXACT_ALARM" />
    </intent-filter>
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

### Step 3: Register Plugin in MainActivity
Add to your `MainActivity.java`:
```java
import com.prajyot.tasktracker.ExactAlarmPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Register plugins
        registerPlugin(ExactAlarmPlugin.class);
    }
}
```

### Step 4: Copy TypeScript Files
```bash
cp ExactAlarm.ts src/
cp web.ts src/
```

### Step 5: Replace PushNotifications.js
```bash
cp PushNotifications.js src/
```

### Step 6: Rebuild Native App
```bash
npx cap sync android
npx cap open android
# Build in Android Studio
```

## 🧪 Testing

### Test 1: Basic Alarm
1. Create a time-based task 2 minutes in the future
2. Wait - notification should fire exactly at the time
3. ✅ Pass if notification appears within 5 seconds of target time

### Test 2: App Killed
1. Create alarm 2 minutes ahead
2. Force stop app: `Settings → Apps → Task Tracker → Force Stop`
3. Wait - notification should still fire
4. ✅ Pass if notification appears even with app killed

### Test 3: Screen Locked
1. Create alarm 2 minutes ahead
2. Lock device and wait
3. ✅ Pass if notification fires while locked

### Test 4: Reboot Survival
1. Create alarm 10 minutes ahead
2. Reboot device
3. Open app after reboot
4. Wait for original alarm time
5. ✅ Pass if alarm fires (re-scheduled on app launch)

## 🔍 Debugging

### Check Logs
```bash
adb logcat | grep -E "ExactAlarm|TaskTracker"
```

Look for:
- `Scheduled exact alarm: task=...` - Alarm was scheduled
- `Exact alarm fired for task: ...` - Receiver triggered
- `Notification shown for task: ...` - Notification displayed

### Check Permissions
```bash
adb shell appops get com.prajyot.tasktracker SCHEDULE_EXACT_ALARM
```
Should output: `allow`

### Verify Receiver Registration
```bash
adb shell dumpsys package com.prajyot.tasktracker | grep ExactAlarmReceiver
```
Should show receiver is registered

## ⚠️ Common Issues

### Issue: Alarm doesn't fire when app is killed
**Cause:** Device manufacturer's aggressive battery optimization
**Fix:** Ask user to disable battery optimization for Task Tracker:
```
Settings → Apps → Task Tracker → Battery → Unrestricted
```

### Issue: Permission denied error
**Cause:** SCHEDULE_EXACT_ALARM not granted
**Fix:** 
1. Ensure Android 12+ (API 31+)
2. Permission is auto-granted on install
3. Check with `ExactAlarm.checkPermission()`

### Issue: Notifications don't show
**Cause:** Notification channel not created
**Fix:** Check notification channel settings:
```
Settings → Apps → Task Tracker → Notifications → Task Reminders
```
Ensure it's enabled with HIGH importance

## 📊 What Changed from v3.7

### Removed
- ❌ LocalNotifications.schedule() for time-based tasks
- ❌ Grace reminders (will return in v3.9)
- ❌ Index-based notification IDs

### Added
- ✅ ExactAlarm.schedule() - native AlarmManager
- ✅ setExactAndAllowWhileIdle - bypasses Doze
- ✅ Task ID-based alarm request codes (prevents conflicts)
- ✅ Defensive re-scheduling on app launch
- ✅ Reboot survival

### Unchanged
- ✅ Daily summary notifications (still use LocalNotifications)
- ✅ Streak warnings (still use LocalNotifications)
- ✅ Task completion logic
- ✅ Task history/storage
- ✅ UI/UX

## 🚀 Next Steps (v3.9)

Not implemented in v3.8 (intentionally deferred):
- Grace reminders (30 min follow-up)
- Notification action buttons (Mark Done, Snooze)
- Repeating alarms
- WorkManager integration
- Foreground service for critical tasks

## ✅ Success Criteria

Your v3.8 is working correctly if:
1. Time-based alarms fire within 5 seconds of target time
2. Alarms fire even when app is killed
3. Alarms survive device reboot
4. No regressions in task history or streaks
5. No regressions in daily notifications

## 📞 Support

If alarms still don't fire:
1. Check Android version (must be Android 12+)
2. Check device manufacturer (some brands block alarms)
3. Verify battery optimization is disabled
4. Check notification channel is enabled
5. Review logcat for errors

## 🔒 Version Tag
Commit: `v3.8 reliable exact time notifications`
