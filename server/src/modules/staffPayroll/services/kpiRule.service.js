import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import { getTrigger, listTriggers } from "./kpiTriggers.js";

/**
 * KPI QOIDALARI - konfiguratsiya CRUD'i.
 *
 * Qoida o'chirilganda yumshoq o'chiriladi (softDelete): o'tgan oylarning
 * maosh qatorlari unga ISHORA qiladi va nomi snapshot qilingan bo'lsa
 * ham, qoidaning o'zi kerak bo'lib qolishi mumkin (audit).
 *
 * ═════════════════════════════════════════════════════════════════
 * MONGO → PRISMA
 *   { rule: id }     → { ruleId: id }
 *   { employee: id } → { employeeId: id }
 *   { payroll: id }  → { payrollId: id }
 *   doc.softDelete(by) → update({ isDeleted, deletedAt, deletedBy })
 *   findOneAndUpdate(..., { upsert: true }) → upsert (qisman unique kalit
 *     bo'lgani uchun `where` ga `findFirst` bilan topilgan `id` beriladi)
 *
 * QISMAN UNIQUE: (employeeId, ruleId) WHERE isDeleted = false. Prisma
 * `upsert` faqat HAQIQIY unique kalit bilan ishlaydi, qisman indeks bilan
 * emas - shuning uchun `setAssignment` avval topadi, keyin yozadi.
 * ═════════════════════════════════════════════════════════════════
 */

const actorId = (u) => u?.id || u?._id || null;

export const triggers = () => listTriggers();

export const list = async ({ enabled, trigger } = {}) => {
  const where = { isDeleted: false };
  if (enabled !== undefined) where.enabled = enabled;
  if (trigger) where.trigger = trigger;

  const rules = await prisma.kpiRule.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Har qoida nechta xodimga shaxsan biriktirilgan.
  const counts = await prisma.staffKpiAssignment.groupBy({
    by: ["ruleId"],
    where: { isDeleted: false, enabled: true },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [String(c.ruleId), c._count._all]));

  return withLegacyIds(
    rules.map((r) => ({
      ...r,
      assignedCount: countMap.get(String(r.id)) || 0,
    })),
  );
};

// Ichki o'qish - XOM Prisma yozuvi (update/remove shundan foydalanadi).
const loadRule = async (id) => {
  const rule = await prisma.kpiRule.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!rule) throw new ApiError(404, "KPI qoidasi topilmadi");
  return rule;
};

export const getById = async (id) => withLegacyId(await loadRule(id));

const assertTrigger = (trigger) => {
  if (!getTrigger(trigger)) {
    throw new ApiError(400, "Bunday KPI triggeri mavjud emas");
  }
};

// `body` dan FAQAT ustunlar olinadi.
//
// Mongoose sxemadan tashqaridagi maydonni jimgina tashlab yuborardi;
// Prisma esa "Unknown argument" bilan yiqiladi. `{...body}` ni to'g'ridan
// to'g'ri uzatish route'ga qo'shilgan har qanday yangi maydonda 500
// berardi, shuning uchun oq ro'yxat ochiq yozilgan.
const ruleColumns = (body) => {
  const out = {};
  if (body.name !== undefined) out.name = body.name;
  if (body.description !== undefined) out.description = body.description;
  if (body.trigger !== undefined) out.trigger = body.trigger;
  if (body.conditions !== undefined) out.conditions = body.conditions ?? {};
  if (body.rewardType !== undefined) out.rewardType = body.rewardType;
  if (body.rewardValue !== undefined) out.rewardValue = Number(body.rewardValue) || 0;
  if (body.applicableRoles !== undefined) out.applicableRoles = body.applicableRoles || [];
  if (body.branchId !== undefined) out.branchId = body.branchId || null;
  if (body.monthlyCap !== undefined) out.monthlyCap = Number(body.monthlyCap) || 0;
  if (body.enabled !== undefined) out.enabled = body.enabled;
  return out;
};

export const create = async (body, currentUser) => {
  assertTrigger(body.trigger);
  const rule = await prisma.kpiRule.create({
    data: {
      ...ruleColumns(body),
      // `rewardValue` sxemada MAJBURIY (default yo'q) - berilmasa
      // Prisma yiqiladi, bu to'g'ri: mukofot qiymatsiz qoida ma'nosiz.
      rewardValue: Number(body.rewardValue) || 0,
      createdById: actorId(currentUser),
    },
  });
  return withLegacyId(rule);
};

