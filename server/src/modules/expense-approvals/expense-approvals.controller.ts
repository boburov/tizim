import {
  Controller,
  Get,
  HttpCode,
  NotImplementedException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ExpenseApprovalsService } from './expense-approvals.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { APPROVAL_CATEGORIES } from '../../common/constants/approvals.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  listSchema,
  decisionSchema,
  idSchema,
  bulkSchema,
  type ListRequest,
  type DecisionRequest,
  type IdRequest,
  type BulkRequest,
} from './expense-approvals.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASDIQLAR — Express `expenseApprovals.routes.js` EKVIVALENTI.
 *
 * Route qatlamidagi ruxsat faqat "eshik" - u ikki kategoriyadan (moliya /
 * sozlama) BIRIGA huquqi borlarni kiritadi. Haqiqiy kategoriya tekshiruvi
 * SERVIS ichida (`categoryCondition` / `assertCanDecide`), chunki bitta
 * endpoint ikkala kategoriyaga xizmat qiladi va ularning huquqi har xil.
 *
 * ⚠ E'LON TARTIBI: `GET /pending-count` va `GET /stats` `GET /:id` DAN
 * OLDIN turishi SHART - aks holda ular ID deb o'qilib 404 qaytarardi.
 * (Express izohida ham aynan shu ogohlantirish bor.)
 *
 * ⚠ IKKI MANZIL: Express `routes/index.js` bu routerni HAM
 * `/expense-approvals` (eski, frontend biladi), HAM `/approvals` (yangi
 * umumiy nom) ostiga ulaydi. NestJS'da buni `@Controller([...])` massivi
 * beradi — bitta kontroller, ikkita prefiks.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller(['expense-approvals', 'approvals'])
@UseGuards(PermissionsGuard)
export class ExpenseApprovalsController {
  constructor(private readonly approvals: ExpenseApprovalsService) {}

