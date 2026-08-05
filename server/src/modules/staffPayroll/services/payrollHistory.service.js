import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import StaffPayroll from "../../../models/staffPayroll.model.js";
import StaffCompensation from "../../../models/staffCompensation.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as payrollService from "./staffPayroll.service.js";
import * as auditService from "./payrollAudit.service.js";

/**
 * MAOSH TARIXINI BOSHQARISH - HR va MOLIYA o'rtasidagi chegara.
 *
 * ASOSIY QOIDA: ishga olingan sana (hiredAt) - HR ma'lumoti. Uni
 * o'zgartirish maosh yaratmaydi, qayta hisoblamaydi va tarixni
 * o'zgartirmaydi. Maosh yaratish HAR DOIM alohida, ATAYLAB boshlangan
 * amal.
 *
 * NEGA: markaz boshqa CRM'dan ko'chib kelganda HR sanasi 2 yil orqaga
 * to'g'rilanadi. Bog'langan tizimda bu bir zumda 16 oylik maosh yaratardi
 * yoki allaqachon to'langan oylarni qayta yozardi - egasi buni sezmasdi
 * ham. Shuning uchun bu yerdagi hamma amal QO'LDA chaqiriladi va davri
 * ANIQ ko'rsatiladi.
 *
 * Bu modul o'qituvchi maoshini HISOBLAMAYDI - u faqat mavjud servisni
 * chegaralangan oy oralig'ida chaqiradi va qulflangan qatorlarni chetlab
 * o'tadi.
 */

const toId = (v) => new mongoose.Types.ObjectId(String(v));

/** [from, to] oralig'idagi oylar ro'yxati (kelajakka o'tmaydi). */
const monthsBetween = (from, to) => {
  const months = [];
  const today = localTodayMidnight();
  const last = to > today ? today : to;

  let y = from.getUTCFullYear();
  let m = from.getUTCMonth() + 1;
  const lastY = last.getUTCFullYear();
  const lastM = last.getUTCMonth() + 1;

  // Xavfsizlik cheklovi: bitta so'rov 36 oydan ko'p yaratmasin.
  while ((y < lastY || (y === lastY && m <= lastM)) && months.length < 36) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
};

const monthKey = (y, m) => y * 100 + m;

/**
 * MAOSH TARIXI HOLATI - "hiredAt ni o'zgartirsam nima bo'ladi?".
 *
 * Client shu javob asosida tasdiqlash oynasini ko'rsatadi. Tarix bo'sh
 * bo'lsa - oyna umuman ochilmaydi (ortiqcha bosish).
 */
export const getImpact = async (employeeId) => {
  const user = await User.findById(employeeId, {
    firstName: 1,
    lastName: 1,
    role: 1,
    hiredAt: 1,
    payrollStartFrom: 1,
  }).lean();
  if (!user) throw new ApiError(404, "Xodim topilmadi");

  const [teacherRows, staffRows] = await Promise.all([
    // O'qituvchi maoshi - MAVJUD modul qatorlari (faqat o'qiladi).
    TeacherSalary.find(
      { teacher: toId(employeeId) },
      {
        year: 1,
        month: 1,
        kind: 1,
        expectedAmount: 1,
        paidAmount: 1,
        status: 1,
        isLocked: 1,
      },
    ).lean(),
    StaffPayroll.find(
      { employee: toId(employeeId) },
      {
        year: 1,
        month: 1,
        finalAmount: 1,
        paidAmount: 1,
        status: 1,
        lifecycle: 1,
      },
    ).lean(),
  ]);

  // Oylar bo'yicha yig'ma ko'rinish (ikkala manba birlashtiriladi).
  const byMonth = new Map();
  const put = (row, kind) => {
    const key = monthKey(row.year, row.month);
    if (!byMonth.has(key)) {
      byMonth.set(key, {
        year: row.year,
        month: row.month,
        expected: 0,
        paid: 0,
        locked: false,
        sources: [],
        // Qulflash tugmasi uchun: qaysi qatorlarni ochish/yopish kerak.
        rows: [],
      });
    }
    const entry = byMonth.get(key);
    entry.expected += (kind === "teacher" ? row.expectedAmount : row.finalAmount) || 0;
    entry.paid += row.paidAmount || 0;
    const rowLocked = Boolean(row.isLocked) || row.lifecycle === "finalized";
    entry.locked = entry.locked || rowLocked;
    entry.rows.push({ kind, id: String(row._id), locked: rowLocked });
    if (!entry.sources.includes(kind)) entry.sources.push(kind);
    return entry;
  };

  for (const r of teacherRows) put(r, "teacher");
  for (const r of staffRows) put(r, "staff");

  const months = [...byMonth.values()].sort(
    (a, b) => monthKey(b.year, b.month) - monthKey(a.year, a.month),
  );

  const lockedCount = months.filter((m) => m.locked).length;
  const paidCount = months.filter((m) => m.paid > 0).length;

  return {
    employee: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      hiredAt: user.hiredAt,
      payrollStartFrom: user.payrollStartFrom,
    },
    hasHistory: months.length > 0,
    monthCount: months.length,
    lockedCount,
    paidCount,
    unlockedCount: months.length - lockedCount,
    firstMonth: months.length ? months[months.length - 1] : null,
    lastMonth: months.length ? months[0] : null,
    months: months.slice(0, 24),
  };
};

