import PayrollAuditLog, {
  PAYROLL_AUDIT_ACTIONS,
  PAYROLL_AUDIT_ACTION_LABELS,
} from "../../../models/payrollAuditLog.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";

export { PAYROLL_AUDIT_ACTIONS };

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
}) => {
  try {
    return await PayrollAuditLog.create({
      employee,
      year,
      month,
      action,
      targetType,
      targetId,
      oldValue,
      newValue,
      reason,
      actor: actor?._id || actor || null,
      actorLabel: actor?.firstName
        ? `${actor.firstName} ${actor.lastName || ""}`.trim()
        : actor
          ? ""
          : "Tizim",
      meta,
    });
  } catch (err) {
    logger.warn({ err: err?.message, action }, "Audit yozuvini saqlab bo'lmadi");
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
    employee: payroll.employee,
    year: payroll.year,
    month: payroll.month,
    action: PAYROLL_AUDIT_ACTIONS.BLOCKED,
    targetType: "staffPayroll",
    targetId: payroll._id,
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
  const filter = { employee: employeeId };
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);

  const rows = await PayrollAuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 300))
    .populate("actor", { firstName: 1, lastName: 1 })
    .lean();

  return rows.map((r) => ({
    ...r,
    actionLabel: PAYROLL_AUDIT_ACTION_LABELS[r.action] || r.action,
    actorName: r.actor
      ? `${r.actor.firstName || ""} ${r.actor.lastName || ""}`.trim()
      : r.actorLabel || "Tizim",
  }));
};
