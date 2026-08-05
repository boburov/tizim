import KpiRule from "../../../models/kpiRule.model.js";
import StaffKpiAssignment from "../../../models/staffKpiAssignment.model.js";
import StaffPayrollItem from "../../../models/staffPayrollItem.model.js";
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
  const [rules, assignments] = await Promise.all([
    KpiRule.find({ enabled: true, isDeleted: { $ne: true } }).lean(),
    StaffKpiAssignment.find({
      employee: employee._id,
      isDeleted: { $ne: true },
    }).lean(),
  ]);

  const byRule = new Map(assignments.map((a) => [String(a.rule), a]));

  return rules
    .map((rule) => {
      const assignment = byRule.get(String(rule._id));

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
        { rule: String(rule._id), trigger: rule.trigger },
        "KPI qoidasi noma'lum triggerga ishora qilmoqda",
      );
      continue;
    }

    let events = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      events = await trigger.evaluate({
        employeeId: employee._id,
        year: payroll.year,
        month: payroll.month,
        conditions: rule.conditions || {},
      });
    } catch (err) {
      // Bitta qoidaning xatosi qolgan mukofotlarni yo'qotmasin.
      logger.warn(
        { err: err?.message, rule: String(rule._id) },
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

      // eslint-disable-next-line no-await-in-loop
      const doc = await StaffPayrollItem.findOneAndUpdate(
        { employee: employee._id, rule: rule._id, eventKey },
        {
          $set: {
            payroll: payroll._id,
            sourceType: ev.sourceType,
            sourceId: ev.sourceId || null,
            year: payroll.year,
            month: payroll.month,
            ruleName: rule.name,
            trigger: rule.trigger,
            quantity: ev.quantity || 1,
            unitAmount: rewardValue,
            amount,
            meta: ev.meta || {},
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      keptIds.push(doc._id);
    }
    total += ruleTotal;
    appliedRules.push({
      rule: String(rule._id),
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
  await StaffPayrollItem.deleteMany({
    payroll: payroll._id,
    _id: { $nin: keptIds },
  });

  return { total, count: keptIds.length, appliedRules };
};
