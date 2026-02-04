# v3.8 Quick Start

## What This Is
Native exact alarms for time-based tasks that fire even when app is killed.

## 5-Minute Integration

### 1. Copy Files (30 seconds)
```bash
# Android native
cp android/*.java android/app/src/main/java/com/prajyot/tasktracker/

# TypeScript
cp ExactAlarm.ts src/
cp web.ts src/

# Updated JS
cp PushNotifications.js src/
```

### 2. Update AndroidManifest.xml (1 minute)
Add these 4 permissions before `<application>`:
```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

Add receiver inside `<application>`:
```xml
<receiver 
    android:name=".ExactAlarmReceiver"
    android:enabled="true"
    android:exported="false">
    <intent-filter>
        <action android:name="com.prajyot.tasktracker.EXACT_ALARM" />
    </intent-filter>
</receiver>
```

### 3. Register Plugin in MainActivity (1 minute)
```java
import com.prajyot.tasktracker.ExactAlarmPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(ExactAlarmPlugin.class);
    }
}
```

### 4. Build (2 minutes)
```bash
npx cap sync android
npx cap open android
# Build APK in Android Studio
```

### 5. Test (1 minute)
1. Create time-based task 2 min ahead
2. Force stop app
3. Wait for notification ✅

## What Changed
- ❌ Removed: LocalNotifications for time-based tasks
- ❌ Removed: Grace reminders (v3.9)
- ✅ Added: Native AlarmManager with setExactAndAllowWhileIdle
- ✅ Added: Reboot survival
- ✅ Added: Defensive re-scheduling

## Zero Changes To
- Task creation/editing UI
- Streak calculation
- Task history
- Tracker page
- Daily notifications (still LocalNotifications)
- Active/Ended task logic

## If It Doesn't Work
1. Check: `adb shell appops get com.prajyot.tasktracker SCHEDULE_EXACT_ALARM` → should be `allow`
2. Check: Settings → Apps → Task Tracker → Battery → Unrestricted
3. Check: LogCat for `ExactAlarm` errors

## Files in This Package
- **ExactAlarmPlugin.java** - Capacitor bridge
- **ExactAlarmScheduler.java** - AlarmManager wrapper
- **ExactAlarmReceiver.java** - Notification builder
- **ExactAlarm.ts** - TypeScript interface
- **web.ts** - Web stub
- **PushNotifications.js** - Updated scheduler
- **AndroidManifest_additions.xml** - Reference
- **IMPLEMENTATION_GUIDE_v3.8.md** - Full docs
- **CHECKLIST.md** - Testing checklist

## Commit Message
```
v3.8 reliable exact time notifications
```

---
**Need help?** Read IMPLEMENTATION_GUIDE_v3.8.md
