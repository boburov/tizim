import { withLegacyId } from '../../common/utils/serialize.js';
import { toUtcMidnight } from '../../common/utils/date.js';
import {
  getClassDaysInRange,
  defaultStatusFor,
  type ExemptionLike,
  type GroupLike,
} from '../../common/utils/attendance.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVOMAT HISOBINING SOF (pure) YADROSI —
 * `attendance.service.js` dagi yordamchi funksiyalar.
 *
 * ALOHIDA FAYLDA, chunki ular BAZAGA TEGMAYDI va shuning uchun
 * to'g'ridan-to'g'ri Express nusxasi bilan solishtirilishi mumkin
 * (`test/attendance-core-parity.test.mjs`). HTTP orqali bu mantiq
 * faqat BILVOSITA ko'rinadi: bir katakning noto'g'ri bog'lanishi
 * javobda umuman sezilmasligi, lekin foizni buzishi mumkin.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ⚠ `leftAt` EXCLUSIVE: chiqilgan kun yarim tuni ARTIQ a'zolik EMAS
 * (belgilash yo'lidagi `leftAt > date` bilan bir xil). Oxirgi faol
 * kun = `leftAt - 1 kun`.
 *
 * Class-day oralig'ining yuqori chegarasi sifatida aynan shu
 * qaytariladi — shunda chiqilgan kun MAXRAJGA kirmaydi va jadvalda
 * "to'ldirib bo'lmaydigan" ghost katak paydo bo'lmaydi.
 */
export const lastActiveDayBefore = (leftAt: Date | string): Date =>
  new Date(toUtcMidnight(leftAt).getTime() - DAY_MS);

export const startOfMonth = (year: number, month: number): Date =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));

export const endOfMonth = (year: number, month: number): Date =>
  new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

/**
 * ═══════════════════════════════════════════════════════════════════════
 * DAVOMAT FOIZI — YAGONA TA'RIF.
 *
 *   Surat  = present
 *   Maxraj = present + absent   → BELGILANGAN, hisobga olinadigan kunlar
 *
 * MAXRAJDAN TASHQARIDA:
 *   • `exempt`   — imtiyoz/muzlatish: foizga ta'sir qilmaydi
 *   • `excused`  — sababli: o'quvchini JAZOLAMAYDI
 *   • belgilanmagan — o'qituvchi belgilamagani o'quvchining foizini
 *     PASAYTIRMASLIGI kerak
 *
 * ⚠ "late" ALOHIDA STATUS EMAS. Kechikish `lateMinutes` maydonida
 * saqlanadi; `late` = `present` yozuvlarning `lateMinutes > 0` bo'lgan
 * KICHIK TO'PLAMI. Faqat informatsion son — na foizga, na `total` ga
 * ta'sir qiladi (kechikkan o'quvchi baribir "kelgan").
 *
 * ⚠ MAXRAJ 0 BO'LSA `null`, 0 EMAS: "hali o'lchanmadi" bilan "0%" ni
 * aralashtirish yangi guruhni eng yomon guruh qilib ko'rsatardi.
 * ═══════════════════════════════════════════════════════════════════════
 */
export interface Counts {
  present: number;
  absent: number;
  excused: number;
  late: number;
  exempt: number;
}

export const computeRate = (counts: Counts): number | null => {
  const numer = counts.present;
  const denom = counts.present + counts.absent;
  return denom > 0 ? Math.round((numer / denom) * 100) : null;
};

const buildSummaryFromBuckets = (counts: Counts) => {
  // ⚠ `late` — `present` ning KICHIK TO'PLAMI, shuning uchun `total` ga
  // QO'SHILMAYDI (aks holda kechikkan o'quvchi IKKI MARTA sanalardi).
  const total = counts.present + counts.absent + counts.excused + counts.exempt;
  return {
    totalClasses: total,
    present: counts.present,
    absent: counts.absent,
    excused: counts.excused,
    late: counts.late,
    exempt: counts.exempt,
    attendanceRate: computeRate(counts),
  } as Record<string, number | null>;
};

export interface MembershipLike {
  joinedAt: Date;
  leftAt: Date | null;
  group: (GroupLike & { id: string; endDate?: Date | null }) | null;
}

