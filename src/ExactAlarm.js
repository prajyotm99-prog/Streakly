import { registerPlugin } from '@capacitor/core';

/**
 * v3.8: ExactAlarm Capacitor Plugin
 * JavaScript version for React apps (no TypeScript)
 */

const ExactAlarm = registerPlugin('ExactAlarm', {
  web: () => import('./web').then(m => new m.ExactAlarmWeb()),
});

export default ExactAlarm;