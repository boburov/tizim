import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { ApiError } from '../../common/errors/api-error.js';
import { hasAnyPermission } from '../../common/rbac/permission.service.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';

import { SummaryService } from './summary.service.js';
import { RevenueService } from './revenue.service.js';
import { ExpenseService } from './expense.service.js';
import { CashFlowService } from './cash-flow.service.js';
import { ReceivablesService } from './receivables.service.js';
import { DiscountService } from './discount.service.js';
import { ProfitabilityService } from './profitability.service.js';
import { EntryDetailService } from './entry-detail.service.js';
import { StudentProfileService } from './student-profile.service.js';
import { FinancialIntelligenceService } from './financial-intelligence.service.js';
import { ExplanationService } from './explanation.service.js';

import {
  analyticsFilterSchema,
  breakdownSchema,
  expenseBreakdownSchema,
  receivablesBreakdownSchema,
  entryIdSchema,
  alertIdSchema,
  studentIdSchema,
} from './finance-analytics.validators.js';
import type { AnalyticsFilter } from './analytics-filter.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYA TAHLILI — FAQAT O'QISH (`financeAnalytics.routes.js` EKVIVALENTI).
 *
 * Bu modulda birorta yozuv endpoint'i YO'Q va bo'lmasligi kerak: hisob
 * yozish `financial-transaction.service.ts` da, bu yer esa uning
 * ustidagi o'qish qatlami. Aralashtirilsa ikkinchi haqiqat manbai
 * paydo bo'lardi.
 *
 * ── FILIAL KO'LAMI ──
 * Barcha so'rov `branchFilter()` ostida (`analytics-filter.ts` →
 * `branchClause`), ya'ni filial direktori faqat o'z raqamlarini
 * ko'radi. Bo'sh ro'yxatda `AND FALSE` — fail-closed.
 *
 * ── RUXSAT (STEP 5.1) ──
 * Granulyar model. `finance.read` — umumiy o'qish, lekin u SEZGIR
 * bo'limlarni QAMRAMAYDI:
 *
 *   /summary /revenue /expenses /budget ...  → finance.read
 *   /cash-flow*                              → finance.view_cashflow
 *   /receivables*                            → finance.view_receivables
 *   /teachers /directions /groups /rooms
 *   /branches                                → finance.view_profitability
 *
 * ⚠ `/teachers` QO'SHIMCHA ravishda maosh ruxsatini talab qiladi:
 * u har bir o'qituvchining tannarxini (payroll) ochiq ko'rsatadi.
 *
 * NEGA /directions /groups /rooms /branches HAM foydalilik ruxsatini
 * talab qiladi: ular ham `payroll` va `directCosts` ustunlarini
 * qaytaradi — o'qituvchi ismisiz, lekin guruh bittagina o'qituvchiga
 * tegishli bo'lsa maosh baribir kelib chiqadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * CHIQIM KESIMI — O'LCHOVGA QARAB RUXSAT.
 *
 * `category` / `costType` / `branch` — oddiy moliyaviy ko'rinish.
 * `person` / `teacher` esa MAOSHNI ODAM BO'YICHA ochadi ("O'qituvchi A
 * — 1.4 mln"), ya'ni `/teachers` jadvali bilan bir xil sezgirlikda.
 *
 * Marshrutni ikkiga bo'lish mumkin edi, lekin unda client ikkita
 * manzilni bilishi kerak bo'lardi. O'lcham bitta parametr — tekshiruv
 * ham shu yerda, so'rov servisga YETIB BORMASDAN oldin.
 */
const PAYROLL_DIMENSIONS: readonly string[] = Object.freeze(['person', 'teacher']);

@Controller('finance-analytics')
@UseGuards(PermissionsGuard)
export class FinanceAnalyticsController {
  constructor(
    private readonly summary: SummaryService,
    private readonly revenue: RevenueService,
    private readonly expense: ExpenseService,
    private readonly cashFlow: CashFlowService,
    private readonly receivables: ReceivablesService,
    private readonly discounts: DiscountService,
    private readonly profit: ProfitabilityService,
    private readonly entries: EntryDetailService,
    private readonly students: StudentProfileService,
    private readonly intelligence: FinancialIntelligenceService,
    private readonly explanation: ExplanationService,
  ) {}

  /**
   * ⚠ SERVISLAR `req.query` NI OLADI, VALIDATSIYA NATIJASINI EMAS.
   *
   * Express `validate()` `req.query` ni zod natijasi bilan ALMASHTIRADI
   * va handler `req.query` ni uzatadi. NestJS'da `@Validated` faqat
   * TEKSHIRADI — almashtirmaydi. Farq `limit`/`year`/`month` da
   * ko'rinardi: zod ularni SONGA aylantiradi, xom `req.query` da esa
   * ular SATR bo'lib qoladi.
   *
   * Shuning uchun servisga TEKSHIRILGAN `v.query` beriladi — Express
   * bilan bir xil turlar. Xom `req.query` HECH QAYERDA ishlatilmaydi.
   */
  private filters(v: { query?: Record<string, unknown> }): AnalyticsFilter {
    return (v.query || {}) as AnalyticsFilter;
  }

