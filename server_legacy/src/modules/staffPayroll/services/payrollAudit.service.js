import prisma from "../../../config/prisma.js";
import {
  PAYROLL_AUDIT_ACTIONS,
  PAYROLL_AUDIT_ACTION_LABELS,
} from "../../../constants/payrollAudit.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyIds } from "../../../utils/serialize.js";
import logger from "../../../config/logger.js";

export { PAYROLL_AUDIT_ACTIONS };

// Chaqiruvchilar `employee` / `actor` / `targetId` ga hujjat ham,
// ID ham uzatadi (masalan `actor` - to'liq `req.user`). Prisma faqat
// satr qabul qiladi, shuning uchun bitta joyda normallashtiramiz.
const toId = (v) => {
  if (!v) return null;
  if (typeof v === "string") return v;
  // Prisma obyektida `id`, eski Mongoose hujjatida `_id` - ikkalasi ham
  // bo'lishi mumkin (migratsiya davomida aralash chaqiruvchilar bor).
  return v.id ? String(v.id) : v._id ? String(v._id) : null;
};

/**
 * AUDIT YOZUVI.
 *
 * "Best-effort" EMAS: agar yozuv o'tmasa ham asosiy amal davom etadi,
 * lekin xato LOGGA tushadi. Sabab - audit tizimning ishlashini
 * to'xtatmasligi kerak, ammo jimgina yo'qolishi ham mumkin emas.
 *
 * DIQQAT: bu funksiya hech qachon `throw` qilmaydi. Chaqiruvchi uni
 * `await` qiladi, lekin natijasiga tayanmaydi.
 */
export const record = async ({
  employee,
  year = null,
  month = null,
  action,
  targetType = "",
  targetId = null,
  oldValue = null,
  newValue = null,
  reason = "",
  actor = null,
  meta = {},
  // Chaqiruvchi tranzaksiya ichida bo'lsa — o'sha tranzaksiyada yozamiz.
  // Aks holda audit yozuvi kommit bo'lib, asosiy amal qaytarilishi
  // mumkin edi: "to'landi" degan audit izi qolib, to'lovning o'zi yo'q.
  tx = null,
}) => {
  const client = tx || prisma;
  try {
    const employeeId = toId(employee);
    if (!employeeId) {
      // Ilgari Mongoose `required: true` bilan rad etardi. Prisma'da FK
      // xatosi kelib chiqardi - uni oldindan, aniq xabar bilan ushlaymiz.
      logger.warn({ action }, "Audit yozuvi: xodim aniqlanmadi");
      return null;
    }

    return await client.payrollAuditLog.create({
      data: {
        employeeId,
        year,
        month,
        action,
        targetType,
        targetId: toId(targetId),
        // Mongo `Mixed` → Prisma `Json?`. `undefined` Prisma'da "tegma"
        // degani, `null` esa "NULL yoz" - shuning uchun ochiq `?? null`.
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        reason,
        actorId: toId(actor),
        actorLabel: actor?.firstName
          ? `${actor.firstName} ${actor.lastName || ""}`.trim()
          : actor
            ? ""
            : "Tizim",
        meta: meta ?? {},
      },
    });
  } catch (err) {
    logger.warn({ err: err?.message, action }, "Audit yozuvini saqlab bo'lmadi");
    // TRANZAKSIYA ICHIDA xato YUTILMAYDI. Prisma tranzaksiyasida
    // yiqilgan so'rovdan keyin o'sha tranzaksiya baribir bekor
    // qilinadi — "yutib" davom etish faqat chalkash xato beradi.
    if (tx) throw err;
    return null;
  }
};

/**
 * O'ZGARMASLIK QO'RIQCHISI - modulning yagona to'siq nuqtasi.
 *
 * Qulflangan, yopilgan yoki TO'LANGAN oy o'zgarmaydi. To'langanlik ham
 * kiritilgan: pul chiqib bo'lgan oyning summasini keyin o'zgartirish
 * kassa bilan hisobot orasida farq tug'diradi.
 *
 * Rad etilgan urinish ham AUDITGA tushadi: "nega o'zgarmadi?" degan
 * savolga javob bo'lishi kerak, jimgina qaytib ketmasligi.
 */
export const assertMutable = async (payroll, { action, actor, reason } = {}) => {
  if (!payroll) return;

  const locked = payroll.lifecycle === "finalized";
  const paid = (payroll.paidAmount || 0) > 0;
  if (!locked && !paid) return;

  await record({
    // Prisma'da ustun `employeeId`; eski Mongoose hujjatida `employee`.
    employee: payroll.employeeId || payroll.employee,
    year: payroll.year,
    month: payroll.month,
    action: PAYROLL_AUDIT_ACTIONS.BLOCKED,
    targetType: "staffPayroll",
    targetId: payroll.id || payroll._id,
    oldValue: {
      lifecycle: payroll.lifecycle,
      paidAmount: payroll.paidAmount,
      finalAmount: payroll.finalAmount,
    },
    reason,
    actor,
    meta: { attemptedAction: action },
  });

  throw new ApiError(
    400,
    locked
      ? "Bu oy yopilgan - o'zgartirish uchun avval qulfni oching."
      : "Bu oy uchun to'lov qilingan - o'zgartirish uchun avval to'lovni bekor qiling.",
  );
};

/** Xodimning moliyaviy TAYMLAYNI (audit tarixi). */
export const timeline = async (employeeId, { limit = 100, year, month } = {}) => {
  const where = { employeeId: String(employeeId) };
  if (year) where.year = Number(year);
  if (month) where.month = Number(month);

  const rows = await prisma.payrollAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 100, 300),
    // Mongoose `.populate("actor", {...})` → Prisma `include` + `select`.
    include: {
      actor: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return withLegacyIds(
    rows.map((r) => ({
      ...r,
      actionLabel: PAYROLL_AUDIT_ACTION_LABELS[r.action] || r.action,
      actorName: r.actor
        ? `${r.actor.firstName || ""} ${r.actor.lastName || ""}`.trim()
        : r.actorLabel || "Tizim",
    })),
  );
};
