import {
  Controller, Get, HttpCode, Inject, Param, Post, Req, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { hasPermission } from '../../common/rbac/permission.service.js';
import { PERMISSIONS, ROLES, ROLE_TYPES } from '../../common/constants/permissions.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { buildMeta } from '../../common/utils/pagination.js';
import { sendXlsx } from '../../common/utils/send-xlsx.js';
import { Validated } from '../../common/decorators/index.js';
import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../config/env.validation.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { ImportRegistryService } from './import-registry.service.js';
import { ImportEngineService, MAX_GRID_ROWS, type Importer } from './import-engine.service.js';
import { ImportTemplateService } from './import-template.service.js';
import { ImportQueueService } from './import-queue.service.js';
import { UploadSheetInterceptor, assertSheet } from './upload-sheet.interceptor.js';
import {
  errorReportSchema, validateRowsSchema, createRowsSchema,
  jobIdSchema, historySchema,
  type ErrorReportRequest, type ValidateRowsRequest, type CreateRowsRequest,
  type JobIdRequest, type HistoryRequest,
} from './imports.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXCEL IMPORT — `imports.routes.js` (11/11).
 *
 * ── ⚠ RUXSAT REYESTRDAN DINAMIK (`requireImporterPermission`) ──
 * IMPORT ruxsati O'QISH emas, YOZISH huquqiga bog'langan
 * (`finance.pay`, `salary.pay`). Ro'yxatni ko'ra oladigan xodim
 * AVTOMATIK ravishda ommaviy yozish huquqini OLMASLIGI kerak — bu
 * importning ENG MUHIM farqi eksportdan.
 *
 * ⚠ Ba'zi importlar BIR NECHTA huquqni birdan talab qiladi
 * (`extraPermissions`): xodim importi odam YARATADI va ROL BIRIKTIRADI
 * — `POST /users/staff` yo'lida ham aynan shu ikkitasi so'raladi.
 *
 * ── ⚠ E'LON TARTIBI ──
 * `/importers`, `/history`, `/jobs/:jobId` — `/:importerKey/...` DAN
 * OLDIN. Aks holda "history" import kaliti deb qabul qilinardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('imports')
export class ImportsController {
  private readonly logger = new Logger('Imports');
  private readonly syncMaxRows: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly registry: ImportRegistryService,
    private readonly engine: ImportEngineService,
    private readonly templates: ImportTemplateService,
    private readonly queue: ImportQueueService,
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
  ) {
    this.syncMaxRows = config.get('IMPORT_SYNC_MAX_ROWS', { infer: true }) as number;
  }

  /**
   * ⚠ `requireImporterPermission` NING EKVIVALENTI. Dataset/importer
   * ruxsati QATTIQ kalit emas, shuning uchun dekorator yaramaydi.
   *
   * ⚠ TARTIB: importer topilmasa 404, ruxsat yetmasa 403 — lekin ikkalasi
   * ham AVVAL autentifikatsiyadan o'tgan bo'ladi.
   */
  private resolveImporter(req: AuthenticatedRequest, key: string): Importer {
    if (!req.user) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");
    const importer = this.registry.getImporter(key);
    if (!importer) throw new ApiError(404, 'Bunday import turi topilmadi');
    if (!hasPermission(req.permissions, importer.permission)) {
      throw new ApiError(403, 'Ruxsat etilmagan');
    }
    for (const extra of importer.extraPermissions || []) {
      if (!hasPermission(req.permissions, extra)) {
        throw new ApiError(403, 'Ruxsat etilmagan');
      }
    }
    return importer;
  }

  private actorOf(req: AuthenticatedRequest) {
    return { currentUser: req.user, permissions: req.permissions };
  }

  // ══════════════════ RO'YXATLAR (`/:importerKey` DAN OLDIN) ══════════════════

  /**
   * Foydalanuvchi ISHLATA OLADIGAN import turlari + ustun tavsifi.
   *
   * ⚠ Client shu javobdan yo'riqnoma va ustun ro'yxatini quradi —
   * ustunlar client'da TAKRORLANMAYDI.
   */
  @Get('importers')
  importersList(@Req() req: AuthenticatedRequest) {
    const data = this.registry
      .listImporters()
      .filter(
        (imp) =>
          hasPermission(req.permissions, imp.permission) &&
          // ⚠ Qo'shimcha huquqlar HAM tekshiriladi — aks holda tugma
          // ko'rinardi-yu, bosilganda 403 chiqardi.
          (imp.extraPermissions || []).every((p) => hasPermission(req.permissions, p)),
      )
      .map((imp) => ({
        key: imp.key,
        label: imp.label,
        gridEnabled: Boolean(imp.gridEnabled),
        columns: imp.columns.map((c: any) => ({
          key: c.key,
          header: c.header,
          required: Boolean(c.required),
          primary: Boolean(c.primary),
          slot: c.slot || '',
          optionsKey: c.optionsKey || '',
          note: c.note || '',
          example: c.example ?? '',
        })),
      }));
    return { success: true, data };
  }

  /**
   * IMPORT TARIXI.
   *
   * ⚠ FILIAL: `branchFilter()` — boshqa filialning import tarixi
   * ko'rinmasin (unda fayl nomi va qatorlar soni, ya'ni BIZNES ma'lumoti).
   *
   * ⚠ RUXSAT: foydalanuvchi FAQAT o'zi ishlata oladigan import
   * turlarining tarixini ko'radi. Aks holda maosh huquqi yo'q xodim
   * maosh importlari BO'LGANINI (va hajmini) bilib olardi.
   */
  @Get('history')
  async historyList(
    @Validated(historySchema) v: HistoryRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const page = Math.max(1, Number(v.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(v.query.limit) || 20));

    const allowedKeys = this.registry
      .listImporters()
      .filter((imp) => hasPermission(req.permissions, imp.permission))
      .map((imp) => imp.key);

    if (!allowedKeys.length) {
      return { success: true, data: [], meta: buildMeta({ page, limit, total: 0 }) };
    }

    const filter: any = { ...branchFilter(), importerKey: { in: allowedKeys } };

    const [items, total] = await Promise.all([
      this.prisma.importJob.findMany({
        where: filter,
        // ⚠ `rows`/`results` RO'YXATDA KERAK EMAS va ular ENG OG'IR
        // ustunlar (butun fayl mazmuni JSON'da) — 500 qatorli import
        // tarixida bu bir necha megabaytlik javob bo'lardi.
        omit: { rows: true, results: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      } as never),
      this.prisma.importJob.count({ where: filter }),
    ]);

    return {
      success: true,
      data: withLegacyIds(items),
      meta: buildMeta({ page, limit, total }),
    };
  }

  /**
   * IMPORT JARAYONI (progress). Client shu yo'lni SO'RAB TURADI.
   *
   * ⚠ `rows` QAYTARILMAYDI — unda OCHIQ PAROLLAR bo'lishi mumkin va
   * ular bu yerda kerak emas (client o'z nusxasini saqlab turibdi).
   */
  @Get('jobs/:jobId')
  async jobStatus(
    @Validated(jobIdSchema) v: JobIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const jobRow = await this.prisma.importJob.findUnique({
      where: { id: String(v.params.jobId) },
      omit: { rows: true },
    } as never);
    if (!jobRow) throw new ApiError(404, 'Import topilmadi');
    const job: any = withLegacyId(jobRow);

    // ⚠ KO'RISH HUQUQI: o'z importini har kim ko'radi, BIROVNIKINI
    // faqat moliya/foydalanuvchi boshqaruvi huquqi borlar. Aks holda
    // bir xodim boshqasining import natijalarini (kim qo'shilgani,
    // xatolar) o'qib olardi.
    const isOwnJob = String(job.user) === String(req.user!._id);
    if (!isOwnJob && !hasPermission(req.permissions, PERMISSIONS.FINANCE_MANAGE)) {
      throw new ApiError(403, 'Ruxsat etilmagan');
    }

    return {
      success: true,
      data: {
        jobId: String(job._id),
        importerKey: job.importerKey,
        status: job.status,
        processed: job.processed || 0,
        total: job.total || 0,
        imported: job.imported || 0,
        failed: job.failed || 0,
        duplicate: job.duplicate || 0,
        error: job.error || '',
        results: job.results || [],
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        durationMs: job.durationMs || 0,
      },
    };
  }

  // ══════════════════════ IMPORTER YO'LLARI ══════════════════════

  /** Bo'sh SHABLON: sarlavhalar + namuna qator + yo'riqnoma varag'i. */
  @Get(':importerKey/template')
  async template(
    @Param('importerKey') key: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const importer = this.resolveImporter(req, key);
    const buffer = await this.templates.buildTemplate(importer);
    sendXlsx(res, buffer, `${importer.fileBase}-shablon.xlsx`);
  }

  /**
   * TANLOV VARIANTLARI (select) — jadval oqimidagi ustunlar uchun.
   *
   * ⚠ NEGA NOM (id emas): import qatorlari Excel bilan BIR XIL shaklda
   * qoladi — foydalanuvchi faylni yuklab, tahrirlab, qayta yuklay
   * oladi. Yozish paytida nom baribir qidiriladi (`prepare`).
   *
   * ⚠ FILIAL KO'LAMI: guruhlar `branchFilter()` orqali kesiladi —
   * direktor boshqa filial guruhini ro'yxatda KO'RMASIN.
   */
  @Get(':importerKey/options')
  async options(@Param('importerKey') key: string, @Req() req: AuthenticatedRequest) {
    const importer = this.resolveImporter(req, key);
    const keys = new Set(
      (importer.columns || []).map((c: any) => c.optionsKey).filter(Boolean),
    );

    const data: Record<string, unknown> = {};

    if (keys.has('groups')) {
      const groups = await this.prisma.group.findMany({
        where: { ...branchFilter(), isActive: true, isDeleted: false },
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      data.groups = groups.map((g) => ({ value: g.name, label: g.name }));
    }

    if (keys.has('branches')) {
      const branches = await this.prisma.branch.findMany({
        where: { ...branchFilter('id'), isDeleted: false },
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      data.branches = branches.map((b) => ({ value: b.name, label: b.name }));
    }

    if (keys.has('roles')) {
      // ⚠ Xodimga biriktirib bo'ladigan rollar: o'quvchi/o'qituvchi
      // tipidagi va MUZLATILGANLAR chiqarib tashlanadi. Owner ham
      // YO'Q — uni import orqali yaratish mumkin emas.
      const roles = await this.prisma.role.findMany({
        where: {
          isFrozen: false,
          roleType: {
            notIn: [ROLE_TYPES.STUDENT, ROLE_TYPES.TEACHER, ROLE_TYPES.OWNER],
          },
          value: { not: ROLES.OWNER },
        } as never,
        select: { value: true, label: true },
        orderBy: { label: 'asc' },
      });
      data.roles = roles.map((r) => ({
        value: r.label || r.value, label: r.label || r.value,
      }));
    }

    return { success: true, data };
  }

  /** KO'RIB CHIQISH — fayl tahlil qilinadi, LEKIN hech narsa yozilmaydi. */
  @Post(':importerKey/preview')
  @HttpCode(200)
  @UseInterceptors(UploadSheetInterceptor)
  async preview(
    @Param('importerKey') key: string,
    @UploadedFile() file: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const importer = this.resolveImporter(req, key);
    assertSheet(file);
    const result = await this.engine.preview({
      importer,
      buffer: file.buffer,
      fileName: file.originalname,
      actor: this.actorOf(req),
    });
    return { success: true, data: result };
  }

  /** TASDIQLASH — fayl QAYTA tekshiriladi va to'g'ri qatorlar yoziladi. */
  @Post(':importerKey/commit')
  @HttpCode(200)
  @UseInterceptors(UploadSheetInterceptor)
  async commit(
    @Param('importerKey') key: string,
    @UploadedFile() file: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const importer = this.resolveImporter(req, key);
    assertSheet(file);
    const startedAt = Date.now();

    const result = await this.engine.commit({
      importer,
      buffer: file.buffer,
      fileName: file.originalname,
      currentUser: req.user,
      actor: this.actorOf(req),
    });

    const durationMs = Date.now() - startedAt;

    // ⚠ TARIX: yozib bo'lmasa import BEKOR QILINMAYDI — pul allaqachon
    // kiritilgan, jurnal esa IKKILAMCHI. Lekin bu JIMGINA o'tmasligi kerak.
    try {
      await this.prisma.importJob.create({
        data: {
          branchId: req.branchId ? String(req.branchId) : null,
          importerKey: importer.key,
          fileName: file.originalname,
          userId: String(req.user!._id),
          userName: [req.user!.firstName, req.user!.lastName].filter(Boolean).join(' '),
          total: result.summary.total,
          imported: result.summary.imported,
          failed: result.summary.failed + result.summary.error,
          duplicate: result.summary.duplicate,
          pending: result.summary.pending,
          durationMs,
        } as never,
      });
    } catch (err) {
      this.logger.error(
        `Import tarixini yozib bo'lmadi (${importer.key}): ${(err as Error).message}`,
      );
    }

    return { success: true, data: { ...result, durationMs } };
  }

  /** JADVAL OQIMI, 1-BOSQICH: fayldan TAHRIRLANADIGAN qoralama. */
  @Post(':importerKey/draft')
  @HttpCode(200)
  @UseInterceptors(UploadSheetInterceptor)
  async draft(
    @Param('importerKey') key: string,
    @UploadedFile() file: any,
    @Req() req: AuthenticatedRequest,
  ) {
    const importer = this.resolveImporter(req, key);
    assertSheet(file);
    const data = await this.engine.draftFromFile({
      importer,
      buffer: file.buffer,
      fileName: file.originalname,
      actor: this.actorOf(req),
    });
    return { success: true, data };
  }

  /** JADVAL OQIMI, 2-BOSQICH: tahrirlangan qatorlarni tekshiradi. */
  @Post(':importerKey/validate-rows')
  @HttpCode(200)
  async validateRows(
    @Validated(validateRowsSchema) v: ValidateRowsRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const importer = this.resolveImporter(req, v.params.importerKey);
    const data = await this.engine.validateRows({
      importer,
      rows: v.body.rows,
      actor: this.actorOf(req),
    });
    return { success: true, data };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * JADVAL OQIMI, 3-BOSQICH: tahrirlangan qatorlarni YOZADI.
   *
   * ── ⚠ NEGA NAVBAT ORQALI ──
   * 300 qatorli o'quvchi importi har qator uchun foydalanuvchi yaratadi,
   * guruhga qo'shadi (bu esa a'zolik sanasidan bugungacha HAR OY uchun
   * to'lov qatorini quradi) va boshlang'ich qoldiqni materializatsiya
   * qiladi — O'N MINGLAB DB amali.
   *
   * Bitta HTTP so'rovda bajarilsa proxy 30-60 soniyada ulanishni uzadi,
   * server esa ishlashda DAVOM etadi. Foydalanuvchi "xato" ko'rib faylni
   * QAYTA yuboradi va IKKITA import parallel ketadi — aynan shu PULNI
   * IKKI MARTA yozishning eng qisqa yo'li edi.
   *
   * ── REDIS BO'LMASA ──
   * Sinxron bajariladi, LEKIN qator soni QATTIQ cheklanadi
   * (`IMPORT_SYNC_MAX_ROWS`, standart 50).
   * ═══════════════════════════════════════════════════════════════════
   */
  @Post(':importerKey/create')
  @HttpCode(200)
  async createRows(
    @Validated(createRowsSchema) v: CreateRowsRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const importer = this.resolveImporter(req, v.params.importerKey);
    const rows = v.body.rows || [];
    if (!rows.length) throw new ApiError(400, 'Yozish uchun qator yuborilmadi');
    if (rows.length > MAX_GRID_ROWS) {
      throw new ApiError(
        413, `Bir martada ${MAX_GRID_ROWS} qatordan ko'p bo'lmasligi kerak`,
      );
    }

    const queued = this.queue.isRedisEnabled();

    if (!queued && rows.length > this.syncMaxRows) {
      throw new ApiError(
        400,
        `Navbat (Redis) sozlanmagani uchun bir martada ${this.syncMaxRows} qatorgacha ` +
          `yuborish mumkin. Faylni bo'laklarga bo'ling yoki REDIS_URL ni sozlang`,
        { code: 'IMPORT_QUEUE_UNAVAILABLE' },
      );
    }

    // ⚠ ISH YOZUVI — NAVBATGA QO'YISHDAN OLDIN. Redis o'chib qolsa ham
    // `queued` qatori BAZADA qoladi va yo'qolgan import KO'RINIB turadi
    // (aks holda so'rov JIMGINA yo'q bo'lardi).
    const job = await this.prisma.importJob.create({
      data: {
        branchId: req.branchId ? String(req.branchId) : null,
        importerKey: importer.key,
        fileName: v.body.fileName || '',
        userId: String(req.user!._id),
        userName: [req.user!.firstName, req.user!.lastName].filter(Boolean).join(' '),
        mode: 'rows',
        status: 'queued',
        total: rows.length,
        rows,
        scope: {
          branchId: req.branchId ? String(req.branchId) : null,
          allowedBranchIds: req.allowedBranchIds || [],
          canSeeAllBranches: Boolean(req.canSeeAllBranches),
          permissions: req.permissions || [],
        },
      } as never,
    });

    if (queued) {
      try {
        await this.queue.enqueueImport(job.id);
      } catch (err) {
        // ⚠ Navbatga qo'shib bo'lmadi — ish `queued` holatida OSILIB
        // qolmasligi kerak, aks holda foydalanuvchi kutib o'tirardi.
        await this.prisma.importJob
          .update({
            where: { id: job.id },
            data: {
              status: 'failed',
              error: "Navbatga qo'shib bo'lmadi (Redis mavjud emas)",
              finishedAt: new Date(),
              rows: [],
            } as never,
          })
          .catch(() => null);
        this.logger.error(
          `Importni navbatga qo'shib bo'lmadi (${job.id}): ${(err as Error).message}`,
        );
        throw new ApiError(
          503, 'Navbat xizmati javob bermayapti. Birozdan keyin urinib ko\'ring',
        );
      }

      res.status(202);
      return {
        success: true,
        data: { jobId: String(job.id), status: 'queued', total: rows.length },
        message: "Import navbatga qo'yildi",
      };
    }

    // ── SINXRON YO'L (Redis yo'q, kichik fayl) ──
    const result: any = await this.queue.runImportJob(job.id);

    return {
      success: true,
      data: {
        jobId: String(job.id),
        status: 'completed',
        summary: result?.summary || null,
        rows: result?.rows || [],
      },
    };
  }

  /**
   * XATOLIK HISOBOTI: o'tmagan qatorlarni Excel qilib qaytaradi.
   *
   * ⚠ NEGA CLIENT QATORLARNI QAYTA YUBORADI (server saqlab qo'ymaydi):
   * bu FAQAT FORMATLASH amali — ma'lumot allaqachon client'da. Server
   * tomonda saqlansa muddati va tozalanishi bilan bog'liq holat paydo
   * bo'lardi. Bu yerda hech qanday DB O'QISH yo'q, ya'ni ma'lumot
   * sizishi ham MUMKIN EMAS — foydalanuvchi o'zi yuborgan narsani
   * qaytarib oladi.
   */
  @Post(':importerKey/error-report')
  @HttpCode(200)
  async errorReport(
    @Validated(errorReportSchema) v: ErrorReportRequest,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const importer = this.resolveImporter(req, v.params.importerKey);
    const buffer = await this.templates.buildErrorReport(importer, v.body.rows || []);
    sendXlsx(res, buffer, `${importer.fileBase}-xatolar.xlsx`);
  }
}
