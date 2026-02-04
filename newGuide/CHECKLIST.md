# v3.8 Implementation Verification Checklist

## ✅ Pre-Integration Checks

### Files Present
- [ ] ExactAlarmPlugin.java (2.7KB)
- [ ] ExactAlarmScheduler.java (4.3KB)
- [ ] ExactAlarmReceiver.java (5.2KB)
- [ ] ExactAlarm.ts (1.1KB)
- [ ] web.ts (590 bytes)
- [ ] PushNotifications.js (23KB)
- [ ] AndroidManifest_additions.xml (1.4KB)
- [ ] IMPLEMENTATION_GUIDE_v3.8.md (6KB)

### Read Documentation
- [ ] Implementation guide reviewed
- [ ] Android manifest changes understood
- [ ] Plugin registration steps clear

## ✅ Integration Steps

### Native Android
- [ ] Java files copied to `android/app/src/main/java/com/streakly/app/`
- [ ] Package name verified (adjust if not `com.streakly.app`)
- [ ] AndroidManifest.xml updated with permissions
- [ ] AndroidManifest.xml updated with receiver
- [ ] ExactAlarmPlugin registered in MainActivity.java

### TypeScript/JS
- [ ] ExactAlarm.ts copied to `src/`
- [ ] web.ts copied to `src/`
- [ ] PushNotifications.js replaced in `src/`
- [ ] Import paths verified

### Build
- [ ] `npx cap sync android` executed successfully
- [ ] Android project opened in Android Studio
- [ ] No compilation errors
- [ ] APK built successfully

## ✅ Functional Testing

### Test 1: Basic Exact Alarm
- [ ] Created time-based task 2 min ahead
- [ ] Notification fired within 5 seconds of target time
- [ ] Notification content shows task name
- [ ] Tapping notification opens app

### Test 2: App Killed State
- [ ] Created alarm 2 min ahead
- [ ] Force stopped app via Settings
- [ ] Notification still fired at exact time
- [ ] App opens when notification tapped

### Test 3: Screen Locked / Doze
- [ ] Created alarm 2 min ahead
- [ ] Locked screen and waited
- [ ] Notification fired while screen locked
- [ ] Device woke up for notification

### Test 4: Defensive Re-scheduling
- [ ] Created alarm 10 min ahead
- [ ] Rebooted device
- [ ] Opened app after reboot
- [ ] Original alarm still fired at correct time

### Test 5: Multiple Tasks
- [ ] Created 3 time-based tasks with different times
- [ ] All 3 alarms fired independently
- [ ] No alarm overwrote another
- [ ] Each had unique notification

## ✅ Regression Testing

### Core Features Still Work
- [ ] Task creation works
- [ ] Streak calculation unchanged
- [ ] Task completion marking works
- [ ] Daily notifications (8 AM) still fire
- [ ] Night summary (9 PM) still fires
- [ ] Streak warning (10 PM) still fires
- [ ] Tracker page displays correctly
- [ ] Calendar modal shows history
- [ ] Active/Ended task split intact

### No Breaking Changes
- [ ] No changes to task schema
- [ ] No changes to storage keys
- [ ] No changes to streak logic
- [ ] No changes to UI components
- [ ] No changes to tracker behavior

## ✅ Permission Verification

### Android System
```bash
adb shell appops get com.streakly.app SCHEDULE_EXACT_ALARM
```
- [ ] Output: `allow`

### In-App Check
```javascript
const result = await ExactAlarm.checkPermission();
console.log(result.granted); // should be true
```
- [ ] Returns `{granted: true}`

## ✅ Logging Verification

### LogCat Output Shows
```bash
adb logcat | grep -E "ExactAlarm|Streakly"
```
- [ ] "ExactAlarm plugin loaded"
- [ ] "Scheduled exact alarm: task=..."
- [ ] "Exact alarm fired for task: ..."
- [ ] "Notification shown for task: ..."
- [ ] No error messages

## ✅ Edge Cases

### Completed Task
- [ ] Marked task as complete
- [ ] Alarm was cancelled (no notification fires)
- [ ] Re-opening app doesn't re-schedule completed task

### Ended Task
- [ ] Ended an active time-based task
- [ ] Alarm was cancelled
- [ ] Re-opening app doesn't re-schedule ended task

### Time Already Passed
- [ ] Created time-based task with time 5 min ago
- [ ] Alarm scheduled for tomorrow at same time
- [ ] Logs show "time passed, scheduling for tomorrow"

### Edit Task Time
- [ ] Created task for 3 PM
- [ ] Edited time to 4 PM
- [ ] Old alarm cancelled, new alarm scheduled
- [ ] Notification fires at 4 PM (not 3 PM)

## ✅ Manufacturer-Specific

### Battery Optimization
- [ ] Settings → Apps → Streakly → Battery
- [ ] Set to "Unrestricted" (if available)
- [ ] Alarms still fire in battery saver mode

### Notification Channel
- [ ] Settings → Apps → Streakly → Notifications
- [ ] "Task Reminders" channel exists
- [ ] Importance set to HIGH
- [ ] Channel enabled

## ⚠️ Known Limitations (Expected)

- [ ] Grace reminders (30 min) NOT implemented (deferred to v3.9)
- [ ] No notification action buttons (deferred to v3.9)
- [ ] No repeating alarms (deferred to v3.9)
- [ ] Web platform shows "not supported" (expected)

## 🚨 Stop If:

Any of these are true - DO NOT DEPLOY:
- ❌ Alarms don't fire when app is killed
- ❌ Alarms overwrite each other
- ❌ Streaks are broken or reset
- ❌ Task history is lost
- ❌ App crashes on alarm fire
- ❌ Daily notifications stop working
- ❌ Compilation errors in native code

## ✅ Deployment Ready When:

All of these are true:
- ✅ All functional tests pass
- ✅ No regressions detected
- ✅ LogCat shows clean logs
- ✅ Permissions granted correctly
- ✅ Multiple device tests successful
- ✅ Reboot test passed
- ✅ Implementation guide followed exactly

## 📝 Post-Deployment Monitoring

First 48 hours:
- [ ] Monitor user reports of missed notifications
- [ ] Check for crash reports in ExactAlarmReceiver
- [ ] Verify alarm reliability across device manufacturers
- [ ] Collect feedback on notification timing accuracy

## 🎯 Success Metrics

Target: 95% of alarms fire within 10 seconds of target time
Target: 90% of alarms survive app kill
Target: Zero regressions in core features

---

**Version:** v3.8 Reliable Exact Time Notifications
**Commit Message:** `v3.8 reliable exact time notifications`
**Date:** 2026-02-03
