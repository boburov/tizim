import { Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { GradesService } from './grades.service.js';
import { RatingService } from './rating.service.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { PermissionOrSelfGuard } from '../../common/guards/permission-or-self.guard.js';
import {
  GroupAccessGuard,
  StudentAccessGuard,
  GroupAccess,
  StudentAccess,
} from '../../common/guards/attendance-scope.guard.js';
import {
  Permissions,
  PermissionOrSelf,
  Validated,
} from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  bulkRecordSchema, listForDateSchema, groupRangeSchema, studentRangeSchema,
  leaderboardSchema, ratingSettingsUpdateSchema,
  type BulkRecordRequest, type ListForDateRequest, type GroupRangeRequest,
  type StudentRangeRequest, type LeaderboardRequest,
  type RatingSettingsUpdateRequest,
} from './grades.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BAHOLAR VA REYTING — Express `grades.routes.js` NING TO'LIQ
 * EKVIVALENTI (8/8).
 *
 * ── QO'RIQCHILAR ZANJIRI (tartib MUHIM) ──
 *   1. `RolesGuard`            — `PATCH /rating/settings` faqat owner
 *   2. `PermissionsGuard`      — "bu bo'limga umuman kira oladimi?"
 *   3. `PermissionOrSelfGuard` — o'quvchi O'ZINI so'rasa ruxsat
 *   4. `GroupAccessGuard` / `StudentAccessGuard`
 *                              — "AYNAN SHU guruh/o'quvchi uningmi?"
 *
 * Express'da ham aynan shu tartib (`requireRole` → `requirePermission`
 * → `require*Access`). NestJS kontroller darajasidagi qo'riqchilarni
 * metod darajasidagilardan OLDIN ishlatadi, shuning uchun `RolesGuard`
 * shu yerda — metodga qo'yilsa `PermissionsGuard` dan KEYIN ishlab,
 * owner bo'lmagan xodim `rating.manage` yo'qligi haqidagi boshqa
 * xatoni olardi. Metadata bo'lmasa har bir qo'riqchi `true` qaytaradi,
 * shuning uchun qolgan marshrutlarga ta'siri yo'q.
 *
 * ⚠ `StudentAccessGuard` `req.scopeGroupIds` NI TO'LDIRADI va
 * kontroller uni servisga UZATADI. Uzatishni unutish A-1
 * "cross-group disclosure" xatosini qaytaradi: o'qituvchi o'zi
 * o'qitmaydigan guruhdagi ballarni ham ko'rib qolardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('grades')
@UseGuards(
  RolesGuard,
  PermissionsGuard,
  PermissionOrSelfGuard,
  GroupAccessGuard,
  StudentAccessGuard,
)
export class GradesController {
  constructor(
    private readonly grades: GradesService,
    private readonly rating: RatingService,
  ) {}

  // ═══════════════════════ REYTING ═══════════════════════

  @Get('rating/leaderboard')
  @Permissions(PERMISSIONS.RATING_READ)
  async leaderboard(@Validated(leaderboardSchema) v: LeaderboardRequest) {
    // ⚠ TASDIQLANGAN `query` DAN o'qiladi, `req.query` dan EMAS:
    // Express `validate()` natijani `req.query` USTIGA yozadi, NestJS
    // `@Validated()` esa yozmaydi. Xom `req.query` dan o'qilsa `limit`
    // satr bo'lib qolardi.
    const data = await this.rating.getLeaderboard({
      scope: v.query.scope || 'all',
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
      limit: v.query.limit ? Number(v.query.limit) : 100,
    });
    return { success: true, data };
  }

  @Get('rating/settings')
  @Permissions(PERMISSIONS.RATING_READ)
  async getRatingSettings() {
    const data = await this.rating.getSettings();
    return { success: true, data };
  }

  /**
   * ⚠ FAQAT `@Permissions(RATING_MANAGE)` — `@Roles(OWNER)` OLIB TASHLANDI.
   *
   * Ilgari ikkalasi ham bor edi (Express merosi) va izoh uni "huquqni
   * kengaytirmaslik" bilan izohlardi. Aslida u TESKARI ishlardi: markaz
   * egasi `rating.manage` ni biror rolga BERSA HAM, `RolesGuard` uni
   * baribir to'sardi — ruxsat matritsasi yolg'on va'da berardi.
   *
   * Reyting vaznlarini kim o'zgartirishini ENDI EGA HAL QILADI: kalit
   * kimda bo'lsa, o'sha o'zgartiradi. Uni hech kimga bermaslik kerak
   * bo'lsa, `permission-scope.ts` dagi `OWNER_ONLY_PERMISSIONS` ga
   * qo'shiladi — to'siq bitta joyda turadi.
   */
  @Patch('rating/settings')
  @Permissions(PERMISSIONS.RATING_MANAGE)
  async updateRatingSettings(
    @Validated(ratingSettingsUpdateSchema) v: RatingSettingsUpdateRequest,
  ) {
    const data = await this.rating.updateSettings(v.body);
    return { success: true, data, message: 'Sozlamalar saqlandi' };
  }

