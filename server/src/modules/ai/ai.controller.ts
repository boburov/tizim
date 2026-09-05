import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { getActiveBranchId, assertBranchInScope } from '../../common/als/branch-context.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { InsightService } from './insight.service.js';
import { BriefingService } from './briefing.service.js';
import { RankingService } from './ranking.service.js';
import { ReportService } from './report.service.js';
import { RecomputeService } from './recompute.service.js';
import { AiConfigService, CODE_DEFAULTS } from './ai-config.service.js';
import {
  listSchema, actionCenterSchema, bySubjectsSchema, byDomainSchema,
  briefingSchema, listReportsSchema, latestReportSchema, reportIdSchema,
  getConfigSchema, idParamSchema, dismissSchema, updateConfigSchema,
  recomputeSchema,
} from './ai.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI MASLAHATCHI — 15/15 marshrut (`ai.routes.js` ning ko'chirmasi).
 *
 * ── ⚠ TARIF DARVOZASI KONTROLLERDA EMAS ──
 * `AiFeatureMiddleware` `AiModule.configure()` da, `AuthMiddleware` DAN
 * OLDIN ulanadi — Express'dagi `router.use(requireFeature(...))` bilan
 * aynan bir xil tartib (402 401 dan oldin).
 *
 * ── ⚠ MARSHRUT TARTIBI ──
 * `reports/latest` `reports/:id` DAN OLDIN e'lon qilinadi. Aks holda
 * "latest" `:id` deb o'qilib, ObjectId validatsiyasi 400 berardi.
 * NestJS marshrutlarni E'LON TARTIBIDA ro'yxatga oladi — bu qatorlarni
 * qayta tartiblash MUMKIN EMAS.
 *
 * ── ⚠ RUXSATLAR ──
 * O'qish va holat o'zgartirish — `ai.read` (kundalik ish oqimi).
 * Sozlamalar va qayta hisoblash — `ai.config`: VAZNLAR barcha ballni
 * siljitadi, ya'ni bu eng tor huquq.
 *
 * ── ⚠ POST JAVOB KODI ──
 * Express `res.json(...)` bilan 200 qaytaradi; NestJS'da POST standarti
 * 201. Har bir POST'ga `@HttpCode(200)` qo'yilgan.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('ai')
@UseGuards(PermissionsGuard)
export class AiController {
  constructor(
    private readonly insights: InsightService,
    private readonly briefing: BriefingService,
    private readonly rankings: RankingService,
    private readonly reports: ReportService,
    private readonly recompute: RecomputeService,
    private readonly aiConfig: AiConfigService,
  ) {}

  /**
   * BRIFING — dashboardning YAGONA so'rovi.
   *
   * To'rtta savol (kecha / bugun / keyin / hozir) BITTA javobda qaytadi.
   * Alohida endpointlarga bo'lish sahifani to'rtta turli vaqtdagi
   * kesimni ko'rsatadigan "yuklanayotgan panellar to'plami" ga
   * aylantirardi.
   */
  @Get('briefing')
  @Permissions(PERMISSIONS.AI_READ)
  async getBriefing(@Validated(briefingSchema) v: any) {
    const data = await this.briefing.buildBriefing({
      actionLimit: v.query.actionLimit ? Number(v.query.actionLimit) : undefined,
    });
    return { success: true, data };
  }

  /**
   * REYTINGLAR — dashboard uchtasini ham BITTA so'rovda oladi.
   *
   * ⚠ VALIDATOR YO'Q (Express'da ham): so'rov parametri yo'q — filial
   * kontekstdan olinadi, limit tungi hisoblashda belgilanadi.
   *
   * ⚠ "Barcha filiallar" rejimida reyting BERILMAYDI: filiallar
   * kesimida "eng ko'p kechiktirgan" ro'yxati turli narxdagi, turli
   * hududdagi o'quvchilarni bitta ustunga qo'yardi, o'qituvchi reytingi
   * esa butunlay ma'nosiz bo'lardi (o'qituvchi FILIAL o'rtachasiga
   * nisbatan baholanadi). Bo'sh ro'yxat o'rniga aniq sabab qaytariladi.
   */
  @Get('rankings')
  @Permissions(PERMISSIONS.AI_READ)
  async getRankings() {
    const branchId = getActiveBranchId();
    if (!branchId) {
      return {
        success: true,
        data: {
          branchRequired: true,
          payment_delay: null,
          absence: null,
          teacher: null,
        },
      };
    }
    const data = await this.rankings.readAllRankings(branchId);
    return { success: true, data: { branchRequired: false, ...data } };
  }

  /**
   * ⚠ `reports/latest` `reports/:id` DAN OLDIN — tartib MUHIM.
   *
   * `null` qaytishi MUMKIN (birinchi hisobot hali tuzilmagan) — bu xato
   * emas, va 404 qaytarish frontendni bo'sh holatni xatodan ajratishga
   * majburlardi.
   */
  @Get('reports/latest')
  @Permissions(PERMISSIONS.AI_READ)
  async getLatestReport(@Validated(latestReportSchema) v: any) {
    const data = await this.reports.latestReport(v.query.period || 'daily');
    return { success: true, data };
  }

  @Get('reports')
  @Permissions(PERMISSIONS.AI_READ)
  async getReports(@Validated(listReportsSchema) v: any) {
    const { items, meta } = await this.reports.listReports(v.query);
    return { success: true, data: items, meta };
  }

