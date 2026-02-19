// VERSION: 3.11.3 – Onboarding catalouge 
// Updated: 2026-02-19

import React, { useState, useEffect, useMemo, useCallback, useRef  } from 'react';
import { Calendar, Home, Plus, X, Trash2, Pencil } from 'lucide-react';
import { initPushNotifications, triggerDailyNotificationCheck, cancelTimeBasedNotifications } from './PushNotifications';
import { Capacitor } from '@capacitor/core';
import ExactAlarm from './ExactAlarm';
console.log('📱 Platform:', Capacitor.getPlatform());
console.log('📱 Is native:', Capacitor.isNativePlatform());

// ============================================================================
// SAFE STORAGE POLYFILL (REQUIRED)
// Fixes: Cannot read properties of undefined (reading 'set')
// ============================================================================

if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    async get(key) {
      try {
        const value = localStorage.getItem(key);
        return value ? { value } : null;
      } catch (e) {
        return null;
      }
    },
    async set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {}
    },
    async remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    }
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Converts a string to title case (first letter of each word capitalized)
 * @param {string} str - The string to convert
 * @returns {string} - Title cased string
 */
const toTitleCase = (str) => {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Determines if a task should occur on a given date based on frequency
 * @param {string} startDate - Task start date (YYYY-MM-DD)
 * @param {string} frequency - Task frequency (Daily, Alternate Days, Weekly, Monthly)
 * @param {string} currentDate - Date to check (YYYY-MM-DD)
 * @returns {boolean} - True if task should occur on this date
 */
const getNextOccurrence = (startDate, frequency, currentDate) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const current = new Date(currentDate);
  current.setHours(0, 0, 0, 0);

  if (current < start) return null;

  const daysDiff = Math.floor((current - start) / (1000 * 60 * 60 * 24));

  switch (frequency) {
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

/**
 * Checks if a task is valid for a specific date (within start/end range + frequency)
 * @param {object} task - Task object
 * @param {string} date - Date to check (YYYY-MM-DD)
 * @returns {boolean} - True if task is valid for this date
 */
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
  
  return getNextOccurrence(task.startDate, task.frequency, date);
};

/**
 * Formats a date string into human-readable format
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {string} - Formatted date (e.g., "Monday, January 30, 2026")
 */
const formatDate = (date) => {
  const d = new Date(date);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString('en-US', options);
};

/**
 * Gets today's date in YYYY-MM-DD format (local timezone)
 * @returns {string} - Today's date
 */
const getTodayString = () => {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
};

/**
 * Returns appropriate greeting based on current time
 * @returns {object} - Object with text and emoji properties
 */
const getGreetingByTime = () => {
  const hour = new Date().getHours();

  if (hour < 12) return { text: 'Good Morning', emoji: '🌅' };
  if (hour < 17) return { text: 'Good Afternoon', emoji: '☀️' };
  if (hour < 21) return { text: 'Good Evening', emoji: '🌇' };
  return { text: 'Good Night', emoji: '🌙' };
};

// ============================================================================
// STREAK CALCULATION FUNCTIONS
// ============================================================================

/**
 * v3.7 FIX: SINGLE SOURCE OF TRUTH for streak calculation
 * This function is the ONLY place streaks are calculated
 * Used by: Tracker cards, Streak modal, Homepage badges (v3.7.5)
 * 
 * Algorithm:
 * 1. Start from YESTERDAY (not today)
 * 2. Walk backwards through history
 * 3. Count only days where task was scheduled AND completed
 * 4. Stop at first scheduled day that was NOT completed
 * 5. Today doesn't count toward streak until marked "Yes"
 * 
 * @param {object} task - Task object
 * @param {object} taskStatuses - All completion statuses
 * @returns {number} - Current streak count
 */
const calculateCurrentStreak = (task, taskStatuses) => {
  if (!task) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Start from YESTERDAY, not today
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  let streak = 0;
  let checkDate = new Date(yesterday);
  
  // Walk backwards from yesterday, max 365 days
  for (let i = 0; i < 365; i++) {
    const dateString = checkDate.toLocaleDateString('en-CA');
    const isScheduled = isTaskValidForDate(task, dateString);
    
    if (isScheduled) {
      const statusKey = `${task.id}_${dateString}`;
      const status = taskStatuses[statusKey];
      
      if (status === 'Yes') {
        streak++;
      } else {
        // Task was scheduled but not completed - streak breaks
        break;
      }
    }
    
    // Move to previous day
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  // Add today's completion if marked as "Yes"
  const todayString = today.toLocaleDateString('en-CA');
  if (isTaskValidForDate(task, todayString)) {
    const todayStatusKey = `${task.id}_${todayString}`;
    const todayStatus = taskStatuses[todayStatusKey];
    
    if (todayStatus === 'Yes') {
      streak++;
    }
  }
  
  return streak;
};

/**
 * v3.7 SIMPLIFIED: Generate 30-day calendar data for heatmap
 * Does NOT calculate streak - uses calculateCurrentStreak() instead
 * 
 * @param {string} taskId - Task ID
 * @param {object} taskStatuses - All completion statuses
 * @param {object} task - Task object
 * @param {string} appInstallDate - App installation date
 * @returns {array} - Array of day objects with status info
 */
const getLast30DaysData = (taskId, taskStatuses, task, appInstallDate) => {
  const daysData = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const installDate = appInstallDate ? new Date(appInstallDate) : new Date(today);
  installDate.setHours(0, 0, 0, 0);
  
  // Generate 30 days backwards from today
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateString = date.toLocaleDateString('en-CA');
    
    const statusKey = `${taskId}_${dateString}`;
    const status = taskStatuses[statusKey] || null;
    const isValidDate = task ? isTaskValidForDate(task, dateString) : false;
    const isBeforeInstall = date < installDate;
    
    daysData.push({
      date: dateString,
      dateObj: new Date(date),
      status,
      isValidDate: isValidDate && !isBeforeInstall,
      isToday: i === 0,
      isBeforeInstall
    });
  }
  
  return daysData;
};

// ============================================================================
// AUTO-MARK UNCOMPLETED TASKS
// Automatically marks tasks as "No" at 11:59 PM if not completed
// ============================================================================

/**
 * Auto-marks uncompleted tasks at end of day (11:59 PM)
 * Sets status to "No" for tasks that are:
 * - Scheduled for today
 * - Not marked yet OR marked as "Partly"
 * 
 * @param {array} tasks - All tasks
 * @param {object} taskStatuses - Current task statuses
 * @param {function} setTaskStatuses - State setter
 * @param {function} saveTaskStatuses - Storage saver function
 */
const autoMarkUncompletedTasks = async (tasks, taskStatuses, setTaskStatuses, saveTaskStatuses) => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Only run between 11:59 PM and 12:00 AM
  if (currentHour !== 23 || currentMinute !== 59) {
    return;
  }
  
  const todayString = new Date().toLocaleDateString('en-CA');
  
  let hasChanges = false;
  const updatedStatuses = { ...taskStatuses };
  
  tasks.forEach(task => {
    // Check if task was valid for today
    if (isTaskValidForDate(task, todayString)) {
      const statusKey = `${task.id}_${todayString}`;
      
      // If no status exists, mark as "No"
      // If status is "Partly", also mark as "No" at end of day
      if (!updatedStatuses[statusKey] || updatedStatuses[statusKey] === 'Partly') {
        updatedStatuses[statusKey] = 'No';
        hasChanges = true;
      }
    }
  });
  
  if (hasChanges) {
    setTaskStatuses(updatedStatuses);
    await saveTaskStatuses(updatedStatuses);
  }
};

// ============================================================================
// v3.7.5: SAFE TIME FORMATTER
// Formats HH:MM string to "9:00 AM" style display
// ============================================================================
const formatTargetTime = (timeString) => {
  if (!timeString) return null;
  try {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return null;
  }
};

/**
 * v3.7.6: Render-time date formatter → DD/MM/YYYY with leading zeros
 * Does NOT touch stored values — formatting only
 * @param {string} dateString - YYYY-MM-DD from storage
 * @returns {string} - "DD/MM/YYYY"
 */
