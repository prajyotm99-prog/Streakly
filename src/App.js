// VERSION: 3.8 — Stability, Consistency & Reliability Update
// Updated: 2026-02-01

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Home, Plus, X, Trash2 } from 'lucide-react';
import { initPushNotifications, triggerDailyNotificationCheck, cancelTimeBasedNotifications } from './PushNotifications';
import { Capacitor } from '@capacitor/core';
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
 * v3.8 FIX: SINGLE SOURCE OF TRUTH for streak calculation
 * Used by: Home page, Tracker page, Calendar modal
 * 
 * Algorithm:
 * 1. Start from YESTERDAY (not today)
 * 2. Walk backwards through history
 * 3. Count only days where task was scheduled AND completed
 * 4. Stop at first scheduled day that was NOT completed
 * 5. Add today's completion if marked "Yes"
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
  
  // v3.8: Add today's completion if marked as "Yes"
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
// MAIN APP COMPONENT
// ============================================================================

export default function TaskTrackerApp() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const [page, setPage] = useState('onboarding');
  const [userName, setUserName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [taskStatuses, setTaskStatuses] = useState({});
  const [appInstallDate, setAppInstallDate] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchEndX, setTouchEndX] = useState(null);

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
  // v3.8 PERFORMANCE: Memoized computed values
  // ============================================================================
  
  /**
   * v3.6 OPTIMIZATION: Memoize tasks for selected date
   * Prevents re-filtering on every render
   */
  const tasksForSelectedDate = useMemo(() => {
    return tasks.filter(task => isTaskValidForDate(task, selectedDate));
  }, [tasks, selectedDate]);

  /**
   * v3.8 OPTIMIZATION: Memoize streak calculations for all visible tasks
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
   * v3.8 OPTIMIZATION: Memoize completion counts
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
    return tasks.filter(task => !task.endDate || new Date(task.endDate) >= new Date());
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
    return showAddTask || showEndTask || showCalendar || showStatusDialog || showStreakModal;
  }, [showAddTask, showEndTask, showCalendar, showStatusDialog, showStreakModal]);
  
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
      try {
        const userResult = await window.storage.get('userName');
        if (userResult) {
          setUserName(userResult.value);
          setPage('tracker');
        }
      } catch (e) {
        // User not set yet
      }

      try {
        const tasksResult = await window.storage.get('tasks');
        if (tasksResult) {
          setTasks(JSON.parse(tasksResult.value));
        }
      } catch (e) {
        // No tasks yet
      }

      try {
        const statusesResult = await window.storage.get('taskStatuses');
        if (statusesResult) {
          setTaskStatuses(JSON.parse(statusesResult.value));
        }
      } catch (e) {
        // No statuses yet
      }
      
      try {
        const darkResult = await window.storage.get('darkMode');
        if (darkResult) {
          setDarkMode(darkResult.value === 'true');
        }
      } catch (e) {}

      // Load or set app installation date
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
  }, []);

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
        setSelectedDate(getTodayString());
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
  const handleOnboardingNext = async () => {
    if (nameInput.trim()) {
      setUserName(nameInput.trim());
      await saveUserName(nameInput.trim());
      setPage('tracker');
    }
  };

  /**
   * Handles adding a new task
   * v3.5: Enforces time selection for time-based tasks
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
    return (
      <div className={`app-container ${darkMode ? 'dark' : ''} onboarding-page`}>
        <div className="onboarding-content">
          <h1 className="onboarding-title">Welcome</h1>
          <input
            type="text"
            placeholder="Enter your name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleOnboardingNext()}
            className="name-input"
            autoFocus
          />
          <button 
            onClick={handleOnboardingNext}
            className="next-button"
            disabled={!nameInput.trim()}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: TASKS MANAGEMENT PAGE
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
            {activeTasks.length === 0 ? (
              <div className="empty-state">
                <p>No tasks yet. Add your first task to get started!</p>
              </div>
            ) : (
              activeTasks.map(task => (
                <div key={task.id} className="task-item">
                  <div className="task-header">
                    <div className="task-info">
                      <h4 
                        className="task-name clickable"
                        onClick={() => {
                          setSelectedTaskForStreak(task);
                          setShowStreakModal(true);
                        }}
                      >
                        {task.name}
                        {/* v3.8: Show streak on home page */}
                        <span className="task-streak-badge">
                          🔥 {calculateCurrentStreak(task, taskStatuses)}
                        </span>
                      </h4>
                    </div>
                    <div className="task-actions">
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
                      <button
                        onClick={() => handleRemoveTask(task.id)}
                        className="task-action-button remove-button"
                        title="Delete Task"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                  
                  {/* v3.8: Two-line metadata display */}
                  <div className="task-meta-container">
                    <p className="task-meta">
                      {task.frequency}
                      {task.isTimeBased && task.targetTime && (
                        <> • {new Date(`2000-01-01T${task.targetTime}`).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}</>
                      )}
                    </p>
                    <p className="task-meta">
                      Starts {new Date(task.startDate).toLocaleDateString()}
                      {task.endDate && ` • Ends ${new Date(task.endDate).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
              ))
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
                
                <div className="form-group">
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
                    <span>Time-based task?</span>
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
                  <p className="streak-subtitle">Keep it up! Complete tasks to build your streak.</p>
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
  // v3.8: Optimized with memoization + swipe restrictions
  // ============================================================================

  if (page === 'tracker') {
    const generateCalendarDates = () => {
      const current = new Date(selectedDate);
      const year = current.getFullYear();
      const month = current.getMonth();

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startingDayOfWeek = firstDay.getDay();

      const dates = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // v3.8: Get install date for validation
      const installDate = appInstallDate ? new Date(appInstallDate) : null;
      if (installDate) installDate.setHours(0, 0, 0, 0);

      for (let i = 0; i < startingDayOfWeek; i++) {
        dates.push(null);
      }

      for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);

        const dateString = date.toLocaleDateString('en-CA');
        
        // v3.8: Disable future dates and dates before install
        const isFuture = date > today;
        const isBeforeInstall = installDate && date < installDate;
        const isDisabled = isFuture || isBeforeInstall;

        dates.push({
          day,
          dateString,
          isToday: dateString === getTodayString(),
          isSelected: dateString === selectedDate,
          isDisabled, // v3.8: Added
        });
      }

      return dates;
    };

    return (
      <div className={`app-container ${darkMode ? 'dark' : ''} tracker-page`}>
        {/* v3.8: Removed swipe handlers from root - now calendar-specific */}
        
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
            onClick={() => setShowCalendar(!showCalendar)}
            className="header-button"
            title="Select Date"
          >
            <Calendar size={24} />
          </button>
        </header>

        {/* VERSION INDICATOR - v3.8 */}
        <div style={{display: 'none'}}>v3.8</div>

        {showCalendar && (
          <div 
            className="inline-calendar"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
          >
            {/* v3.8: Swipe gestures restricted to calendar only */}
            
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
// STYLES (v3.8 ADDITIONS)
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
    font-size: 48px;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 48px;
    text-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
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

  .task-name {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a2e;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .task-name.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .task-name.clickable:hover {
    color: #667eea;
    transform: translateX(2px);
  }

  /* v3.8: Streak badge on home page */
  .task-streak-badge {
    margin-left: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #ff6b35;
    white-space: nowrap;
  }

  /* v3.8: Two-line task metadata */
  .task-meta-container {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .task-meta {
    font-size: 13px;
    color: #6b6b80;
    margin: 0;
  }

  .task-meta:first-child {
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