  /**
   * MAOSH RUXSATI — `salary.read` YOKI `payroll.read`.
   *
   * ⚠ NEGA DEKORATOR EMAS: `/teachers` uchun shart
   * `finance.view_profitability` VA (`salary.read` YOKI `payroll.read`).
   * `@Permissions` — sof OR, `@AllPermissions` — sof AND; ikkalasi ham
   * bu ARALASH shaklni bera olmaydi. Express buni ikkita ketma-ket
   * `requirePermission` bilan hal qiladi, bu yerda esa ikkinchi qadam
   * ochiq yoziladi. `hasAnyPermission` — xom `.includes()` EMAS: u
   * `PERMISSION_IMPLIES` iyerarxiyasini hisobga oladi.
   */
  private assertPayroll(req: AuthenticatedRequest, message: string): void {
    const ok = hasAnyPermission(req.permissions, [
      PERMISSIONS.SALARY_READ,
      PERMISSIONS.PAYROLL_READ,
    ]);
    if (!ok) throw new ApiError(403, message);
  }

  // ── UMUMIY ──

  @Get('summary')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async summaryRoute(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.summary.getSummary(this.filters(v));
    return { success: true, data };
  }

  // ── TRANZAKSIYA TAFSILOTI (STEP 7) ──
  // Tahlildagi HAR QANDAY summani jurnal yozuvigacha kuzatish nuqtasi.
  //
  // Ruxsat: `finance.read` — bu oddiy moliyaviy hujjat. LEKIN maosh
  // yozuvi (`kind = "salary"`) uchun SERVIS qo'shimcha ravishda
  // `salary.read` yoki `payroll.read` talab qiladi: aks holda
  // `/teachers` jadvali yopiq bo'lgan xodim maosh yozuvlarini bittalab
  // ochib, o'sha ma'lumotni yig'ib olardi (yon eshik).
  // RO'YXAT — jamlanma bilan tafsilot orasidagi ko'prik. Maosh
  // yozuvlari ruxsatsiz foydalanuvchida ro'yxatdan CHIQARILADI.

  @Get('entries')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async entryList(
    @Validated(analyticsFilterSchema) v: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.entries.listEntries(this.filters(v), req.permissions);
    return { success: true, data };
  }

  /**
   * O'QUVCHINING MOLIYAVIY YO'LI (talab 15) — zanjirning odam bo'g'ini.
   * `finance.read`: bu o'quvchining to'lov holati, maosh emas.
   *
   * ⚠ `/students/:id` `/entries/:id` DAN OLDIN E'LON QILINGAN EMAS —
   * ular BOSHQA prefikslar, to'qnashuv yo'q. Lekin ikkalasi ham
   * `/entries` va `/intelligence` kabi QAT'IY yo'llardan KEYIN turadi,
   * chunki NestJS marshrutlarni e'lon tartibida sinaydi.
   */
  @Get('students/:id')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async studentProfile(@Validated(studentIdSchema) v: any, @Param('id') id: string) {
    const data = await this.students.getStudentFinancialProfile(id, this.filters(v));
    return { success: true, data };
  }

  @Get('entries/:id')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async entryDetail(
    @Validated(entryIdSchema) _v: any,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ `req.permissions` SERVISGA UZATILADI: maosh yozuvi uchun
    // qo'shimcha tekshiruv U YERDA (yon eshik yopilishi kerak).
    const data = await this.entries.getEntryDetail(id, req.user, req.permissions);
    return { success: true, data };
  }

