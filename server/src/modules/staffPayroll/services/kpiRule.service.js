import KpiRule from "../../../models/kpiRule.model.js";
import StaffKpiAssignment from "../../../models/staffKpiAssignment.model.js";
import StaffPayrollItem from "../../../models/staffPayrollItem.model.js";
import ApiError from "../../../utils/ApiError.js";
import { getTrigger, listTriggers } from "./kpiTriggers.js";

/**
 * KPI QOIDALARI - konfiguratsiya CRUD'i.
 *
 * Qoida o'chirilganda yumshoq o'chiriladi (softDelete): o'tgan oylarning
 * maosh qatorlari unga ISHORA qiladi va nomi snapshot qilingan bo'lsa
 * ham, qoidaning o'zi kerak bo'lib qolishi mumkin (audit).
 */

export const triggers = () => listTriggers();

export const list = async ({ enabled, trigger } = {}) => {
  const filter = { isDeleted: { $ne: true } };
  if (enabled !== undefined) filter.enabled = enabled;
  if (trigger) filter.trigger = trigger;

  const rules = await KpiRule.find(filter).sort({ createdAt: -1 }).lean();

  // Har qoida nechta xodimga shaxsan biriktirilgan.
  const counts = await StaffKpiAssignment.aggregate([
    { $match: { isDeleted: { $ne: true }, enabled: true } },
    { $group: { _id: "$rule", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  return rules.map((r) => ({
    ...r,
    assignedCount: countMap.get(String(r._id)) || 0,
  }));
};

export const getById = async (id) => {
  const rule = await KpiRule.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
  if (!rule) throw new ApiError(404, "KPI qoidasi topilmadi");
  return rule;
};

const assertTrigger = (trigger) => {
  if (!getTrigger(trigger)) {
    throw new ApiError(400, "Bunday KPI triggeri mavjud emas");
  }
};

export const create = async (body, currentUser) => {
  assertTrigger(body.trigger);
  return KpiRule.create({
    ...body,
    createdBy: currentUser?._id || null,
  });
};

export const update = async (id, body, currentUser) => {
  if (body.trigger) assertTrigger(body.trigger);

  const rule = await KpiRule.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!rule) throw new ApiError(404, "KPI qoidasi topilmadi");

  Object.assign(rule, body, { updatedBy: currentUser?._id || null });
  await rule.save();
  return rule;
};

export const remove = async (id, currentUser) => {
  const rule = await KpiRule.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!rule) throw new ApiError(404, "KPI qoidasi topilmadi");

  await rule.softDelete(currentUser?._id);
  // Biriktiruvlar ham o'chadi - "o'chirilgan qoida"ga ishora qilib
  // turishning ma'nosi yo'q.
  await StaffKpiAssignment.updateMany(
    { rule: rule._id, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date() } },
  );

  // YOPILMAGAN oylardagi qatorlar tozalanadi. Yopilgan oylar
  // TEGILMAYDI - to'langan/qabul qilingan maosh o'zgarmaydi.
  const StaffPayroll = (await import("../../../models/staffPayroll.model.js")).default;
  const draftIds = await StaffPayroll.find(
    { lifecycle: "draft" },
    { _id: 1 },
  ).lean();
  await StaffPayrollItem.deleteMany({
    rule: rule._id,
    payroll: { $in: draftIds.map((p) => p._id) },
  });

  return { id };
};

// --- BIRIKTIRUVLAR (xodim x qoida) ---

export const listAssignments = async (employeeId) =>
  StaffKpiAssignment.find({
    employee: employeeId,
    isDeleted: { $ne: true },
  })
    .populate("rule")
    .lean();

/**
 * Biriktiruvni o'rnatish (yaratish yoki yangilash).
 *
 * `enabled: false` - ISTISNO: rol bo'yicha tegishli qoidani shu xodim
 * uchun o'chiradi. Shuning uchun "hamma resepshinga, Alidan tashqari"
 * qoidani ko'chirmasdan hal bo'ladi.
 */
export const setAssignment = async (body, currentUser) => {
  const rule = await KpiRule.findOne({
    _id: body.rule,
    isDeleted: { $ne: true },
  }).lean();
  if (!rule) throw new ApiError(404, "KPI qoidasi topilmadi");

  return StaffKpiAssignment.findOneAndUpdate(
    { employee: body.employee, rule: body.rule, isDeleted: { $ne: true } },
    {
      $set: {
        enabled: body.enabled !== false,
        rewardValueOverride:
          body.rewardValueOverride === undefined ||
          body.rewardValueOverride === null ||
          body.rewardValueOverride === ""
            ? null
            : Number(body.rewardValueOverride),
      },
      $setOnInsert: {
        employee: body.employee,
        rule: body.rule,
        createdBy: currentUser?._id || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const removeAssignment = async (id, currentUser) => {
  const doc = await StaffKpiAssignment.findOne({
    _id: id,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Biriktiruv topilmadi");
  await doc.softDelete(currentUser?._id);
  return { id };
};
