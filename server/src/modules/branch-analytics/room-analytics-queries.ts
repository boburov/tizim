import { PrismaService } from '../../prisma/prisma.service.js';
import { DAYS, toMinutes, toClock, overlaps, mergeIntervals, activeDaysOf, DEFAULT_DAY_START, DEFAULT_DAY_END } from '../../common/helpers/room-occupancy.js';
import { branchFilter, isBranchAllowed } from '../../common/als/branch-context.js';
import { ApiError } from '../../common/errors/api-error.js';
import { Injectable, Inject } from '@nestjs/common';

const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

export const generateDateRange = (startDate: Date, endDate: Date) => {
  const dates = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

// We will implement the logic inside RoomUtilizationService itself to avoid creating multiple services.
