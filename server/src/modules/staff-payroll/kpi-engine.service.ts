import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { KpiTriggersService } from './kpi-triggers.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KPI DVIGATELI — qoidalarni hodisalarga qo'llaydi.
 *
 * Qoida xodimga IKKI yo'l bilan tegishli:
 *   1) ROL bo'yicha — `rule.applicableRoles` ichida xodim roli bo'lsa
 *                     (bo'sh massiv = hamma xodimga);
 *   2) SHAXSAN      — `StaffKpiAssignment` yozuvi orqali.
 *
 * ⚠ Biriktiruv AYNI PAYTDA ISTISNO ham: `enabled=false` bo'lsa rol
 * bo'yicha tegishli qoida shu xodim uchun O'CHADI. "Hamma resepshinga,
 * Alidan tashqari" holati qoidani ko'chirmasdan hal bo'ladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface EmployeeLike {
  id?: string;
  _id?: string;
  role: string;
  homeBranchId?: string | null;
}

export interface AppliedRule {
  rule: string;
  name: string;
  trigger: string;
  rewardType: string;
  rewardValue: number;
  monthlyCap: number;
  conditions: Record<string, unknown>;
  amount: number;
}

/**
 * Bitta hodisa uchun mukofot summasi.
 *
 * ⚠ Yaxlitlash SHU YERDA va faqat shu yerda — har qatorda bir marta.
 */
const computeAmount = ({
  rewardType, rewardValue, quantity, base,
}: {
  rewardType: string; rewardValue: unknown; quantity?: number; base?: number;
}): number => {
  if (rewardType === 'percent') {
    return Math.round((Number(base || 0) * Number(rewardValue || 0)) / 100);
  }
  if (rewardType === 'per_unit') {
    return Math.round(Number(rewardValue || 0) * Number(quantity || 0));
  }
  // fixed — har hodisa uchun qat'iy summa
  return Math.round(Number(rewardValue || 0));
};