  @Get('reports/:id')
  @Permissions(PERMISSIONS.AI_READ)
  async getReportById(@Validated(reportIdSchema) v: any) {
    const data = await this.reports.getReport(v.params.id);
    return { success: true, data };
  }

  @Get('insights')
  @Permissions(PERMISSIONS.AI_READ)
  async list(@Validated(listSchema) v: any) {
    const { items, meta } = await this.insights.list(v.query);
    return { success: true, data: items, meta };
  }

  /** Modul paneli: "Moliya → AI Insights". Har modul o'z domenini oladi. */
  @Get('insights/domain/:domain')
  @Permissions(PERMISSIONS.AI_READ)
  async byDomain(@Validated(byDomainSchema) v: any) {
    const data = await this.insights.byDomain(v.params.domain, v.query);
    return { success: true, data };
  }

  @Get('action-center')
  @Permissions(PERMISSIONS.AI_READ)
  async actionCenter(@Validated(actionCenterSchema) v: any) {
    const data = await this.insights.actionCenter(v.query);
    return { success: true, data };
  }

  /**
   * ⚠ POST, GET EMAS: 500 tagacha ID query string'ga sig'maydi —
   * ro'yxat sahifasi barcha o'quvchilarning badge'ini BITTA so'rovda
   * oladi.
   */
  @Post('insights/by-subjects')
  @HttpCode(200)
  @Permissions(PERMISSIONS.AI_READ)
  async bySubjects(@Validated(bySubjectsSchema) v: any) {
    const data = await this.insights.bySubjects(v.body.subjectIds);
    return { success: true, data };
  }

  @Post('insights/:id/ack')
  @HttpCode(200)
  @Permissions(PERMISSIONS.AI_READ)
  async acknowledge(@Validated(idParamSchema) v: any, @Req() req: AuthenticatedRequest) {
    const data = await this.insights.acknowledge(v.params.id, req.user);
    return { success: true, data, message: 'Belgilandi' };
  }

  @Post('insights/:id/resolve')
  @HttpCode(200)
  @Permissions(PERMISSIONS.AI_READ)
  async resolve(@Validated(idParamSchema) v: any, @Req() req: AuthenticatedRequest) {
    const data = await this.insights.resolve(v.params.id, req.user);
    return { success: true, data, message: "Bajarildi deb belgilandi" };
  }

  @Post('insights/:id/dismiss')
  @HttpCode(200)
  @Permissions(PERMISSIONS.AI_READ)
  async dismiss(@Validated(dismissSchema) v: any, @Req() req: AuthenticatedRequest) {
    const data = await this.insights.dismiss(v.params.id, v.body.reason, req.user);
    return { success: true, data, message: 'Rad etildi' };
  }

  /**
   * ⚠ `ai.config` — eng tor huquq: vaznlar BARCHA ballni siljitadi.
   *
   * `defaults` ham qaytariladi — UI "standartga qaytarish" tugmasi uchun.
   */
  @Get('config')
  @Permissions(PERMISSIONS.AI_CONFIG)
  async getConfig(@Validated(getConfigSchema) v: any) {
    // FILIAL: mijoz bergan `?branchId=` KO'LAMDA ekani tekshiriladi.
    // `AI_CONFIG` hozir owner-only kalit, ya'ni amalda faqat ega keladi
    // va `assertBranchInScope` u uchun jim o'tadi — lekin kalit kelajakda
    // maxsus rolga berilsa, bu tekshiruvsiz begona filialning AI
    // sozlamasi o'qilardi.
    const branchId = v.query.branchId || getActiveBranchId();
    if (v.query.branchId) assertBranchInScope(v.query.branchId);
    const data = await this.aiConfig.resolveConfig(branchId);
    return { success: true, data: { config: data, defaults: CODE_DEFAULTS } };
  }

  @Put('config')
  @Permissions(PERMISSIONS.AI_CONFIG)
  async updateConfig(@Validated(updateConfigSchema) v: any, @Req() req: AuthenticatedRequest) {
    const { branchId = null, ...patch } = v.body;
    // FILIAL: tanadagi `branchId` ga YOZAMIZ — ko'lam tekshirilmasa
    // begona filialning AI vaznlari qayta yozilardi.
    if (branchId) assertBranchInScope(branchId);
    const data = await this.aiConfig.upsertConfig(branchId, patch, (req.user as any)?._id);
    return { success: true, data, message: 'AI sozlamalari saqlandi' };
  }

  /**
   * Qo'lda qayta hisoblash — tungi jobni kutmasdan natijani ko'rish
   * uchun (vaznlarni sozlagandan keyin darhol tekshirish kerak bo'ladi).
   */
  @Post('recompute')
  @HttpCode(200)
  @Permissions(PERMISSIONS.AI_CONFIG)
  async runRecompute(@Validated(recomputeSchema) v: any) {
    // FILIAL: qayta hisoblash `aiRun`/`insight` qatorlarini YOZADI.
    if (v.body.branchId) assertBranchInScope(v.body.branchId);
    const branchId = v.body.branchId || getActiveBranchId();
    const data = branchId
      ? [await this.recompute.recomputeBranch(branchId)]
      : await this.recompute.recomputeAll();
    return { success: true, data, message: 'Qayta hisoblandi' };
  }
}