const formatDDMMYYYY = (dateString) => {
  if (!dateString) return '';
  // Parse as local date parts to avoid timezone shift
  const [year, month, day] = dateString.split('-');
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function TaskTrackerApp() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const [page, setPage] = useState('onboarding');
  const isFirstLaunchRef = useRef(null);
  const [onboardingPage, setOnboardingPage] = useState(0);
  const [userName, setUserName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [taskStatuses, setTaskStatuses] = useState({});
  const [appInstallDate, setAppInstallDate] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchEndX, setTouchEndX] = useState(null);
  const [visibleMonth, setVisibleMonth] = useState(new Date());
  const [calendarTouchStartX, setCalendarTouchStartX] = useState(null);
  const [calendarTouchEndX, setCalendarTouchEndX] = useState(null);
  // Modal states
  const [showAddTask, setShowAddTask] = useState(false);
  const [showEndTask, setShowEndTask] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statusDialogMessage, setStatusDialogMessage] = useState('');
  const [duplicateError, setDuplicateError] = useState('');
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [selectedTaskForStreak, setSelectedTaskForStreak] = useState(null);
  const [editingPartlyTask, setEditingPartlyTask] = useState(null);

  // v3.7.5: Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  
  const [currentTaskForEnd, setCurrentTaskForEnd] = useState(null);
  
  // New task form
  const [newTask, setNewTask] = useState({
    name: '',
    startDate: getTodayString(),
    frequency: 'Daily',
    isTimeBased: false,
    targetTime: null
  });

  const [timeValidationError, setTimeValidationError] = useState('');

  // ============================================================================
  // v3.7 PERFORMANCE: Memoized computed values
  // ============================================================================
  
  /**
   * v3.6 OPTIMIZATION: Memoize tasks for selected date
   * Prevents re-filtering on every render
   */
  const tasksForSelectedDate = useMemo(() => {
    return tasks.filter(task => isTaskValidForDate(task, selectedDate));
  }, [tasks, selectedDate]);

  /**
   * v3.7 OPTIMIZATION: Memoize streak calculations for all visible tasks
   * Prevents recalculation on every render
   */
  const taskStreaks = useMemo(() => {
    const streaks = {};
    tasksForSelectedDate.forEach(task => {
      streaks[task.id] = calculateCurrentStreak(task, taskStatuses);
    });
    return streaks;
  }, [tasksForSelectedDate, taskStatuses]);

  /**
   * v3.7 OPTIMIZATION: Memoize completion counts
   */
  const { completedTasksCount, totalTasksCount } = useMemo(() => {
    const completed = tasksForSelectedDate.filter(task => {
      const statusKey = `${task.id}_${selectedDate}`;
      return taskStatuses[statusKey] === 'Yes';
    }).length;
    
    return {
      completedTasksCount: completed,
      totalTasksCount: tasksForSelectedDate.length
    };
  }, [tasksForSelectedDate, taskStatuses, selectedDate]);

  /**
   * v3.6 OPTIMIZATION: Memoize active tasks
   * Only recalculate when tasks array changes
   */
  const activeTasks = useMemo(() => {
    const today = getTodayString(); // "YYYY-MM-DD" — string compare is safe for this format
    return tasks.filter(task => !task.endDate || task.endDate > today);
  }, [tasks]);

  /**
   * v3.7.5: Memoize streak calculations for homepage
   * Iterates activeTasks (not tasksForSelectedDate — that's tracker-only)
   * Reuses the exact same calculateCurrentStreak — zero new streak logic
   */
  const homepageTaskStreaks = useMemo(() => {
    const streaks = {};
    activeTasks.forEach(task => {
      streaks[task.id] = calculateCurrentStreak(task, taskStatuses);
    });
    return streaks;
  }, [activeTasks, taskStatuses]);

  /**
   * v3.7.6: Tasks whose endDate is today or in the past
   * Strict inverse of activeTasks — together they partition all tasks with zero overlap
   * String comparison on YYYY-MM-DD is safe and timezone-free
   */
  const endedTasks = useMemo(() => {
    const today = getTodayString();
    return tasks.filter(task => task.endDate && task.endDate <= today);
  }, [tasks]);

  /**
   * v3.6 FIX: Check if selected date is today (for status editing)
   */
  const isSelectedDateToday = useMemo(() => {
    return selectedDate === getTodayString();
  }, [selectedDate]);

  // ============================================================================
  // TOUCH/SWIPE HANDLERS (for date navigation)
  // ============================================================================
  
  /**
   * Checks if any overlay/modal is currently open
   * Used to disable swipe gestures when user is interacting with modals
   * @returns {boolean} - True if any overlay is open
   */
  const isAnyOverlayOpen = useCallback(() => {
    return showAddTask || showEndTask || showCalendar || showStatusDialog || showStreakModal || showEditModal;
  }, [showAddTask, showEndTask, showCalendar, showStatusDialog, showStreakModal, showEditModal]);
  
  const handleTouchStart = useCallback((e) => {
    if (isAnyOverlayOpen()) return;
    setTouchStartX(e.touches ? e.touches[0].clientX : e.clientX);
  }, [isAnyOverlayOpen]);

  const handleTouchMove = useCallback((e) => {
    if (isAnyOverlayOpen()) return;
    setTouchEndX(e.touches ? e.touches[0].clientX : e.clientX);
  }, [isAnyOverlayOpen]);

  const handleTouchEnd = useCallback(() => {
    if (isAnyOverlayOpen()) return;
    
    if (touchStartX === null || touchEndX === null) return;

    const diff = touchStartX - touchEndX;
    const swipeThreshold = 50;

    if (diff > swipeThreshold) {
      changeDateBy(1);
    } else if (diff < -swipeThreshold) {
      changeDateBy(-1);
    }

    setTouchStartX(null);
    setTouchEndX(null);
  }, [isAnyOverlayOpen, touchStartX, touchEndX]);

  /**
   * Changes the selected date by a number of days
   * @param {number} days - Number of days to add/subtract
   */
  const changeDateBy = useCallback((days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toLocaleDateString('en-CA'));
  }, [selectedDate]);

  const handleCalendarTouchStart = useCallback((e) => {
    console.log('🔵 Calendar touch start:', e.touches ? e.touches[0].clientX : e.clientX);
    setCalendarTouchStartX(e.touches ? e.touches[0].clientX : e.clientX);
  }, []);

  const handleCalendarTouchMove = useCallback((e) => {
    setCalendarTouchEndX(e.touches ? e.touches[0].clientX : e.clientX);
  }, []);

  const handleCalendarTouchEnd = useCallback(() => {
    console.log('🟢 Calendar touch end. Start:', calendarTouchStartX, 'End:', calendarTouchEndX);
    
    if (calendarTouchStartX === null || calendarTouchEndX === null) {
      console.log('❌ Touch values null, skipping');
      return;
    }

    const diff = calendarTouchStartX - calendarTouchEndX;
    const swipeThreshold = 50;

    console.log('📊 Swipe diff:', diff, 'Threshold:', swipeThreshold);

    if (diff > swipeThreshold) {
      console.log('⬅️ Swipe left → next month');
      setVisibleMonth(prev => {
        const next = new Date(prev);
        next.setMonth(next.getMonth() + 1);
        console.log('New month:', next.getMonth() + 1, '/', next.getFullYear());
        return next;
      });
    } else if (diff < -swipeThreshold) {
      console.log('➡️ Swipe right → previous month');
      setVisibleMonth(prev => {
        const next = new Date(prev);
        next.setMonth(next.getMonth() - 1);
        console.log('New month:', next.getMonth() + 1, '/', next.getFullYear());
        return next;
      });
    }

    setCalendarTouchStartX(null);
    setCalendarTouchEndX(null);
  }, [calendarTouchStartX, calendarTouchEndX]);
  // ============================================================================
  // INITIALIZATION & DATA LOADING
  // ============================================================================

  // Initialize push notifications on mount
  useEffect(() => {
    console.log('🚀 App mounted – initializing push notifications');
    initPushNotifications();
  }, []);

