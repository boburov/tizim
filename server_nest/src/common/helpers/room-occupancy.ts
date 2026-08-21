import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { branchFilter } from '../als/branch-context.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * XONA BANDLIGI — YAGONA HISOB MANBAI
 * (`helpers/roomOccupancy.helper.js` NING KO'CHIRMASI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── ⚠ NEGA ALOHIDA HELPER (VA NEGA NUSXA OLINMASLIGI KERAK) ──
 *
 * "Xona qancha band?" degan savol IKKI modulda kerak:
 *
 *   `branchAnalytics/roomUtilization`  → Tizim tahlili → Xonalar
 *   `financeAnalytics/profitability`   → Moliya → Foydalilik → Xonalar
 *
 * Ular ALOHIDA hisoblaganda ayni xona uchun IKKI XIL foiz chiqardi
 * (101-xona: 74% va 100%, keyinroq 103% va 100%). Foydalanuvchi uchun
 * bu eng yomon holat: ikkala raqam ham ishonchli ko'rinadi va qaysi
 * biri to'g'ri ekanini ayta oladigan hech kim yo'q.
 *
 * ⚠ `financeAnalytics` ko'chirilganda U HAM SHU SERVISDAN foydalanishi
 * SHART — nusxa ko'chirilsa xato QAYTADAN paydo bo'ladi.
 *
 * ── IKKI XATO SHU YERDA TUZATILGAN (VA U SAQLANADI) ──
 *
 *  1. USTMA-UST YOZUV IKKI BAROBAR SANALARDI. Bitta xonaga bir vaqtda
 *     ikki guruh yozilgan bo'lsa, xom `SUM(end - start)` band vaqtni
 *     qo'shib yuborardi va bandlik 100% dan OSHARDI (103.35%). Xona esa
 *     baribir o'sha ikki soat band. To'g'ri javob — oraliqlar
 *     BIRLASHMASI (`mergeIntervals`).
 *
 *     Ikkilanma yozuv YO'QOLMAYDI: u `conflicts` bo'lib ALOHIDA chiqadi
 *     — u boshqa savolning javobi: "jadvalda xato bormi?".
 *
 *  2. ISH VAQTIDAN TASHQARI DARS TO'LIQ SANALARDI. 08:00–10:00 dars
 *     09:00 da boshlanadigan kunda BIR SOAT sifatida sanalishi kerak.
 *
 * ── MAXRAJ: FAOL KUNLAR ──
 * Sig'im haftaning 7 kuniga hisoblansa, dushanbadan jumagacha TO'LA
 * band xona 74% ko'rsatadi — ya'ni tizim "joy bor" deydi, aslida esa
 * bitta ham bo'sh soat yo'q. Faol kun — jadvalda kamida bitta dars
 * bo'lgan kun; markaz rejimi AYTILMAYDI, jadvaldan O'QILADI.
 * ══════════════════════════════════════════════════════════════════════
 */

export const DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const DEFAULT_DAY_START = 9;
export const DEFAULT_DAY_END = 21;

/**
 * Ish kunidagi soat — bandlik MAXRAJINING ikkinchi qismi.
 *
 * ⚠ Ilgari `12` uchta faylda ALOHIDA yozilgan edi. Bittasi o'zgarsa,
 * uchta ekran uch xil foiz ko'rsatardi va buni hech narsa tutmasdi.
 */
export const WORKING_HOURS_PER_DAY = DEFAULT_DAY_END - DEFAULT_DAY_START;

/**
 * "HH:MM" → daqiqa.
 *
 * ⚠ Yaroqsiz qiymatda `null` (0 EMAS — 0 YARIM TUN degani). `0` qaytsa
 * buzuq yozuv yarim tundagi dars bo'lib hisobga tushardi.
 */
export const toMinutes = (value: unknown): number | null => {
  const [h, m] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(h) || h < 0 || h > 24) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
};

