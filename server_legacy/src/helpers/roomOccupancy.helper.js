import prisma from "../config/prisma.js";
import { branchFilter } from "./branchContext.helper.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * XONA BANDLIGI — YAGONA HISOB MANBAI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA ALOHIDA HELPER ──
 * "Xona qancha band?" degan savol ikki modulda kerak:
 *
 *   `branchAnalytics/roomUtilization`  → Tizim tahlili → Xonalar
 *   `financeAnalytics/profitability`   → Moliya → Foydalilik → Xonalar
 *
 * Ular ALOHIDA hisoblaganda ayni xona uchun ikki xil foiz chiqardi
 * (101-xona: 74% va 100%, keyinroq 103% va 100%). Foydalanuvchi
 * uchun bu eng yomon holat: ikkala raqam ham ishonchli ko'rinadi va
 * qaysi biri to'g'ri ekanini ayta oladigan hech kim yo'q.
 *
 * ── IKKI XATO SHU YERDA TUZATILGAN ──
 *
 *  1. USTMA-UST YOZUV IKKI BAROBAR SANALARDI. Bitta xonaga bir vaqtda
 *     ikki guruh yozilgan bo'lsa, xom `SUM(end - start)` band vaqtni
 *     qo'shib yuborardi va bandlik 100% dan OSHARDI (103.35% — testda
 *     aynan shu ushlangan). Xona esa baribir o'sha ikki soat band.
 *     To'g'ri javob — oraliqlar BIRLASHMASI.
 *
 *     Ikkilanma yozuv yo'qolmaydi: u `conflicts` bo'lib alohida
 *     chiqadi (`roomUtilization.service.js`) — u boshqa savolning
 *     javobi: "jadvalda xato bormi?".
 *
 *  2. ISH VAQTIDAN TASHQARI DARS TO'LIQ SANALARDI. 08:00–10:00 dars
 *     09:00 da boshlanadigan kunda bir soat sifatida sanalishi kerak.
 *
 * ── MAXRAJ: FAOL KUNLAR ──
 * Sig'im haftaning 7 kuniga hisoblansa, dushanbadan jumagacha TO'LA
 * band xona 74% ko'rsatadi — ya'ni tizim "joy bor" deydi, aslida esa
 * bitta ham bo'sh soat yo'q. Faol kun — jadvalda kamida bitta dars
 * bo'lgan kun; markaz rejimi AYTILMAYDI, jadvaldan O'QILADI.
 */

export const DAYS = Object.freeze(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export const DEFAULT_DAY_START = 9;
export const DEFAULT_DAY_END = 21;

/**
 * Ish kunidagi soat — bandlik MAXRAJINING ikkinchi qismi.
 *
 * Ilgari `12` uchta faylda ALOHIDA yozilgan edi. Bittasi o'zgarsa,
 * uchta ekran uch xil foiz ko'rsatardi va buni hech narsa tutmasdi.
 */
export const WORKING_HOURS_PER_DAY = DEFAULT_DAY_END - DEFAULT_DAY_START;

/** "HH:MM" → daqiqa. Yaroqsiz qiymatda `null` (0 EMAS — 0 yarim tun). */
export const toMinutes = (value) => {
  const [h, m] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(h) || h < 0 || h > 24) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
};

export const toClock = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * Ikki oraliq KESISHADIMI.
 *
 * Chegara tegib turishi (11:00 tugadi — 11:00 boshlandi) to'qnashuv
 * EMAS: bu odatiy ketma-ket dars. Shuning uchun qat'iy `<`.
 */
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** Kesishuvchi oraliqlarni birlashtiradi (band vaqtni ikki marta sanamaslik uchun). */
export const mergeIntervals = (slots) => {
  const sorted = [...slots].sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
};

/**
 * Guruhlar va ularning jadvalini filial ko'lamida o'qiydi.
 *
 * ⚠ `schedule` MAJBURIY `select`: u alohida jadval
 * (`GroupScheduleItem`). So'ralmasa `undefined` bo'lib qoladi va
 * bandlik JIMGINA 0 chiqadi.
 */
export const loadScheduledGroups = (scope = {}) =>
  prisma.group.findMany({
    where: { ...scope, isActive: true, isDeleted: false },
    select: {
      id: true,
      name: true,
      roomId: true,
      branchId: true,
      schedule: { select: { day: true, startTime: true, endTime: true } },
    },
  });

/** Jadvalda dars bo'lgan kunlar (bandlik maxraji). */
export const activeDaysOf = (groups) => {
  const seen = new Set();
  for (const g of groups) for (const s of g.schedule || []) seen.add(s.day);
  return DAYS.filter((d) => seen.has(d));
};

/**
 * HAR XONANING HAFTALIK BAND SOATI — birlashtirilgan va qirqilgan.
 *
 * @returns {{ activeDaysPerWeek: number, byRoom: Map<string, {weeklyHours: number, groups: number}> }}
 */
export const weeklyRoomHours = async ({
  branchId = null,
  dayStart = DEFAULT_DAY_START,
  dayEnd = DEFAULT_DAY_END,
} = {}) => {
  const scope = { ...branchFilter() };
  // DIQQAT: bu yerda `isBranchAllowed` CHAQIRILMAYDI — chaqiruvchi
  // servis uni O'ZI tekshiradi (u yerda 403 xabari ham mos bo'ladi).
  // Bu helper faqat hisoblaydi.
  if (branchId) scope.branchId = String(branchId);

  const groups = await loadScheduledGroups(scope);
  const activeDays = activeDaysOf(groups);
  const dayStartMin = dayStart * 60;
  const dayEndMin = dayEnd * 60;

  const byRoom = new Map();
  for (const g of groups) {
    if (!g.roomId) continue;
    const key = String(g.roomId);
    if (!byRoom.has(key)) byRoom.set(key, { slots: [], groups: new Set() });
    const bucket = byRoom.get(key);
    bucket.groups.add(String(g.id));
    for (const s of g.schedule || []) {
      const start = toMinutes(s.startTime);
      const end = toMinutes(s.endTime);
      if (start === null || end === null || end <= start) continue;
      bucket.slots.push({ day: s.day, start, end });
    }
  }

  const out = new Map();
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
};

export default weeklyRoomHours;
