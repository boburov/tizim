import {
  Controller, Delete, Get, HttpCode, Patch, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { GroupsService } from './groups.service.js';
import { TeacherGroupPeriodService } from './teacher-group-period.service.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { salaryTermsMetrics } from '../../common/helpers/config-metrics.js';
import { actorOf } from '../../common/helpers/actor.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
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
  createSchema,
  updateSchema,
  permanentDeleteSchema,
  addStudentSchema,
  backdatePreviewSchema,
  addStudentsBulkSchema,
  updateMembershipSchema,
  studentParamsSchema,
  membershipByIdSchema,
  membershipUpdateSchema,
  teacherPeriodListSchema,
  teacherPeriodCreateSchema,
  teacherPeriodUpdateSchema,
  teacherPeriodRemoveSchema,
  teacherPeriodHandoverSchema,
  type ListRequest,
  type IdParamRequest,
  type HistoryRequest,
  type MembershipListRequest,
  type CreateRequest,
  type UpdateRequest,
  type PermanentDeleteRequest,
  type AddStudentRequest,
  type BackdatePreviewRequest,
  type AddStudentsBulkRequest,
  type UpdateMembershipRequest,
  type StudentParamsRequest,
  type MembershipByIdRequest,
  type MembershipUpdateRequest,
  type TeacherPeriodListRequest,
  type TeacherPeriodCreateRequest,
  type TeacherPeriodUpdateRequest,
  type TeacherPeriodRemoveRequest,
  type TeacherPeriodHandoverRequest,
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
    private readonly approvals: ExpenseApprovalsService,
    private readonly branchAccess: BranchAccessService,
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

  /** ⚠ 201 — Express `res.status(201)` yozadi. */
  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.GROUPS_CREATE)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.groups.create(v.body, actorOf(req));
    return { success: true, data, message: 'Guruh yaratildi' };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.GROUPS_READ)
  async getById(@Validated(idParamSchema) v: IdParamRequest) {
    return { success: true, data: await this.groups.getById(v.params.id) };
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.GROUPS_UPDATE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data: any = await this.groups.update(v.params.id, v.body);
    // ⚠ `priceChange` — Express handler'idagi shox. Servis uni HECH
    // QACHON qaytarmaydi (o'lik kod), lekin xabar shakli klient
    // shartnomasining bir qismi, shuning uchun AYNAN takrorlanadi.
    let message = 'Saqlandi';
    const pc = data?.priceChange;
    if (pc && pc.repriced > 0) {
      message = `Saqlandi - joriy oy uchun ${pc.repriced} ta hisob yangi narxga moslandi`;
    }
    return { success: true, data, message };
  }

  /**
   * BUTUNLAY O'CHIRISH — qaytarib bo'lmaydi.
   *
   * ⚠ Javobda `data` YO'Q (Express ham faqat `{ success, message }`
   * yozadi) — servis natijasi ATAYLAB tashlanadi.
   */
  @Delete(':id/permanent')
  @Permissions(PERMISSIONS.GROUPS_DELETE)
  async permanentRemove(
    @Validated(permanentDeleteSchema) v: PermanentDeleteRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.groups.permanentRemove(v.params.id, actorOf(req), {
      confirmName: v.body?.confirmName,
    });
    return { success: true, message: "Guruh butunlay o'chirildi" };
  }

  /** ⚠ 200 — Express `res.json()` yozadi, NestJS POST standarti 201. */
  @Post(':id/undelete')
  @HttpCode(200)
  @Permissions(PERMISSIONS.GROUPS_DELETE)
  async undelete(@Validated(idParamSchema) v: IdParamRequest) {
    const data = await this.groups.restoreDeleted(v.params.id);
    return { success: true, data, message: 'Guruh qaytarildi' };
  }

  // ═══════════════════════ O'QUVCHI QO'SHISH ═══════════════════════

  /**
   * ORQAGA SANA TA'SIRINI OLDINDAN KO'RSATADI — HECH NARSA SAQLAMAYDI.
   *
   * UI "Qo'shish" tugmasidan OLDIN shuni chaqiradi va foydalanuvchiga
   * "Bu amal 3 oy uchun 4 200 000 so'm qarz yaratadi" tasdig'ini
   * ko'rsatadi.
   */
  @Get(':id/students/backdate-preview')
  @Permissions(PERMISSIONS.GROUPS_MANAGE_STUDENTS)
  async backdatePreview(@Validated(backdatePreviewSchema) v: BackdatePreviewRequest) {
    const data = await this.groups.previewBackdate(v.params.id, {
      joinedAt: v.query.joinedAt,
      leftAt: v.query.leftAt,
    });
    return { success: true, data };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * O'QUVCHINI GURUHGA QO'SHISH.
   *
   * ⚠ ORQAGA SANA (backdate) QO'RIQCHISI: `joinedAt` o'tgan oyga
   * qo'yilsa tizim o'sha oylar uchun AVTOMATIK QARZ yaratadi. Ilgari bu
   * JIMGINA sodir bo'lardi — o'quvchi ogohlantirishsiz to'satdan 3
   * oylik qarzdor bo'lib qolardi.
   *
   * Endi: o'tgan oylarga qarz yaratiladigan bo'lsa va summa filial
   * limitidan oshsa — a'zolik DARHOL yaratilmaydi, owner tasdig'iga
   * yuboriladi (202). Bu chegirmaning TESKARISI va aynan shunday
   * nazoratga muhtoj: qarzni sun'iy yaratib, keyin uni "yomon qarz" deb
   * hisobdan chiqarish yo'li ochiq qolardi.
   *
   * ⚠ GATE ATAYLAB KONTROLLERDA: servisning `addStudent()` i ICHKI
   * oqimlardan (transfer, import, tasdiqni bajarish) ham chaqiriladi —
   * u yerda qayta tasdiq so'rash CHEKSIZ AYLANMA hosil qilardi.
   * ═══════════════════════════════════════════════════════════════════
   */
  @Post(':id/students')
  @HttpCode(201)
  @Permissions(PERMISSIONS.GROUPS_MANAGE_STUDENTS)
  async addStudent(
    @Validated(addStudentSchema) v: AddStudentRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const groupId = v.params.id;
    const { studentId, joinedAt, leftAt } = v.body;

    const preview = await this.groups.previewBackdate(groupId, { joinedAt, leftAt });

    if (preview.isBackdated) {
      const { needsApproval } = await this.approvals.checkExpenseLimit({
        branchId: await this.branchAccess.resolveBranchFromGroup(groupId),
        amount: preview.estimatedDebt,
        permissions: req.permissions,
      });

      if (needsApproval) {
        const approval = await this.groups.requestBackdate(
          groupId, studentId, v.body, actorOf(req),
        );
        // ⚠ `@HttpCode(201)` ni BEKOR QILAMIZ: bu shox 202 qaytaradi.
        res.status(202);
        return {
          success: true,
          data: approval,
          message:
            `Bu amal ${preview.pastMonthCount} oy uchun qarz yaratadi. ` +
            "Tasdiqlash uchun yuborildi - owner tasdiqlagach o'quvchi qo'shiladi.",
        };
      }
    }

    const data = await this.groups.addStudent(groupId, studentId, { joinedAt, leftAt });

    return {
      success: true,
      data,
      // ⚠ Qarz yaratilgan bo'lsa foydalanuvchi buni KO'RISHI kerak —
      // jimgina "qo'shildi" deb yozib qo'yish chalkashlikning asosiy
      // manbai edi.
      message: preview.isBackdated
        ? `O'quvchi qo'shildi. ${preview.pastMonthCount} oy uchun qarz yozildi.`
        : "O'quvchi qo'shildi",
      meta: preview.isBackdated ? { backdate: preview } : undefined,
    };
  }

  /**
   * Bir nechta o'quvchini bir martada qo'shish.
   *
   * ⚠ IKKI XIL MUVAFFAQIYAT STATUSI:
   *   200 — dars TO'QNASHUVI topildi, HECH KIM qo'shilmadi (tasdiq kerak);
   *   201 — qo'shildi.
   */
  @Post(':id/students/bulk')
  @HttpCode(201)
  @Permissions(PERMISSIONS.GROUPS_MANAGE_STUDENTS)
  async addStudentsBulk(
    @Validated(addStudentsBulkSchema) v: AddStudentsBulkRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.groups.addStudentsBulk(v.params.id, v.body.studentIds, {
      joinedAt: v.body.joinedAt,
      leftAt: v.body.leftAt,
      force: v.body.force,
    });

    if (data.requiresConfirmation) {
      res.status(200);
      return {
        success: true, data,
        message: "Ba'zi o'quvchilarning bu vaqtda darsi bor",
      };
    }

    const addedCount = data.added.length;
    const failedCount = data.failed.length;
    const message = failedCount
      ? `${addedCount} ta o'quvchi qo'shildi, ${failedCount} tasi qo'shilmadi`
      : `${addedCount} ta o'quvchi qo'shildi`;
    return { success: true, data, message };
  }

  @Patch(':id/students/:studentId')
  @Permissions(PERMISSIONS.GROUPS_MANAGE_STUDENTS)
  async updateMembership(@Validated(updateMembershipSchema) v: UpdateMembershipRequest) {
    const data = await this.groups.updateMembership(v.params.id, v.params.studentId, {
      joinedAt: v.body.joinedAt,
      leftAt: v.body.leftAt,
    });
    return { success: true, data, message: "A'zolik sanalari yangilandi" };
  }

  @Delete(':id/students/:studentId')
  @Permissions(PERMISSIONS.GROUPS_MANAGE_STUDENTS)
  async removeStudent(
    @Validated(studentParamsSchema) v: StudentParamsRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const result: any = await this.groups.removeStudent(
      v.params.id, v.params.studentId,
      { reasonId: v.body?.reasonId, writeOff: Boolean(v.body?.writeOff) },
      actorOf(req),
    );
    const message = result?.writeOff
      ? `O'quvchi chiqarildi. ${result.writeOff.amount.toLocaleString('uz-UZ')} so'm undirilmagan to'lov sifatida hisobdan chiqarildi.`
      : "O'quvchi guruhdan chiqarildi";
    return { success: true, data: { writeOff: result?.writeOff || null }, message };
  }

  // ═══════════════════════ A'ZOLIK VA TARIX ═══════════════════════

  @Get(':id/students/:studentId/memberships')
  @Permissions(PERMISSIONS.GROUPS_READ)
  async membershipList(@Validated(membershipListSchema) v: MembershipListRequest) {
    const data = await this.groups.listMemberships(v.params.id, v.params.studentId);
    return { success: true, data };
  }

  /** O'qish davrini ID bo'yicha tahrirlash (TARIXIY davr ham). */
  @Patch(':id/memberships/:membershipId')
  @Permissions(PERMISSIONS.GROUPS_MANAGE_STUDENTS)
  async membershipUpdate(@Validated(membershipUpdateSchema) v: MembershipUpdateRequest) {
    const data = await this.groups.updateMembershipById(
      v.params.id, v.params.membershipId, v.body,
    );
    return { success: true, data, message: "O'qish davri yangilandi" };
  }

  @Delete(':id/memberships/:membershipId')
  @Permissions(PERMISSIONS.GROUPS_MANAGE_STUDENTS)
  async membershipRemove(@Validated(membershipByIdSchema) v: MembershipByIdRequest) {
    const data = await this.groups.removeMembershipById(
      v.params.id, v.params.membershipId,
    );
    return { success: true, data, message: "O'qish davri o'chirildi" };
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

  // ══════════════ DARS BERISH DAVRLARI — YOZISH ══════════════

  /**
   * Yangi dars berish davri.
   *
   * ⚠ TASDIQ GATE'i KONTROLLERDA, SERVISDA EMAS — Express'da ham
   * shunday. Servisning `create()` i ICHKI oqimlardan ham chaqiriladi
   * (guruhni arxivdan chiqarish, `assignTeacher`, seed) va u yerda
   * tasdiq so'rash noto'g'ri bo'lardi.
   *
   * ⚠ BU TUR UCHUN `auto` REJIMI YO'Q — eng ko'pi `threshold`.
   * Sabab `constants/delegation`da: direktor o'zini o'qituvchi
   * sifatida ham yozdirib, cheksiz `auto` bilan O'Z stavkasini o'zi
   * belgilay olardi.
   *
   * ⚠ 202 = "qabul qilindi, lekin hali BAJARILMADI". Yozuv
   * YARATILMAYDI — tasdiqlanmagan stavka maosh hisobiga kirib
   * ketmasin.
   */
  @Post(':id/teacher-periods')
  @HttpCode(201)
  @Permissions(PERMISSIONS.GROUPS_UPDATE)
  async teacherPeriodCreate(
    @Validated(teacherPeriodCreateSchema) v: TeacherPeriodCreateRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const group = v.params.id;
    const { needsApproval } = await this.approvals.checkConfigApproval({
      permissions: req.permissions,
      kind: APPROVAL_KINDS.SALARY_TERMS,
      metrics: salaryTermsMetrics(v.body as Record<string, unknown>),
    });

    if (needsApproval) {
      const approval = await this.periods.requestSalaryTerms(
        { op: 'create', group, body: v.body as Record<string, unknown> },
        actorOf(req),
      );
      // ⚠ `@HttpCode(201)` ni BEKOR QILAMIZ: bu shox 202 qaytaradi.
      res.status(202);
      return {
        success: true,
        data: approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
      };
    }

    const data = await this.periods.create(
      { ...(v.body as Record<string, unknown>), group } as never,
      actorOf(req),
    );
    return { success: true, data, message: "Dars berish davri qo'shildi" };
  }

  /** Qarang: `teacherPeriodCreate` — bir xil tasdiq qoidasi. */
  @Patch(':id/teacher-periods/:periodId')
  @Permissions(PERMISSIONS.GROUPS_UPDATE)
  async teacherPeriodUpdate(
    @Validated(teacherPeriodUpdateSchema) v: TeacherPeriodUpdateRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { periodId } = v.params;
    const { needsApproval } = await this.approvals.checkConfigApproval({
      permissions: req.permissions,
      kind: APPROVAL_KINDS.SALARY_TERMS,
      metrics: salaryTermsMetrics(v.body as Record<string, unknown>),
    });

    if (needsApproval) {
      const approval = await this.periods.requestSalaryTerms(
        { op: 'update', periodId, body: v.body as Record<string, unknown> },
        actorOf(req),
      );
      res.status(202);
      return {
        success: true,
        data: approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
      };
    }

    const data = await this.periods.update(periodId, v.body as never, actorOf(req));
    return { success: true, data, message: 'Dars berish davri yangilandi' };
  }

  @Delete(':id/teacher-periods/:periodId')
  @Permissions(PERMISSIONS.GROUPS_UPDATE)
  async teacherPeriodRemove(
    @Validated(teacherPeriodRemoveSchema) v: TeacherPeriodRemoveRequest,
  ) {
    const data = await this.periods.remove(v.params.periodId);
    return { success: true, data, message: "Dars berish davri o'chirildi" };
  }

  /**
   * OMMAVIY TOPSHIRISH (ishdan bo'shatish).
   *
   * ⚠ TASDIQ GATE'i ATAYLAB YO'Q (`teacherPeriodCreate` dan farqli):
   * u yerdagi tasdiq MAOSH STAVKASI o'zgarishi uchun edi. Bu yerda
   * stavka belgilanmaydi — qabul qiluvchi O'Z shartnomasi bo'yicha
   * oladi.
   */
  @Post('teacher-handover/:teacherId')
  @HttpCode(200)
  @Permissions(PERMISSIONS.GROUPS_UPDATE)
  async teacherPeriodHandover(
    @Validated(teacherPeriodHandoverSchema) v: TeacherPeriodHandoverRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.periods.handover(
      { teacher: v.params.teacherId, ...(v.body as Record<string, unknown>) } as never,
      actorOf(req),
    );
    return { success: true, data, message: `${data.opened} ta guruh topshirildi` };
  }
}