  // O'QISH: ro'yxat filial bo'yicha avtomatik kesiladi (branchFilter),
  // ya'ni direktor faqat o'z filialining so'rovlarini ko'radi. Kategoriya
  // bo'yicha esa servis kesadi - moliya huquqi bor odam sozlama
  // so'rovlarini ko'rmaydi (va aksincha), lekin O'Z so'rovini har kim
  // ko'radi.
  @Get()
  @Permissions(PERMISSIONS.FINANCE_READ, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async list(
    @Validated(listSchema) v: ListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(v.query as Record<string, unknown>);
    const { items, total } = await this.approvals.list({
      status: v.query.status,
      kind: v.query.kind,
      category: v.query.category,
      search: v.query.search,
      sort: v.query.sort,
      dateFrom: v.query.dateFrom,
      dateTo: v.query.dateTo,
      requestedBy: v.query.requestedBy,
      page,
      limit,
      permissions: req.permissions,
      currentUser: req.user,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get('pending-count')
  @Permissions(PERMISSIONS.FINANCE_READ, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async pendingCount(@Req() req: AuthenticatedRequest) {
    const count = await this.approvals.pendingCount({
      permissions: req.permissions,
      currentUser: req.user,
    });
    return { success: true, data: { count } };
  }

  /**
   * KPI kartalari: kutilayotgan soni, kutilayotgan chiqim summasi, xatolar.
   * Ro'yxat bilan BIR XIL ko'rinish qoidalariga bo'ysunadi (filial +
   * kategoriya ruxsati) - aks holda karta 12 ta deb turib ro'yxatda 3 ta
   * chiqardi.
   */
  @Get('stats')
  @Permissions(PERMISSIONS.FINANCE_READ, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async stats(@Req() req: AuthenticatedRequest) {
    const data = await this.approvals.stats({
      permissions: req.permissions,
      currentUser: req.user,
    });
    return { success: true, data };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.FINANCE_READ, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async getById(
    @Param('id') id: string,
    @Validated(idSchema) _v: IdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.approvals.getById(id, {
      permissions: req.permissions,
      currentUser: req.user,
    });
    return { success: true, data };
  }

  // ── QAROR ──

  /**
   * ⚠ TASDIQLASH NestJS'DA HALI YO'Q — 501.
   *
   * Sabab servisdagi izohda batafsil: bajaruvchilar (EXECUTORS) o'n
   * modulda va ulardan faqat `users` ko'chirilgan. Yarim bajaruvchi
   * bilan ochilsa "Tasdiqlash" tugmasi so'rovni `failed` holatiga
   * o'tkazib BUZIB qo'yardi.
   *
   * Trafik Express'da (5000-port) — foydalanuvchi uchun hech narsa
   * o'zgarmaydi. Farqni `expense-approvals-parity` testi kuzatadi:
   * bajaruvchilar ko'chgan kuni test YIQILADI.
   */
  @Post(':id/approve')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async approve(
    @Validated(decisionSchema) v: DecisionRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data: any = await this.approvals.approve(
      v.params.id,
      { note: v.body?.note },
      req.user,
      req.permissions,
    );
    // ⚠ XABAR KATEGORIYAGA QARAB — Express bilan AYNAN bir xil.
    // Konfiguratsiya so'rovida pul harakati YO'Q ("o'zgarish qo'llandi"),
    // moliyaviy so'rovda esa BOR ("to'lov amalga oshirildi").
    const message =
      data?.category === APPROVAL_CATEGORIES.CONFIGURATION
        ? "Tasdiqlandi va o'zgarish qo'llandi"
        : "Tasdiqlandi va to'lov amalga oshirildi";
    return { success: true, data, message };
  }

  @Post('bulk-approve')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async bulkApprove(
    @Validated(bulkSchema) v: BulkRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.approvals.bulkDecide(
      v.body.ids,
      { action: 'approve', note: v.body?.note },
      req.user,
      req.permissions,
    );
    // 207 EMAS, 200: qisman muvaffaqiyat bu yerda NORMAL holat, xato emas.
    const message = result.failed.length
      ? `${result.succeeded.length} ta bajarildi, ${result.failed.length} ta o'tmadi`
      : `${result.succeeded.length} ta so'rov bajarildi`;
    return { success: true, data: result, message };
  }

  /**
   * OMMAVIY RAD ETISH — bajaruvchi TALAB QILMAYDI, shuning uchun
   * `bulk-approve` dan farqli o'laroq TO'LIQ ishlaydi.
   *
   * KETMA-KET, ATAYLAB PARALLEL EMAS — Express izohidagi sabab bilan:
   * har bir ID alohida tekshiriladi va alohida yiqiladi.
   */
  @Post('bulk-reject')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async bulkReject(
    @Validated(bulkSchema) v: BulkRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const succeeded: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const id of v.body.ids) {
      try {
         
        await this.approvals.reject(
          id,
          { note: v.body.note },
          req.user,
          req.permissions,
        );
        succeeded.push(String(id));
      } catch (err) {
        failed.push({
          id: String(id),
          reason: (err as { message?: string })?.message || "Noma'lum xato",
        });
      }
    }
    const result = { succeeded, failed, total: v.body.ids.length };

    // 207 EMAS, 200: qisman muvaffaqiyat bu yerda NORMAL holat, xato emas.
    // Frontend natijani `failed` massivi bo'yicha ko'rsatadi.
    const message = failed.length
      ? `${succeeded.length} ta bajarildi, ${failed.length} ta o'tmadi`
      : `${succeeded.length} ta so'rov bajarildi`;
    return { success: true, data: result, message };
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async reject(
    @Param('id') id: string,
    @Validated(decisionSchema) v: DecisionRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.approvals.reject(
      id,
      { note: v.body?.note },
      req.user,
      req.permissions,
    );
    return { success: true, data, message: 'Rad etildi' };
  }

  @Post(':id/retry')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.APPROVALS_DECIDE_CONFIG)
  async retry(
    @Param('id') id: string,
    @Validated(idSchema) _v: IdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.approvals.retry(id, req.permissions);
    return { success: true, data, message: 'Qayta tasdiqlash uchun yuborildi' };
  }

  /**
   * BEKOR QILISH: so'rovchining o'zi (servis ichida tekshiriladi).
   * Shuning uchun tasdiqlash huquqi shart emas - so'rov YARATA oladigan
   * har qanday rol (chiqim uchun finance.pay, maosh sharti uchun
   * groups.update) o'z so'rovini bekor qila olishi kerak.
   */
  @Post(':id/cancel')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_PAY, PERMISSIONS.GROUPS_UPDATE)
  async cancel(
    @Param('id') id: string,
    @Validated(idSchema) _v: IdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.approvals.cancel(id, req.user);
    return { success: true, data, message: "So'rov bekor qilindi" };
  }
}
