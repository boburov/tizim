import prisma from "../../../config/prisma.js";
import { getTrigger } from "./kpiTriggers.js";
import logger from "../../../config/logger.js";

/**
 * KPI DVIGATELI - qoidalarni hodisalarga qo'llaydi.
 *
 * Qoida xodimga ikki yo'l bilan tegishli:
 *   1) ROL bo'yicha  - rule.applicableRoles ichida xodim roli bo'lsa
 *                      (bo'sh massiv = hamma xodimga);
 *   2) SHAXSAN       - StaffKpiAssignment yozuvi orqali.
 *
 * Biriktiruv AYNI PAYTDA istisno ham: enabled=false bo'lsa rol bo'yicha
 * tegishli qoida shu xodim uchun o'chadi. "Hamma resepshinga, Alidan
 * tashqari" holati qoidani ko'chirmasdan hal bo'ladi.
 */
export const resolveRulesForEmployee = async (employee) => {
  // MONGO → PRISMA: { employee } → { employeeId }, { rule } → { ruleId }.
  // `employee` chaqiruvchidan keladi va Prisma yozuvi bo'lgani uchun `id`.
  const employeeId = String(employee.id ?? employee._id);

  const [rules, assignments] = await Promise.all([
    prisma.kpiRule.findMany({ where: { enabled: true, isDeleted: false } }),
    prisma.staffKpiAssignment.findMany({
      where: { employeeId, isDeleted: false },
    }),
  ]);

  const byRule = new Map(assignments.map((a) => [String(a.ruleId), a]));

  return rules
    .map((rule) => {
      const assignment = byRule.get(String(rule.id));

      // Aniq o'chirilgan - rol bo'yicha tegishli bo'lsa ham qo'llanmaydi.
      if (assignment && assignment.enabled === false) return null;

      const byRole =
        !rule.applicableRoles?.length ||
        rule.applicableRoles.includes(employee.role);
      if (!assignment && !byRole) return null;

      // FILIAL: qoida bitta filialga bog'langan bo'lsa, boshqa filial
      // xodimiga qo'llanmaydi.
      if (
        rule.branchId &&
        String(rule.branchId) !== String(employee.homeBranchId || "")
      ) {
        return null;
      }

      return {
        rule,
        // Shaxsiy stavka qoidanikidan ustun.
        rewardValue:
          assignment?.rewardValueOverride != null
            ? assignment.rewardValueOverride
            : rule.rewardValue,
      };
    })
    .filter(Boolean);
};

// Bitta hodisa uchun mukofot summasi.
//
// Yaxlitlash SHU YERDA va faqat shu yerda - har qatorda bir marta.
const computeAmount = ({ rewardType, rewardValue, quantity, base }) => {
  if (rewardType === "percent") {
    return Math.round((Number(base || 0) * Number(rewardValue || 0)) / 100);
  }
  if (rewardType === "per_unit") {
    return Math.round(Number(rewardValue || 0) * Number(quantity || 0));
  }
  // fixed - har hodisa uchun qat'iy summa
  return Math.round(Number(rewardValue || 0));
};

/**
 * Xodimning bir oydagi AVTOMATIK KPI qatorlarini qayta quradi.
 *
 * IDEMPOTENT: qatorlar (payroll, rule, sourceType, sourceId) kaliti
 * bo'yicha upsert qilinadi va shu hisobda uchramagan eski qatorlar
 * o'chiriladi. Ya'ni oyni necha marta qayta hisoblasangiz ham natija
 * bir xil - qo'shaloq mukofot jismonan mumkin emas (unique indeks).
 *
 * @returns {Promise<{ total: number, items: Array }>}
 */