/**
 * TIZIM QAYSI SANADAN maosh hisoblaydi.
 *
 * "Oldingi maoshlar allaqachon to'langanmi?" -> Ha bo'lsa, owner ko'chish
 * sanasini beradi va undan oldingi oylar UMUMAN yaratilmaydi.
 */
export const setPayrollStart = async (
  employeeId,
  payrollStartFrom,
  { currentUser, reason = "", confirm = false } = {},
) => {
  const user = await User.findById(employeeId);
  if (!user) throw new ApiError(404, "Xodim topilmadi");

  const parsed = payrollStartFrom ? parseLocalDay(payrollStartFrom) : null;
  if (payrollStartFrom && !parsed) {
    throw new ApiError(400, "Sana noto'g'ri");
  }

  const previous = user.payrollStartFrom;
  const changed = String(previous || "") !== String(parsed || "");
  if (!changed) return { _id: user._id, payrollStartFrom: previous };

  // ─── HIMOYA: birinchi maosh yaratilgandan keyin ───
  //
  // Aktivatsiya sanasi maosh YARATISH chegarasini belgilaydi. Tarix
  // paydo bo'lgach uni beparvo o'zgartirish "qaysi oylar bor edi"
  // savolini chalkashtiradi, shuning uchun ATAYLAB tasdiqlash va SABAB
  // talab qilinadi. Bu amal tarixiy ma'lumotni to'g'rilash uchun.
  const hasPayroll = await StaffPayroll.exists({ employee: user._id });
  if (hasPayroll) {
    if (!confirm) {
      throw new ApiError(
        400,
        "Bu xodimda maosh tarixi bor. Aktivatsiya sanasini o'zgartirish tasdiqlanishi kerak.",
      );
    }
    if (!String(reason || "").trim()) {
      throw new ApiError(400, "O'zgartirish sababini ko'rsating");
    }
  }

  user.payrollStartFrom = parsed;
  await user.save();

  await auditService.record({
    employee: user._id,
    action: auditService.PAYROLL_AUDIT_ACTIONS.ACTIVATION_CHANGED,
    targetType: "user",
    targetId: user._id,
    oldValue: { payrollStartFrom: previous },
    newValue: { payrollStartFrom: parsed },
    reason,
    actor: currentUser,
  });

  return { _id: user._id, payrollStartFrom: user.payrollStartFrom };
};

/**
 * QURUQ YUGURISH (dry run) - DB'ga hech narsa yozilmaydi.
 *
 * Egasi "Hisoblash" tugmasini bosishdan OLDIN nima bo'lishini ko'radi:
 * qaysi oylar yaratiladi, qaysilari chetlab o'tiladi va nima uchun.
 * Bu ERP odati: moliyaviy amal ko'r-ko'rona bajarilmaydi.
 */