  /**
   * O'quvchining reytingdagi o'rni (umumiy + guruh) — o'zi yoki
   * ruxsatli.
   *
   * ⚠ VALIDATOR YO'Q — Express'da ham yo'q. `fromDate`/`toDate` xom
   * `req.query` dan olinadi va servis ichida `parseLocalDay` bilan
   * tekshiriladi. Bu yerga validator QO'SHILSA, noto'g'ri sana uchun
   * Express 200 qaytarganda NestJS 400 qaytarib, paritet buzilardi.
   */
  /**
   * ⚠ XAVFSIZLIK TUZATISHI — `@StudentAccess('id')` QO'SHILDI (ikkala
   * stekda BIR VAQTDA).
   *
   * `@PermissionOrSelf` faqat "bo'limga kira oladimi?" degan savolga
   * javob beradi. "AYNAN SHU o'quvchi uningmi?" so'ralmasdi, ya'ni
   * `rating.read` ruxsatli filial xodimi BEGONA FILIAL o'quvchisining
   * reytingini o'qiy olardi.
   *
   * O'LCHANDI (taxmin emas): ko'lamlangan aktyorga `rating.read`
   * berilganda begona o'quvchi uchun express=200, nest=200.
   *
   * Qo'shni `students/:id/summary` (AYNI ma'lumot turi) `@StudentAccess`
   * ni ALLAQACHON ishlatadi — bu qoldirib ketilgan joy edi.
   */
  @Get('rating/students/:id')
  @PermissionOrSelf(PERMISSIONS.RATING_READ, 'id')
  @StudentAccess('id')
  async studentRank(@Req() req: AuthenticatedRequest) {
    const q = req.query as Record<string, unknown>;
    const data = await this.rating.getStudentRank(String(req.params.id), {
      fromDate: q.fromDate,
      toDate: q.toDate,
    });
    return { success: true, data };
  }

  // ═══════════════════════ BAHOLAR ═══════════════════════

  /** O'quvchining o'rtacha balli + oxirgi ballar (o'zi yoki ruxsatli). */
  @Get('students/:id/summary')
  @PermissionOrSelf(PERMISSIONS.GRADES_READ, 'id')
  @StudentAccess('id')
  async studentSummary(
    @Validated(studentRangeSchema) v: StudentRangeRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.grades.getStudentSummary(v.params.id, {
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
      // ⚠ Qo'riqchidan keladi — uzatilmasa cross-group oshkorlik.
      scopeGroupIds: req.scopeGroupIds ?? null,
    });
    return { success: true, data };
  }

  /** Guruh summary (o'rtacha + tarqalish). */
  @Get('groups/:groupId/summary')
  @Permissions(PERMISSIONS.GRADES_READ)
  @GroupAccess('groupId')
  async groupSummary(@Validated(groupRangeSchema) v: GroupRangeRequest) {
    const data = await this.grades.getGroupSummary(v.params.groupId, {
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
    });
    return { success: true, data };
  }

  /**
   * Guruh + sana uchun baholash ro'yxati.
   *
   * ⚠ `/groups/:groupId/summary` DAN KEYIN e'lon qilinadi — Express
   * tartibi ATAYLAB takrorlangan.
   */
  @Get('groups/:groupId')
  @Permissions(PERMISSIONS.GRADES_READ)
  @GroupAccess('groupId')
  async listForGroupOnDate(@Validated(listForDateSchema) v: ListForDateRequest) {
    // `?? null` — Express `req.query.slot ?? null`. `null` VA
    // `undefined` FARQ QILADI: `null` bo'lsa servis birinchi sessiyani
    // tanlaydi, bo'sh satr esa "yagona sessiya" degani.
    const data = await this.grades.listForGroupOnDate(
      v.params.groupId,
      v.query.date,
      v.query.slot ?? null,
    );
    return { success: true, data };
  }

  /** Ballarni bulk saqlash. */
  @Post('groups/:groupId/bulk')
  @HttpCode(201)
  @Permissions(PERMISSIONS.GRADES_RECORD)
  @GroupAccess('groupId')
  async bulkRecord(
    @Validated(bulkRecordSchema) v: BulkRecordRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.grades.bulkRecord(
      v.params.groupId,
      v.body.date,
      v.body.items,
      req.user!,
      v.body.slot || '',
    );
    return { success: true, data, message: 'Baholar saqlandi' };
  }
}