export const update = async (id, body, currentUser) => {
  if (body.trigger) assertTrigger(body.trigger);

  const rule = await loadRule(id);
  const saved = await prisma.kpiRule.update({
    where: { id: rule.id },
    data: { ...ruleColumns(body), updatedById: actorId(currentUser) },
  });
  return withLegacyId(saved);
};

export const remove = async (id, currentUser) => {
  const rule = await loadRule(id);
  const by = actorId(currentUser);

  // Uchala yozuv BITTA tranzaksiyada: qoida o'chirilib, biriktiruvlari
  // qolib ketsa ular mavjud bo'lmagan qoidaga ishora qilardi va
  // `rebuildAutoKpi` har oyda "qoida topilmadi" deb aylanib yurardi.
  await prisma.$transaction(async (tx) => {
    await tx.kpiRule.update({
      where: { id: rule.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: by },
    });

    // Biriktiruvlar ham o'chadi - "o'chirilgan qoida"ga ishora qilib
    // turishning ma'nosi yo'q.
    await tx.staffKpiAssignment.updateMany({
      where: { ruleId: rule.id, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    // YOPILMAGAN oylardagi qatorlar tozalanadi. Yopilgan oylar
    // TEGILMAYDI - to'langan/qabul qilingan maosh o'zgarmaydi.
    //
    // Mongo'da bu ikki bosqichli edi (avval draft ID'lar, keyin
    // deleteMany). Prisma relation filtri buni bitta so'rovga
    // yig'adi: "payroll'i draft bo'lgan qatorlar".
    await tx.staffPayrollItem.deleteMany({
      where: { ruleId: rule.id, payroll: { lifecycle: "draft" } },
    });
  });

  return { id: rule.id };
};

// --- BIRIKTIRUVLAR (xodim x qoida) ---

export const listAssignments = async (employeeId) =>
  withLegacyIds(
    await prisma.staffKpiAssignment.findMany({
      where: { employeeId: String(employeeId), isDeleted: false },
      include: { rule: true },
    }),
  );

/**
 * Biriktiruvni o'rnatish (yaratish yoki yangilash).
 *
 * `enabled: false` - ISTISNO: rol bo'yicha tegishli qoidani shu xodim
 * uchun o'chiradi. Shuning uchun "hamma resepshinga, Alidan tashqari"
 * qoidani ko'chirmasdan hal bo'ladi.
 */
export const setAssignment = async (body, currentUser) => {
  const rule = await prisma.kpiRule.findFirst({
    where: { id: String(body.rule), isDeleted: false },
    select: { id: true },
  });
  if (!rule) throw new ApiError(404, "KPI qoidasi topilmadi");

  const employeeId = String(body.employee);
  const data = {
    enabled: body.enabled !== false,
    rewardValueOverride:
      body.rewardValueOverride === undefined ||
      body.rewardValueOverride === null ||
      body.rewardValueOverride === ""
        ? null
        : Number(body.rewardValueOverride),
  };

  // Unique indeks QISMAN ((employeeId, ruleId) WHERE isDeleted = false),
  // Prisma `upsert` esa faqat to'liq unique kalitni qabul qiladi -
  // shuning uchun topib-yozamiz. Poyga bo'lsa indeks P2002 beradi va
  // mavjudini o'qiymiz (natija bir xil).
  const existing = await prisma.staffKpiAssignment.findFirst({
    where: { employeeId, ruleId: rule.id, isDeleted: false },
    select: { id: true },
  });
  if (existing) {
    return withLegacyId(
      await prisma.staffKpiAssignment.update({ where: { id: existing.id }, data }),
    );
  }

  try {
    return withLegacyId(
      await prisma.staffKpiAssignment.create({
        data: { ...data, employeeId, ruleId: rule.id, createdById: actorId(currentUser) },
      }),
    );
  } catch (err) {
    if (err?.code !== "P2002") throw err;
    const raced = await prisma.staffKpiAssignment.findFirst({
      where: { employeeId, ruleId: rule.id, isDeleted: false },
    });
    if (!raced) throw err;
    return withLegacyId(
      await prisma.staffKpiAssignment.update({ where: { id: raced.id }, data }),
    );
  }
};

export const removeAssignment = async (id, currentUser) => {
  const doc = await prisma.staffKpiAssignment.findFirst({
    where: { id: String(id), isDeleted: false },
    select: { id: true },
  });
  if (!doc) throw new ApiError(404, "Biriktiruv topilmadi");
  await prisma.staffKpiAssignment.update({
    where: { id: doc.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
  });
  return { id: doc.id };
};