export interface Cell {
  groupId: string;
  dateKey: string;
  slot: string;
  isFirstSlot: boolean;
  exemptDefault: boolean;
}

/**
 * A'zolik + imtiyozlardan `[from, to]` oralig'idagi dars-kun kataklari.
 *
 * ⚠ BIR O'QUVCHINING BIR NECHTA A'ZOLIGI bo'lishi mumkin (chiqarilib,
 * qayta qabul qilingan). Har `(group, dateKey, slot)` katagi FAQAT BIR
 * MARTA sanaladi — aks holda o'sha kun IKKI MARTA hisoblanardi.
 */
export const computeClassDays = ({
  memberships,
  exemptions,
  from,
  to,
  holidaySet = null,
}: {
  memberships: MembershipLike[];
  exemptions: ExemptionLike[];
  from: Date;
  to: Date;
  holidaySet?: Set<string> | null;
}) => {
  let total = 0;
  let exemptDefault = 0;
  const cells: Cell[] = [];
  const seenCells = new Set<string>();

  for (const m of memberships) {
    if (!m.group) continue;
    const effFrom = m.joinedAt > from ? m.joinedAt : from;
    const leftBound = m.leftAt ? lastActiveDayBefore(m.leftAt) : null;
    let effTo = leftBound && leftBound < to ? leftBound : to;
    // Kurs tugagan bo'lsa — `endDate` dan keyin dars kuni YO'Q.
    if (m.group.endDate) {
      const fin = toUtcMidnight(m.group.endDate);
      if (fin < effTo) effTo = fin;
    }
    const classDays = getClassDaysInRange(m.group, effFrom, effTo, holidaySet);
    for (const cd of classDays) {
      const cellKey = `${String(m.group.id)}|${cd.dateKey}|${cd.slot || ''}`;
      if (seenCells.has(cellKey)) continue;
      seenCells.add(cellKey);
      total += 1;
      const def = defaultStatusFor(exemptions, cd.date, cd.dayOfWeek);
      const isExemptDefault = def === 'exempt';
      if (isExemptDefault) exemptDefault += 1;
      cells.push({
        groupId: m.group.id,
        dateKey: cd.dateKey as string,
        slot: cd.slot || '',
        isFirstSlot: cd.isFirstSlot,
        exemptDefault: isExemptDefault,
      });
    }
  }
  return { total, exemptDefault, cells };
};

export interface AttendanceRow {
  groupId: string;
  studentId: string;
  dateKey: string;
  slot: string;
  status: string;
  lateMinutes?: number | null;
  [key: string]: unknown;
}

/**
 * Davomat yozuvlarini `(group, dateKey)` bo'yicha guruhlaydi.
 *
 * ⚠ `a.group` EMAS, `a.groupId`. Prisma qatorida `group` — RELATION
 * (so'ralmasa `undefined`), va `String(undefined)` "undefined" beradi:
 * kalit HECH QACHON mos kelmasdi va har bir davomat yozuvi JIMGINA
 * yo'qolardi — jami darslar to'g'ri, kelgan/kelmagan esa 0 bo'lardi.
 */
export const buildAttBySlot = (
  attendances: AttendanceRow[],
): Map<string, Map<string, AttendanceRow>> => {
  const byDay = new Map<string, Map<string, AttendanceRow>>();
  for (const a of attendances) {
    const dayKey = `${String(a.groupId)}|${a.dateKey}`;
    if (!byDay.has(dayKey)) byDay.set(dayKey, new Map());
    byDay.get(dayKey)!.set(a.slot || '', a);
  }
  return byDay;
};

/**
 * Bir kun ichidagi yozuvlardan eng ERTA (vaqt bo'yicha), bo'sh
 * BO'LMAGAN slotli, hali ishlatilmagan yozuv.
 *
 * Jadval ko'p→1 slotga qaytarilganda eski `slot="HH:mm"` yozuvini bir
 * slotli kunning katagiga bog'lash uchun.
 */
