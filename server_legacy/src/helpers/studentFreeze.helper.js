import prisma from "../config/prisma.js";
import { toUtcMidnight } from "./attendance.helper.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// ═════════════════════════════════════════════════════════════════
// MONGO → PRISMA: `studentMatch` SHAKLI O'ZGARDI
//
// Chaqiruvchilar ilgari XOM MONGO FILTRI uzatardi:
//     loadFreezeWindows({ student: id })
//     loadExemptionsWithFreezes({ student: { $in: ids } })
//
// Bu shakl Prisma'da JIMGINA NOTO'G'RI ishlardi: `student` - relation,
// `$in` esa umuman tanilmaydigan kalit. Xato ham bermas, boshqa
// natija ham berardi.
//
// Shuning uchun endi funksiyalar ANIQ ARGUMENT oladi:
//     loadFreezeWindows(studentId)
//     loadFreezeWindowsByStudent(studentIds)
//     loadExemptionsWithFreezes(studentIds)
//
// Eski `{ student }` / `{ student: { $in } }` shakli ham QABUL QILINADI
// (normalizeStudentIds) - migratsiya davomida ko'chirilmagan chaqiruvchi
// jimgina bo'sh natija olmasin.
// ═════════════════════════════════════════════════════════════════

/**
 * Chaqiruvchidan kelgan narsani o'quvchi ID'lari massiviga keltiradi.
 * Qabul qiladi: "id" | ["id"] | { student: "id" } | { student: { $in: [...] } }
 *               | { studentId: "id" } | { studentId: { in: [...] } }
 */
const normalizeStudentIds = (input) => {
  if (!input) return [];
  if (typeof input === "string") return [input];
  if (Array.isArray(input)) return input.map(String);

  const raw = input.studentId ?? input.student;
  if (!raw) return [];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.map(String);
  const list = raw.in ?? raw.$in;
  return Array.isArray(list) ? list.map(String) : [];
};

const studentWhere = (input) => {
  const ids = normalizeStudentIds(input);
  // Bo'sh ro'yxat = "hech kim" (fail-closed), `undefined` emas -
  // aks holda filtr yo'qolib, BUTUN jadval qaytardi.
  return ids.length === 1 ? { studentId: ids[0] } : { studentId: { in: ids } };
};

// ─── Davomat integratsiyasi ───
// Muzlatish oynasini davomat "exemption" shakliga aylantiradi. Muzlatish
// [startDate, endDate) - endDate EXCLUSIVE (chiqarish kuni endi muzlatilmagan),
// exemption endDate esa INCLUSIVE, shu sabab oxirgi muzlatilgan kun = endDate - 1 kun.
// daysOfWeek: [] => hamma kun (to'liq muzlatish). isExemptOn/defaultStatusFor
// bunday kunlarga "exempt" statusini beradi (davomat foiziga ta'sir qilmaydi).
export const freezeToExemption = (f) => ({
  // Prisma ustuni `studentId`; chaqiruvchilar (attendance) eski `student`
  // nomini o'qiydi - ikkalasi ham beriladi.
  studentId: f.studentId,
  student: f.studentId,
  isActive: true,
  startDate: f.startDate,
  endDate: f.endDate
    ? new Date(toUtcMidnight(f.endDate).getTime() - DAY_MS)
    : null,
  daysOfWeek: [],
  __source: "freeze",
});

// Berilgan o'quvchi(lar) uchun HAQIQIY exemption'lar + muzlatishdan olingan
// pseudo-exemption'larni birlashtiradi. attendance.service dagi har bir
// `AttendanceExemption.find({ ...studentMatch, isActive: true })` o'rniga
// ishlatiladi.
export const loadExemptionsWithFreezes = async (studentMatch) => {
  const where = studentWhere(studentMatch);
  const [exemptions, freezes] = await Promise.all([
    prisma.attendanceExemption.findMany({ where: { ...where, isActive: true } }),
    prisma.studentFreeze.findMany({ where: { ...where, isDeleted: false } }),
  ]);
  // Haqiqiy exemption'da ham `student` taxallusi kerak (chaqiruvchi
  // `e.student` bo'yicha guruhlaydi).
  const normalized = exemptions.map((e) => ({ ...e, student: e.studentId }));
  return [...normalized, ...freezes.map(freezeToExemption)];
};

// ─── To'lov integratsiyasi ───
// O'quvchining muzlatish oynalarini normallashtirilgan [{start, end}] shaklida
// qaytaradi (UTC yarim tun, ms). end EXCLUSIVE; ochiq muzlatish => Infinity.
export const loadFreezeWindows = async (studentMatch) => {
  const rows = await prisma.studentFreeze.findMany({
    where: { ...studentWhere(studentMatch), isDeleted: false },
    select: { startDate: true, endDate: true },
  });
  return rows.map((r) => ({
    start: toUtcMidnight(r.startDate).getTime(),
    end: r.endDate ? toUtcMidnight(r.endDate).getTime() : Infinity,
  }));
};

// Berilgan sana biror muzlatish oynasiga tushadimi (start <= d < end).
export const isFrozenOn = (windows, dateMs) =>
  windows.some((w) => dateMs >= w.start && dateMs < w.end);

/**
 * Muzlatish oynalari O'QUVCHI BO'YICHA: Map<studentId, [{start, end}]>.
 *
 * `loadFreezeWindows` oynalarni bitta ro'yxatga qo'shib yuboradi - u
 * BITTA o'quvchi uchun mo'ljallangan (to'lov hisobi). Ko'p o'quvchini
 * birdan tekshirganda (kunlik joblar) oynalar kimniki ekani kerak,
 * aks holda bir o'quvchining muzlatishi boshqasiga ham qo'llanardi.
 *
 * Bittada bitta so'rov: har o'quvchi uchun alohida chaqirilsa 500
 * o'quvchida 500 ta so'rov ketardi.
 */
export const loadFreezeWindowsByStudent = async (studentMatch) => {
  const rows = await prisma.studentFreeze.findMany({
    where: { ...studentWhere(studentMatch), isDeleted: false },
    select: { studentId: true, startDate: true, endDate: true },
  });

  const map = new Map();
  for (const r of rows) {
    const key = String(r.studentId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      start: toUtcMidnight(r.startDate).getTime(),
      end: r.endDate ? toUtcMidnight(r.endDate).getTime() : Infinity,
    });
  }
  return map;
};