export const rebuildAutoKpi = async ({ payroll, employee }) => {
  const employeeId = String(employee.id ?? employee._id);
  const applicable = await resolveRulesForEmployee(employee);
  const keptIds = [];
  // Snapshot uchun: hisob paytida QAYSI qoidalar qanday stavka bilan
  // qo'llangani. Qoida keyin o'zgartirilsa ham o'tgan oy o'z holicha
  // tushuntirilib turadi.
  const appliedRules = [];
  let total = 0;

  for (const { rule, rewardValue } of applicable) {
    const trigger = getTrigger(rule.trigger);
    if (!trigger) {
      // Qoida noma'lum triggerga ishora qilyapti (kod orqaga qaytarilgan?).
      // Butun maoshni yiqitmaymiz - qoidani o'tkazib yuboramiz.
      logger.warn(
        { rule: String(rule.id), trigger: rule.trigger },
        "KPI qoidasi noma'lum triggerga ishora qilmoqda",
      );
      continue;
    }

    let events = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      events = await trigger.evaluate({
        employeeId,
        year: payroll.year,
        month: payroll.month,
        conditions: rule.conditions || {},
      });
    } catch (err) {
      // Bitta qoidaning xatosi qolgan mukofotlarni yo'qotmasin.
      logger.warn(
        { err: err?.message, rule: String(rule.id) },
        "KPI qoidasini hisoblab bo'lmadi",
      );
      continue;
    }

    let ruleTotal = 0;
    for (const ev of events) {
      let amount = computeAmount({
        rewardType: rule.rewardType,
        rewardValue,
        quantity: ev.quantity,
        base: ev.base,
      });
      if (amount <= 0) continue;

      // OYLIK SHIFT: noto'g'ri sozlangan qoida byudjetni yeb qo'ymasin.
      if (rule.monthlyCap > 0) {
        const room = rule.monthlyCap - ruleTotal;
        if (room <= 0) break;
        amount = Math.min(amount, room);
      }
      ruleTotal += amount;

      // Hodisaning barqaror kaliti. Trigger o'zi bermasa - manba turi +
      // id. Bu kalit UMR BO'YI noyob (oy ichida emas), shuning uchun
      // hodisa oyi siljisa ham ikkinchi marta to'lanmaydi.
      const eventKey = ev.eventKey || `${ev.sourceType}:${ev.sourceId || "-"}`;

      // IDEMPOTENTLIK ANKARI: @@unique([employeeId, ruleId, eventKey]).
      // Bu HAQIQIY (qisman emas) unique kalit, shuning uchun Prisma'ning
      // tabiiy `upsert` i ishlaydi - bir hodisa uchun ikkinchi mukofot
      // qatori bazada jismonan yaratilmaydi.
      const payload = {
        payrollId: payroll.id,
        sourceType: ev.sourceType,
        sourceId: ev.sourceId ? String(ev.sourceId) : null,
        year: payroll.year,
        month: payroll.month,
        ruleName: rule.name,
        trigger: rule.trigger,
        quantity: ev.quantity || 1,
        unitAmount: rewardValue,
        amount,
        meta: ev.meta || {},
      };
      // eslint-disable-next-line no-await-in-loop
      const doc = await prisma.staffPayrollItem.upsert({
        where: {
          employeeId_ruleId_eventKey: { employeeId, ruleId: rule.id, eventKey },
        },
        update: payload,
        create: { ...payload, employeeId, ruleId: rule.id, eventKey },
      });
      keptIds.push(doc.id);
    }
    total += ruleTotal;
    appliedRules.push({
      rule: String(rule.id),
      name: rule.name,
      trigger: rule.trigger,
      rewardType: rule.rewardType,
      rewardValue,
      monthlyCap: rule.monthlyCap || 0,
      conditions: rule.conditions || {},
      amount: ruleTotal,
    });
  }

  // Endi tegishli bo'lmagan qatorlar (qoida o'chirilgan, shart o'zgargan,
  // lid boshqa xodimga o'tgan) - tozalanadi.
  // Mongo `$nin` → Prisma `notIn`. Bo'sh ro'yxatda `notIn: []` HAMMA
  // qatorga to'g'ri keladi - bu aynan kerak: hech bir qoida qo'llanmasa
  // shu oyning barcha avtomatik qatorlari tozalanishi shart.
  await prisma.staffPayrollItem.deleteMany({
    where: { payrollId: payroll.id, id: { notIn: keptIds } },
  });

  return { total, count: keptIds.length, appliedRules };
};