// Load all data from storage on mount
  useEffect(() => {
    const loadData = async () => {
      console.log('🔵 loadData START - Ref value:', isFirstLaunchRef.current);
      try {
        const userResult = await window.storage.get('userName');
        
        // Only handle page routing if username exists and we haven't handled it yet
        if (userResult && userResult.value) {
          // Only update userName if it's different (prevents re-renders)
          if (userResult.value !== userName) {
            setUserName(userResult.value);
          }
          
          // v3.11.3: Check if user has seen onboarding
          if (isFirstLaunchRef.current === null) {
            const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
            console.log('📍 loadData - hasSeenOnboarding:', hasSeenOnboarding);
            
            if (!hasSeenOnboarding) {
              console.log('🎉 First install → Onboarding');
              setPage('onboarding');
            } else {
              const hasLaunchedBefore = localStorage.getItem('hasLaunchedBefore');
              if (!hasLaunchedBefore) {
                console.log('🎉 First app launch → Homepage');
                localStorage.setItem('hasLaunchedBefore', 'true');
                setPage('tasks');
              } else {
                console.log('🔄 Subsequent launch → Tracker');
                setPage('tracker');
              }
            }
            isFirstLaunchRef.current = 'loadData';
          }
        }
      } catch (e) {
        console.error('Error loading userName:', e);
      }

      try {
        const tasksResult = await window.storage.get('tasks');
        if (tasksResult) {
          setTasks(JSON.parse(tasksResult.value));
        }
      } catch (e) {}

      try {
        const statusesResult = await window.storage.get('taskStatuses');
        if (statusesResult) {
          setTaskStatuses(JSON.parse(statusesResult.value));
        }
      } catch (e) {}
        
      try {
        const darkResult = await window.storage.get('darkMode');
        if (darkResult) {
          setDarkMode(darkResult.value === 'true');
        } else {
          // v3.11.1: Auto-detect system theme on first load
          const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setDarkMode(systemPrefersDark);
          await window.storage.set('darkMode', String(systemPrefersDark));
        }
      } catch (e) {}

      try {
        const installDateResult = await window.storage.get('appInstallDate');
        if (installDateResult) {
          setAppInstallDate(installDateResult.value);
        } else {
          const today = getTodayString();
          await window.storage.set('appInstallDate', today);
          setAppInstallDate(today);
        }
      } catch (e) {
        const today = getTodayString();
        await window.storage.set('appInstallDate', today);
        setAppInstallDate(today);
      }
    };

    loadData();
  }, []); // Keeping empty array - we only want this on initial mount

  // Auto-mark uncompleted tasks at end of day
  useEffect(() => {
    const checkAndAutoMark = () => {
      autoMarkUncompletedTasks(tasks, taskStatuses, setTaskStatuses, saveTaskStatuses);
    };

    const interval = setInterval(checkAndAutoMark, 60000);
    checkAndAutoMark();

    return () => clearInterval(interval);
  }, [tasks, taskStatuses]);

  // Reset to today when app resumes from background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && page === 'tracker') {
        const today = getTodayString();
        setSelectedDate(today);
        setVisibleMonth(new Date()); // v3.10: Sync visible month
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [page]);

  /**
   * v3.7 FIX: Schedule notifications ONCE per day at app start
   * Also re-schedule when day changes
   */
  useEffect(() => {
    if (tasks.length === 0) return;
    
    // Schedule immediately on mount
    triggerDailyNotificationCheck(tasks, taskStatuses);
    
    // Re-schedule at midnight when date changes
    const checkMidnight = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        triggerDailyNotificationCheck(tasks, taskStatuses);
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(checkMidnight);
  }, [tasks.length]); // Only depend on tasks.length, not tasks or taskStatuses

  // ============================================================================
  // STORAGE HELPERS
  // ============================================================================

  const saveUserName = async (name) => {
    await window.storage.set('userName', name);
  };

  const saveTasks = async (updatedTasks) => {
    await window.storage.set('tasks', JSON.stringify(updatedTasks));
  };

  const saveTaskStatuses = async (updatedStatuses) => {
    await window.storage.set('taskStatuses', JSON.stringify(updatedStatuses));
  };

  const toggleDarkMode = async () => {
    const nextMode = !darkMode;
    setDarkMode(nextMode);
    await window.storage.set('darkMode', String(nextMode));
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handles onboarding completion
   */
const handleCatalogueComplete = () => {
  console.log('📖 Catalogue complete → Name input');
  setOnboardingPage(3); // Move to name input page (page 4)
};

const handleOnboardingNext = async () => {
  if (nameInput.trim()) {
    setUserName(nameInput.trim());
    await saveUserName(nameInput.trim());
    
    // v3.11.3: First onboarding completion → Homepage, then tracker on subsequent launches
    localStorage.setItem('hasSeenOnboarding', 'true');
    
    const hasLaunchedBefore = localStorage.getItem('hasLaunchedBefore');
    if (!hasLaunchedBefore) {
      console.log('🎉 First onboarding completion → Homepage');
      localStorage.setItem('hasLaunchedBefore', 'true');
      isFirstLaunchRef.current = 'onboarding';
      setPage('tasks'); // First time → Homepage
    } else {
      console.log('🔄 Re-onboarding → Tracker');
      isFirstLaunchRef.current = 'onboarding';
      setPage('tracker');
    }
  }
};

  /**
   * v3.10: Schedules exact alarm immediately for a newly created time-based task
   * Ensures alarm fires today if time is in future, or tomorrow if time passed
   */
  const scheduleExactAlarmImmediately = async (task) => {
    if (!task.isTimeBased || !task.targetTime) return;
    
    try {
      // Parse target time into today's date
      const [hours, minutes] = task.targetTime.split(':').map(Number);
      const targetTime = new Date();
      targetTime.setHours(hours, minutes, 0, 0);
      
      const now = new Date();
      let scheduleTime = targetTime;
      
      // If time already passed today, schedule for tomorrow
      if (targetTime <= now) {
        scheduleTime = new Date(targetTime);
        scheduleTime.setDate(scheduleTime.getDate() + 1);
        console.log(`⏰ v3.10: Task "${task.name}" time passed, scheduling for tomorrow`);
      } else {
        console.log(`⏰ v3.10: Task "${task.name}" scheduling for today`);
      }
      
      await ExactAlarm.schedule({
        time: scheduleTime.getTime(),
        taskId: task.id,
        taskName: task.name
      });
      
      console.log(`⏰ v3.10: Immediately scheduled alarm for "${task.name}" at ${scheduleTime.toLocaleString()}`);
    } catch (error) {
      console.error(`⏰ v3.10: Error scheduling immediate alarm for "${task.name}":`, error);
    }
  };

  /**
   * Handles adding a new task
   * v3.5: Enforces time selection for time-based tasks
   * v3.10: Immediately schedules exact alarm if time-based
   */
  const handleAddTask = async () => {
    if (newTask.name.trim()) {
      const titleCaseName = toTitleCase(newTask.name.trim());
      
      const isDuplicate = tasks.some(
        task => task.name.toLowerCase() === titleCaseName.toLowerCase()
      );
      
      if (isDuplicate) {
        setDuplicateError('A task with this name already exists!');
        return;
      }

      if (newTask.isTimeBased && !newTask.targetTime) {
        setTimeValidationError('Please select a target time');
        return;
      }
      
      const task = {
        id: Date.now().toString(),
        name: titleCaseName,
        startDate: newTask.startDate,
        frequency: newTask.frequency,
        endDate: null,
        isTimeBased: newTask.isTimeBased,
        targetTime: newTask.targetTime
      };
      
      const updatedTasks = [...tasks, task];
      setTasks(updatedTasks);
      await saveTasks(updatedTasks);

      // v3.10: Schedule exact alarm immediately if time-based
      if (task.isTimeBased && task.targetTime) {
        await scheduleExactAlarmImmediately(task);
      }
      
      setNewTask({
        name: '',
        startDate: getTodayString(),
        frequency: 'Daily',
        isTimeBased: false,
        targetTime: null
      });
      setDuplicateError('');
      setTimeValidationError('');
      setShowAddTask(false);
    }
  };

  /**
   * Handles setting an end date for a task
   */
  const handleEndTask = async (endDate) => {
    if (currentTaskForEnd && endDate) {
      const updatedTasks = tasks.map(task =>
        task.id === currentTaskForEnd.id
          ? { ...task, endDate }
          : task
      );
      setTasks(updatedTasks);
      await saveTasks(updatedTasks);
      setShowEndTask(false);
      setCurrentTaskForEnd(null);
    }
  };

  /**
   * Handles removing a task permanently
   */
  const handleRemoveTask = async (taskId) => {
    const updatedTasks = tasks.filter(task => task.id !== taskId);
    setTasks(updatedTasks);
    await saveTasks(updatedTasks);
  };

  /**
   * v3.7.5: Opens the edit modal pre-filled with task data
   * Safe defaults applied for legacy tasks missing isTimeBased/targetTime
   */
  const handleOpenEdit = (task) => {
    setEditingTask({
      id: task.id,
      name: task.name,
      frequency: task.frequency,
      isTimeBased: task.isTimeBased || false,
      targetTime: task.targetTime || null
    });
    setShowEditModal(true);
  };

  /**
   * v3.7.5: Saves edits to a task
   * Only updates: name, frequency, isTimeBased, targetTime
   * NEVER touches: id, startDate, endDate, statuses
   */
  const handleSaveEdit = async () => {
    if (!editingTask) return;

    // Validate time if time-based
    if (editingTask.isTimeBased && !editingTask.targetTime) {
      setTimeValidationError('Please select a target time');
      return;
    }

    // Check for duplicate name (exclude current task)
    const isDuplicate = tasks.some(
      t => t.id !== editingTask.id && t.name.toLowerCase() === editingTask.name.toLowerCase()
    );
    if (isDuplicate) {
      setDuplicateError('A task with this name already exists!');
      return;
    }

    const updatedTasks = tasks.map(task =>
      task.id === editingTask.id
        ? {
            ...task,
            name: toTitleCase(editingTask.name.trim()),
            frequency: editingTask.frequency,
            isTimeBased: editingTask.isTimeBased,
            targetTime: editingTask.isTimeBased ? editingTask.targetTime : null
          }
        : task
    );

    setTasks(updatedTasks);
    await saveTasks(updatedTasks);
    setShowEditModal(false);
    setEditingTask(null);
    setDuplicateError('');
    setTimeValidationError('');
  };

  /**
   * v3.6 FIX: Handles status change for a task (Yes/No/Partly)
   * NOW only allows changes for TODAY
   * Past/future dates are read-only
   */
  const handleStatusChange = async (taskId, date, status) => {
    if (!status) return;
    
    // v3.6: CRITICAL - Only allow status changes for today
    const todayString = getTodayString();
    if (date !== todayString) {
      console.warn('⚠️ Status change blocked: not today');
      return;
    }
    
    const key = `${taskId}_${todayString}`;
    const updatedStatuses = { ...taskStatuses, [key]: status };
    
    setTaskStatuses(updatedStatuses);
    saveTaskStatuses(updatedStatuses);

    // Cancel time-based notifications if task completed
    if (status === 'Yes') {
      await cancelTimeBasedNotifications(taskId, tasks);
    }
    
    let message = '';
    switch (status) {
      case 'Yes':
        message = 'Yippie! Good job, keep it up 💪';
        break;
      case 'No':
        message = 'You better complete it next time 😅';
        break;
      case 'Partly':
        message = 'Your streak will end please complete it, to extend your streak';
        break;
      default:
        return;
    }
    
    setStatusDialogMessage(message);
    setShowStatusDialog(true);
  };

  // ============================================================================
  // RENDER: ONBOARDING PAGE
  // ============================================================================

  if (page === 'onboarding') {
    const catalogueContent = [
      {
        title: 'Create Tasks in Seconds',
        bullets: [
          'Daily / Weekly tracking',
          'Time-based scheduling',
          'Edit anytime',
          'Active & Ended separation'
        ]
      },
      {
        title: 'Swipe Through Your Progress',
        bullets: [
          'Swipe tracker to change dates',
          'Swipe calendar to change months',
          'Streak highlights with flame',
          'History preserved after ending task'
        ]
      },
      {
        title: 'Never Miss What Matters',
        bullets: [
          'Exact time alerts',
          'Works when app is killed',
          'Auto re-schedules after reboot',
          'Cancels when task completed'
        ]
      }
    ];

    // Page 0-2: Catalogue, Page 3: Name input
    const isNameInputPage = onboardingPage === 3;
    const isCataloguePage = onboardingPage < 3;
    const currentCatalogue = catalogueContent[onboardingPage];
    const isLastCataloguePage = onboardingPage === catalogueContent.length - 1;

    return (
      <div className={`app-container ${darkMode ? 'dark' : ''} onboarding-page`}>
        <div className="onboarding-content">
          {isCataloguePage && (
            <>
              {/* Skip button */}
              <button 
                onClick={() => setOnboardingPage(catalogueContent.length - 1)}
                className="skip-button"
              >
                Skip
              </button>

              {/* Catalogue Content */}
              <div className="onboarding-main">
                <h1 className="onboarding-title">{currentCatalogue.title}</h1>
                <ul className="onboarding-bullets">
                  {currentCatalogue.bullets.map((bullet, index) => (
                    <li key={index} className="onboarding-bullet">
                      <span className="bullet-icon">✓</span>
                      <span className="bullet-text">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Page indicators */}
              <div className="onboarding-indicators">
                {catalogueContent.map((_, index) => (
                  <div
                    key={index}
                    className={`indicator ${index === onboardingPage ? 'active' : ''}`}
                  />
                ))}
              </div>

              {/* Navigation buttons */}
              <div className="onboarding-nav">
                {onboardingPage > 0 && (
                  <button
                    onClick={() => setOnboardingPage(onboardingPage - 1)}
                    className="nav-button secondary"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={() => {
                    if (isLastCataloguePage) {
                      handleCatalogueComplete();
                    } else {
                      setOnboardingPage(onboardingPage + 1);
                    }
                  }}
                  className="nav-button primary"
                  style={onboardingPage === 0 ? { marginLeft: 'auto' } : {}}
                >
                  {isLastCataloguePage ? 'Get Started' : 'Next'}
                </button>
              </div>
            </>
          )}

          {isNameInputPage && (
            <>
              {/* Name Input Page */}
              <div className="onboarding-main">
                <h1 className="onboarding-title">What should we call you?</h1>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleOnboardingNext()}
                  className="name-input"
                  autoFocus
                />
              </div>

              {/* Navigation */}
              <div className="onboarding-nav">
                <button
                  onClick={() => setOnboardingPage(2)}
                  className="nav-button secondary"
                >
                  Back
                </button>
                <button 
                  onClick={handleOnboardingNext}
                  className="nav-button primary"
                  disabled={!nameInput.trim()}
                >
                  Start Tracking
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  // ============================================================================
  // RENDER: TASKS MANAGEMENT PAGE (HOMEPAGE)
  // v3.7.5: Added streak badge, time display, edit button
  // ============================================================================

  if (page === 'tasks') {
    return (
      <div className={`app-container ${darkMode ? 'dark' : ''} tasks-page`}>
        <header className="page-header">
          <h2 className="greeting greeting-with-toggle">
            <div className="greeting-text">
              <span className="smart-greeting">
                {getGreetingByTime().emoji} {getGreetingByTime().text}
              </span>

              <span className="user-name">
                {toTitleCase(userName)}
              </span>
            </div>

            <button
              onClick={toggleDarkMode}
              className="dark-toggle inline-toggle"
              title="Toggle Dark Mode"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </h2>
        </header>

        <main className="main-content">
          <div className="section-header">
            <h3 className="section-title">Your Tasks</h3>
            <button 
              onClick={() => {
                setShowAddTask(true);
                setTimeValidationError('');
              }}
              className="add-task-button"
            >
              <Plus size={20} />
              Add Task
            </button>
          </div>

          <div className="task-list">
            {/* ── Active Tasks ─────────────────────────────── */}
            <p className="section-subtitle">Active Tasks</p>

            {activeTasks.length === 0 && endedTasks.length === 0 ? (
              <div className="empty-state">
                <p>No tasks yet. Add your first task to get started!</p>
              </div>
            ) : activeTasks.length === 0 ? (
              <div className="empty-state-small">
                <p>No active tasks</p>
              </div>
            ) : (
              activeTasks.map(task => {
                // v3.7.5: safe defaults for legacy tasks
                const isTimeBased = task.isTimeBased || false;
                const targetTime = task.targetTime || null;
                const streak = homepageTaskStreaks[task.id] || 0;

                return (
                  <div key={task.id} className="task-item">
                    <div className="task-header">
                      <div className="task-info">
                        <div className="task-name-row">
                          <h4 
                            className="task-name clickable"
                            onClick={() => {
                              setSelectedTaskForStreak(task);
                              setShowStreakModal(true);
                            }}
                          >
                            {task.name}
                          </h4>
                          {/* v3.7.5: Streak badge — only shown if streak > 0 */}
                          {streak > 0 && (
                            <span className="streak-badge-homepage">🔥 {streak}</span>
                          )}
                        </div>
                      </div>
                      <div className="task-actions">
                        {/* v3.7.5: Edit button */}
                        <button
                          onClick={() => handleOpenEdit(task)}
                          className="task-action-button edit-button"
                          title="Edit Task"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setCurrentTaskForEnd(task);
                            setShowEndTask(true);
                          }}
                          className="task-action-button end-button"
                          title="End Task"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <rect x="9" y="9" width="6" height="6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {/* Meta: frequency + started date (no endDate here — ended tasks have own section) */}
                    {/* Meta line: frequency + time (if time-based) */}
                    <p className="task-meta">
                      {task.frequency}
                      {isTimeBased && targetTime && (
                        <> • ⏰ {formatTargetTime(targetTime)}</>
                      )}
                    </p>
                    {/* Started date on separate line */}
                    <p className="task-meta task-started-date">
                      Started {formatDDMMYYYY(task.startDate)}
                    </p>
                  </div>
                );
              })
            )}

            {/* ── Ended Tasks ──────────────────────────────── */}
            {endedTasks.length > 0 && (
              <>
                <p className="section-subtitle ended-subtitle">Ended Tasks</p>
                {endedTasks.map(task => (
                  <div key={task.id} className="task-item ended-task-item">
                    <div className="task-header">
                      <div className="task-info">
                        <h4 
                          className="task-name ended-task-name clickable"
                          onClick={() => {
                            setSelectedTaskForStreak(task);
                            setShowStreakModal(true);
                          }}
                        >
                          {task.name}
                        </h4>
                      </div>
                      <div className="task-actions">
                        {/* Ended tasks: delete only */}
                        <button
                          onClick={() => handleRemoveTask(task.id)}
                          className="task-action-button remove-button"
                          title="Delete Task"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                    {/* Line 1: Frequency */}
                    <p className="task-meta">{task.frequency}</p>
                    {/* Line 2: Started and Ended dates on same line */}
                    <p className="task-meta task-dates-line">
                      Started {formatDDMMYYYY(task.startDate)} • Ended {formatDDMMYYYY(task.endDate)}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        </main>

        <div className="bottom-action">
          <button 
            onClick={() => {
              setSelectedDate(getTodayString());
              setPage('tracker');
            }}
            className="tracker-button"
          >
            Tracker
          </button>
        </div>

        {/* Add Task Modal */}
        {showAddTask && (
          <div className="modal-overlay" onClick={() => {
            setShowAddTask(false);
            setDuplicateError('');
            setTimeValidationError('');
          }}>
            <div 
              className="modal-content" 
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Add New Task</h3>
                <button onClick={() => {
                  setShowAddTask(false);
                  setDuplicateError('');
                  setTimeValidationError('');
                }} className="close-button">
                  <X size={24} />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Task Name</label>
                  <input
                    type="text"
                    value={newTask.name}
                    onChange={(e) => {
                      setNewTask({ ...newTask, name: e.target.value });
                      setDuplicateError('');
                    }}
                    placeholder="e.g., Morning Exercise"
                    className="form-input"
                    autoFocus
                  />
                  {duplicateError && (
                    <p className="error-message">{duplicateError}</p>
                  )}
                </div>
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={newTask.startDate}
                    onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Frequency</label>
                  <select
                    value={newTask.frequency}
                    onChange={(e) => setNewTask({ ...newTask, frequency: e.target.value })}
                    className="form-input"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Alternate Days">Alternate Days</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newTask.isTimeBased}
                      onChange={(e) => {
                        setNewTask({ 
                          ...newTask, 
                          isTimeBased: e.target.checked,
                          targetTime: e.target.checked ? newTask.targetTime : null
                        });
                        setTimeValidationError('');
                      }}
                      className="form-checkbox"
                    />
                    <span>  Time-based task?</span>
                  </label>
                </div>
                
                {newTask.isTimeBased && (
                  <div className="form-group">
                    <label>Target Time</label>
                    <input
                      type="time"
                      value={newTask.targetTime || ''}
                      onChange={(e) => {
                        setNewTask({ ...newTask, targetTime: e.target.value });
                        setTimeValidationError('');
                      }}
                      className="form-input"
                    />
                    {timeValidationError && (
                      <span className="error-text">{timeValidationError}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-buttons">
                <button onClick={() => {
                  setShowAddTask(false);
                  setDuplicateError('');
                  setTimeValidationError('');
                  setNewTask({
                    name: '',
                    startDate: getTodayString(),
                    frequency: 'Daily',
                    isTimeBased: false,
                    targetTime: null
                  });
                }} className="btn-secondary">Cancel</button>
                <button 
                  onClick={handleAddTask} 
                  className="btn-primary"
                  disabled={newTask.isTimeBased && !newTask.targetTime}
                >
                  Add Task
                </button>
              </div>
            </div>
          </div>
        )}

        {/* End Task Modal */}
        {showEndTask && currentTaskForEnd && (
          <div className="modal-overlay" onClick={() => setShowEndTask(false)}>
            <div 
              className="modal-content" 
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>End Task</h3>
                <button onClick={() => setShowEndTask(false)} className="close-button">
                  <X size={24} />
                </button>
              </div>
              <div className="modal-body">
                <p className="modal-text">
                  Select the last date for "<strong>{currentTaskForEnd.name}</strong>"
                </p>
                <div className="form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    min={currentTaskForEnd.startDate}
                    onChange={(e) => handleEndTask(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button onClick={() => setShowEndTask(false)} className="secondary-button">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* v3.7.5: Edit Task Modal */}
        {showEditModal && editingTask && (
          <div className="modal-overlay" onClick={() => {
            setShowEditModal(false);
            setEditingTask(null);
            setDuplicateError('');
            setTimeValidationError('');
          }}>
            <div 
              className="modal-content" 
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Edit Task</h3>
                <button onClick={() => {
                  setShowEditModal(false);
                  setEditingTask(null);
                  setDuplicateError('');
                  setTimeValidationError('');
                }} className="close-button">
                  <X size={24} />
                </button>
              </div>
              <div className="modal-body">
                {/* Task Name */}
                <div className="form-group">
                  <label>Task Name</label>
                  <input
                    type="text"
                    value={editingTask.name}
                    onChange={(e) => {
                      setEditingTask({ ...editingTask, name: e.target.value });
                      setDuplicateError('');
                    }}
                    placeholder="Task name"
                    className="form-input"
                    autoFocus
                  />
                  {duplicateError && (
                    <p className="error-message">{duplicateError}</p>
                  )}
                </div>

                {/* Frequency */}
                <div className="form-group">
                  <label>Frequency</label>
                  <select
                    value={editingTask.frequency}
                    onChange={(e) => setEditingTask({ ...editingTask, frequency: e.target.value })}
                    className="form-input"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Alternate Days">Alternate Days</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>

                {/* Time-based toggle */}
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={editingTask.isTimeBased}
                      onChange={(e) => {
                        setEditingTask({
                          ...editingTask,
                          isTimeBased: e.target.checked,
                          targetTime: e.target.checked ? editingTask.targetTime : null
                        });
                        setTimeValidationError('');
                      }}
                      className="form-checkbox"
                    />
                    <span>Time-based task?</span>
                  </label>
                </div>

                {/* Target Time — only visible when time-based */}
                {editingTask.isTimeBased && (
                  <div className="form-group">
                    <label>Target Time</label>
                    <input
                      type="time"
                      value={editingTask.targetTime || ''}
                      onChange={(e) => {
                        setEditingTask({ ...editingTask, targetTime: e.target.value });
                        setTimeValidationError('');
                      }}
                      className="form-input"
                    />
                    {timeValidationError && (
                      <span className="error-text">{timeValidationError}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-buttons">
                <button onClick={() => {
                  setShowEditModal(false);
                  setEditingTask(null);
                  setDuplicateError('');
                  setTimeValidationError('');
                }} className="btn-secondary">Cancel</button>
                <button 
                  onClick={handleSaveEdit} 
                  className="btn-primary"
                  disabled={!editingTask.name.trim() || (editingTask.isTimeBased && !editingTask.targetTime)}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Streak Calendar Modal */}
        {showStreakModal && selectedTaskForStreak && (
          <div className="modal-overlay" onClick={() => setShowStreakModal(false)}>
            <div 
              className="streak-modal-content" 
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>{selectedTaskForStreak.name}</h3>
                <button onClick={() => setShowStreakModal(false)} className="close-button">
                  <X size={24} />
                </button>
              </div>
              <div className="streak-modal-body">
                <div className="streak-counter">
                  <span className="streak-flame">🔥</span>
                  <span className="streak-number">
                    {calculateCurrentStreak(selectedTaskForStreak, taskStatuses)}
                  </span>
                  <span className="streak-label">day streak</span>
                </div>
                
                <div className="calendar-grid">
                  {getLast30DaysData(selectedTaskForStreak.id, taskStatuses, selectedTaskForStreak, appInstallDate).map((day, index) => {
                    const dayOfMonth = day.dateObj.getDate();
                    const isCompleted = day.status === 'Yes';
                    const isMissed = day.isValidDate && (day.status === 'No' || day.status === 'Partly') && !day.isToday;
                    const isNotMarked = day.isValidDate && !day.status && !day.isToday;
                    
                    return (
                      <div
                        key={index}
                        className={`calendar-cell ${isCompleted ? 'completed' : ''} ${isMissed ? 'missed' : ''} ${isNotMarked ? 'not-marked' : ''} ${day.isToday ? 'today' : ''} ${!day.isValidDate || day.isBeforeInstall ? 'invalid' : ''}`}
                        title={day.date}
                      >
                        <span className="cell-day">{dayOfMonth}</span>
                      </div>
                    );
                  })}
                </div>
                
                <div className="streak-footer">
                  {selectedTaskForStreak.endDate && selectedTaskForStreak.endDate <= getTodayString() ? (
                    <p className="streak-subtitle ended-task-note">
                      📖 This task has ended. History is read-only.
                    </p>
                  ) : (
                    <p className="streak-subtitle">Keep it up! Complete tasks to build your streak.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDER: TRACKER PAGE
  // v3.7: Optimized with memoization
  // ============================================================================

  if (page === 'tracker') {
    const generateCalendarDates = () => {
      // v3.10: Use visibleMonth for rendering, not selectedDate
      const year = visibleMonth.getFullYear();
      const month = visibleMonth.getMonth();

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startingDayOfWeek = firstDay.getDay();

      const dates = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < startingDayOfWeek; i++) {
        dates.push(null);
      }

      for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);

        const dateString = date.toLocaleDateString('en-CA');

        dates.push({
          day,
          dateString,
          isToday: dateString === getTodayString(),
          isSelected: dateString === selectedDate,
        });
      }

      return dates;
    };

    return (
      <div
        className={`app-container ${darkMode ? 'dark' : ''} tracker-page`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseMove={handleTouchMove}
        onMouseUp={handleTouchEnd}
      >
        <header className="tracker-header">
          <button
            onClick={() => setPage('tasks')}
            className="header-button"
            title="Home"
          >
            <Home size={24} />
          </button>

          <div className="header-center">
            <h2 className="current-date">{formatDate(selectedDate)}</h2>
            <p className="task-counter">
              {completedTasksCount} out of {totalTasksCount} tasks completed
            </p>
          </div>

          <button
            onClick={() => {
              if (!showCalendar) {
                // v3.10: Sync visible month to selected date when opening
                setVisibleMonth(new Date(selectedDate));
              }
              setShowCalendar(!showCalendar);
            }}
            className="header-button"
            title="Select Date"
          >
            <Calendar size={24} />
          </button>
        </header>

        {/* VERSION INDICATOR - v3.7.5 */}
        <div style={{display: 'none'}}>v3.7.5</div>

        {showCalendar && (
          <div 
            className="inline-calendar"
            onTouchStart={handleCalendarTouchStart}
            onTouchMove={handleCalendarTouchMove}
            onTouchEnd={handleCalendarTouchEnd}
            onMouseDown={handleCalendarTouchStart}
            onMouseMove={handleCalendarTouchMove}
            onMouseUp={handleCalendarTouchEnd}
          >
            {/* v3.10: Month name header */}
            <div className="calendar-month-header">
              {visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>

            <div className="calendar-weekdays">
              <div className="weekday">S</div>
              <div className="weekday">M</div>
              <div className="weekday">T</div>
              <div className="weekday">W</div>
              <div className="weekday">T</div>
              <div className="weekday">F</div>
              <div className="weekday">S</div>
            </div>
            <div className="calendar-dates-grid">
              {generateCalendarDates().map((dateInfo, index) => {
                if (!dateInfo) {
                  return <div key={`empty-${index}`} className="calendar-date-cell empty"></div>;
                }
                
                return (
                  <button
                    type="button"
                    key={dateInfo.dateString}
                    className={`calendar-date-cell ${dateInfo.isToday ? 'is-today' : ''} ${dateInfo.isSelected ? 'is-selected' : ''} ${dateInfo.isDisabled ? 'is-disabled' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!dateInfo.isDisabled) {
                        setSelectedDate(dateInfo.dateString);
                        setShowCalendar(false);
                      }
                    }}
                    disabled={dateInfo.isDisabled}
                  >
                    {dateInfo.day}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <main className="main-content">
          <div className="tracker-list">
            {tasksForSelectedDate.length === 0 ? (
              <div className="empty-state">
                <p>No tasks scheduled for this date.</p>
              </div>
            ) : (
              tasksForSelectedDate.map(task => {
                const statusKey = `${task.id}_${selectedDate}`;
                const currentStatus = taskStatuses[statusKey] || '';
                
                // v3.6 FIX: Disable dropdown for non-today dates
                const canEdit = isSelectedDateToday;
                const showDropdown = canEdit && (!currentStatus || editingPartlyTask === task.id);
                const isPartlyEditable = canEdit && currentStatus === 'Partly' && editingPartlyTask !== task.id;
                
                return (
                  <div key={task.id} className="tracker-item">
                    <div className="tracker-item-header">
                      <h4 className="tracker-task-name">{task.name}</h4>
                      <div className="tracker-item-status">
                        {showDropdown ? (
                          <select
                            value={currentStatus}
                            onChange={(e) => {
                              handleStatusChange(task.id, selectedDate, e.target.value);
                              setEditingPartlyTask(null);
                            }}
                            onBlur={() => setEditingPartlyTask(null)}
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            className="status-select-compact"
                            autoFocus={editingPartlyTask === task.id}
                            disabled={!canEdit}
                          >
                            <option value="">Select</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                            <option value="Partly">Partly</option>
                          </select>
                        ) : currentStatus ? (
                          <div 
                            className={`status-display-compact ${isPartlyEditable ? 'editable' : ''}`}
                            onClick={() => {
                              if (isPartlyEditable) {
                                setEditingPartlyTask(task.id);
                              }
                            }}
                          >
                            <span className={`status-badge-compact ${currentStatus.toLowerCase()} ${isPartlyEditable ? 'editable-badge' : ''}`}>
                              {currentStatus}
                              {isPartlyEditable && <span className="edit-indicator"> ✎</span>}
                            </span>
                          </div>
                        ) : (
                          <span className="status-badge-compact empty">
                            {canEdit ? 'Pending' : '—'}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="tracker-item-meta">
                      <span className="task-frequency">{task.frequency}</span>
                      {task.isTimeBased && task.targetTime && (
                        <span className="task-time">
                          {' • '}
                          {new Date(`2000-01-01T${task.targetTime}`).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      )}
                    </div>
                    
                    <div className="tracker-item-streak">
                      <span className="streak-icon">🔥</span>
                      <span className="streak-text">Streak: {taskStreaks[task.id] || 0} days</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>

        {showStatusDialog && (
          <div className="modal-overlay" onClick={() => setShowStatusDialog(false)}>
            <div 
              className="dialog-content" 
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <p className="dialog-message">{statusDialogMessage}</p>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowStatusDialog(false);
                }}
                className="primary-button"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ============================================================================
// STYLES
// v3.7.5: Added .task-name-row, .streak-badge-homepage, .task-time-homepage, .edit-button
// ============================================================================

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fraunces:wght@600;700&display=swap');

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'DM Sans', sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    color: #1a1a2e;
  }

  .app-container {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background: #ffffff;
    box-shadow: 0 0 60px rgba(0, 0, 0, 0.15);
  }

  .onboarding-page {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .onboarding-content {
    width: 100%;
    max-width: 340px;
    padding: 40px 20px;
    text-align: center;
  }

  .onboarding-title {
    font-family: 'Fraunces', serif;
    font-size: 32px;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 32px;
    text-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    text-align: center;
  }

  .skip-button {
    position: absolute;
    top: 24px;
    right: 24px;
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .skip-button:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .onboarding-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 40px 0;
  }

  .onboarding-bullets {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .onboarding-bullet {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 0;
  }

  .bullet-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-size: 14px;
    font-weight: 700;
  }

  .bullet-text {
    color: rgba(255, 255, 255, 0.95);
    font-size: 16px;
    line-height: 1.5;
    padding-top: 2px;
  }

  .onboarding-indicators {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin: 32px 0 24px;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transition: all 0.3s ease;
  }

  .indicator.active {
    width: 24px;
    border-radius: 4px;
    background: #ffffff;
  }

  .onboarding-nav {
    display: flex;
    gap: 12px;
    justify-content: space-between;
  }

  .nav-button {
    flex: 1;
    padding: 16px 24px;
    font-size: 16px;
    font-weight: 600;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .nav-button.primary {
    background: #ffffff;
    color: #667eea;
  }

  .nav-button.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(255, 255, 255, 0.3);
  }

  .nav-button.secondary {
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  .nav-button.secondary:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .start-button {
    width: 100%;
    padding: 18px 24px;
    font-size: 18px;
    font-weight: 700;
    color: #667eea;
    background: #ffffff;
    border: none;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 8px 24px rgba(255, 255, 255, 0.2);
    font-family: 'DM Sans', sans-serif;
  }

  .start-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(255, 255, 255, 0.3);
  }

  .name-input {
    width: 100%;
    padding: 18px 24px;
    font-size: 16px;
    border: none;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .name-input:focus {
    outline: none;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }

  .name-input::placeholder {
    color: #a0a0b0;
  }

  .next-button {
    width: 100%;
    margin-top: 24px;
    padding: 18px 24px;
    font-size: 16px;
    font-weight: 600;
    color: #667eea;
    background: #ffffff;
    border: none;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    font-family: 'DM Sans', sans-serif;
  }

  .next-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
  }

  .next-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .app-container {
    transition: background 0.3s ease, color 0.3s ease;
  }

  .app-container.dark {
    background: #0f1220;
    color: #eaeaf0;
  }

  .dark .page-header,
  .dark .tracker-header {
    background: linear-gradient(135deg, #1f2340 0%, #14172e 100%);
  }

  .dark .task-item,
  .dark .tracker-item,
  .dark .modal-content,
  .dark .streak-modal-content,
  .dark .dialog-content,
  .dark .inline-calendar {
    background: #181c34;
    border-color: #2a2f55;
    color: #eaeaf0;
  }

  .dark .section-title,
  .dark .task-name,
  .dark .tracker-task-name,
  .dark .modal-header h3 {
    color: #ffffff;
  }

  .dark .task-meta,
  .dark .date-info-text,
  .dark .streak-subtitle {
    color: #b8bbd9;
  }

  .dark .ended-task-note {
    color: #7a7fa8;
  }

  .dark .tracker-item-meta .task-frequency {
    color: #b8bbd9;
  }

  .dark .streak-text {
    color: #ffa726;
  }

  .dark .status-select-compact {
    background: #10132a;
    border-color: #2a2f55;
    color: #ffffff;
  }

  .dark .error-text {
    color: #fca5a5;
  }

  .dark .form-input,
  .dark .status-select,
  .dark .name-input {
    background: #10132a;
    border-color: #2a2f55;
    color: #ffffff;
  }

  .dark .form-input::placeholder,
  .dark .name-input::placeholder {
    color: #8f93c9;
  }

  .dark .add-task-button,
  .dark .secondary-button {
    background: #242863;
    color: #ffffff;
  }

  .dark .add-task-button:hover,
  .dark .secondary-button:hover {
    background: #2f3490;
  }

  .dark .primary-button,
  .dark .tracker-button {
    box-shadow: 0 10px 30px #70ffe566;
  }

  .dark .calendar-date-cell {
    background: #181c34;
    border-color: #2a2f55;
    color: #ffffff;
  }

  .dark .calendar-date-cell.is-disabled {
    background: #0b0e1a;
    color: #555;
  }

  .dark .calendar-date-cell.is-selected {
    background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
  }

  .dark .status-badge.empty,
  .dark .status-badge-compact.empty {
    background: #0b0e1a;
    color: #7a7fa8;
  }

  .dark-toggle {
    background: rgba(255,255,255,0.15);
    border: none;
    border-radius: 12px;
    padding: 10px;
    cursor: pointer;
    font-size: 18px;
    transition: transform 0.2s ease;
  }

  .dark-toggle:hover {
    transform: scale(1.1);
  }

  .dark .modal-content,
  .dark .dialog-content,
  .dark .streak-modal-content {
    background: #181c34;
    border-color: #2a2f55;
  }

  .dark .modal-header h3 {
    color: #ffffff;
  }

  .dark .modal-text,
  .dark .dialog-message,
  .dark .streak-subtitle,
  .dark .dialog-content p {
    color: #eaeaf0;
  }

  .dark .dialog-message {
    color: #ffffff;
  }

  .dark .header-button {
    background: linear-gradient(135deg, #2e323c 0%, #1b1e25 100%);
    color: #eaeaf0;
  }

  .dark .header-button:hover {
    background: linear-gradient(135deg, #3a3f4b 0%, #262a33 100%);
  }

  .dark .modal-content .primary-button {
    color: #ffffff;
  }

  .dark .modal-content .secondary-button {
    background: #242863;
    color: #eaeaf0;
  }

  .dark .close-button {
    color: #b8bbd9;
  }

  .dark .close-button:hover {
    color: #ffffff;
  }

  /* v3.7.5: Dark mode for new homepage elements */
  .dark .streak-badge-homepage {
    background: rgba(255, 107, 53, 0.2);
    color: #ffaa77;
  }

  .dark .edit-button {
    background: #242863;
    color: #8b9dff;
  }

  .dark .edit-button:hover {
    background: #2f3490;
  }

  .dark .end-button {
    background: #2a1f0e;
    color: #ffb74d;
  }

  .dark .end-button:hover {
    background: #3a2a14;
  }

  .dark .remove-button {
    background: #2a1010;
    color: #ef5350;
  }

  .dark .remove-button:hover {
    background: #3a1818;
  }

  /* v3.7.6: Dark mode — section subtitles & ended cards */
  .dark .section-subtitle {
    color: #8b9dff;
  }

  .dark .ended-subtitle {
    color: #6b6f8a;
  }

  .dark .ended-task-item {
    background: #141828;
    border-color: #222650;
    opacity: 0.75;
  }

  .dark .ended-task-item:hover {
    border-color: #2a2f55;
    box-shadow: none;
  }

  .dark .ended-task-name {
    color: #7a7fa8;
  }

  .dark .empty-state-small {
    color: #555a7a;
  }

  .tasks-page {
    display: flex;
    flex-direction: column;
  }

  .page-header {
    padding: 32px 24px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .greeting {
    font-family: 'Fraunces', serif;
    font-size: 32px;
    font-weight: 700;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .greeting-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .smart-greeting {
    font-size: 14px;
    font-weight: 600;
    opacity: 0.9;
  }

  .user-name {
    font-size: 32px;
    font-weight: 700;
  }

  .greeting-with-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .inline-toggle {
    margin-left: auto;
  }

  .main-content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
    padding-bottom: 100px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 22px;
    font-weight: 700;
    color: #1a1a2e;
  }

  .add-task-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    font-size: 14px;
    font-weight: 600;
    color: #667eea;
    background: #f0f0f8;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .add-task-button:hover {
    background: #e0e0f0;
    transform: translateY(-1px);
  }

  .task-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* v3.7.6: Section subheadings inside task list */
  .section-subtitle {
    font-size: 13px;
    font-weight: 700;
    color: #667eea;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 4px 0 2px;
    margin-top: 4px;
  }

  .section-subtitle:first-child {
    margin-top: 0;
  }

  .ended-subtitle {
    color: #9b9bb0;
    margin-top: 16px;
  }

  /* v3.7.6: Ended task card — visually muted */
  .ended-task-item {
    background: #fafafa;
    border-color: #ececec;
    opacity: 0.82;
  }

  .ended-task-item:hover {
    border-color: #d8d8e0;
    box-shadow: none;
  }

  .ended-task-name {
    color: #6b6b80;
  }

  /* v3.7.6: Small empty state inside a section (not full-page) */
  .empty-state-small {
    text-align: center;
    padding: 18px 20px;
    color: #b0b0c0;
  }

  .empty-state-small p {
    font-size: 14px;
    font-style: italic;
  }

  .task-item {
    background: #ffffff;
    border: 2px solid #f0f0f8;
    border-radius: 16px;
    padding: 16px;
    transition: all 0.2s ease;
  }

  .task-item:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
  }

  .task-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .task-info {
    flex: 1;
    min-width: 0;
  }

  /* v3.7.5: Name + streak badge row */
  .task-name-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .task-name {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a2e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  .task-name.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .task-name.clickable:hover {
    color: #667eea;
    transform: translateX(2px);
  }

  /* v3.7.5: Streak badge on homepage */
  .streak-badge-homepage {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: rgba(255, 107, 53, 0.12);
    color: #e65100;
    font-size: 13px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 20px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .task-meta {
    font-size: 13px;
    color: #6b6b80;
    margin-top: 4px;
  }

  .task-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .task-action-button {
    padding: 8px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Sans', sans-serif;
  }

  /* v3.7.5: Edit button */
  .edit-button {
    background: #eef0ff;
    color: #667eea;
  }

  .edit-button:hover {
    background: #dde1ff;
    transform: scale(1.05);
  }

  .end-button {
    background: #fff3e0;
    color: #f57c00;
  }

  .end-button:hover {
    background: #ffe0b2;
    transform: scale(1.05);
  }

  .remove-button {
    background: #ffebee;
    color: #d32f2f;
  }

  .remove-button:hover {
    background: #ffcdd2;
    transform: scale(1.05);
  }

  .bottom-action {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 480px;
    padding: 20px 24px;
    background: linear-gradient(to top, #ffffff 80%, transparent);
  }
  
  .dark .bottom-action {
    background: linear-gradient(to top, #0f1220 85%, rgba(15, 18, 32, 0));
  }

  .dark .tracker-button {
    background: linear-gradient(135deg, #5a5f66 0%, #2c2f34 100%);
    color: #f5f6f7;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    animation: trackerPulse 2.6s infinite;
  }

  .dark .tracker-button:hover {
    background: linear-gradient(135deg, #6b7077 0%, #3a3e44 100%);
  }

  @keyframes trackerPulse {
    0% {
      box-shadow: 0 0 0 0 rgba(180, 180, 180, 0.45), 0 10px 30px rgba(0, 0, 0, 0.6);
    }
    70% {
      box-shadow: 0 0 0 14px rgba(180, 180, 180, 0), 0 10px 30px rgba(0, 0, 0, 0.6);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(180, 180, 180, 0), 0 10px 30px rgba(0, 0, 0, 0.6);
    }
  }

  .tracker-button {
    width: 100%;
    padding: 18px 24px;
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
    font-family: 'DM Sans', sans-serif;
  }

  .tracker-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(102, 126, 234, 0.4);
  }

  .tracker-page {
    display: flex;
    flex-direction: column;
  }

  .tracker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .header-center {
    flex: 1;
    text-align: center;
    padding: 0 12px;
  }

  .current-date {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .task-counter {
    font-size: 13px;
    font-weight: 500;
    opacity: 0.9;
    margin: 0;
  }

  .inline-calendar {
    background: #ffffff;
    padding: 20px;
    border-bottom: 2px solid #f0f0f8;
    animation: slideDown 0.2s ease;
    position: relative;
    z-index: 100;
  }
  .calendar-month-header {
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    color: #667eea;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid #f0f0f8;
  }

  .dark .calendar-month-header {
    color: #8b9dff;
    border-bottom-color: #2a2f55;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .calendar-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }

  .weekday {
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    color: #667eea;
    padding: 8px 0;
  }

  .calendar-dates-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
  }

  .calendar-date-cell {
    aspect-ratio: 1;
    border: 2px solid #f0f0f8;
    border-radius: 12px;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    color: #1a1a2e;
    cursor: pointer;
    transition: all 0.2s ease;
    pointer-events: auto;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .calendar-date-cell.empty {
    border: none;
    background: transparent;
    cursor: default;
    pointer-events: none;
  }

  .calendar-date-cell:not(.empty):not(.is-disabled):hover {
    border-color: #667eea;
    background: #f8f8ff;
    transform: scale(1.05);
  }

  .calendar-date-cell:not(.empty):not(.is-disabled):active {
    transform: scale(0.95);
  }

  .calendar-date-cell.is-today {
    border-color: #667eea;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    font-weight: 700;
  }

  .calendar-date-cell.is-selected {
    border-color: #ff6b35;
    background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
    color: #ffffff;
    font-weight: 700;
  }

  .calendar-date-cell.is-disabled {
    background: #fafafa;
    color: #d0d0d0;
    cursor: not-allowed;
    border-color: #f5f5f5;
  }

  .calendar-date-cell.is-disabled:hover {
    transform: none;
    border-color: #f5f5f5;
    background: #fafafa;
  }

  .header-button {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 12px;
    padding: 12px;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-button:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .tracker-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .tracker-item {
    background: #ffffff;
    border: 2px solid #f0f0f8;
    border-radius: 16px;
    padding: 16px;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tracker-item:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
  }

  .tracker-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .tracker-task-name {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a2e;
    margin: 0;
    flex: 1;
    min-width: 0;
  }

  .tracker-task-name.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tracker-task-name.clickable:hover {
    color: #667eea;
    transform: translateX(2px);
  }

  .tracker-item-status {
    flex-shrink: 0;
  }

  .tracker-item-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .task-frequency {
    font-size: 13px;
    color: #6b6b80;
    font-weight: 500;
  }

  .task-time {
    font-size: 13px;
    color: #667eea;
    font-weight: 600;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-group {
    padding: 0;
  }

  .checkbox-group .checkbox-label {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: transparent;
    border: 2px solid #e0e0f0;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    margin: 0;
  }

  .checkbox-group .checkbox-label:hover {
    border-color: #667eea;
  }

  .checkbox-group .checkbox-label span {
    font-size: 16px;
    font-weight: 500;
    color: inherit;
  }

  .dark .checkbox-group .checkbox-label {
    border-color: #2a2f55;
  }

  .dark .checkbox-group .checkbox-label:hover {
    border-color: #667eea;
  }

  .form-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #667eea;
  }

  .error-text {
    display: block;
    color: #ef4444;
    font-size: 13px;
    margin-top: 6px;
    font-weight: 500;
  }

  .dark .task-time {
    color: #8b9dff;
  }

  .tracker-item-streak {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .streak-icon {
    font-size: 16px;
  }

  .streak-text {
    font-size: 14px;
    font-weight: 600;
    color: #ff6b35;
  }

  .status-select {
    width: 100%;
    padding: 12px 16px;
    font-size: 16px;
    font-weight: 500;
    border: 2px solid #e0e0f0;
    border-radius: 12px;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .status-select:hover {
    border-color: #667eea;
  }

  .status-select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .status-select-compact {
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 500;
    border: 2px solid #e0e0f0;
    border-radius: 10px;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
    min-width: 100px;
  }

  .status-select-compact:hover:not(:disabled) {
    border-color: #667eea;
  }

  .status-select-compact:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .status-select-compact:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status-display {
    width: 100%;
  }

  .status-display.editable {
    cursor: pointer;
  }

  .status-display-compact {
    display: inline-block;
  }

  .status-badge {
    display: inline-block;
    padding: 12px 20px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 12px;
    text-align: center;
    width: 100%;
    transition: all 0.2s ease;
  }

  .status-badge-compact {
    display: inline-block;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 10px;
    transition: all 0.2s ease;
  }

  .status-badge.editable-badge,
  .status-badge-compact.editable-badge {
    cursor: pointer;
  }

  .status-badge.editable-badge:hover,
  .status-badge-compact.editable-badge:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);
  }

  .edit-indicator {
    margin-left: 8px;
    font-size: 14px;
    opacity: 0.8;
  }

  .status-badge.yes,
  .status-badge-compact.yes {
    background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
    color: #ffffff;
  }

  .status-badge.no,
  .status-badge-compact.no {
    background: linear-gradient(135deg, #f44336 0%, #ef5350 100%);
    color: #ffffff;
  }

  .status-badge.partly,
  .status-badge-compact.partly {
    background: linear-gradient(135deg, #ff9800 0%, #ffa726 100%);
    color: #ffffff;
  }

  .status-badge.empty,
  .status-badge-compact.empty {
    background: #f5f5f5;
    color: #9b9bb0;
    font-style: italic;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    animation: fadeIn 0.1s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    background: #ffffff;
    border-radius: 20px;
    max-width: 440px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.15s ease;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 24px 16px;
    border-bottom: 2px solid #f0f0f8;
  }

  .modal-header h3 {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a2e;
  }

  .close-button {
    background: none;
    border: none;
    color: #6b6b80;
    cursor: pointer;
    padding: 4px;
    display: flex;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    color: #1a1a2e;
  }

  .modal-body {
    padding: 24px;
  }

  .modal-text {
    margin-bottom: 20px;
    color: #4a4a5e;
    line-height: 1.6;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #4a4a5e;
    margin-bottom: 8px;
  }

  .form-input {
    width: 100%;
    padding: 12px 16px;
    font-size: 16px;
    border: 2px solid #e0e0f0;
    border-radius: 12px;
    background: #ffffff;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .form-input:hover {
    border-color: #d0d0e0;
  }

  .form-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .error-message {
    margin-top: 8px;
    font-size: 14px;
    color: #d32f2f;
    font-weight: 500;
  }

  .date-picker-large {
    padding: 16px;
    font-size: 18px;
  }

  .date-info-text {
    margin-top: 12px;
    font-size: 13px;
    color: #6b6b80;
    text-align: center;
    line-height: 1.4;
  }

  .modal-footer {
    display: flex;
    gap: 12px;
    padding: 16px 24px 24px;
  }

  .modal-buttons {
    display: flex;
    gap: 12px;
    padding: 16px 24px 24px;
  }

  .btn-primary {
    flex: 1;
    padding: 14px 24px;
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.3);
  }

  .btn-primary:disabled {
    background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .btn-primary:disabled:hover {
    transform: none;
    box-shadow: none;
  }

  .btn-secondary {
    flex: 1;
    padding: 14px 24px;
    font-size: 16px;
    font-weight: 600;
    color: #6b6b80;
    background: #f0f0f8;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .btn-secondary:hover {
    background: #e0e0f0;
  }

  .primary-button {
    flex: 1;
    padding: 14px 24px;
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .primary-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.3);
  }

  .primary-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .secondary-button {
    flex: 1;
    padding: 14px 24px;
    font-size: 16px;
    font-weight: 600;
    color: #6b6b80;
    background: #f0f0f8;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'DM Sans', sans-serif;
  }

  .secondary-button:hover {
    background: #e0e0f0;
  }

  .dialog-content {
    background: #ffffff;
    border-radius: 20px;
    max-width: 320px;
    width: 100%;
    padding: 32px 24px 24px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    text-align: center;
    animation: slideUp 0.15s ease;
  }

  .dialog-message {
    font-size: 18px;
    font-weight: 500;
    color: #1a1a2e;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #9b9bb0;
  }

  .empty-state p {
    font-size: 16px;
    line-height: 1.6;
  }

  .streak-modal-content {
    background: #ffffff;
    border-radius: 24px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.15s ease;
    max-height: 90vh;
    overflow-y: auto;
  }

  .streak-modal-body {
    padding: 24px;
  }

  .streak-counter {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 0;
    margin-bottom: 24px;
  }

  .streak-flame {
    font-size: 48px;
    margin-bottom: 8px;
    animation: flicker 2s ease-in-out infinite;
  }

  @keyframes flicker {
    0%, 100% {
      transform: scale(1);
      filter: brightness(1);
    }
    50% {
      transform: scale(1.05);
      filter: brightness(1.2);
    }
  }

  .streak-number {
    font-family: 'Fraunces', serif;
    font-size: 56px;
    font-weight: 700;
    background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1;
    margin-bottom: 4px;
  }

  .streak-label {
    font-size: 16px;
    font-weight: 600;
    color: #6b6b80;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    margin-bottom: 24px;
  }

  .calendar-cell {
    aspect-ratio: 1;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s ease;
    position: relative;
  }

  .calendar-cell.invalid {
    background: #e8e8e8;
    color: #b0b0b0;
  }

  .calendar-cell.missed {
    background: #ffebee;
    color: #d32f2f;
    font-weight: 700;
  }

  .calendar-cell.not-marked {
    background: #f0f0f0;
    color: #5a5a5a;
    font-weight: 600;
  }

  .calendar-cell.completed {
    background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
    transform: scale(1.02);
  }

  .calendar-cell.today {
    border: 3px solid #667eea;
    box-shadow: 0 0 0 1px #667eea;
    color: #2a2a2a;
    font-weight: 700;
  }

  .calendar-cell.today.completed {
    border-color: #ff6b35;
    box-shadow: 0 0 0 1px #ff6b35, 0 4px 12px rgba(255, 107, 53, 0.4);
    color: #ffffff;
  }

  .cell-day {
    font-size: 13px;
  }

  .streak-footer {
    text-align: center;
    padding-top: 16px;
    border-top: 2px solid #f0f0f8;
  }

  .streak-subtitle {
    font-size: 14px;
    color: #6b6b80;
    line-height: 1.5;
  }

  .ended-task-note {
    color: #9b9bb0;
    font-style: italic;
  }

  @media (max-width: 480px) {
    .app-container {
      max-width: 100%;
    }

    .onboarding-title {
      font-size: 40px;
    }

    .greeting {
      font-size: 28px;
    }

    .current-date {
      font-size: 14px;
    }

    .bottom-action {
      max-width: 100%;
    }

    .streak-modal-content {
      max-width: 95%;
      margin: 0 10px;
    }

    .calendar-grid {
      gap: 6px;
    }

    .streak-number {
      font-size: 48px;
    }

    .streak-flame {
      font-size: 40px;
    }
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}