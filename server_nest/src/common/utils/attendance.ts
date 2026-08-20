import {
  toUtcMidnight,
  localTodayMidnight,
  dateKeyOf,
  dayOfWeekOf,
  type DayOfWeek,
} from './date.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DARS KUNLARI, JADVAL VERSIYALASH VA OZOD DAVRLARI —
 * `helpers/attendance.helper.js` NING KO'CHIRMASI.
 *
 * Sana primitivlari (`toUtcMidnight`, `localTodayMidnight`, `dateKeyOf`,
 * `dayOfWeekOf`) ATAYLAB `date.ts` DAN IMPORT QILINADI — bu yerda qayta
 * yozilsa "kun" ta'rifi ikkiga bo'linib, vaqt o'tib ajralib ketardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
  effectiveFrom?: Date | string | null;
}

export interface GroupLike {
  schedule?: ScheduleSlot[] | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

/** Diapazonda har bir kunni iteratsiya qiladi (UTC). */
function* iterateDays(fromDate: Date | string, toDate: Date | string) {
  const start = toUtcMidnight(fromDate);
  const end = toUtcMidnight(toDate);
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    yield new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * JADVAL VERSIYALASH — berilgan sanada AMAL QILGAN versiya.
 *
 * Har slotda `effectiveFrom` (Date | null) bor. `null` = "boshidan"
 * (eng eski). Amal qilgan (`<= target`) versiyalar orasidan ENG SO'NGGI
 * `effectiveFrom` tanlanadi va FAQAT o'sha versiyaning qatorlari
 * qaytariladi.
 *
 * ⚠ BUTUN-VERSIYA (SNAPSHOT), HAR-KUN EMAS. Bu farq muhim: agar har
 * kun uchun alohida "eng so'nggi" izlansa, YANGI versiyada OLIB
 * TASHLANGAN kun eski versiyadan TIRILIB qolardi — ya'ni jadvaldan
 * o'chirilgan dars hisob-kitobda yashab qolaverardi.
 * ═══════════════════════════════════════════════════════════════════════
 */
export const scheduleActiveOn = (
  schedule: ScheduleSlot[] | null | undefined,
  onDate: Date | string | null = null,
): ScheduleSlot[] => {
  const items = schedule || [];
  if (items.length === 0) return [];
  const target = onDate
    ? toUtcMidnight(onDate).getTime()
    : localTodayMidnight().getTime();

  // `effectiveFrom` timestampi (null → -Infinity = boshidan).
  const effTs = (it: ScheduleSlot) =>
    it.effectiveFrom ? toUtcMidnight(it.effectiveFrom).getTime() : -Infinity;

  let activeEff: number | null = null;
  for (const it of items) {
    const ts = effTs(it);
    if (ts > target) continue; // bu versiya hali amal qilmaydi
    if (activeEff === null || ts > activeEff) activeEff = ts;
  }
  if (activeEff === null) return [];
  return items.filter((it) => effTs(it) === activeEff);
};

export interface ClassSession {
  date: Date;
  dateKey: string | null;
  dayOfWeek: DayOfWeek;
  slot: string;
  startTime: string;
  endTime: string;
  isFirstSlot: boolean;
}

/**
 * Guruh jadvali asosida diapazondagi dars SESSIYALARI (har biri alohida).
 *
 * Kunda bir nechta dars bo'lsa — har sessiya alohida qaytadi:
 *   • bir slotli kun  → `slot = ""` (eski xatti-harakat, bitta yozuv/kun)
 *   • ko'p slotli kun → har slot uchun `slot = startTime` (mas. "14:00")
 *
 * `group.startDate` bo'lsa undan oldingi kunlar hisoblanmaydi;
 * `holidaySet` berilsa bayram kunlari hisoblanmaydi.
 */
export const getClassDaysInRange = (
  group: GroupLike | null | undefined,
  fromDate: Date | string,
  toDate: Date | string,
  holidaySet: Set<string> | null = null,
): ClassSession[] => {
  const schedule = group?.schedule || [];
  const startTs = group?.startDate ? toUtcMidnight(group.startDate).getTime() : null;
  const result: ClassSession[] = [];

  for (const d of iterateDays(fromDate, toDate)) {
    if (startTs !== null && d.getTime() < startTs) continue;
    const dow = dayOfWeekOf(d);
    const slots = scheduleActiveOn(schedule, d)
      .filter((s) => s.day === dow)
      .map((s) => ({ startTime: s.startTime, endTime: s.endTime }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (slots.length === 0) continue;
    const dKey = dateKeyOf(d);
    if (holidaySet && dKey && holidaySet.has(dKey)) continue;
    const multi = slots.length > 1;
    slots.forEach((s, idx) => {
      result.push({
        date: d,
        dateKey: dKey,
        dayOfWeek: dow,
        slot: multi ? s.startTime : '',
        startTime: s.startTime,
        endTime: s.endTime,
        isFirstSlot: idx === 0,
      });
    });
  }
  return result;
};

export interface ExemptionLike {
  isActive?: boolean;
  startDate: Date | string;
  endDate?: Date | string | null;
  daysOfWeek?: string[] | null;
}

/** Faol ozod davri shu sana va hafta kunini qoplaydimi. */
export const isExemptOn = (
  exemptions: ExemptionLike[] | null | undefined,
  date: Date | string,
  dayOfWeek: string,
): boolean => {
  const target = toUtcMidnight(date).getTime();
  return (exemptions || []).some((ex) => {
    if (!ex.isActive) return false;
    const start = toUtcMidnight(ex.startDate).getTime();
    if (target < start) return false;
    if (ex.endDate) {
      const end = toUtcMidnight(ex.endDate).getTime();
      if (target > end) return false;
    }
    if (Array.isArray(ex.daysOfWeek) && ex.daysOfWeek.length > 0) {
      if (!ex.daysOfWeek.includes(dayOfWeek)) return false;
    }
    return true;
  });
};

export const defaultStatusFor = (
  exemptions: ExemptionLike[] | null | undefined,
  date: Date | string,
  dayOfWeek: string,
): 'exempt' | null => (isExemptOn(exemptions, date, dayOfWeek) ? 'exempt' : null);

/**
 * Sana kurs oralig'ida (`startDate..endDate`, IKKALASI INCLUSIVE) mi.
 *
 * ⚠ INCLUSIVE — a'zolik davrlaridan (`[start, end)` HALF-OPEN) FARQ
 * QILADI. Ikkalasini aralashtirish kursning oxirgi kunini bir joyda
 * "dars bor", boshqasida "dars yo'q" qilib ko'rsatardi.
 */
export const withinCourseBounds = (
  group: GroupLike | null | undefined,
  date: Date | string,
): boolean => {
  const t = toUtcMidnight(date).getTime();
  if (group?.startDate && t < toUtcMidnight(group.startDate).getTime()) return false;
  if (group?.endDate && t > toUtcMidnight(group.endDate).getTime()) return false;
  return true;
};

export const isHolidayOn = (
  holidaySet: Set<string> | null | undefined,
  date: Date | string,
): boolean => {
  const key = dateKeyOf(date);
  return Boolean(holidaySet && key && holidaySet.has(key));
};
