import { Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { hasPermission } from '../../common/rbac/permission.service.js';
import { Validated } from '../../common/decorators/index.js';
import { sendXlsx } from '../../common/utils/send-xlsx.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { ExportRegistryService } from './export-registry.service.js';
import { ExportsService } from './exports.service.js';
import { downloadSchema, type DownloadRequest } from './exports.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXCEL EKSPORT — `exports.routes.js` (2/2).
 *
 * ── ⚠ RUXSAT `@Permissions` BILAN EMAS — DATASET REYESTRIDAN ──
 * Marshrut BITTA (`POST /:datasetKey`), lekin har bir dataset O'Z
 * ruxsatini talab qiladi (to'lovlar — `finance.read`, o'qituvchilar —
 * `teachers.read`). Dekorator QATTIQ kalit kutadi, shuning uchun kalit
 * reyestrdan DINAMIK olinadi — Express'dagi `requireDatasetPermission`
 * middleware'ining aynan ekvivalenti.
 *
 * ⚠ TARTIB: dataset topilmasa 404, ruxsat yetmasa 403 — lekin ikkalasi
 * ham AVVAL autentifikatsiyadan o'tgan bo'ladi (`AuthMiddleware`
 * moduldа ulanadi), shuning uchun anonim so'rov dataset'lar ro'yxatini
 * SANAB CHIQA OLMAYDI.
 *
 * ── ⚠ NEGA POST (GET EMAS) ──
 * Tanlangan ustunlar + filtrlar TANADA yuboriladi va ular URL uzunligi
 * chegarasidan oshib ketishi mumkin. Qo'shimcha foyda: POST audit
 * jurnaliga AVTOMATIK tushadi — kim, qachon, qaysi hisobotni, qanday
 * filtr bilan yuklab olgani ko'rinadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Fayl nomi uchun: o'zbekcha apostrof/harflarni ASCII'ga tushiradi.
 * `Content-Disposition` ning oddiy `filename=` qismi FAQAT ASCII qabul
 * qiladi; to'liq nom `filename*=UTF-8''` da yuboriladi.
 */
const asciiSlug = (value: unknown): string =>
  String(value)
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'export';

const pad2 = (n: number) => String(n).padStart(2, '0');

const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-` +
  `${pad2(d.getHours())}${pad2(d.getMinutes())}`;

/** Ma'lumot varag'idagi "Filtrlar" qatori uchun o'qiladigan matn. */
const buildFilterLabel = (filters: Record<string, unknown>) => {
  const parts = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join('; ') : '';
};

@Controller('exports')
export class ExportsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly registry: ExportRegistryService,
    private readonly exports: ExportsService,
  ) {}

  /**
   * Foydalanuvchi eksport qila oladigan hisobotlar VA ULARNING ustunlari.
   *
   * ⚠ Ruxsati yetmagan dataset va ustunlar javobga UMUMAN tushmaydi —
   * "bor, lekin bloklangan" deb ko'rsatish ham ORTIQCHA MA'LUMOT berardi.
   */
  @Get('datasets')
  datasetsList(@Req() req: AuthenticatedRequest) {
    const data = this.registry
      .listDatasets()
      .filter((ds) => hasPermission(req.permissions, ds.permission))
      .map((ds) => ({
        key: ds.key,
        label: ds.label,
        columns: this.registry.visibleColumns(ds, req.permissions).map((col) => ({
          key: col.key,
          header: col.header,
          type: col.type,
          default: Boolean(col.default),
        })),
      }));
    return { success: true, data };
  }

  private async resolveBranchLabel(req: AuthenticatedRequest): Promise<string> {
    if (!req.branchId) {
      return req.canSeeAllBranches ? 'Barcha filiallar' : 'Biriktirilgan filiallar';
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id: req.branchId },
      select: { name: true },
    });
    return branch?.name || "Noma'lum filial";
  }

  /** ⚠ Javob JSON EMAS — binar XLSX. `@Res()` passthrough YO'Q. */
  @Post(':datasetKey')
  @HttpCode(200)
  async download(
    @Param('datasetKey') datasetKey: string,
    @Validated(downloadSchema) v: DownloadRequest,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    // ── RUXSAT: reyestrdan DINAMIK (Express `requireDatasetPermission`) ──
    if (!req.user) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");
    const dataset = this.registry.getDataset(datasetKey);
    if (!dataset) throw new ApiError(404, 'Bunday hisobot turi topilmadi');
    if (!hasPermission(req.permissions, dataset.permission)) {
      throw new ApiError(403, 'Ruxsat etilmagan');
    }

    // ⚠ USTUNLAR reyestr bo'yicha OQ RO'YXATLANADI: client yuborgan
    // noma'lum yoki ruxsatsiz kalit SHU YERDA tushib qoladi — ya'ni
    // so'rov tanasi orqali qo'shimcha maydon "so'rab olib" bo'lmaydi.
    const columns = this.registry.resolveColumns(
      dataset, req.permissions, v.body.columns,
    );
    if (!columns.length) throw new ApiError(400, 'Kamida bitta ustun tanlang');

    // ⚠ FILTRLAR: har bir dataset O'Z sxemasi bilan tekshiradi. Sxemada
    // yo'q kalit (masalan `role`) JIMGINA tushib qoladi — Zod strip qiladi.
    let filters: any;
    try {
      filters = dataset.filterSchema.parse(v.body.filters || {});
    } catch {
      throw new ApiError(400, "Filtrlar noto'g'ri");
    }

    const generatedAt = new Date();
    const { buffer, rowCount } = await this.exports.generateXlsx({
      dataset,
      columns,
      filters,
      meta: {
        actorName: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
        generatedAt,
        branchLabel: await this.resolveBranchLabel(req),
        filterLabel: buildFilterLabel(filters),
      },
    });

    const fileName = `${asciiSlug(dataset.fileBase)}-${stamp(generatedAt)}.xlsx`;
    // Qatorlar sonini client toast'da ko'rsatadi (tana — binar).
    sendXlsx(res, buffer, fileName, { 'X-Export-Rows': rowCount });
  }
}
