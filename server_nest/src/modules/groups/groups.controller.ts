import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { GroupsService } from './groups.service.js';
import { TeacherGroupPeriodService } from './teacher-group-period.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { ApiError } from '../../common/errors/api-error.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  listSchema,
  idParamSchema,
  historyQuerySchema,
  membershipListSchema,
  teacherPeriodListSchema,
  type ListRequest,
  type IdParamRequest,
  type HistoryRequest,
  type MembershipListRequest,
  type TeacherPeriodListRequest,
} from './groups.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GURUHLAR — Express `groups.routes.js` NING O'QISH YO'LLARI (9/24).
 *
 * ⚠⚠ E'LON TARTIBI O'ZGARTIRILMASIN ⚠⚠
 * `/me/*` marshrutlari `/:id` DAN OLDIN turadi. Teskarisida NestJS
 * "me" ni guruh ID'si deb o'qir edi va o'quvchi o'z guruhini
 * so'raganda 404 olardi.
 *
 * ── NEGA 9/24 ──
 * Qolgan 15 marshrut YOZISH amallari va ular moliya/maosh
 * servislariga tayanadi (`groupFee`, `studentPayment`,
 * `teacherSalary`, `deposits`, `openingBalance`, `expenseApprovals`) —
 * ular hali ko'chirilmagan. `users` moduli uchun qo'llanilgan
 * 2.5a/2.5b naqshining aynan o'zi.
 *
 * `GET /:id/students/backdate-preview` HAM KUTADI: u faqat "o'quvchi
 * qo'shish" oqimining tasdiq oynasi uchun mavjud va
 * `groupFee.nearestFeeAmount` ga tayanadi. Uni hozir ko'chirish
 * moliya qoidasining IKKINCHI nusxasini yaratardi — aynan shu
 * turdagi ikkilanish vaqt o'tib jimgina ajralib ketadi.
 *
 * ── RUXSATLAR ──
 * `/me/*` uchun ruxsat YO'Q, faqat ROL tekshiruvi — Express'da ham
 * shunday: o'quvchida `groups.read` bo'lmaydi, lekin u O'Z guruhini
 * ko'rishi SHART.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('groups')
@UseGuards(PermissionsGuard)
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly periods: TeacherGroupPeriodService,
  ) {}

  // ══════════════ "MENING" MARSHRUTLARI — `/:id` DAN OLDIN ══════════════

  /**
   * ⚠ ROL TEKSHIRUVI KONTROLLERDA, `@Roles()` DEKORATORI BILAN EMAS.
   *
   * Express handler'i `req.user.role !== ROLES.STUDENT` ni tekshirib
   * `403 "Faqat o'quvchilar uchun"` beradi. `RolesGuard` boshqa
   * XABAR qaytarardi va bu klient shartnomasini jimgina o'zgartirardi.
   */
  @Get('me/active')
  async myActive(@Req() req: AuthenticatedRequest) {
    if (req.user!.role !== ROLES.STUDENT) {
      throw new ApiError(403, "Faqat o'quvchilar uchun");
    }
    const data = await this.groups.findActiveForStudent(req.user!._id);
    return { success: true, data };
  }

  @Get('me/teach')
  async myTeach(@Req() req: AuthenticatedRequest) {
    if (req.user!.role !== ROLES.TEACHER) {
      throw new ApiError(403, "Faqat o'qituvchilar uchun");
    }
    const items = await this.groups.listForTeacher(req.user!._id);
    return { success: true, data: items };
  }

  /**
   * O'quvchi "siz guruhdan chiqarildingiz" modalini yopganda —
   * xabar qayta ko'rinmasligi uchun ko'rilgan deb belgilanadi.
   *
   * ⚠ YAGONA YOZISH AMALI SHU TO'LQINDA: u moliyaga TEGMAYDI va
   * faqat aktyorning O'Z yozuviga ta'sir qiladi.
   */
  @Post('me/removal-notice/seen')
  // ⚠ 200, 201 EMAS. NestJS `POST` uchun standart holda 201 qaytaradi,
  // Express handler'i esa `res.json(...)` — ya'ni 200. Bu farqni
  // `test/groups-read-parity.test.mjs` TUTDI. Status klient
  // shartnomasining bir qismi: `res.status === 201` ni tekshiradigan
  // kod jimgina boshqacha ishlab ketardi.
  //
  // Bu marshrut hech narsa YARATMAYDI (mavjud yozuvni "ko'rilgan" deb
  // belgilaydi), shuning uchun 200 semantik jihatdan ham to'g'ri.
  @HttpCode(200)
  async markRemovalNoticeSeen(@Req() req: AuthenticatedRequest) {
    if (req.user!.role !== ROLES.STUDENT) {
      throw new ApiError(403, "Faqat o'quvchilar uchun");
    }
    await this.groups.markRemovalNoticesSeen(req.user!._id);
    // ⚠ Express `{ success: true }` QAYTARADI — `data` YO'Q.
    return { success: true };
  }

  // ══════════════════════════ RO'YXAT VA BITTA ══════════════════════════

  @Get()
  @Permissions(PERMISSIONS.GROUPS_READ)
  async list(
    @Validated(listSchema) v: ListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.groups.list({
      search: v.query.search,
      teacherId: v.query.teacherId,
      archived: v.query.archived === '1' || v.query.archived === 'true',
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.GROUPS_READ)
  async getById(@Validated(idParamSchema) v: IdParamRequest) {
    return { success: true, data: await this.groups.getById(v.params.id) };
  }

  // ═══════════════════════ A'ZOLIK VA TARIX ═══════════════════════

  @Get(':id/students/:studentId/memberships')
  @Permissions(PERMISSIONS.GROUPS_READ)
  async membershipList(@Validated(membershipListSchema) v: MembershipListRequest) {
    const data = await this.groups.listMemberships(v.params.id, v.params.studentId);
    return { success: true, data };
  }

  @Get(':id/history')
  @Permissions(PERMISSIONS.GROUPS_READ)
  async history(
    @Validated(historyQuerySchema) v: HistoryRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.groups.history(v.params.id, { page, limit });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  // ═══════════════════════ O'QITUVCHILAR ═══════════════════════

  /**
   * Guruhga biriktirish uchun BO'SH (jadvali to'qnashmaydigan)
   * o'qituvchilar.
   *
   * ⚠ VALIDATOR YO'Q — Express'da ham yo'q (`router.get(...)` da
   * `validate()` chaqirilmagan). Qo'shilsa yaroqsiz ID uchun 400
   * berardi, hozir esa 404 beradi — bu klient shartnomasi.
   */
  @Get(':id/available-teachers')
  @Permissions(PERMISSIONS.GROUPS_READ)
  async availableTeachers(@Req() req: AuthenticatedRequest) {
    const data = await this.periods.listAvailableTeachers(String(req.params.id));
    return { success: true, data };
  }

  /** O'qituvchi dars berish DAVRLARI — manba haqiqati (timeline). */
  @Get(':id/teacher-periods')
  @Permissions(PERMISSIONS.GROUPS_READ)
  async teacherPeriodList(
    @Validated(teacherPeriodListSchema) v: TeacherPeriodListRequest,
  ) {
    return { success: true, data: await this.periods.listByGroup(v.params.id) };
  }
}