  /**
   * `/alerts` — ESKI SHAKL, YAGONA MANBADAN.
   *
   * ── NEGA ALOHIDA SERVIS EMAS ──
   * STEP 5 da bu endpoint o'z qoidalar to'plamiga ega edi
   * (`alerts.service.js`). STEP 8 da intellekt qatlami qo'shilgach
   * ular IKKI XIL qoida dvigateliga aylanardi: bir xil holat uchun
   * ikki xil chegara, ikki xil matn va vaqt o'tib — ikki xil javob.
   *
   * Shuning uchun eski servis O'CHIRILDI va bu endpoint intellekt
   * qatlamiga yo'naltirildi. Javob shakli saqlanadi (mavjud
   * chaqiruvchilar buzilmasin), lekin manba BITTA.
   */
  @Get('alerts')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async alerts(@Validated(analyticsFilterSchema) v: any, @Req() req: AuthenticatedRequest) {
    const d = await this.intelligence.getIntelligence(this.filters(v), req.permissions);
    return {
      success: true,
      data: {
        period: d.period,
        thresholds: d.thresholds,
        counts: {
          // Eski shakl `high/medium/low/good` edi — moslik uchun
          // saqlanadi, lekin ichkarida bitta manba.
          high: d.counts.urgent,
          medium: d.counts.watch,
          low: 0,
          good: d.counts.positive,
        },
        alerts: d.alerts.map((a: any) => ({
          code: a.type,
          severity:
            a.severity === 'urgent' ? 'high' : a.severity === 'watch' ? 'medium' : 'good',
          title: a.title,
          explanation: (a.evidence || [])
            .slice(0, 3)
            .map((e: any) => `${e.label}: ${e.current ?? '—'}`)
            .join(', '),
          metric: a.metric,
          currentValue: a.currentValue,
          comparisonValue: a.previousValue,
          recommendedAction: a.recommendedActionType,
          entities: a.entityId ? { [`${a.entityType}Id`]: a.entityId } : {},
        })),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // MOLIYAVIY INTELLEKT (STEP 8)
  //
  // Determinstik qoidalar tahlil ustida ishlaydi — LLM aniqlashda
  // QATNASHMAYDI. AI faqat `/alerts/:alertId?explain=true` da va
  // faqat foydalanuvchi so'raganda matn yozadi.
  //
  // RUXSAT: `finance.read`. Maoshga bog'liq qoidalar servis ichida
  // `salary.read`/`payroll.read` bo'yicha filtrlanadi — ular umuman
  // hisoblanmaydi, ya'ni AI ga ham yetib bormaydi.
  // ══════════════════════════════════════════════════════════════════

  @Get('intelligence')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async intelligenceOverview(
    @Validated(analyticsFilterSchema) v: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.intelligence.getIntelligence(
      this.filters(v),
      req.permissions,
    );
    return { success: true, data };
  }

  @Get('intelligence/alerts')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async intelligenceAlerts(
    @Validated(analyticsFilterSchema) v: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.intelligence.getIntelligence(
      this.filters(v),
      req.permissions,
    );
    return {
      success: true,
      data: { alerts: data.alerts, counts: data.counts, comparison: data.comparison },
    };
  }

  @Get('intelligence/briefing')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async intelligenceBriefing(
    @Validated(analyticsFilterSchema) v: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.intelligence.getBriefing(this.filters(v), req.permissions);
    return { success: true, data };
  }

  /**
   * Bitta signal + IXTIYORIY AI izohi.
   *
   * `?explain=true` bo'lgandagina LLM chaqiriladi. Standart holatda
   * deterministik matn qaytadi — dashboard ochilishida LLM ishlamaydi.
   *
   * ⚠ NestJS'da LLM tarmog'i HOZIRCHA ULANMAGAN (`ai` moduli
   * ko'chirilmagan) — `explanation.service.ts` dagi B29 izohiga qarang.
   */
  @Get('intelligence/alerts/:alertId')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async alertDetail(
    @Validated(alertIdSchema) v: any,
    @Param('alertId') alertId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const signal = await this.intelligence.getAlertById(
      alertId,
      this.filters(v),
      req.permissions,
    );
    if (!signal) throw new ApiError(404, "Signal topilmadi yoki bu davrda faol emas");

    const useAi = String((v.query || {}).explain || '') === 'true';
    const explanation = await this.explanation.explainSignal(signal, { useAi });

    return { success: true, data: { ...signal, explanation } };
  }

  // ── DAROMAD ──

  @Get('revenue/trend')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async revenueTrend(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.revenue.getRevenueTrend(this.filters(v));
    return { success: true, data };
  }

  @Get('revenue/by/:by')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async revenueBy(@Validated(breakdownSchema) v: any, @Param('by') by: string) {
    const data = await this.revenue.getRevenueBy(by, this.filters(v));
    return { success: true, data };
  }

  @Get('payment-methods')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async paymentMethods(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.revenue.getPaymentMethodBreakdown(this.filters(v));
    return { success: true, data };
  }

  @Get('refunds')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async refunds(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.revenue.getRefundAnalytics(this.filters(v));
    return { success: true, data };
  }

  @Get('discounts')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async discountsRoute(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.discounts.getDiscountAnalytics(this.filters(v));
    return { success: true, data };
  }

  // ── CHIQIM ──

  @Get('expenses/trend')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async expenseTrend(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.expense.getExpenseTrend(this.filters(v));
    return { success: true, data };
  }

  @Get('expenses/breakdown')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async expenseBreakdown(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.expense.getExpenseBreakdown(this.filters(v));
    return { success: true, data };
  }

  @Get('expenses/cost-structure')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async costStructure(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.expense.getCostStructure(this.filters(v));
    return { success: true, data };
  }

  @Get('expenses/recurring')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async recurringSplit(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.expense.getRecurringSplit(this.filters(v));
    return { success: true, data };
  }

  /**
   * "PUL QAYERGA KETDI" zanjiri: kategoriya → odam → yozuvlar (talab 10).
   *
   * ⚠ E'LON TARTIBI: `/expenses/trend`, `/breakdown`, `/cost-structure`
   * va `/recurring` SHU MARSHRUTDAN OLDIN turishi SHART. `:by`
   * parametri ularning hammasiga mos kelardi va zod `by` enum'i
   * "trend" ni rad etib, 400 qaytarardi (Express'da 200).
   */
  @Get('expenses/by/:by')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async expenseBy(
    @Validated(expenseBreakdownSchema) v: any,
    @Param('by') by: string,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ TEKSHIRUV VALIDATSIYADAN KEYIN, SERVISDAN OLDIN — Express'dagi
    // `guardExpenseDimension` bilan AYNAN bir xil o'rin. Noto'g'ri
    // `by` avval 400 oladi, keyingina ruxsat ko'riladi.
    if (PAYROLL_DIMENSIONS.includes(by)) {
      this.assertPayroll(req, "Maosh ma'lumotini ko'rish uchun ruxsat yo'q");
    }
    const data = await this.expense.getExpenseBy(by, this.filters(v));
    return { success: true, data };
  }

  @Get('budget')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async budget(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.expense.getBudgetPerformance(this.filters(v));
    return { success: true, data };
  }

  // ── PUL ──

  @Get('cash-flow/accounts')
  @Permissions(PERMISSIONS.FINANCE_VIEW_CASHFLOW)
  async accounts(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.cashFlow.getAccountBalances(this.filters(v));
    return { success: true, data };
  }

  @Get('cash-flow/trend')
  @Permissions(PERMISSIONS.FINANCE_VIEW_CASHFLOW)
  async cashTrend(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.cashFlow.getCashTrend(this.filters(v));
    return { success: true, data };
  }

  @Get('cash-flow')
  @Permissions(PERMISSIONS.FINANCE_VIEW_CASHFLOW)
  async cashFlowRoute(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.cashFlow.getCashFlow(this.filters(v));
    return { success: true, data };
  }

  // ── DEBITORLIK ──

  @Get('receivables/by/:by')
  @Permissions(PERMISSIONS.FINANCE_VIEW_RECEIVABLES)
  async receivablesBy(
    @Validated(receivablesBreakdownSchema) v: any,
    @Param('by') by: string,
  ) {
    const data = await this.receivables.getReceivablesBy(by, this.filters(v));
    return { success: true, data };
  }

  @Get('receivables')
  @Permissions(PERMISSIONS.FINANCE_VIEW_RECEIVABLES)
  async receivablesRoute(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.receivables.getReceivables(this.filters(v));
    return { success: true, data };
  }

  // ── FOYDALILIK ──

  /**
   * O'QITUVCHI KESIMI — IKKI SHART BIRGA.
   *
   * `finance.view_profitability` (dekorator) VA `salary.read`/
   * `payroll.read` (quyidagi tekshiruv). Ikkalasi HAM bo'lishi kerak:
   * jadval har o'qituvchining maosh tannarxini ochiq ko'rsatadi.
   */
  @Get('teachers')
  @Permissions(PERMISSIONS.FINANCE_VIEW_PROFITABILITY)
  async teachers(
    @Validated(analyticsFilterSchema) v: any,
    @Req() req: AuthenticatedRequest,
  ) {
    this.assertPayroll(req, 'Ruxsat etilmagan');
    const data = await this.profit.getTeacherProfitability(this.filters(v));
    return { success: true, data };
  }

  @Get('directions')
  @Permissions(PERMISSIONS.FINANCE_VIEW_PROFITABILITY)
  async directions(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.profit.getDirectionProfitability(this.filters(v));
    return { success: true, data };
  }

  @Get('groups')
  @Permissions(PERMISSIONS.FINANCE_VIEW_PROFITABILITY)
  async groups(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.profit.getGroupProfitability(this.filters(v));
    return { success: true, data };
  }

  @Get('rooms')
  @Permissions(PERMISSIONS.FINANCE_VIEW_PROFITABILITY)
  async rooms(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.profit.getRoomRevenue(this.filters(v));
    return { success: true, data };
  }

  @Get('branches')
  @Permissions(PERMISSIONS.FINANCE_VIEW_PROFITABILITY)
  async branches(@Validated(analyticsFilterSchema) v: any) {
    const data = await this.profit.getBranchProfitability(this.filters(v));
    return { success: true, data };
  }
}
