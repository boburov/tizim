import { replay, konst } from './_replay.mjs';

export const monthToIndex = replay('period', 'monthToIndex');
export const indexToMonth = replay('period', 'indexToMonth');
export const assertValidPeriod = replay('period', 'assertValidPeriod');
export const assertPeriodInvariants = replay('period', 'assertPeriodInvariants');
export const findPeriodForMonth = replay('period', 'findPeriodForMonth');
export const findPeriodForDate = replay('period', 'findPeriodForDate');
export const monthsInRange = replay('period', 'monthsInRange');
