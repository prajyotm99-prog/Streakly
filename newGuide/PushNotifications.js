import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import ExactAlarm from './ExactAlarm';

/**
 * ============================================================================
 * PUSH NOTIFICATIONS – STREAKLY (Discipline Companion)
 * v3.8 — Reliable Exact Time Notifications
 * ============================================================================
 *
 * This file handles:
 * 1. Permission initialization (including exact alarms)
 * 2. Message generation (pure logic)
 * 3. Task statistics calculation
 * 4. De-duplication guard
 * 5. Centralized daily notification orchestration
 * 6. Time-based exact alarms (v3.8: native AlarmManager)
 * 7. Daily flag cleanup
 *
 * v3.8 EXACT ALARM UPGRADE:
 * - Uses native ExactAlarm plugin with setExactAndAllowWhileIdle
 * - Fires reliably even when app is killed, screen locked, or in Doze
 * - Alarm survives device reboot (re-scheduled on app launch)
 * - No LocalNotifications for time-based tasks (native only)
 * - Grace reminders removed (will return in v3.9)
 * ============================================================================
 */

/* ============================================================================
 * DATE UTILITIES - v3.7.1 FIX
 * Reliable date formatting (YYYY-MM-DD)
 * ============================================================================ */

/**
 * v3.7.1 FIX: Reliable date formatter (YYYY-MM-DD)
 * toLocaleDateString('en-CA') doesn't work consistently on all devices
 */
const formatDateYYYYMMDD = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * v3.7.1: Get today's date in YYYY-MM-DD format
 */
const getTodayString = () => {
  return formatDateYYYYMMDD(new Date());
};

/**
 * v3.7.1: Get yesterday's date in YYYY-MM-DD format
 */
const getYesterdayString = () => {
  return formatDateYYYYMMDD(new Date(Date.now() - 86400000));
};

/* ============================================================================
 * INITIALIZATION
 * ============================================================================ */

const isTaskValidForDate = (task, date) => {
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  const startDate = new Date(task.startDate);
  startDate.setHours(0, 0, 0, 0);
  
  if (checkDate < startDate) return false;
  
  if (task.endDate) {
    const endDate = new Date(task.endDate);
    endDate.setHours(0, 0, 0, 0);
    if (checkDate > endDate) return false;
  }
  
  const start = new Date(task.startDate);
  start.setHours(0, 0, 0, 0);
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);

  if (current < start) return null;

  const daysDiff = Math.floor((current - start) / (1000 * 60 * 60 * 24));

  switch (task.frequency) {
    case 'Daily':
      return true;
    case 'Alternate Days':
      return daysDiff % 2 === 0 && current >= start;
    case 'Weekly':
      return daysDiff % 7 === 0;
    case 'Monthly':
      return start.getDate() === current.getDate();
    default:
      return false;
  }
};

export const initPushNotifications = async () => {
  console.log('🔔 v3.8: Initializing notifications...');

  if (!Capacitor.isNativePlatform()) {
    console.log('⏭️ Notifications skipped (web platform)');
    return;
  }

  try {
    // Request notification permission
    const permissionResult = await LocalNotifications.requestPermissions();

    if (permissionResult.display === 'granted') {
      console.log('✅ Notification permission granted');
    } else {
      console.warn('⚠️ Notification permission denied');
    }

    // v3.7.1: Check and request exact alarm permission (Android 12+)
    if (Capacitor.getPlatform() === 'android') {
      await checkExactAlarmPermission();
    }

  } catch (error) {
    console.error('❌ Error while requesting notification permissions:', error);
  }
};

/**
 * v3.7.1: Check if exact alarm permission is granted (Android 12+)
 * This permission is needed for time-based notifications to fire at exact times
 */
const checkExactAlarmPermission = async () => {
  try {
    // Check current permission status
    const result = await LocalNotifications.checkPermissions();
    console.log('📋 Current permissions:', result);

    // On Android 12+, we need exact alarm permission
    if (result.exactAlarm === 'prompt' || result.exactAlarm === 'prompt-with-rationale') {
      console.log('⚠️ Exact alarm permission needed - requesting...');
      
      // Request permission
      const requestResult = await LocalNotifications.requestPermissions();
      
      if (requestResult.exactAlarm === 'granted') {
        console.log('✅ Exact alarm permission granted');
      } else {
        console.warn('⚠️ Exact alarm permission denied');
        
        // Alert user about manual permission
        setTimeout(() => {
          alert(
            'Important: Enable "Alarms & Reminders" permission\n\n' +
            'For notifications to work when the app is closed:\n\n' +
            '1. Go to Settings → Apps → Streakly\n' +
            '2. Tap Permissions\n' +
            '3. Enable "Alarms & reminders"\n\n' +
            'This ensures your task reminders fire on time!'
          );
        }, 1000);
      }
    } else if (result.exactAlarm === 'granted') {
      console.log('✅ Exact alarm permission already granted');
    } else {
      console.log('ℹ️ Exact alarm permission status:', result.exactAlarm);
    }
  } catch (error) {
    console.error('❌ Error checking exact alarm permission:', error);
    // Don't block app initialization if permission check fails
  }
};