export const previewGenerate = async ({ employeeId, from, to }) => {
  const user = await User.findById(employeeId).lean();
  if (!user) throw new ApiError(404, "Xodim topilmadi");

  const fromDate = parseLocalDay(from);
  const toDate = parseLocalDay(to);
  if (!fromDate || !toDate) throw new ApiError(400, "Davr sanalari noto'g'ri");

  const boundary = user.payrollStartFrom;
  const months = monthsBetween(fromDate, toDate);

  const existing = await StaffPayroll.find(
    { employee: user._id },
    { year: 1, month: 1, lifecycle: 1, paidAmount: 1, finalAmount: 1, source: 1 },
  ).lean();
  const existingMap = new Map(
    existing.map((r) => [monthKey(r.year, r.month), r]),
  );

  const hasContract = await StaffCompensation.exists({
    employee: user._id,
    isDeleted: { $ne: true },
  });

  const rows = [];
  for (const { year, month } of months) {
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const row = existingMap.get(monthKey(year, month));

    if (boundary && monthEnd <= boundary) {
      rows.push({ year, month, action: "skip", why: "Aktivatsiya sanasidan oldin" });
      continue;
    }
    if (row?.lifecycle === "finalized") {
      rows.push({ year, month, action: "locked", why: "Oy yopilgan", amount: row.finalAmount });
      continue;
    }
    if ((row?.paidAmount || 0) > 0) {
      rows.push({ year, month, action: "locked", why: "To'lov qilingan", amount: row.finalAmount });
      continue;
    }
    if (row) {
      rows.push({ year, month, action: "exists", why: "Qator mavjud", amount: row.finalAmount });
      continue;
    }

    // Yozmasdan hisoblab ko'ramiz (save: false).
    // eslint-disable-next-line no-await-in-loop
    const projected = await payrollService.computePayroll(user._id, year, month, {
      save: false,
    });
    rows.push({
      year,
      month,
      action: "create",
      why: "Yangi qator yaratiladi",
      amount: projected?.fixedAmount || 0,
    });
  }

  const warnings = [];
  if (!hasContract) warnings.push("Xodimda maosh shartnomasi yo'q");
  if (boundary && rows.some((r) => r.action === "skip")) {
    warnings.push("Aktivatsiya sanasidan oldingi oylar yaratilmaydi");
  }
  if (rows.some((r) => r.action === "locked")) {
    warnings.push("Qulflangan/to'langan oylar o'zgartirilmaydi");
  }

  return {
    employee: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      payrollStartFrom: boundary || null,
    },
    rows,
    summary: {
      willCreate: rows.filter((r) => r.action === "create").length,
      exists: rows.filter((r) => r.action === "exists").length,
      locked: rows.filter((r) => r.action === "locked").length,
      skipped: rows.filter((r) => r.action === "skip").length,
    },
    warnings,
  };
};

/**
 * YETISHMAYDIGAN OYLARNI YARATISH - faqat ko'rsatilgan oraliqda.
 *
 * MAVJUD qatorlar TEGILMAYDI: bu amal faqat qator YO'Q oylarni to'ldiradi.
 * Shuning uchun uni ikki marta bosish ham xavfsiz va tarixni buzmaydi.
 */
export const generateRange = async ({ employeeId, from, to }, currentUser) => {
  const user = await User.findById(employeeId).lean();
  if (!user) throw new ApiError(404, "Xodim topilmadi");
  if (user.role === ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchiga maosh hisoblanmaydi");
  }

  const fromDate = parseLocalDay(from);
  const toDate = parseLocalDay(to);
  if (!fromDate || !toDate) throw new ApiError(400, "Davr sanalari noto'g'ri");
  if (fromDate > toDate) throw new ApiError(400, "Boshlanish sanasi tugashdan keyin");

  // MOLIYAVIY CHEGARA: ko'chishdan oldingi oylar yaratilmaydi.
  const boundary = user.payrollStartFrom;
  const effectiveFrom = boundary && boundary > fromDate ? boundary : fromDate;

  const months = monthsBetween(effectiveFrom, toDate);
  if (!months.length) {
    return { created: 0, skipped: 0, months: [], boundarySkipped: Boolean(boundary) };
  }

  // Shartnomasi yo'q oylarda hisoblash ma'nosiz - avval buni aytamiz.
  const hasContract = await StaffCompensation.exists({
    employee: user._id,
    isDeleted: { $ne: true },
  });
  if (!hasContract) {
    throw new ApiError(
      400,
      "Xodimda maosh shartnomasi yo'q - avval shartnoma belgilang",
    );
  }

  let created = 0;
  let skipped = 0;
  const details = [];

  for (const { year, month } of months) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await StaffPayroll.findOne(
      { employee: user._id, year, month },
      { _id: 1 },
    ).lean();

    if (existing) {
      skipped += 1;
      details.push({ year, month, status: "mavjud" });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await payrollService.computePayroll(user._id, year, month, {
        source: "generated",
        actor: currentUser,
        reason: "Yetishmayotgan oy qo'lda yaratildi",
      });
      created += 1;
      details.push({ year, month, status: "yaratildi" });
    } catch (err) {
      logger.warn(
        { err: err?.message, employee: String(user._id), year, month },
        "Yetishmayotgan maoshni yaratib bo'lmadi",
      );
      details.push({ year, month, status: "xato" });
    }
  }

  return {
    created,
    skipped,
    months: details,
    boundarySkipped: Boolean(boundary && boundary > fromDate),
  };
};