@Injectable()
export class KpiEngineService {
  private readonly logger = new Logger('KpiEngine');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly triggers: KpiTriggersService,
  ) {}

  /** Xodimga tegishli qoidalar + amaldagi stavka. */
  async resolveRulesForEmployee(employee: EmployeeLike) {
    const employeeId = String(employee.id ?? employee._id);

    const [rules, assignments] = await Promise.all([
      this.prisma.kpiRule.findMany({ where: { enabled: true, isDeleted: false } }),
      this.prisma.staffKpiAssignment.findMany({
        where: { employeeId, isDeleted: false },
      }),
    ]);

    const byRule = new Map(assignments.map((a) => [String(a.ruleId), a]));

    return rules
      .map((rule) => {
        const assignment = byRule.get(String(rule.id));

        // Aniq o'chirilgan — rol bo'yicha tegishli bo'lsa ham qo'llanmaydi.
        if (assignment && assignment.enabled === false) return null;

        const byRole =
          !rule.applicableRoles?.length ||
          rule.applicableRoles.includes(employee.role);
        if (!assignment && !byRole) return null;

        // FILIAL: qoida bitta filialga bog'langan bo'lsa, boshqa filial
        // xodimiga qo'llanmaydi.
        if (
          rule.branchId &&
          String(rule.branchId) !== String(employee.homeBranchId || '')
        ) {
          return null;
        }

        return {
          rule,
          // ⚠ Shaxsiy stavka qoidanikidan USTUN.
          rewardValue:
            assignment?.rewardValueOverride != null
              ? (assignment.rewardValueOverride as unknown as number)
              : (rule.rewardValue as unknown as number),
        };
      })
      .filter(Boolean) as { rule: (typeof rules)[number]; rewardValue: number }[];
  }

  /**
   * Xodimning bir oydagi AVTOMATIK KPI qatorlarini QAYTA QURADI.
   *
   * ⚠ IDEMPOTENT: qatorlar `(employeeId, ruleId, eventKey)` kaliti
   * bo'yicha upsert qilinadi va shu hisobda uchramagan eski qatorlar
   * o'chiriladi. Oyni necha marta qayta hisoblasangiz ham natija bir
   * xil — qo'shaloq mukofot JISMONAN mumkin emas (unique indeks).
   */
  async rebuildAutoKpi({
    payroll, employee,
  }: {
    payroll: { id: string; year: number; month: number };
    employee: EmployeeLike;
  }): Promise<{ total: number; count: number; appliedRules: AppliedRule[] }> {
    const employeeId = String(employee.id ?? employee._id);
    const applicable = await this.resolveRulesForEmployee(employee);
    const keptIds: string[] = [];
    // Snapshot uchun: hisob paytida QAYSI qoidalar qanday stavka bilan
    // qo'llangani. Qoida keyin o'zgartirilsa ham o'tgan oy o'z holicha
    // tushuntirilib turadi.
    const appliedRules: AppliedRule[] = [];
    let total = 0;

    for (const { rule, rewardValue } of applicable) {
      if (!this.triggers.has(rule.trigger)) {
        // Qoida noma'lum triggerga ishora qilyapti (kod orqaga
        // qaytarilgan?). Butun maoshni yiqitmaymiz — qoidani o'tkazib
        // yuboramiz.
        this.logger.warn(
          `KPI qoidasi noma'lum triggerga ishora qilmoqda (${String(rule.id)}: ${rule.trigger})`,
        );
        continue;
      }

      let events: Awaited<ReturnType<KpiTriggersService['evaluate']>> = [];
      try {
         
        events = await this.triggers.evaluate(rule.trigger, {
          employeeId,
          year: payroll.year,
          month: payroll.month,
          conditions: (rule.conditions || {}) as Record<string, unknown>,
        });
      } catch (err) {
        // Bitta qoidaning xatosi qolgan mukofotlarni yo'qotmasin.
        this.logger.warn(
          `KPI qoidasini hisoblab bo'lmadi (${String(rule.id)}): ${
            err instanceof Error ? err.message : String(err)
          }`,
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

        // ⚠ OYLIK SHIFT: noto'g'ri sozlangan qoida byudjetni yeb
        // qo'ymasin.
        const monthlyCap = (rule.monthlyCap as unknown as number) || 0;
        if (monthlyCap > 0) {
          const room = monthlyCap - ruleTotal;
          if (room <= 0) break;
          amount = Math.min(amount, room);
        }
        ruleTotal += amount;

        // Hodisaning BARQAROR kaliti. Trigger o'zi bermasa — manba turi
        // + id. Bu kalit UMR BO'YI noyob (oy ichida emas), shuning
        // uchun hodisa oyi siljisa ham ikkinchi marta to'lanmaydi.
        const eventKey = ev.eventKey || `${ev.sourceType}:${ev.sourceId || '-'}`;

        // ⚠ IDEMPOTENTLIK ANKARI: `@@unique([employeeId, ruleId,
        // eventKey])`. Bu HAQIQIY (qisman emas) unique kalit, shuning
        // uchun Prisma'ning tabiiy `upsert` i ishlaydi.
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
         
        const doc = await this.prisma.staffPayrollItem.upsert({
          where: {
            employeeId_ruleId_eventKey: { employeeId, ruleId: rule.id, eventKey },
          },
          update: payload as never,
          create: { ...payload, employeeId, ruleId: rule.id, eventKey } as never,
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
        monthlyCap: (rule.monthlyCap as unknown as number) || 0,
        conditions: (rule.conditions || {}) as Record<string, unknown>,
        amount: ruleTotal,
      });
    }

    // Endi tegishli bo'lmagan qatorlar (qoida o'chirilgan, shart
    // o'zgargan, lid boshqa xodimga o'tgan) — tozalanadi.
    //
    // ⚠ Bo'sh ro'yxatda `notIn: []` HAMMA qatorga to'g'ri keladi — bu
    // aynan KERAK: hech bir qoida qo'llanmasa shu oyning barcha
    // avtomatik qatorlari tozalanishi shart.
    await this.prisma.staffPayrollItem.deleteMany({
      where: { payrollId: payroll.id, id: { notIn: keptIds } },
    });

    return { total, count: keptIds.length, appliedRules };
  }
}
