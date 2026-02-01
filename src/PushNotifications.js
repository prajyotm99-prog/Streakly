import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * ============================================================================
 * PUSH NOTIFICATIONS – STREAKLY (Discipline Companion)
 * v3.8.1 — Stability, Consistency & Reliability Update (Grace Reminder Fix)
 * ============================================================================
 *
 * This file handles:
 * 1. Permission initialization
 * 2. Message generation (pure logic)
 * 3. Task statistics calculation
 * 4. De-duplication guard (v3.8: improved daily check)
 * 5. Centralized daily notification orchestrator
 * 6. Time-based task notifications
 * 7. Daily flag cleanup
 *
 * v3.8 FIXES:
 * - Fixed night summary showing "0 completed" (loads from storage)
 * - Added iconColor to ALL notifications for consistency
 * - Added last_notification_check flag to prevent duplicate scheduling
 * - Enhanced debug logging for night summary stats
 * - Improved reliability for app killed state
 *
 * v3.8.1 FIX:
 * - Fixed grace reminder not firing (removed premature flag setting)
 * - Grace reminder now always schedules alongside main notification
 * - Auto-cancels when task is marked complete
 * ============================================================================
 */

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
  console.log('🔔 v3.8.1: Initializing notifications...');

  if (!Capacitor.isNativePlatform()) {
    console.log('⏭️ Notifications skipped (web platform)');
    return;
  }

  try {
    const permissionResult = await LocalNotifications.requestPermissions();

    if (permissionResult.display === 'granted') {
      console.log('✅ Notification permission granted');
    } else {
      console.warn('⚠️ Notification permission denied');
    }
  } catch (error) {
    console.error('❌ Error while requesting notification permissions:', error);
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
 * v3.8 FIX: Now loads from storage for accurate night summary
 * ============================================================================ */

/**
 * v3.8 IMPROVED: Calculates task stats with optional storage fallback
 * Used by night summary to ensure accurate counts
 */
const calculateTaskStats = async (tasks, taskStatuses, dateString, loadFromStorage = false) => {
  const checkDate = new Date(dateString);
  checkDate.setHours(0, 0, 0, 0);

  // v3.8 FIX: Load from storage if requested (for night summary)
  let currentTaskStatuses = taskStatuses;
  if (loadFromStorage) {
    try {
      const statusesResult = await Preferences.get({ key: 'taskStatuses' });
      if (statusesResult.value) {
        currentTaskStatuses = JSON.parse(statusesResult.value);
        console.log('📊 v3.8: Loaded taskStatuses from storage for accurate stats');
      }
    } catch (e) {
      console.warn('⚠️ Could not load taskStatuses from storage, using passed value');
    }
  }

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
    return currentTaskStatuses[key] === 'Yes';
  }).length;

  const stats = {
    totalTasks: validTasks.length,
    completedTasks,
    pendingTasks: validTasks.length - completedTasks,
  };

  // v3.8: Debug logging
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
    const today = new Date().toLocaleDateString('en-CA');

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
    const today = new Date().toLocaleDateString('en-CA');
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
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  
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
 * v3.8: Enhanced with storage-based stats for night summary
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

    const today = new Date().toLocaleDateString('en-CA');
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');

    // Calculate stats (morning uses passed taskStatuses)
    const yesterdayStats = await calculateTaskStats(tasks, taskStatuses, yesterday, false);
    const todayStats = await calculateTaskStats(tasks, taskStatuses, today, false);

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
      iconColor: '#667eea' // v3.8: Explicit icon color
    });

    // v3.8 FIX: Night summary uses storage-loaded stats
    const nightStatsFromStorage = await calculateTaskStats(tasks, taskStatuses, today, true);
    const nightMsg = generateNightSummary(nightStatsFromStorage);
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
      iconColor: '#667eea' // v3.8: Explicit icon color
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
        iconColor: '#ff6b35' // v3.8: Explicit icon color
      });
    }

    await LocalNotifications.schedule({ notifications });
    await markAsScheduledToday();

    console.log('✅ v3.8: Daily notifications scheduled successfully');
    console.log('📊 Scheduled:', {
      morning: { time: morningTime.toLocaleString(), title: morningMsg.title },
      night: { time: nightTime.toLocaleString(), title: nightMsg.title, stats: nightStatsFromStorage },
      warning: todayStats.pendingTasks > 0 ? 'Yes' : 'Skipped'
    });

  } catch (error) {
    console.error('❌ Failed to schedule notifications:', error);
  }
};

/* ============================================================================
 * TIME-BASED TASK NOTIFICATIONS (PHASE 3)
 * v3.8.1 FIX: Grace reminder always schedules
 * ============================================================================ */

/**
 * v3.8.1 CRITICAL FIX: Schedules time-based task notifications
 * - Main notification at target time
 * - Grace reminder 30 min later (ALWAYS schedules)
 * - Auto-cancels when task marked complete
 */