/**
 * QULFLANMAGAN OYLARNI QAYTA HISOBLASH.
 *
 * Qulflangan va yopilgan oylar CHETLAB O'TILADI - ular hisobotga
 * kirgan/topshirilgan davrlar.
 */
export const recalcUnlocked = async ({ employeeId, from, to }, currentUser) => {
  const user = await User.findById(employeeId).lean();
  if (!user) throw new ApiError(404, "Xodim topilmadi");

  const filter = { employee: toId(employeeId), lifecycle: { $ne: "finalized" } };

  const fromDate = from ? parseLocalDay(from) : null;
  const toDate = to ? parseLocalDay(to) : null;
  const rows = await StaffPayroll.find(filter, { year: 1, month: 1 }).lean();

  const inRange = rows.filter((r) => {
    const rowStart = new Date(Date.UTC(r.year, r.month - 1, 1));
    if (fromDate && rowStart < new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1))) {
      return false;
    }
    if (toDate && rowStart > new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1))) {
      return false;
    }
    return true;
  });

  let recalculated = 0;
  for (const r of inRange) {
    try {
      // `force` BERILMAYDI: yopilgan oy o'z-o'zidan ochilmasligi kerak.
      // eslint-disable-next-line no-await-in-loop
      await payrollService.computePayroll(user._id, r.year, r.month, {
        source: "manual",
        actor: currentUser,
        reason: "Qulflanmagan oylar qayta hisoblandi",
      });
      recalculated += 1;
    } catch (err) {
      logger.warn(
        { err: err?.message, employee: String(user._id), ...r },
        "Maoshni qayta hisoblab bo'lmadi",
      );
    }
  }

  const lockedSkipped = await StaffPayroll.countDocuments({
    employee: toId(employeeId),
    lifecycle: "finalized",
  });

  return { recalculated, lockedSkipped };
};

/**
 * QULFLASH / OCHISH - ikkala manba uchun.
 *
 * kind: "teacher" (TeacherSalary) | "staff" (StaffPayroll)
 *
 * O'qituvchi qatorining qulfi shu yerdan qo'yiladi, lekin uning
 * HISOB-KITOBI o'zgarmaydi - teacherSalary.service faqat `isLocked` ni
 * o'qib, qayta hisobni o'tkazib yuboradi.
 */
export const setLock = async ({ kind, id, locked, reason = "" }, currentUser) => {
  const now = new Date();
  const patch = locked
    ? { isLocked: true, lockedAt: now, lockedBy: currentUser?._id || null }
    : { isLocked: false, lockedAt: null, lockedBy: null };

  if (kind === "teacher") {
    const before = await TeacherSalary.findById(id).lean();
    if (!before) throw new ApiError(404, "Maosh qatori topilmadi");
    if (before.isLocked && !locked && !String(reason || "").trim()) {
      throw new ApiError(400, "Qulfni ochish sababini ko'rsating");
    }

    const row = await TeacherSalary.findByIdAndUpdate(id, { $set: patch }, { new: true });
    await auditService.record({
      employee: before.teacher,
      year: before.year,
      month: before.month,
      action: locked
        ? auditService.PAYROLL_AUDIT_ACTIONS.LOCKED
        : auditService.PAYROLL_AUDIT_ACTIONS.UNLOCKED,
      targetType: "teacherSalary",
      targetId: before._id,
      oldValue: { isLocked: Boolean(before.isLocked) },
      newValue: { isLocked: locked },
      reason,
      actor: currentUser,
    });
    return row;
  }

  // Xodim maoshida qulf `lifecycle` bilan ifodalanadi - ikkinchi
  // tushuncha kiritilsa ikkalasi bir-biriga zid bo'lib qolardi.
  return payrollService.setLifecycle(id, locked ? "finalized" : "draft", currentUser, {
    reason,
  });
};
