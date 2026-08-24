import { replay, konst } from './_replay.mjs';

export const dayOfWeekOf = replay('attendance', 'dayOfWeekOf');
export const dateKeyOf = replay('attendance', 'dateKeyOf');
export const toUtcMidnight = replay('attendance', 'toUtcMidnight');
export const TZ_OFFSET_MIN = konst('attendance.TZ_OFFSET_MIN');
export const localTodayMidnight = replay('attendance', 'localTodayMidnight');
export const localTodayKey = replay('attendance', 'localTodayKey');
export const localDayOfWeek = replay('attendance', 'localDayOfWeek');
export const parseLocalDay = replay('attendance', 'parseLocalDay');
export const parseLocalDayKey = replay('attendance', 'parseLocalDayKey');
export const isFutureLocalDay = replay('attendance', 'isFutureLocalDay');
export const scheduleActiveOn = replay('attendance', 'scheduleActiveOn');
export const getClassDaysInRange = replay('attendance', 'getClassDaysInRange');
export const isExemptOn = replay('attendance', 'isExemptOn');
export const defaultStatusFor = replay('attendance', 'defaultStatusFor');
export const withinCourseBounds = replay('attendance', 'withinCourseBounds');
export const isHolidayOn = replay('attendance', 'isHolidayOn');