/**
 * v3.6: Converts HH:MM time string to Date object for today
 */
const parseTimeToToday = (timeString) => {
  if (!timeString) return null;
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

/**
 * v3.6: Checks if a time has already passed today
 */
const hasTimePassed = (timeString) => {
  const targetTime = parseTimeToToday(timeString);
  if (!targetTime) return false;
  return new Date() > targetTime;
};

/* ============================================================================
 * PURE MESSAGE GENERATORS
 * ============================================================================ */

const generateMorningMessage = (yesterdayStats, todayStats) => {
  const { totalTasks: yesterdayTotal, completedTasks: yesterdayCompleted } = yesterdayStats;
  const { totalTasks: todayTotal } = todayStats;

  if (yesterdayTotal === 0 && todayTotal === 0) {
    return {
      title: '🔥 A Fresh Start Awaits',
      body: 'Add a task today and begin your first streak.',
      largeBody: '🔥 A FRESH START AWAITS\n\nAdd a task today and begin your first streak.',
    };
  }

  if (yesterdayTotal === 0 && todayTotal > 0) {
    return {
      title: '🎯 Your Tasks Await',
      body: `You have ${todayTotal} task${todayTotal > 1 ? 's' : ''} to complete today.`,
      largeBody: `🎯 YOUR TASKS AWAIT\n\nYou have ${todayTotal} task${todayTotal > 1 ? 's' : ''} to complete today.\n\nLet's build consistency together.`,
    };
  }

  if (yesterdayCompleted === 0) {
    return {
      title: '💪 Yesterday Slipped',
      body: `Today you have ${todayTotal} task${todayTotal > 1 ? 's' : ''}.`,
      largeBody: `💪 YESTERDAY SLIPPED\n\nToday you have ${todayTotal} task${todayTotal > 1 ? 's' : ''} to complete.\n\nNew day. New chance. Show up today.`,
    };
  }

  if (yesterdayCompleted === yesterdayTotal) {
    return {
      title: '🔥 Yesterday Was Strong',
      body: `Today: ${todayTotal} task${todayTotal > 1 ? 's' : ''} to maintain momentum.`,
      largeBody: `🔥 YESTERDAY WAS STRONG\n\nToday: ${todayTotal} task${todayTotal > 1 ? 's' : ''} to maintain momentum.\n\nPerfect discipline. Repeat it today.`,
    };
  }

  return {
    title: '🌱 Progress Made',
    body: `Yesterday: ${yesterdayCompleted}/${yesterdayTotal}. Today: ${todayTotal} task${todayTotal > 1 ? 's' : ''}.`,
    largeBody: `🌱 PROGRESS MADE\n\nYesterday: ${yesterdayCompleted} of ${yesterdayTotal} completed.\nToday: ${todayTotal} task${todayTotal > 1 ? 's' : ''} to complete.\n\nSmall improvements create big streaks.`,
  };
};

const generateNightSummary = (todayStats) => {
  const { totalTasks, completedTasks } = todayStats;

  if (totalTasks === 0) {
    return {
      title: '📝 No Tasks Today',
      body: 'Add tasks tomorrow and start building consistency.',
    };
  }

  if (completedTasks === totalTasks) {
    return {
      title: '✅ Day Completed',
      body: `${completedTasks} of ${totalTasks} tasks done. Excellent work.`,
    };
  }

  return {
    title: '📊 Today\'s Summary',
    body: `Completed ${completedTasks} of ${totalTasks} tasks.`,
  };
};

const generateStreakWarning = (pendingTasks) => {
  if (pendingTasks === 1) {
    return {
      title: '⚠️ One Task Remaining',
      body: 'Finish it now to protect your streak.',
    };
  }

  return {
    title: `⚠️ ${pendingTasks} Tasks Pending`,
    body: 'Complete them before the day ends.',
  };
};

/* ============================================================================
 * TASK STATISTICS CALCULATOR
 * ============================================================================ */

const calculateTaskStats = async (tasks, taskStatuses, dateString) => {
  const checkDate = new Date(dateString);
  checkDate.setHours(0, 0, 0, 0);

  const validTasks = tasks.filter((task) => {
    const startDate = new Date(task.startDate);
    startDate.setHours(0, 0, 0, 0);

    if (checkDate < startDate) return false;

    if (task.endDate) {
      const endDate = new Date(task.endDate);
      endDate.setHours(0, 0, 0, 0);
      if (checkDate > endDate) return false;
    }

    const daysDiff = Math.floor((checkDate - startDate) / (1000 * 60 * 60 * 24));

    switch (task.frequency) {
      case 'Daily':
        return true;
      case 'Alternate Days':
        return daysDiff % 2 === 0;
      case 'Weekly':
        return daysDiff % 7 === 0;
      case 'Monthly':
        return startDate.getDate() === checkDate.getDate();
      default:
        return false;
    }
  });

  const completedTasks = validTasks.filter((task) => {
    const key = `${task.id}_${dateString}`;
    return taskStatuses[key] === 'Yes';
  }).length;

  const stats = {
    totalTasks: validTasks.length,
    completedTasks,
    pendingTasks: validTasks.length - completedTasks,
  };

  console.log('📊 Task Stats for', dateString, ':', stats);

  return stats;
};

/* ============================================================================
 * DE-DUPLICATION GUARDS
 * v3.7: IMPROVED with time-based window
 * ============================================================================ */

const hasUserActuallyStarted = (tasks) => {
  return Array.isArray(tasks) && tasks.length > 0;
};

/**
 * v3.7 FIX: Improved de-duplication
 * Allows re-scheduling if we cross into a new day
 * Also prevents rapid re-scheduling (1 hour window)
 */
const shouldScheduleToday = async () => {
  try {
    const stored = await window.storage.get('lastScheduledDate');
    const today = getTodayString(); // v3.7.1 FIX

    if (stored && stored.value === today) {
      // Already scheduled for today - check if recent
      const storedTime = await window.storage.get('lastScheduledTime');
      if (storedTime) {
        const timeSinceSchedule = Date.now() - parseInt(storedTime.value);
        // If scheduled less than 1 hour ago, skip
        if (timeSinceSchedule < 3600000) {
          console.log('⏭️ Notifications scheduled recently, skipping');
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Schedule guard failed:', error);
    return true;
  }
};

/**
 * v3.7 FIX: Track both date and timestamp
 */
const markAsScheduledToday = async () => {
  try {
    const today = getTodayString(); // v3.7.1 FIX
    const now = Date.now().toString();
    await window.storage.set('lastScheduledDate', today);
    await window.storage.set('lastScheduledTime', now);
    console.log('✅ Notifications marked as scheduled for', today, 'at', new Date().toLocaleTimeString());
  } catch (error) {
    console.error('❌ Failed to mark scheduled date:', error);
  }
};

/**
 * v3.7 NEW: Clear time-based notification flags for new day
 * Call this when day changes to allow re-scheduling
 */
const clearOldNotificationFlags = async (tasks) => {
  const today = getTodayString(); // v3.7.1 FIX
  const yesterday = getYesterdayString(); // v3.7.1 FIX
  
  try {
    for (const task of tasks) {
      if (task.isTimeBased && task.targetTime) {
        const oldScheduleFlag = `timeTaskScheduled_${task.id}_${yesterday}`;
        await window.storage.remove(oldScheduleFlag);
      }
    }
    console.log('🧹 Cleared notification flags for yesterday');
  } catch (error) {
    console.error('❌ Failed to clear old flags:', error);
  }
};

/* ============================================================================
 * CENTRALIZED DAILY NOTIFICATION ORCHESTRATOR
 * ============================================================================ */

export const scheduleDailyNotifications = async (tasks, taskStatuses) => {
  if (!Capacitor.isNativePlatform()) {
    console.log('⏭️ Skipping notification scheduling (web)');
    return;
  }

  if (!hasUserActuallyStarted(tasks)) {
    console.log('⏭️ No tasks found – skipping daily notifications');
    return;
  }

  const canSchedule = await shouldScheduleToday();
  if (!canSchedule) return;

  try {
    // v3.6: Clear all old notifications
    await LocalNotifications.cancel({
      notifications: [
        { id: 1 }, { id: 2 }, { id: 3 },
        { id: 4 }, { id: 5 }, { id: 6 },
        { id: 7 }, { id: 8 }, { id: 9 }
      ],
    });
    
    console.log('🧹 Cleared all old notifications');

    const today = getTodayString(); // v3.7.1 FIX
    const yesterday = getYesterdayString(); // v3.7.1 FIX

    // Calculate stats
    const yesterdayStats = await calculateTaskStats(tasks, taskStatuses, yesterday);
    const todayStats = await calculateTaskStats(tasks, taskStatuses, today);

    const notifications = [];

    // Morning notification (8:00 AM)
    const morningMsg = generateMorningMessage(yesterdayStats, todayStats);
    const morningTime = new Date();
    morningTime.setHours(8, 0, 0, 0);
    if (morningTime < Date.now()) {
      morningTime.setDate(morningTime.getDate() + 1);
    }

    notifications.push({
      id: 1,
      title: morningMsg.title,
      body: morningMsg.body,
      largeBody: morningMsg.largeBody,
      schedule: { at: morningTime },
      sound: 'default',
      smallIcon: 'ic_notification',
      iconColor: '#667eea'
    });

    // Night summary (9:00 PM)
    const nightMsg = generateNightSummary(todayStats);
    const nightTime = new Date();
    nightTime.setHours(21, 0, 0, 0);
    if (nightTime < Date.now()) {
      nightTime.setDate(nightTime.getDate() + 1);
    }

    notifications.push({
      id: 2,
      title: nightMsg.title,
      body: nightMsg.body,
      schedule: { at: nightTime },
      sound: 'default',
      smallIcon: 'ic_notification',
      iconColor: '#667eea'
    });

    // Streak warning (10:00 PM) - only if pending tasks
    if (todayStats.totalTasks > 0 && todayStats.pendingTasks > 0) {
      const warnMsg = generateStreakWarning(todayStats.pendingTasks);
      const warnTime = new Date();
      warnTime.setHours(22, 0, 0, 0);
      if (warnTime < Date.now()) {
        warnTime.setDate(warnTime.getDate() + 1);
      }

      notifications.push({
        id: 3,
        title: warnMsg.title,
        body: warnMsg.body,
        schedule: { at: warnTime },
        sound: 'default',
        smallIcon: 'ic_notification',
        iconColor: '#ff6b35'
      });
    }

    await LocalNotifications.schedule({ notifications });
    await markAsScheduledToday();

    console.log('✅ v3.7.1: Daily notifications scheduled successfully');
    console.log('📊 Scheduled:', {
      morning: { time: morningTime.toLocaleString(), title: morningMsg.title },
      night: { time: nightTime.toLocaleString(), title: nightMsg.title },
      warning: todayStats.pendingTasks > 0 ? 'Yes' : 'Skipped'
    });

  } catch (error) {
    console.error('❌ Failed to schedule notifications:', error);
  }
};

/* ============================================================================
 * TIME-BASED TASK NOTIFICATIONS (PHASE 3)
 * v3.7: With improved de-duplication
 * ============================================================================ */

/**
 * v3.8: Schedules exact time-based alarms using native AlarmManager
 * - Uses ExactAlarm plugin for setExactAndAllowWhileIdle
 * - Fires even when app is killed
 * - No grace reminders in v3.8 (main alarm only)
 * - Auto-cancels when task marked complete
 */
const scheduleTimeBasedNotifications = async (tasks, taskStatuses) => {
  if (Capacitor.getPlatform() === 'web') {
    console.log('⏰ Time-based notifications skipped (web platform)');
    return;
  }

  const today = getTodayString();
  const timeBasedTasks = tasks.filter(task => 
    task.isTimeBased && 
    task.targetTime &&
    isTaskValidForDate(task, today)
  );

  console.log('⏰ v3.8: Scheduling exact alarms for', timeBasedTasks.length, 'tasks');

  for (const task of timeBasedTasks) {
    const statusKey = `${task.id}_${today}`;
    const isCompleted = taskStatuses[statusKey] === 'Yes';

    if (isCompleted) {
      console.log(`⏰ Task "${task.name}" already completed, skipping alarm`);
      continue;
    }

    const scheduleFlagKey = `exactAlarm_${task.id}_${today}`;
    
    try {
      const scheduleFlag = await window.storage.get(scheduleFlagKey);
      if (scheduleFlag && scheduleFlag.value === 'true') {
        console.log(`⏰ Task "${task.name}" alarm already scheduled for today`);
        continue;
      }

      const targetTime = parseTimeToToday(task.targetTime);
      const now = new Date();

      // If time has passed, schedule for tomorrow
      let scheduleTime = targetTime;
      if (targetTime <= now) {
        scheduleTime = new Date(targetTime);
        scheduleTime.setDate(scheduleTime.getDate() + 1);
        console.log(`⏰ Task "${task.name}" time passed, scheduling for tomorrow at ${task.targetTime}`);
      }

      // Schedule exact alarm via native plugin
      await ExactAlarm.schedule({
        time: scheduleTime.getTime(), // epoch milliseconds
        taskId: task.id,
        taskName: task.name
      });

      // Set de-duplication flag
      await window.storage.set(scheduleFlagKey, 'true');
      
      console.log(`⏰ v3.8: Scheduled exact alarm for "${task.name}" at ${scheduleTime.toLocaleString()}`);

    } catch (error) {
      console.error(`⏰ Error scheduling exact alarm for "${task.name}":`, error);
    }
  }
};

/**
 * v3.8: Cancels exact alarm for a specific task
 * Called when task is marked complete or deleted
 */
export const cancelTimeBasedNotifications = async (taskId, tasks) => {
  if (Capacitor.getPlatform() === 'web') return;

  try {
    // Cancel exact alarm via native plugin
    await ExactAlarm.cancel({ taskId });
    
    console.log(`⏰ v3.8: Cancelled exact alarm for task ${taskId}`);
  } catch (error) {
    console.error('⏰ Error cancelling exact alarm:', error);
  }
};

/* ============================================================================
 * PUBLIC TRIGGER
 * v3.8: Enhanced with defensive re-scheduling
 * ============================================================================ */

/**
 * v3.8: Re-schedule exact alarms for active time-based tasks
 * Called on app launch to survive:
 * - Device reboot
 * - App updates
 * - OS purging alarms
 * 
 * Only re-schedules if:
 * - Task is active (not ended/paused)
 * - Task is time-based
 * - Next trigger time is in the future
 */
export const rescheduleExactAlarms = async (tasks, taskStatuses) => {
  if (Capacitor.getPlatform() === 'web') return;

  console.log('⏰ v3.8: Defensive re-scheduling of exact alarms...');

  const today = getTodayString();
  const now = new Date();

  // Get all active time-based tasks
  const activeTimeBased = tasks.filter(task => 
    task.isTimeBased && 
    task.targetTime &&
    (!task.endDate || task.endDate > today) // Active tasks only
  );

  for (const task of activeTimeBased) {
    try {
      const targetTime = parseTimeToToday(task.targetTime);
      
      // Determine next trigger time
      let nextTrigger = targetTime;
      if (targetTime <= now) {
        // Time passed today, schedule for tomorrow
        nextTrigger = new Date(targetTime);
        nextTrigger.setDate(nextTrigger.getDate() + 1);
      }

      // Check if already completed today
      const statusKey = `${task.id}_${today}`;
      const isCompleted = taskStatuses[statusKey] === 'Yes';

      if (isCompleted) {
        console.log(`⏰ Task "${task.name}" completed today, skipping re-schedule`);
        continue;
      }

      // Re-schedule alarm
      await ExactAlarm.schedule({
        time: nextTrigger.getTime(),
        taskId: task.id,
        taskName: task.name
      });

      console.log(`⏰ Re-scheduled alarm for "${task.name}" at ${nextTrigger.toLocaleString()}`);
    } catch (error) {
      console.error(`⏰ Error re-scheduling alarm for "${task.name}":`, error);
    }
  }

  console.log('⏰ v3.8: Defensive re-scheduling complete');
};

/**
 * v3.8: Daily notification scheduling with exact alarm re-scheduling
 * Called at:
 * - App startup (triggers re-scheduling)
 * - Midnight rollover
 * - Task add/update
 */
export const triggerDailyNotificationCheck = async (tasks, taskStatuses) => {
  console.log('🔔 v3.8: Running daily notification check...');
  
  if (!hasUserActuallyStarted(tasks)) {
    console.log('🔔 User has not started yet, skipping notifications');
    return;
  }

  // v3.7: Clear old flags before scheduling
  await clearOldNotificationFlags(tasks);
  
  // v3.8: Defensive re-scheduling (survives reboot/updates)
  await rescheduleExactAlarms(tasks, taskStatuses);
  
  await scheduleDailyNotifications(tasks, taskStatuses);
  await scheduleTimeBasedNotifications(tasks, taskStatuses);

  console.log('✅ v3.8: Daily notification check complete');
};