const scheduleTimeBasedNotifications = async (tasks, taskStatuses) => {
  if (Capacitor.getPlatform() === 'web') {
    console.log('⏰ Time-based notifications skipped (web platform)');
    return;
  }

  const today = new Date().toLocaleDateString('en-CA');
  const timeBasedTasks = tasks.filter(task => 
    task.isTimeBased && 
    task.targetTime &&
    isTaskValidForDate(task, today)
  );

  console.log('⏰ v3.8.1: Scheduling time-based notifications for', timeBasedTasks.length, 'tasks');

  for (let i = 0; i < timeBasedTasks.length; i++) {
    const task = timeBasedTasks[i];
    const statusKey = `${task.id}_${today}`;
    const isCompleted = taskStatuses[statusKey] === 'Yes';

    if (isCompleted) {
      console.log(`⏰ Task "${task.name}" already completed, skipping notification`);
      continue;
    }

    const scheduleFlagKey = `timeTaskScheduled_${task.id}_${today}`;
    
    try {
      const scheduleFlag = await window.storage.get(scheduleFlagKey);
      if (scheduleFlag && scheduleFlag.value === 'true') {
        console.log(`⏰ Task "${task.name}" already scheduled for today`);
        continue;
      }

      const targetTime = parseTimeToToday(task.targetTime);
      const now = new Date();

      // v3.6 CRITICAL FIX: If time has passed, schedule for tomorrow
      let scheduleTime = targetTime;
      if (targetTime <= now) {
        scheduleTime = new Date(targetTime);
        scheduleTime.setDate(scheduleTime.getDate() + 1);
        console.log(`⏰ Task "${task.name}" time passed, scheduling for tomorrow at ${task.targetTime}`);
      }

      // Main notification at target time
      const mainNotificationId = 100 + i;
      await LocalNotifications.schedule({
        notifications: [{
          id: mainNotificationId,
          title: `⏰ ${task.name} time`,
          body: 'Have you completed it?',
          schedule: { at: scheduleTime },
          sound: 'default',
          smallIcon: 'ic_notification',
          iconColor: '#667eea'
        }]
      });

      // v3.8.1 FIX: Grace reminder - ALWAYS schedule (no flag check)
      const graceTime = new Date(scheduleTime.getTime() + 30 * 60 * 1000);
      const graceNotificationId = 200 + i;

      await LocalNotifications.schedule({
        notifications: [{
          id: graceNotificationId,
          title: `⏳ ${task.name} is still pending`,
          body: '30 mins already past. Please complete it soon!',
          schedule: { at: graceTime },
          sound: 'default',
          smallIcon: 'ic_notification',
          iconColor: '#ff6b35'
        }]
      });

      // Set de-duplication flag (only for main notification)
      await window.storage.set(scheduleFlagKey, 'true');
      
      console.log(`⏰ Scheduled main notification for "${task.name}" at ${scheduleTime.toLocaleString()}`);
      console.log(`⏰ Scheduled grace reminder for "${task.name}" at ${graceTime.toLocaleString()}`);

    } catch (error) {
      console.error(`⏰ Error scheduling time-based notification for "${task.name}":`, error);
    }
  }
};

/**
 * v3.6: Cancels time-based notifications for a specific task
 * Fixed to use tasks array instead of index
 */
const cancelTimeBasedNotifications = async (taskId, tasks) => {
  if (Capacitor.getPlatform() === 'web') return;

  try {
    const today = new Date().toLocaleDateString('en-CA');
    const timeBasedTasks = tasks.filter(task => 
      task.isTimeBased && 
      task.targetTime &&
      isTaskValidForDate(task, today)
    );

    const taskIndex = timeBasedTasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      console.log(`⏰ Task ${taskId} is not a time-based task for today`);
      return;
    }

    const mainNotificationId = 100 + taskIndex;
    const graceNotificationId = 200 + taskIndex;

    await LocalNotifications.cancel({
      notifications: [
        { id: mainNotificationId },
        { id: graceNotificationId }
      ]
    });

    console.log(`⏰ Cancelled time-based notifications (main + grace) for task ${taskId}`);
  } catch (error) {
    console.error('⏰ Error cancelling time-based notifications:', error);
  }
};

/* ============================================================================
 * PUBLIC TRIGGER
 * v3.8: Enhanced with daily check flag
 * ============================================================================ */

/**
 * v3.8: Daily notification scheduling with proper de-duplication
 * Called at:
 * - App startup (once per day via flag)
 * - Midnight rollover
 * - Task add/update
 */
export const triggerDailyNotificationCheck = async (tasks, taskStatuses) => {
  console.log('🔔 v3.8.1: Running daily notification check...');
  
  if (!hasUserActuallyStarted(tasks)) {
    console.log('🔔 User has not started yet, skipping notifications');
    return;
  }

  // v3.8: Check if already run today
  const todayString = new Date().toLocaleDateString('en-CA');
  try {
    const lastRun = await Preferences.get({ key: 'last_notification_check' });
    
    if (lastRun.value === todayString) {
      console.log('⏭️ Notifications already scheduled for today');
      return;
    }
  } catch (e) {
    // First run or error, continue
  }

  // v3.7: Clear old flags before scheduling
  await clearOldNotificationFlags(tasks);
  
  await scheduleDailyNotifications(tasks, taskStatuses);
  await scheduleTimeBasedNotifications(tasks, taskStatuses);

  // v3.8: Mark as run for today
  try {
    await Preferences.set({ key: 'last_notification_check', value: todayString });
    console.log('✅ v3.8.1: Daily notification check complete');
  } catch (e) {
    console.error('❌ Failed to mark notification check:', e);
  }
};

// Export cancel function for use in App.js
export { cancelTimeBasedNotifications };