import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * ============================================================================
 * PUSH NOTIFICATIONS – STREAKLY (Discipline Companion)
 * Phase 2 – Smart Daily Notifications
 * ============================================================================
 *
 * This file handles:
 * 1. Permission initialization
 * 2. Message generation (pure logic)
 * 3. Task statistics calculation
 * 4. De-duplication guard
 * 5. Centralized daily notification orchestration
 *
 * IMPORTANT:
 * - Notifications are scheduled ONLY on native platforms
 * - Notifications are scheduled ONLY once per day
 * - Brand new users (no tasks) DO NOT get notifications
 * ============================================================================
 */

/* ============================================================================
 * INITIALIZATION
 * ============================================================================ */

export const initPushNotifications = async () => {
  console.log('🔔 Initializing notifications...');

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

/* ============================================================================
 * PURE MESSAGE GENERATORS
 * (NO side-effects, NO scheduling)
 * ============================================================================ */

const generateMorningMessage = (yesterdayStats, todayStats) => {
  const { totalTasks: yesterdayTotal, completedTasks: yesterdayCompleted } = yesterdayStats;
  const { totalTasks: todayTotal } = todayStats;

  // Case 1: No tasks yesterday AND no tasks today
  if (yesterdayTotal === 0 && todayTotal === 0) {
    return {
      title: '🔥 A Fresh Start Awaits',
      body: 'Add a task today and begin your first streak.',
      largeBody: '🔥 A FRESH START AWAITS\n\nAdd a task today and begin your first streak.',
    };
  }

  // Case 2: No tasks yesterday BUT tasks exist today
  if (yesterdayTotal === 0 && todayTotal > 0) {
    return {
      title: '🎯 Your Tasks Await',
      body: `You have ${todayTotal} task${todayTotal > 1 ? 's' : ''} to complete today.`,
      largeBody: `🎯 YOUR TASKS AWAIT\n\nYou have ${todayTotal} task${todayTotal > 1 ? 's' : ''} to complete today.\n\nLet's build consistency together.`,
    };
  }

  // Case 3: Nothing completed yesterday
  if (yesterdayCompleted === 0) {
    return {
      title: '💪 Yesterday Slipped',
      body: `Today you have ${todayTotal} task${todayTotal > 1 ? 's' : ''}.`,
      largeBody: `💪 YESTERDAY SLIPPED\n\nToday you have ${todayTotal} task${todayTotal > 1 ? 's' : ''} to complete.\n\nNew day. New chance. Show up today.`,
    };
  }

  // Case 4: Everything completed yesterday
  if (yesterdayCompleted === yesterdayTotal) {
    return {
      title: '🔥 Yesterday Was Strong',
      body: `Today: ${todayTotal} task${todayTotal > 1 ? 's' : ''} to maintain momentum.`,
      largeBody: `🔥 YESTERDAY WAS STRONG\n\nToday: ${todayTotal} task${todayTotal > 1 ? 's' : ''} to maintain momentum.\n\nPerfect discipline. Repeat it today.`,
    };
  }

  // Case 5: Partial completion yesterday
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

const calculateTaskStats = (tasks, taskStatuses, dateString) => {
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

  return {
    totalTasks: validTasks.length,
    completedTasks,
    pendingTasks: validTasks.length - completedTasks,
  };
};

/* ============================================================================
 * DE-DUPLICATION GUARDS
 * ============================================================================ */

const hasUserActuallyStarted = (tasks) => {
  return Array.isArray(tasks) && tasks.length > 0;
};

const shouldScheduleToday = async () => {
  try {
    const stored = await window.storage.get('lastScheduledDate');
    const today = new Date().toLocaleDateString('en-CA');

    if (stored && stored.value === today) {
      console.log('⏭️ Notifications already scheduled for today');
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Schedule guard failed:', error);
    return true;
  }
};

const markAsScheduledToday = async () => {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    await window.storage.set('lastScheduledDate', today);
    console.log('✅ Notifications marked as scheduled for', today);
  } catch (error) {
    console.error('❌ Failed to mark scheduled date:', error);
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

    const yesterdayStats = calculateTaskStats(tasks, taskStatuses, yesterday);
    const todayStats = calculateTaskStats(tasks, taskStatuses, today);

    const notifications = [];

    // ========================================
    // 1️⃣ MORNING NOTIFICATION (8:00 AM)
    // ========================================
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
    });

    // ========================================
    // 2️⃣ NIGHT SUMMARY (9:00 PM)
    // ========================================
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
    });

    // ========================================
    // 3️⃣ STREAK WARNING (10:00 PM)
    // ========================================
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
      });
    }

    await LocalNotifications.schedule({ notifications });
    await markAsScheduledToday();

    console.log('✅ Daily notifications scheduled successfully');
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
 * PUBLIC TRIGGER
 * Call this ONCE per day after data is loaded
 * ============================================================================ */

export const triggerDailyNotificationCheck = async (tasks, taskStatuses) => {
  await scheduleDailyNotifications(tasks, taskStatuses);
};