export const toClock = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Ikki oraliq KESISHADIMI.
 *
 * ⚠ Chegara tegib turishi (11:00 tugadi — 11:00 boshlandi) to'qnashuv
 * EMAS: bu odatiy ketma-ket dars. Shuning uchun QAT'IY `<`.
 */
export const overlaps = (
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean => a.start < b.end && b.start < a.end;

/** Kesishuvchi oraliqlarni birlashtiradi (band vaqtni ikki marta sanamaslik uchun). */
export const mergeIntervals = (
  slots: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> => {
  const sorted = [...slots].sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
};

/** Jadvalda dars bo'lgan kunlar (bandlik maxraji). */
export const activeDaysOf = (groups: Array<{ schedule?: Array<{ day: string }> }>): string[] => {
  const seen = new Set<string>();
  for (const g of groups) for (const s of g.schedule || []) seen.add(s.day);
  return (DAYS as readonly string[]).filter((d) => seen.has(d));
};

@Injectable()
export class RoomOccupancyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Guruhlar va ularning jadvalini filial ko'lamida o'qiydi.
   *
   * ⚠ `schedule` MAJBURIY `select`: u ALOHIDA jadval
   * (`GroupScheduleItem`). So'ralmasa `undefined` bo'lib qoladi va
   * bandlik JIMGINA 0 chiqadi — hech qanday xato bermasdan.
   */
  loadScheduledGroups(scope: Record<string, any> = {}) {
    return this.prisma.group.findMany({
      where: { ...scope, isActive: true, isDeleted: false } as never,
      select: {
        id: true,
        name: true,
        roomId: true,
        branchId: true,
        schedule: { select: { day: true, startTime: true, endTime: true } },
      },
    });
  }

  /**
   * HAR XONANING HAFTALIK BAND SOATI — birlashtirilgan va qirqilgan.
   *
   * ⚠ Bu yerda `isBranchAllowed` CHAQIRILMAYDI — chaqiruvchi servis uni
   * O'ZI tekshiradi (u yerda 403 xabari ham mos bo'ladi). Bu helper
   * faqat HISOBLAYDI.
   */
  async weeklyRoomHours({
    branchId = null,
    dayStart = DEFAULT_DAY_START,
    dayEnd = DEFAULT_DAY_END,
  }: { branchId?: string | null; dayStart?: number; dayEnd?: number } = {}) {
    const scope: Record<string, any> = { ...branchFilter() };
    if (branchId) scope.branchId = String(branchId);

    const groups = await this.loadScheduledGroups(scope);
    const activeDays = activeDaysOf(groups as never);
    const dayStartMin = dayStart * 60;
    const dayEndMin = dayEnd * 60;

    const byRoom = new Map<string, { slots: any[]; groups: Set<string> }>();
    for (const g of groups) {
      if (!g.roomId) continue;
      const key = String(g.roomId);
      if (!byRoom.has(key)) byRoom.set(key, { slots: [], groups: new Set() });
      const bucket = byRoom.get(key)!;
      bucket.groups.add(String(g.id));
      for (const s of (g as any).schedule || []) {
        const start = toMinutes(s.startTime);
        const end = toMinutes(s.endTime);
        if (start === null || end === null || end <= start) continue;
        bucket.slots.push({ day: s.day, start, end });
      }
    }

    const out = new Map<string, { weeklyHours: number; groups: number }>();
    for (const [roomId, bucket] of byRoom) {
      let minutes = 0;
      for (const day of DAYS) {
        const clipped = bucket.slots
          .filter((s) => s.day === day)
          .map((s) => ({
            start: Math.max(s.start, dayStartMin),
            end: Math.min(s.end, dayEndMin),
          }))
          .filter((s) => s.end > s.start);
        for (const s of mergeIntervals(clipped)) minutes += s.end - s.start;
      }
      out.set(roomId, {
        weeklyHours: Math.round((minutes / 60) * 10) / 10,
        groups: bucket.groups.size,
      });
    }

    return {
      activeDaysPerWeek: activeDays.length || DAYS.length,
      activeDays,
      byRoom: out,
    };
  }
}
