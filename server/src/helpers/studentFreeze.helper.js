import AttendanceExemption from "../models/attendanceExemption.model.js";
import StudentFreeze from "../models/studentFreeze.model.js";
import { toUtcMidnight } from "./attendance.helper.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Davomat integratsiyasi ───
// Muzlatish oynasini davomat "exemption" shakliga aylantiradi. Muzlatish
// [startDate, endDate) - endDate EXCLUSIVE (chiqarish kuni endi muzlatilmagan),
// exemption endDate esa INCLUSIVE, shu sabab oxirgi muzlatilgan kun = endDate - 1 kun.
// daysOfWeek: [] => hamma kun (to'liq muzlatish). isExemptOn/defaultStatusFor
// bunday kunlarga "exempt" statusini beradi (davomat foiziga ta'sir qilmaydi).
export const freezeToExemption = (f) => ({
  student: f.student,
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
// ishlatiladi. studentMatch: { student: id } yoki { student: { $in: ids } }.
export const loadExemptionsWithFreezes = async (studentMatch) => {
  const [exemptions, freezes] = await Promise.all([
    AttendanceExemption.find({ ...studentMatch, isActive: true }),
    StudentFreeze.find({ ...studentMatch, isDeleted: { $ne: true } }).lean(),
  ]);
  return [...exemptions, ...freezes.map(freezeToExemption)];
};

// ─── To'lov integratsiyasi ───
// O'quvchining muzlatish oynalarini normallashtirilgan [{start, end}] shaklida
// qaytaradi (UTC yarim tun, ms). end EXCLUSIVE; ochiq muzlatish => Infinity.
export const loadFreezeWindows = async (studentMatch) => {
  const rows = await StudentFreeze.find({
    ...studentMatch,
    isDeleted: { $ne: true },
  })
    .select("startDate endDate")
    .lean();
  return rows.map((r) => ({
    start: toUtcMidnight(r.startDate).getTime(),
    end: r.endDate ? toUtcMidnight(r.endDate).getTime() : Infinity,
  }));
};

// Berilgan sana biror muzlatish oynasiga tushadimi (start <= d < end).
export const isFrozenOn = (windows, dateMs) =>
  windows.some((w) => dateMs >= w.start && dateMs < w.end);