export const earliestUnusedSlotDoc = (
  slots: Map<string, AttendanceRow>,
  used: Set<AttendanceRow>,
): AttendanceRow | null => {
  const keys = Array.from(slots.keys())
    .filter((k) => k !== '')
    .sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    const d = slots.get(k);
    if (d && !used.has(d)) return d;
  }
  return null;
};

/**
 * ═══════════════════════════════════════════════════════════════════════
 * KATAK ↔ YOZUV BOG'LASH (slot-fallback).
 *
 * Avval ANIQ slot bo'yicha. Topilmasa — guruh jadvali KEYINROQ
 * o'zgargan holatda eski yozuvni shu kunning katagiga bog'laymiz, IKKI
 * YO'NALISHLI:
 *   • 1 → ko'p slot : ko'p slotli kunning BIRINCHI sloti eski
 *                     `slot=""` yozuvini oladi
 *   • ko'p → 1 slot : bir slotli kun (want="") eski `slot="HH:mm"`
 *                     yozuvini oladi
 *
 * ⚠ `used` TO'PLAMI SHART: bitta yozuv FAQAT BIR katakka bog'lanadi.
 * Usiz jadval o'zgarganda o'sha yozuv ikki katakda ko'rinib, davomat
 * IKKI MARTA sanalardi (BUG-03 double-count).
 * ═══════════════════════════════════════════════════════════════════════
 */
export const matchAttendanceForCell = (
  byDay: Map<string, Map<string, AttendanceRow>>,
  cell: { groupId: string; dateKey: string; slot: string; isFirstSlot: boolean },
  used: Set<AttendanceRow>,
): AttendanceRow | null => {
  const dayKey = `${String(cell.groupId)}|${cell.dateKey}`;
  const slots = byDay.get(dayKey);
  if (!slots) return null;
  const want = cell.slot || '';
  let doc = slots.get(want);
  if (!doc && cell.isFirstSlot) {
    if (want !== '') {
      const legacy = slots.get('');
      if (legacy && !used.has(legacy)) doc = legacy;
    } else {
      doc = earliestUnusedSlotDoc(slots, used) || undefined;
    }
  }
  if (doc) {
    if (used.has(doc)) return null; // bir yozuv faqat bir katak uchun
    used.add(doc);
  }
  return doc || null;
};

/**
 * Kataklar + davomat yozuvlaridan yakuniy hisobot.
 *
 * `attendances` kataklardan KENG bo'lishi mumkin — faqat mos
 * `group|dateKey` lar hisobga olinadi.
 */
export const summarizeCells = ({
  total,
  cells,
  attendances,
}: {
  total: number;
  cells: Cell[];
  attendances: AttendanceRow[];
}) => {
  if (total === 0) {
    return buildSummaryFromBuckets({
      present: 0, absent: 0, excused: 0, late: 0, exempt: 0,
    });
  }

  const byDay = buildAttBySlot(attendances);
  const used = new Set<AttendanceRow>();

  const counts: Counts & Record<string, number> = {
    present: 0, absent: 0, excused: 0, late: 0, exempt: 0,
  };
  let exemptUnmarked = 0;
  for (const c of cells) {
    const a = matchAttendanceForCell(byDay, c, used);
    if (a) {
      counts[a.status] = (counts[a.status] || 0) + 1;
      if (a.status === 'present' && (a.lateMinutes || 0) > 0) counts.late += 1;
    } else if (c.exemptDefault) {
      // ⚠ FAQAT BELGILANMAGAN exempt-default kunlar avto-exempt
      // hisoblanadi. Belgilangan kun yuqorida O'Z statusi bilan
      // sanaladi — ikkalasi ham sanalsa kun ikki marta hisoblanardi.
      exemptUnmarked += 1;
    }
    // Boshqa belgilanmagan kunlar HECH QAYSI bucket'ga qo'shilmaydi.
  }
  counts.exempt += exemptUnmarked;
  const markedTotal =
    counts.present + counts.absent + counts.excused + counts.exempt;
  const summary = buildSummaryFromBuckets(counts);
  summary.totalClasses = total; // jami dars kunlari (belgilangan-belgilanmagan)
  summary.unmarked = total - markedTotal;
  return summary;
};

export { withLegacyId };
