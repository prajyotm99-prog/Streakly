import { WebPlugin } from '@capacitor/core';

/**
 * v3.8: Web stub for ExactAlarm
 * Alarms are not supported on web - this is a no-op implementation
 * JavaScript version (no TypeScript)
 */
export class ExactAlarmWeb extends WebPlugin {
  async schedule() {
    console.log('ExactAlarm.schedule() is not supported on web');
  }

  async cancel() {
    console.log('ExactAlarm.cancel() is not supported on web');
  }

  async checkPermission() {
    return { granted: false };
  }
}