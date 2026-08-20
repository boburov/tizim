import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES, ROLE_TYPES } from '../../common/constants/permissions.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { hashPassword } from '../../common/utils/password.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import {
  toUtcMidnight,
  localTodayMidnight,
  parseLocalDay,
  isFutureLocalDay,
} from '../../common/utils/date.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import {
  assertTargetInScope,
  assertCanAssignBranch,
  type BranchScope,
} from '../../common/rbac/branch-access.service.js';
import { userBranchCondition } from '../../common/als/branch-context.js';
import {
  CredentialScopeService,
  type CredentialActor,
} from '../../common/rbac/credential-scope.js';
import {
  RolesHelperService,
  staffRoleFilter,
  assertNotSelfRoleChange,
  type RoleCatalogEntry,
} from '../../common/rbac/roles.helper.js';
import { StudentCompletionService } from '../../common/helpers/student-completion.service.js';
import { UserRelationsService } from '../../common/helpers/user-relations.service.js';
import { ArchiveReasonsService } from '../archive-reasons/archive-reasons.service.js';
import { SystemNotificationsService } from '../system-notifications/system-notifications.service.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { UserProfileService } from '../auth/user-profile.service.js';
import { StudentFreezeService } from '../student-freeze/student-freeze.service.js';
import {
  PayrollAuditService,
  PAYROLL_AUDIT_ACTIONS,
} from '../staff-payroll/payroll-audit.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-request.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FOYDALANUVCHILAR — `server/src/modules/users/services/users.service.js`
 * NING KO'CHIRMASI (FAZA 2.5a: 14 marshrutdan 10 tasi).
 *
 * ── ⚠ NEGA HAMMASI EMAS: BOG'LIQLIK YO'NALISHI ──
 *
 * `users` bu tizimning MARKAZIY obyekti va u o'zidan PASTDA emas,
 * YUQORIDA turadi: quyidagi to'rt marshrut moliya/maosh/tasdiq
 * modullariga tayanadi va ular hali ko'chirilmagan:
 *
 *   POST   /users/staff        → expenseApprovals + teacherSalary
 *                                (kompensatsiya) + openingBalance
 *   DELETE /users/:id          → financePaymentService.recalcForStudent
 *   POST   /users/:id/restore  → systemNotifications + archiveReasons
 *   DELETE /users/:id/permanent→ hardDelete{Student,Teacher}Data (moliya)
 *
 * Ular FAZA 7/8 dan keyin, "users to'lqin 2" da ko'chadi. Yarim
 * ko'chirilgan moliyaviy zanjirni yozib qo'yish — mavjud bo'lmagan
 * kafolat berish demak.
 *
 * ── ⚠ MEROS QILIB OLINGAN CHEKLOV (FAZA 2.3 dan) ──
 *
 * `UserProfileService.build()` O'QUVCHI va O'QITUVCHI uchun 501
 * (`PROFILE_NOT_MIGRATED`) qaytaradi — profilga guruh/davomat/muzlatish
 * kerak. Shu sababli `GET /:id`, `PATCH /:id/role`, `PATCH /:id/branches`
 * XODIM nishonida Express bilan aynan bir xil ishlaydi, o'quvchi/
 * o'qituvchi nishonida esa 501 beradi. Bu YANGI cheklov emas —
 * `/auth/me` da allaqachon mavjud va cutover shartlari ro'yxatida turadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const STUDENT_ONLY_FIELDS = ['enrolledAt', 'completedAt'] as const;
const TEACHER_ONLY_FIELDS = ['hiredAt'] as const;

/**
 * ⚠ KO'LAM TEKSHIRUVI (`assertTargetInScope`) foydalanuvchining BARCHA
 * filiallarini biladi degan taxminga asoslanadi: `homeBranchId` VA
 * `branchAssignments[]`. Prisma relation'ni so'ralmasa qaytarmaydi, ya'ni
 * uni unutish qo'shimcha filialga biriktirilgan xodimni "begona" qilib
 * ko'rsatardi. Shuning uchun yagona konstanta.
 */
const SCOPE_INCLUDE = {
  branchAssignments: { select: { branchId: true, role: true } },
} as const;

/** Ro'yxatda saralash mumkin bo'lgan maydonlar (xavfsiz oq ro'yxat). */
const USER_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
  firstName: 'firstName',
  lastName: 'lastName',
};

/**
 * `homeBranch` relation'ini ESKI nomga qaytaradi.
 *
 * Mongoose `.populate("homeBranchId")` maydonning O'ZINI obyektga
 * aylantirardi va klient aynan shunga tayanadi (`u.homeBranchId?.name`).
 * Prisma esa `homeBranchId` ni satr qoldirib, obyektni `homeBranch` deb
 * alohida beradi. Qayta nomlamasak jadvaldagi "Filial" ustuni JIMGINA
 * bo'sh qolardi.
 */
const withBranchShape = (row: any) => {
  const out: any = withLegacyId(row);
  if (row.homeBranch !== undefined) {
    out.homeBranchId = row.homeBranch ? withLegacyId(row.homeBranch) : null;
    delete out.homeBranch;
  }
  return out;
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly credentials: CredentialScopeService,
    private readonly roles: RolesHelperService,
    private readonly completion: StudentCompletionService,
    private readonly profiles: UserProfileService,
    private readonly freezes: StudentFreezeService,
    private readonly payrollAudit: PayrollAuditService,
    private readonly relations: UserRelationsService,
    // ⚠ EGASI MODULLARDAN — NUSXA EMAS. Bu ikkalasi qisqa muddat
    // `common/helpers/` dagi VAQTINCHALIK ko'prik edi (egasi modullar
    // hali ko'chmagan paytda). Modullar kelgan zahoti ko'priklar
    // O'CHIRILDI — aks holda ikkita manba bir-biridan uzoqlashardi.
    private readonly archiveReasons: ArchiveReasonsService,
    private readonly systemNotifications: SystemNotificationsService,
    private readonly approvals: ExpenseApprovalsService,
  ) {}

  private readonly logger = new Logger('UsersService');

  /**
   * ⚠ KO'CHIRILMAGAN YON TA'SIR — JIMGINA O'TKAZIB YUBORILMAYDI.
   *
   * Express shu nuqtada `teacherSalary` hisoblash dvigatelini chaqiradi
   * (best-effort: `try/catch` + `logger.warn`). U FAZA 8 da ko'chadi.
   * Chaqiruv o'rnini bo'sh qoldirish farqni KO'RINMAS qilardi, shuning
   * uchun har safar barqaror belgili WARN yoziladi — jurnalda
   * `DEFERRED_EFFECT` bo'yicha qidirib topiladi.
   *
   * ⚠ JAVOB TANASIGA TA'SIR QILMAYDI: Express'da ham bu chaqiruvning
   * natijasi javobga chiqmaydi, shuning uchun paritet buzilmaydi.
   */
  private deferredEffect(what: string, ctx: Record<string, unknown>) {
    this.logger.warn(
      `DEFERRED_EFFECT ${what} — FAZA 8 (teacherSalary) ko'chmagan. ` +
        `Kontekst: ${JSON.stringify(ctx)}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ICHKI YORDAMCHILAR
  // ═══════════════════════════════════════════════════════════════════

  /**
   * O'qituvchining FAOL guruhi bo'lsa arxivlash/faolsizlantirishni bloklaydi.
   *
   * Ikkala manba tekshiriladi: `Group.teachers` keshi (UI shuni ko'rsatadi)
   * VA ochiq dars davri (`TeacherGroupPeriod`) — biror-birida bo'lsa ham
   * bloklanadi.
   */
  private async assertTeacherHasNoActiveGroup(user: any, actionVerb = 'arxivlang') {
    if (!user || user.role !== ROLES.TEACHER) return;

    const openPeriods = await this.prisma.teacherGroupPeriod.findMany({
      where: { teacherId: user.id, endDate: null, isDeleted: false },
      select: { groupId: true },
    });

    const activeGroups = await this.prisma.group.findMany({
      where: {
        OR: [
          { teachers: { some: { id: user.id } } },
          // Bo'sh ro'yxatda `{ in: [] }` hech nimaga mos kelmaydi — to'g'ri.
          { id: { in: openPeriods.map((p) => p.groupId) } },
        ],
        isActive: true,
        isDeleted: false,
      },
      select: { name: true },
    });

    if (activeGroups.length) {
      const names = activeGroups.map((g) => g.name).join(', ');
      throw new ApiError(
        400,
        `O'qituvchining faol guruhi bor (${names}). Avval uni boshqa o'qituvchiga almashtiring yoki guruh(lar)dan chiqaring, so'ng ${actionVerb}.`,
      );
    }
  }

  /** O'quvchilar ro'yxatiga faol guruhlarni va muzlatish holatini qo'shadi. */
  private async enrichStudents(items: any[]) {
    const studentIds = items.filter((u) => u.role === ROLES.STUDENT).map((u) => u.id);
    if (studentIds.length === 0) return items.map(withBranchShape);

    const [membershipRows, freezeMap] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: { studentId: { in: studentIds }, leftAt: null, isDeleted: false },
        select: { studentId: true, group: { select: { id: true, name: true } } },
      }),
      this.freezes.getActiveFreezeMap(studentIds),
    ]);

    const groupsMap = new Map<string, unknown[]>();
    for (const m of membershipRows) {
      if (!m.group) continue;
      const key = String(m.studentId);
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      // Klient `g._id` o'qiydi (guruh chiplari).
      groupsMap.get(key)!.push({ _id: m.group.id, id: m.group.id, name: m.group.name });
    }

    return items.map((u) => {
      const obj = withBranchShape(u);
      if (u.role === ROLES.STUDENT) {
        obj.activeGroups = groupsMap.get(String(u.id)) || [];
        const fr = freezeMap.get(String(u.id));
        obj.isFrozen = !!fr;
        obj.frozenSince = fr ? fr.startDate : null;
      }
      return obj;
    });
  }

  /**
   * XODIMLAR ro'yxatini boyitadi: rol yorlig'i + tirik sessiya soni.
   *
   * Ikkala so'rov ham SAHIFA bo'yicha (har qator uchun emas) — N+1 yo'q.
   */
  private async enrichEmployees(rows: any[], catalog: Map<string, RoleCatalogEntry> | null) {
    if (rows.length === 0) return rows;

    const ids = rows.map((u) => String(u.id));
    const now = new Date();

    // TIRIK SESSIYA: bekor qilinmagan va muddati o'tmagan refresh token.
    const sessions = await this.prisma.refreshToken.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, revokedAt: null, expiresAt: { gt: now } },
      _count: { _all: true },
    });
    const sessionMap = new Map(sessions.map((s) => [String(s.userId), s._count._all]));

    return rows.map((u) => {
      const roleDoc = catalog?.get(u.role);
      return {
        ...u,
        // Rol hujjati topilmasa `resolveRole` bilan BIR XIL zaxira qiymat:
        // yorliq = xom qiymat, tip = staff (owner esa har doim owner).
        roleLabel: roleDoc?.label || u.role,
        roleType:
          roleDoc?.roleType ||
          (u.role === ROLES.OWNER ? ROLE_TYPES.OWNER : ROLE_TYPES.STAFF),
        roleIsFrozen: Boolean(roleDoc?.isFrozen),
        activeSessions: sessionMap.get(String(u.id)) || 0,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // O'QISH
  // ═══════════════════════════════════════════════════════════════════

  async list({
    role,
    search,
    staff = false,
    status = 'active',
    page = 1,
    limit = 20,
    sort = 'createdAt',
    order = 'desc',
  }: {
    role?: string;
    search?: string;
    staff?: boolean;
    status?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: string;
  }) {
    // "Muzlatilgan" — faqat O'QUVCHI tushunchasi. Xodimlar ro'yxatida u
    // DOIM bo'sh natija berardi, shuning uchun "faol"ga tushiriladi.
    const effectiveStatus = staff && status === 'frozen' ? 'active' : status;

    const where: any = { isDeleted: false };
    if (effectiveStatus === 'active') where.isActive = true;
    else if (effectiveStatus === 'archived') where.isActive = false;
    else if (effectiveStatus === 'frozen') {
      where.isActive = true;
      where.id = { in: await this.freezes.getActiveFrozenStudentIds() };
    }

    // Aniq `role` USTUN turadi — kartochkadan "faqat direktorlar" filtri
    // shu orqali ishlaydi, qo'shimcha kodsiz.
    const catalog = staff ? await this.roles.loadRoleCatalog() : null;
    where.role = role
      ? role
      : staff
        ? staffRoleFilter(catalog!)
        : { in: [ROLES.STUDENT, ROLES.TEACHER] };

    if (search && search.trim()) {
      // RegExp KERAK EMAS: `contains` xom SATRNI qidiradi (Prisma LIKE
      // maxsus belgilarini o'zi ekranlaydi).
      const q = search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    // ⚠ FILIAL KO'LAMI — `AND` ishlatiladi, `OR` EMAS: yuqorida qidiruv
    // allaqachon `OR` ni band qilgan. Ikkinchi `OR` birinchisini bosib
    // ketardi va qidiruv filial filtrini BUTUNLAY yo'q qilardi (jimgina
    // sizish). Prisma yuqori darajadagi barcha kalitlarni o'zaro AND
    // qiladi, ya'ni `OR` + `AND` birga to'g'ri ishlaydi.
    const branchCond = userBranchCondition();
    if (branchCond) where.AND = [...(where.AND || []), branchCond];

    const dir = order === 'asc' ? 'asc' : 'desc';
    const skip = (page - 1) * limit;
    const sortField = USER_SORT_FIELDS[sort] || 'createdAt';

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [sortField]: dir },
        skip,
        take: limit,
        include: {
          homeBranch: { select: { id: true, name: true, code: true } },
          ...SCOPE_INCLUDE,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const enriched = await this.enrichStudents(items);
    return {
      items: staff ? await this.enrichEmployees(enriched, catalog) : enriched,
      total,
      page,
      limit,
    };
  }

  /**
   * XODIMLAR STATISTIKASI — rol kesimida.
   *
   * Ro'yxat bilan BIR XIL predikat (`staffRoleFilter`) va BIR XIL filial
   * sharti ishlatiladi. Aks holda kartochkadagi "Jami" ro'yxatdagi
   * qatorlar soniga teng bo'lmasdi va bu buzuq ko'rinardi.
   */
  async staffStats() {
    const catalog = await this.roles.loadRoleCatalog();
    const where: any = { isDeleted: false, role: staffRoleFilter(catalog) };

    const branchCond = userBranchCondition();
    if (branchCond) where.AND = [branchCond];

    const [totals, actives] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], where, _count: { _all: true } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { ...where, isActive: true },
        _count: { _all: true },
      }),
    ]);

    const activeMap = new Map(actives.map((r) => [r.role, r._count._all]));

    // Tartib: Ega → xodimlar → o'qituvchilar, ichida yorliq bo'yicha.
    const ORDER: Record<string, number> = {
      [ROLE_TYPES.OWNER]: 0,
      [ROLE_TYPES.STAFF]: 1,
      [ROLE_TYPES.TEACHER]: 2,
    };

    const byRole = totals
      .map((r) => {
        const meta = catalog.get(r.role);
        const roleType =
          meta?.roleType || (r.role === ROLES.OWNER ? ROLE_TYPES.OWNER : ROLE_TYPES.STAFF);
        const total = r._count._all;
        const active = activeMap.get(r.role) || 0;
        return {
          role: r.role,
          label: meta?.label || r.role,
          roleType,
          isFrozen: Boolean(meta?.isFrozen),
          total,
          active,
          archived: total - active,
        };
      })
      .sort(
        (a, b) =>
          (ORDER[a.roleType] ?? 9) - (ORDER[b.roleType] ?? 9) ||
          a.label.localeCompare(b.label),
      );

    const total = byRole.reduce((s, r) => s + r.total, 0);
    const active = byRole.reduce((s, r) => s + r.active, 0);
    return { total, active, archived: total - active, byRole };
  }

  /**
   * LOGIN (username) band emasligini oldindan tekshiradi.
   *
   * ⚠ QOIDA `auth.registerUser` BILAN AYNAN BIR XIL bo'lishi shart, aks
   * holda forma "bo'sh" deb ko'rsatib, saqlashda 409 berardi:
   *   • qidiruv ARXIVLANGAN va o'chirilganlarni ham qamraydi (login ular
   *     bilan ham band bo'lib turadi);
   *   • filial ko'lami QO'LLANMAYDI: boshqa filialdagi odamning logini
   *     ham band, lekin kimligi oshkor qilinmaydi — faqat "band" bayrog'i.
   *
   * TELEFON tekshirilmaydi: takrorlanish ruxsat etilgan.
   */
  async checkAvailability({
    username,
    excludeId,
  }: { username?: string; excludeId?: string } = {}) {
    const result: Record<string, unknown> = {};
    const login = String(username || '').toLowerCase().trim();
    if (login) {
      const exists = await this.prisma.user.findFirst({
        where: {
          username: login,
          ...(excludeId ? { id: { not: String(excludeId) } } : {}),
        },
        select: { id: true },
      });
      result.username = { taken: Boolean(exists) };
    }
    return result;
  }

  /**
   * Foydalanuvchini ID bo'yicha oladi (ichki ishlatish uchun ham).
   * `branchAssignments` HAR DOIM yuklanadi — `SCOPE_INCLUDE` izohiga qarang.
   */
  async getById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(id) },
      include: SCOPE_INCLUDE,
    });
    if (!user) throw new ApiError(404, 'Foydalanuvchi topilmadi');
    return user;
  }

  async getProfile(id: string) {
    return this.profiles.build(await this.getById(id));
  }

  async studentHistory(studentId: string, { page = 1, limit = 20 } = {}) {
    const user = await this.getById(studentId);
    if (user.role !== ROLES.STUDENT) {
      throw new ApiError(400, "Bu foydalanuvchi o'quvchi emas");
    }
    const where = { studentId: user.id };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip,
        take: limit,
        include: {
          group: {
            select: {
              id: true,
              name: true,
              schedule: { select: { day: true, startTime: true, endTime: true } },
            },
          },
          transferredTo: { select: { id: true, name: true } },
        },
      }),
      this.prisma.groupMembership.count({ where }),
    ]);

    return { items: withLegacyIds(items), total, page, limit };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PAROL — ENG QAT'IY YO'L
  // ═══════════════════════════════════════════════════════════════════

  /**
   * ⚠ PAROLLAR OCHIQ MATNDA SAQLANADI — bu endpoint mavjud qiymatni
   * QAYTARADI (u parolni "tiklamaydi").
   */
  async getPassword(id: string, actor: CredentialActor) {
    // Global `omit` parolni har qanday boshqa so'rovdan chetlatadi;
    // FAQAT shu yer uni ataylab so'raydi.
    const user = await this.prisma.user.findUnique({
      where: { id: String(id) },
      omit: { passwordHash: false },
      include: SCOPE_INCLUDE,
    });
    if (!user) throw new ApiError(404, 'Foydalanuvchi topilmadi');
    if (user.role === ROLES.OWNER) {
      throw new ApiError(403, "Owner parolini ko'rib bo'lmaydi");
    }
    await this.assertCredentialScope(actor, user);
    return { username: user.username, password: user.passwordHash || '' };
  }

  /** Yangi parol o'rnatish (javobda bir martalik qaytadi). */
  async setPassword(id: string, newPassword: string, actor: CredentialActor) {
    const user = await this.getById(id);
    if (user.role === ROLES.OWNER) {
      throw new ApiError(403, "Owner parolini o'zgartirib bo'lmaydi");
    }

    // ⚠ O'QISH BILAN AYNAN BIR XIL KO'LAM: boshqa filial xodimining
    // parolini ALMASHTIRISH ham o'sha hisobga kirishni beradi.
    await this.assertCredentialScope(actor, user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    // Parol o'zgargach barcha eski sessiyalarni bekor qilamiz.
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { username: user.username, password: newPassword };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * FILIAL HIMOYASI — ENG MUHIM TEKSHIRUV.
   *
   * `requireRole(OWNER)` uchinchi bosqichda `system.admin_access`
   * borlarni ham o'tkazadi — ya'ni filial direktori parol endpointi
   * orqali BOSHQA filial xodimining parolini o'qiy olardi.
   *
   * ⚠ `req.allowedBranchIds` / `canSeeAllBranches` ATAYLAB
   * ISHLATILMAYDI: `branches.view_all` IKKALASINI ham kengaytiradi va
   * zaiflik aynan shundan kelib chiqadi. Faqat HAQIQIY owner
   * (`roleType === "owner"`) cheklovsiz; qolganlar uchun aktyorning
   * filiallari BAZADAN QAYTA o'qiladi.
   * ═══════════════════════════════════════════════════════════════════
   */
  private async assertCredentialScope(actor: CredentialActor, user: unknown) {
    const actorBranchIds = await this.credentials.actorBranchIds(actor?.actorId ?? null);
    assertTargetInScope(actorBranchIds, Boolean(actor?.isOwner), user as never);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAHRIRLASH
  // ═══════════════════════════════════════════════════════════════════

  async update(
    id: string,
    body: Record<string, any>,
    currentUser: AuthenticatedUser | null = null,
    // ⚠ `Partial` — auth middleware maydonlari ixtiyoriy. `undefined`
    // falsy, ya'ni ko'lam noma'lum bo'lsa tekshiruv BAJARILADI.
    scope: Partial<BranchScope> | null = null,
  ) {
    const user: any = await this.getById(id);
    if (user.role === ROLES.OWNER) {
      throw new ApiError(403, "Owner foydalanuvchini tahrirlab bo'lmaydi");
    }

    // FILIAL HIMOYASI. Bu marshrut endi owner-only EMAS (`users.update`
    // ruxsati — filial direktori O'Z xodimini tahrirlashi kerak), shuning
    // uchun chegara SHU YERDA qo'yiladi.
    //
    // `scope` berilmasa (seed / job / ichki chaqiruv) tekshirilmaydi.
    if (scope) {
      assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, user);
    }

    // Rolga bog'liq maydonlar.
    if (user.role !== ROLES.STUDENT) {
      for (const f of STUDENT_ONLY_FIELDS) {
        if (body[f] !== undefined) {
          throw new ApiError(400, `Bu maydon (${f}) faqat o'quvchi uchun`);
        }
      }
    }
    if (user.role !== ROLES.TEACHER) {
      for (const f of TEACHER_ONLY_FIELDS) {
        if (body[f] !== undefined) {
          throw new ApiError(400, `Bu maydon (${f}) faqat o'qituvchi uchun`);
        }
      }
    }

    // ⚠ Prisma'da `undefined` = "bu maydonga tegma", `null` = "NULL yoz".
    // Mongoose'dagi `= undefined` esa maydonni O'CHIRARDI. Shuning uchun
    // tozalash kerak bo'lgan joyda OCHIQ `null` yoziladi.
    const data: Record<string, unknown> = {};

    if (body.firstName !== undefined) data.firstName = body.firstName.trim();
    if (body.lastName !== undefined) data.lastName = body.lastName.trim();
    if (body.isActive !== undefined) {
      // O'quvchini faolsizlantirib (arxivlab) bo'lmaydi — u doim faol obyekt.
      if (body.isActive === false && user.role === ROLES.STUDENT) {
        throw new ApiError(
          400,
          'O\'quvchini arxivlab bo\'lmaydi. "Muzlatish"dan foydalaning yoki guruhdan chiqaring.',
        );
      }
      // Faolsizlantirish ham arxivlash kabi — faol guruhi bor o'qituvchiga ruxsat yo'q.
      if (body.isActive === false) await this.assertTeacherHasNoActiveGroup(user, 'arxivlang');
      data.isActive = !!body.isActive;
    }

    if (body.phone !== undefined) {
      const phone = body.phone ? normalizePhone(body.phone) : null;
      if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");
      data.phone = phone || null;
    }

    if (body.birthDate !== undefined) {
      data.birthDate = body.birthDate ? new Date(body.birthDate) : null;
    }
    if (body.gender !== undefined) data.gender = body.gender || null;

    // ── FAQAT O'QUVCHI ──
    let recomputeCompletion = false;
    if (user.role === ROLES.STUDENT) {
      // Ro'yxatga olingan sana SHU chaqiruvda o'zgargan bo'lishi mumkin —
      // pastdagi "yakunlash sanasi" tekshiruvi YANGI qiymatga tayanishi kerak.
      let nextEnrolledAt = user.enrolledAt;

      if (body.enrolledAt !== undefined) {
        const d = body.enrolledAt ? parseLocalDay(body.enrolledAt) : null;
        if (body.enrolledAt && d == null) {
          throw new ApiError(400, "Ro'yxatga olingan sana noto'g'ri");
        }
        if (d && isFutureLocalDay(d)) {
          throw new ApiError(400, "Ro'yxatga olingan sana kelajakda bo'lmasin");
        }
        // Ro'yxatga olingan sanani mavjud a'zolik boshlangan kundan
        // KEYINGA surib bo'lmaydi — aks holda "guruhga ro'yxatdan oldin
        // qo'shilgan" holat qolardi.
        if (d) {
          const earliest = await this.prisma.groupMembership.findFirst({
            where: { studentId: user.id, isDeleted: false },
            select: { joinedAt: true },
            orderBy: { joinedAt: 'asc' },
          });
          if (
            earliest?.joinedAt &&
            toUtcMidnight(d).getTime() > toUtcMidnight(earliest.joinedAt).getTime()
          ) {
            throw new ApiError(
              400,
              "Ro'yxatga olingan sana o'quvchi guruhga qo'shilgan sanadan keyin bo'lmasin",
            );
          }
        }
        data.enrolledAt = d;
        nextEnrolledAt = d;
      }

      // Yakunlash sanasi: bo'sh → avtoga qaytarish, sana → qo'lda override.
      if (body.completedAt !== undefined) {
        const d = body.completedAt ? parseLocalDay(body.completedAt) : null;
        if (body.completedAt && d == null) {
          throw new ApiError(400, "Yakunlash sanasi noto'g'ri");
        }
        if (d) {
          if (isFutureLocalDay(d)) {
            throw new ApiError(400, "Yakunlash sanasi kelajakda bo'lmasin");
          }
          if (nextEnrolledAt && d.getTime() < toUtcMidnight(nextEnrolledAt).getTime()) {
            throw new ApiError(
              400,
              "Yakunlash sanasi ro'yxatga olingan sanadan oldin bo'lmasin",
            );
          }
          data.completedAt = d;
          data.completedAtManual = true;
        } else {
          data.completedAt = null;
          data.completedAtManual = false;
          recomputeCompletion = true;
        }
      }
    }

    // ── FAQAT O'QITUVCHI ──
    let hiredAtAudit: { from: unknown; to: Date } | null = null;
    if (user.role === ROLES.TEACHER) {
      if (body.hiredAt !== undefined) {
        // Ishga olingan sana o'qituvchi uchun MAJBURIY — bo'shatib bo'lmaydi.
        if (!body.hiredAt) throw new ApiError(400, 'Ishga olingan sana majburiy');
        const d = parseLocalDay(body.hiredAt);
        if (d == null) throw new ApiError(400, "Ishga olingan sana noto'g'ri");
        if (isFutureLocalDay(d)) {
          throw new ApiError(400, 'Ishga olingan sana kelajakda bo\'lmasin');
        }

        // ⚠ HR SANASI MOLIYAGA TA'SIR QILMAYDI, lekin IZI QOLADI.
        // Bu yerda ATAYLAB hech qanday qayta hisob chaqirilmaydi: maosh
        // yaratish/qayta hisoblash mustaqil, qo'lda boshlanadigan amal.
        const previousHiredAt = user.hiredAt;
        data.hiredAt = d;
        if (String(previousHiredAt || '') !== String(d || '')) {
          hiredAtAudit = { from: previousHiredAt, to: d };
        }
      }
    }

    const saved = await this.prisma.user.update({
      where: { id: user.id },
      data,
      include: SCOPE_INCLUDE,
    });

    if (hiredAtAudit) {
      await this.payrollAudit.record({
        employee: saved.id,
        action: PAYROLL_AUDIT_ACTIONS.EMPLOYMENT_DATE_CHANGED,
        targetType: 'user',
        targetId: saved.id,
        oldValue: { hiredAt: hiredAtAudit.from },
        newValue: { hiredAt: hiredAtAudit.to },
        actor: currentUser as never,
      });
    }

    // Override bo'shatilgan bo'lsa — avtomatik qiymatni qayta hisoblaymiz.
    if (recomputeCompletion) {
      await this.completion.safeRecompute(saved.id);
      return withLegacyId(await this.getById(id));
    }
    return withLegacyId(saved);
  }

  // ═══════════════════════════════════════════════════════════════════
  // ROL VA FILIAL BIRIKTIRUVI
  // ═══════════════════════════════════════════════════════════════════

  async setBranches(
    id: string,
    body: {
      homeBranchId?: string;
      branchAssignments?: { branchId: string; role?: string | null }[];
    },
    currentUser: {
      _id?: unknown;
      permissions?: string[];
      allowedBranchIds?: string[];
      canSeeAllBranches?: boolean;
    },
  ) {
    const user = await this.getById(id);

    // Nishon joriy ko'lamda bo'lishi SHART (boshqa filial xodimiga tegib bo'lmaydi).
    assertTargetInScope(
      currentUser?.allowedBranchIds,
      currentUser?.canSeeAllBranches,
      user as never,
    );

    const data: Record<string, unknown> = {};

    if (body.homeBranchId !== undefined) {
      if (!body.homeBranchId) {
        throw new ApiError(400, "Asosiy filial bo'sh bo'lmasligi kerak");
      }
      assertCanAssignBranch(
        currentUser?.allowedBranchIds,
        currentUser?.canSeeAllBranches,
        body.homeBranchId,
      );
      const branch = await this.prisma.branch.findFirst({
        where: { id: String(body.homeBranchId), isDeleted: false },
        select: { id: true },
      });
      if (!branch) throw new ApiError(400, 'Filial topilmadi');
      data.homeBranchId = branch.id;
    }

    if (body.branchAssignments !== undefined) {
      const next: { branchId: string; role: string | null }[] = [];
      for (const a of body.branchAssignments || []) {
        assertCanAssignBranch(
          currentUser?.allowedBranchIds,
          currentUser?.canSeeAllBranches,
          a.branchId,
        );
        if (a.role) {
          const r = await this.roles.assertRoleAssignable(a.role);
          await this.roles.assertCanGrantRole(r, currentUser as never);
        }
        next.push({ branchId: String(a.branchId), role: a.role || null });
      }
      // Eskilarini o'chirib, yangisini yozish — ikkalasi BITTA `update`
      // ichida, ya'ni bitta tranzaksiyada. Yarim holat (eskisi o'chgan,
      // yangisi yozilmagan) bo'lishi mumkin emas.
      data.branchAssignments = {
        deleteMany: {},
        ...(next.length ? { create: next } : {}),
      };
    }

    const saved = await this.prisma.user.update({
      where: { id: user.id },
      data,
      include: SCOPE_INCLUDE,
    });
    return this.profiles.build(saved as never);
  }

  /**
   * Foydalanuvchiga rol biriktirish (built-in yoki custom).
   *
   * `User.role` da enum YO'Q (dinamik rol), shuning uchun tekshiruv SHU YERDA:
   *  - rol haqiqatan mavjudmi va muzlatilmaganmi;
   *  - o'z rolini o'zgartirmayaptimi (o'zini qulflab qo'ymasin);
   *  - tizimdagi oxirgi owner rolidan ayrilmayaptimi.
   */
  async setRole(
    id: string,
    role: string,
    currentUser: {
      _id?: unknown;
      permissions?: string[];
      allowedBranchIds?: string[];
      canSeeAllBranches?: boolean;
    },
  ) {
    assertNotSelfRoleChange(currentUser as never, id);

    const user = await this.getById(id);

    if (user.role === role) return this.profiles.build(user as never);

    const targetRole = await this.roles.assertRoleAssignable(role);
    await this.roles.assertNotLastOwner(id);

    // ⚠ IMTIYOZ OSHIRISHDAN HIMOYA. Bu tekshiruvsiz `roles.update` huquqi
    // bor filial direktori boshqa odamga OWNER rolini bera olardi va shu
    // orqali butun tizimni egallardi.
    await this.roles.assertCanGrantRole(targetRole, currentUser as never);

    // FILIAL: boshqa filial xodimining rolini o'zgartirib bo'lmaydi.
    assertTargetInScope(
      currentUser?.allowedBranchIds,
      currentUser?.canSeeAllBranches,
      user as never,
    );

    const saved = await this.prisma.user.update({
      where: { id: user.id },
      data: { role },
      include: SCOPE_INCLUDE,
    });

    // Rol o'zgardi — eski sessiyalar yangi ruxsat bilan ishlashi uchun
    // barcha refresh tokenlar bekor qilinadi (qayta login talab qilinadi).
    await this.prisma.refreshToken.updateMany({
      where: { userId: saved.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return this.profiles.build(saved as never);
  }
  // ═══════════════════════════════════════════════════════════════════
  // HAYOT SIKLI — ARXIVLASH / TIKLASH / BUTUNLAY O'CHIRISH (FAZA 2.5b)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * ARXIVLASH (soft delete).
   *
   * ── ⚠ O'QUVCHI SHOXI KO'CHIRILMADI — VA BU ATAYLAB ──
   *
   * Express fayli o'quvchi uchun to'liq bir shox saqlaydi (a'zolikni
   * yopish, sababni snapshot qilish, to'lovni qayta proratsiya qilish),
   * LEKIN u ERISHIB BO'LMAYDIGAN kod: undan 15 qator YUQORIDA
   * `role === student` SHARTSIZ 400 bilan to'siladi. Express izohi buni
   * ochiq aytadi ("HOZIRDA ERISHIB BO'LMAYDI ... ATAYLAB SAQLANDI").
   *
   * Uni bu yerga ko'chirish `assertPeriodInvariants` (groups) va
   * `financePayment.recalcForStudent` (finance) ni talab qilardi — ikkalasi
   * ham ko'chirilmagan. Ya'ni natija "ko'chirilgandek ko'rinib, aslida
   * ishlamaydigan" kod bo'lardi — Express izohi aynan shundan qochgan edi.
   *
   * `test/users-lifecycle-parity.test.mjs` to'siqning O'ZINI o'lchaydi:
   * o'quvchi ikkala stekda ham 400 oladi. Siyosat o'zgarib to'siq
   * olib tashlansa — o'sha test yiqiladi va bu shox eslab qolinadi.
   */
  async softRemove(
    id: string,
    {
      reasonId,
      archiveDate,
      by,
      scope,
    }: {
      reasonId?: string;
      archiveDate?: Date | string | null;
      by?: { id?: string; _id?: unknown } | null;
      scope?: Partial<BranchScope> | null;
    } = {},
  ) {
    const user = await this.getById(id);
    if (user.role === ROLES.OWNER) {
      throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
    }

    // FILIAL HIMOYASI — boshqa filial xodimini arxivlab bo'lmaydi.
    if (scope) {
      assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, user as never);
    }

    // O'quvchi arxivlanmaydi — u tizimda doim faol obyekt bo'lib qoladi.
    // Vaqtincha to'xtatish uchun "Muzlatish" (StudentFreeze), chiqib ketish
    // esa guruhdan chiqarish (`GroupMembership.leftAt`) orqali qayd etiladi.
    if (user.role === ROLES.STUDENT) {
      throw new ApiError(
        400,
        "O'quvchini arxivlab bo'lmaydi. Vaqtincha to'xtatish uchun \"Muzlatish\"dan foydalaning yoki guruhdan chiqaring.",
      );
    }

    // Arxiv sanasi — berilsa o'sha kun (UTC midnight), aks holda mahalliy
    // "bugun".
    const archivedAt = archiveDate ? toUtcMidnight(archiveDate) : localTodayMidnight();
    if (archivedAt.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "Arxiv sanasi kelajakda bo'lishi mumkin emas");
    }

    // ─── XODIM / O'QITUVCHI SHOXI ───

    // O'qituvchining faol guruhi bo'lsa arxivlab bo'lmaydi
    // (almashtirish/chiqarish kerak).
    await this.assertTeacherHasNoActiveGroup(user, 'arxivlang');

    const data: Record<string, unknown> = { isActive: false, archivedAt };

    // ISHDAN BO'SHASH: o'qituvchi uchun arxivlash = ishdan bo'shash.
    // `terminatedAt` EXCLUSIVE — shu kundan boshlab maosh hisoblanmaydi.
    //
    // NEGA MUHIM: fiksa oylik (`kind="base"`) `TeacherCompensation` dan
    // AVTOMATIK hisoblanadi va u guruhga bog'liq EMAS. Ya'ni guruhlari
    // bo'shatilgan bo'lsa ham, `terminatedAt` qo'yilmasa o'qituvchiga har
    // oy maosh hisoblanib boraverardi — "ishdan ketgan odamga maosh".
    if (user.role === ROLES.TEACHER) {
      data.terminatedAt = archivedAt;
      if (reasonId) {
        const reason = await this.prisma.archiveReason.findUnique({
          where: { id: String(reasonId) },
          select: { title: true },
        });
        if (reason) data.terminationReason = reason.title;
      }
    }

    const saved = await this.prisma.user.update({
      where: { id: user.id },
      data,
      include: SCOPE_INCLUDE,
    });

    // Ochiq maosh stavkasini YOPAMIZ — bu sof Prisma amali va u Express'da
    // ham shunday (servis chaqiruvi emas), shuning uchun AYNAN ko'chirildi.
    // Best-effort: xato bo'lsa arxivlash bekor QILINMAYDI (xodim allaqachon
    // saqlangan), tungi job qolganini tuzatadi.
    if (user.role === ROLES.TEACHER) {
      try {
        await this.prisma.teacherCompensation.updateMany({
          where: { teacherId: user.id, effectiveTo: null, isDeleted: false },
          data: { effectiveTo: archivedAt },
        });
      } catch (err) {
        this.logger.warn(
          `Ishdan bo'shatishda maosh stavkasi yopilmadi (user=${user.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      // Express: `compensationService.recomputeFrom(user.id, archivedAt)`.
      this.deferredEffect('teacherCompensation.recomputeFrom', {
        userId: user.id,
        from: archivedAt.toISOString(),
      });
    }

    return withLegacyId(saved);
  }

  /**
   * ARXIVDAN QAYTARISH.
   *
   * ISHGA QAYTARISH: `terminatedAt` olib tashlanadi, lekin YOPILGAN maosh
   * stavkasi AVTOMATIK ochilmaydi — qaytgan o'qituvchi bilan yangi
   * shartnoma tuzilishi mumkin va eski stavkani jimgina tiklash noto'g'ri
   * bo'lardi. Owner uni profil sahifasidan qayta belgilaydi.
   *
   * ⚠ ROL TO'SIG'I YO'Q (Express'da ham): arxivlash o'quvchiga taqiqlangan
   * bo'lsa-da, TIKLASH har qanday rolda ishlaydi. Sabab: bazada tarixiy
   * yoki qo'lda arxivlangan o'quvchilar bo'lishi mumkin va ular uchun
   * qaytish yo'li ochiq qolishi kerak.
   */
  async restore(
    id: string,
    {
      reasonId,
      by,
      scope,
    }: {
      reasonId?: string;
      by?: { id?: string; _id?: unknown } | null;
      scope?: Partial<BranchScope> | null;
    } = {},
  ) {
    const user = await this.getById(id);

    // FILIAL HIMOYASI — arxivlash bilan bir xil chegara: boshqa filialning
    // arxivlangan xodimini tiklab, uni o'z ro'yxatiga chiqarib olish
    // mumkin edi.
    if (scope) {
      assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, user as never);
    }

    const wasTerminated = Boolean((user as any).terminatedAt);

    const saved = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isActive: true,
        archivedAt: null,
        terminatedAt: null,
        terminationReason: '',
      },
      include: SCOPE_INCLUDE,
    });

    if (saved.role === ROLES.TEACHER && wasTerminated) {
      try {
        const active = await this.activeCompensation(saved.id);
        if (!active) {
          const name = `${saved.firstName} ${saved.lastName || ''}`.trim();
          await this.systemNotifications.create({
            message: `${name} ishga qaytarildi, lekin maosh stavkasi yopiq holatda. Uni qayta belgilang - aks holda maosh 0 bo'lib hisoblanadi.`,
            link: `/users/${saved.id}`,
          });
        }
      } catch {
        // bildirishnoma yuborilmasa ham qaytarish buzilmasin
      }
    }

    if (saved.role === ROLES.STUDENT) {
      // `archivedAt` olib tashlangach yakunlash sanasi a'zolik tarixiga
      // ko'ra qayta hisoblanadi (faol a'zolik yo'q bo'lsa max `leftAt` da
      // qoladi).
      await this.completion.safeRecompute(saved.id);
      try {
        await this.archiveReasons.logAction({
          user: saved.id,
          action: 'restore',
          reasonId,
          by: (by?.id || (by?._id as string | undefined)) ?? null,
        });
      } catch {
        // log yozilmasa ham qaytarish buzilmasin
      }
    }

    return withLegacyId(saved);
  }

  /**
   * `teacherSalary/teacherCompensation.getActive` NING ICHKI KO'CHIRMASI.
   *
   * ⚠ NEGA ICHKARIDA: bu SOF O'QISH (Prisma + sana solishtiruvi) va u
   * `restore()` dagi bildirishnoma shartini hal qiladi. Butun
   * `teacherSalary` modulini (2 700 qator hisoblash dvigateli) kutib
   * turish shu bitta shart uchun o'zini oqlamaydi; shartni tashlab
   * ketish esa owner'ni "maosh 0 bo'lib hisoblanadi" ogohlantirishisiz
   * qoldirardi.
   *
   * ⚠ FAZA 8 KO'CHIRILGANDA: bu metod O'CHIRILADI va o'sha modulning
   * `getActive` iga ulanadi.
   */
  private async activeCompensation(teacherId: string, onDate: Date | null = null) {
    const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
    const rows = await this.prisma.teacherCompensation.findMany({
      where: { teacherId: String(teacherId), isDeleted: false },
      orderBy: { effectiveFrom: 'desc' },
    });
    const found = rows.find((r: any) => {
      const s = toUtcMidnight(r.effectiveFrom).getTime();
      const e = r.effectiveTo ? toUtcMidnight(r.effectiveTo).getTime() : Infinity;
      return s <= t && t < e;
    });
    return found ? withLegacyId(found) : null;
  }

  /**
   * BUTUNLAY (hard) O'CHIRISH — yozuv va bog'liq ma'lumotlar TIKLAB
   * BO'LMAYDIGAN tarzda drop qilinadi.
   *
   *  - O'quvchi: to'lov, depozit, a'zolik, davomat, baho... o'chadi.
   *  - O'qituvchi: maosh hisoblari, maosh to'lovlari (chiqim), dars
   *    davrlari, HR davomat/yo'qliklar o'chadi; guruhlar va ular ichidagi
   *    o'quvchilar SAQLANADI (o'qituvchi `Group.teachers` dan chiqariladi).
   *
   * Ikkalasi uchun ham to'liq ism (`confirmName`) tasdiq sifatida talab
   * etiladi. Owner o'chirilmaydi.
   */
  async permanentRemove(
    id: string,
    _currentUser: unknown,
    { confirmName }: { confirmName?: string } = {},
  ) {
    const user = await this.getById(id);
    if (user.role === ROLES.OWNER) {
      throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
    }

    const isStudent = user.role === ROLES.STUDENT;
    const isTeacher = user.role === ROLES.TEACHER;

    // ─── O'QITUVCHINI BUTUNLAY O'CHIRISH: DEYARLI HAR DOIM TAQIQLANADI ───
    //
    // Maoshlar TO'LIQ to'langan bo'lsa ham, o'chirish `SalaryTransaction`
    // yozuvlarini olib ketardi — ya'ni o'tgan yilning CHIQIMI yo'q bo'lib,
    // o'sha oyning foydasi OSHIB ketardi. Bu buxgalteriya emas, tarixni
    // tahrirlash.
    //
    // Shuning uchun o'chirish FAQAT "hech qachon ishlamagan" xodim uchun
    // ochiq (noto'g'ri yaratilgan hisob).
    if (isTeacher) {
      await this.assertTeacherHasNoActiveGroup(user, "o'chiring");

      // ─── MATERIALLIK: qator MAVJUDLIGI emas, undagi PUL tekshiriladi ───
      //
      // Oylik cron har oy HAR BIR o'qituvchiga `base`/`group` qatorini
      // avtomatik ochadi — hech qachon dars bermagan xodimda ham bir
      // yildan keyin 12 ta BO'SH qator paydo bo'ladi. Qatorlarni
      // shunchaki sanash bunday hisobni o'chirishning ILOJINI
      // QOLDIRMASDI. Endi faqat HAQIQIY moliyaviy iz to'sadi.
      const [salaryRows, txnCount, periodCount] = await Promise.all([
        this.prisma.teacherSalary.findMany({
          where: {
            teacherId: user.id,
            OR: [{ expectedAmount: { not: 0 } }, { paidAmount: { gt: 0 } }],
          },
          select: { expectedAmount: true, paidAmount: true },
        }),
        this.prisma.salaryTransaction.count({ where: { teacherId: user.id } }),
        // Haqiqiy dars tarixi = kamida bir kun davom etgan (yoki hali
        // ochiq) davr. Ochilgan kuniyoq yopilgan davr (start === end) bir
        // kunlik ham maosh hosil qilmaydi — xato kiritma, tarix emas.
        //
        // Ustunni ustunga solishtirish uchun Prisma "field reference"
        // ishlatiladi.
        this.prisma.teacherGroupPeriod.count({
          where: {
            teacherId: user.id,
            isDeleted: false,
            OR: [
              { endDate: null },
              { endDate: { gt: this.prisma.teacherGroupPeriod.fields.startDate } },
            ],
          },
        }),
      ]);

      // DAVOMAT ATAYLAB SANALMAYDI. `Attendance.recordedById` — "kim
      // belgiladi" degan audit maydoni, moliyaviy iz emas.

      const traces: string[] = [];
      if (salaryRows.length) traces.push(`${salaryRows.length} ta maosh yozuvi`);
      if (txnCount) traces.push(`${txnCount} ta maosh to'lovi`);
      if (periodCount) traces.push(`${periodCount} ta dars berish davri`);

      if (traces.length) {
        // To'lanmagan qoldiq — owner uchun ENG muhim raqam: "Hisobni
        // yopish" aynan shuni nolga tushiradi.
        const outstanding = salaryRows.reduce(
          (sum: number, r: any) =>
            sum + Math.max((r.expectedAmount || 0) - (r.paidAmount || 0), 0),
          0,
        );
        const hint = outstanding
          ? ` Hozircha ${outstanding.toLocaleString('ru-RU')} so'm to'lanmagan maosh turibdi - ` +
            `avval "Hisobni yopish" orqali uni nolga tushiring, so'ng arxivlang.`
          : '';
        throw new ApiError(
          400,
          `Bu o'qituvchida tarix bor (${traces.join(', ')}). Uni butunlay o'chirib bo'lmaydi - ` +
            `o'chirilsa o'tgan oylarning chiqimi yo'qolib, foyda hisoboti yolg'on bo'lardi. ` +
            `Buning o'rniga ARXIVLANG: tarix saqlanadi, o'qituvchi ro'yxatlardan yo'qoladi.${hint}`,
        );
      }
    }

    // O'quvchini o'chirish sharti: hech qanday guruhga biriktirilmagan
    // bo'lsin (faol a'zolik bo'lmasin).
    if (isStudent) {
      const inGroup = await this.prisma.groupMembership.findFirst({
        where: { studentId: user.id, leftAt: null, isDeleted: false },
        select: { id: true },
      });
      if (inGroup) {
        throw new ApiError(
          400,
          "O'quvchi guruhga biriktirilgan. Avval uni guruh(lar)dan chiqaring, so'ng o'chiring.",
        );
      }
    }

    if (isStudent || isTeacher) {
      const fullName = `${user.firstName} ${user.lastName}`.trim();
      if (!confirmName || confirmName.trim() !== fullName) {
        throw new ApiError(
          400,
          "Tasdiqlash uchun foydalanuvchining to'liq ismini to'g'ri kiriting",
        );
      }

      // Barcha o'chirishlarni BITTA tranzaksiyada. Postgres'da atomiklik
      // kafolatlangan: yo hammasi o'chadi, yo hech nima. Yarim o'chirilgan
      // o'quvchi (to'lovi yo'q, a'zoligi bor) holat mumkin emas.
      const groupIds: string[] = await this.prisma.$transaction(async (tx: any) => {
        const gids = isStudent
          ? await this.relations.hardDeleteStudentData(user.id, { tx })
          : await this.relations.hardDeleteTeacherData(user.id, { tx });
        await this.relations.purgeUserResidualData(user.id, { tx });
        await tx.user.delete({ where: { id: user.id } });
        return gids;
      }, FINANCE_TXN_OPTIONS);

      // Express: har bir `groupId` uchun `teacherSalaryService.recalcForGroup`.
      //  - O'quvchi o'chsa: guruh kirimi kamayadi → o'qituvchi maoshlari
      //    qayta hisoblanishi SHART.
      //  - O'qituvchi o'chsa: amalda no-op (maoshlar o'zaro bog'liq emas).
      if (groupIds.length) {
        this.deferredEffect('teacherSalary.recalcForGroup', {
          userId: user.id,
          groupIds,
        });
      }

      // Owner uchun tizim bildirishnomasi (best-effort).
      const roleLabel = isStudent ? "o'quvchi" : "o'qituvchi";
      try {
        await this.systemNotifications.create({
          message: `${fullName} (${roleLabel}) tizimdan butunlay o'chirildi`,
        });
      } catch {
        // bildirishnoma yozilmasa ham o'chirish buzilmasin
      }

      return { id: user.id, _id: user.id };
    }

    // Kutilmagan rollar (himoya): bog'liqlik bo'lsa o'chirib bo'lmaydi.
    const blockers = await this.relations.findUserBlockingRelations(user.id);
    if (blockers.length > 0) {
      const detail = blockers.map((b) => `${b.label} (${b.count})`).join(', ');
      throw new ApiError(
        409,
        `Bu foydalanuvchini butunlay o'chirib bo'lmaydi: u quyidagi ma'lumotlarga bog'liq — ${detail}. Avval bu yozuvlarni o'chiring yoki foydalanuvchini arxivlang.`,
        { code: 'USER_HAS_RELATIONS', details: blockers },
      );
    }

    // Bog'liqlik yo'q — qoldiq sessiya/audit ma'lumotini tozalab, yozuvni
    // o'chiramiz.
    await this.prisma.$transaction(async (tx: any) => {
      await this.relations.purgeUserResidualData(user.id, { tx });
      await tx.user.delete({ where: { id: user.id } });
    }, FINANCE_TXN_OPTIONS);
    return { id: user.id, _id: user.id };
  }
  // ═══════════════════════════════════════════════════════════════════
  // XODIM YARATISH (`POST /users/staff`)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * XODIM (direktor/administrator/o'qituvchi) yaratish — login/parol +
   * filial + rol.
   *
   * ── ⚠ KO'CHIRILMAGAN YON TA'SIRLAR — JIMGINA TASHLAB KETILMAYDI ──
   *
   * Express ikkita IXTIYORIY yon ta'sir bajaradi va ikkalasi ham
   * ko'chirilmagan MOLIYA zanjiriga tayanadi:
   *
   *   `compensation`   → teacherSalary/teacherCompensation.setCompensation
   *   `openingBalance` → openingBalance.create
   *
   * Ikkinchisi JAVOB TANASIGA ham chiqadi: xato bo'lsa Express
   * `profile.openingBalanceError` maydonini qo'shadi. Ya'ni uni jimgina
   * o'tkazib yuborish PUL MA'LUMOTINI YO'QOTARDI — aynan Express kodi
   * ehtiyot bo'ladigan holat.
   *
   * Shuning uchun OCHIQ 501. Bu `POST /auth/register-user` da allaqachon
   * qabul qilingan naqsh (`REGISTER_SIDE_EFFECTS_NOT_MIGRATED`) —
   * ikkalasi bir xil ikki yon ta'sirga ega opasingdi.
   *
   * ⚠⚠ 501 QAYERDA TURGANI MUHIM — U BARCHA VALIDATSIYADAN KEYIN.
   *
   * `register-user` da bu tekshiruv metodning ENG BOSHIDA turadi, ya'ni
   * login band bo'lsa ham `openingBalance` bilan 501 qaytadi (Express
   * esa 409 berardi). Bu yerda u ATAYLAB PASTGA tushirildi — barcha
   * tekshiruvlardan KEYIN, birinchi YOZUVDAN OLDIN:
   *
   *   • noto'g'ri kirish + openingBalance → Express bilan AYNAN bir xil
   *     xato (400/403/409);
   *   • to'g'ri kirish + openingBalance   → 501, va HECH NARSA YOZILMAYDI.
   *
   * Boshiga qo'yish soddaroq bo'lardi, lekin pastga qo'yish paritetni
   * KENGROQ saqlaydi. Yozuvdan KEYIN qo'yish esa mumkin emas: xodim
   * yaratilib, so'ng 501 qaytarilsa yarim holat qolardi.
   */
  async createStaff(
    body: Record<string, any>,
    currentUser: {
      _id?: unknown;
      permissions?: string[];
      allowedBranchIds?: string[];
      canSeeAllBranches?: boolean;
    },
  ) {
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");

    const username = String(body.username).toLowerCase().trim();

    // TELEFON TAKRORLANISHI RUXSAT ETILADI (qarang: schema.prisma, User.phone).
    const usernameTaken = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (usernameTaken) {
      throw new ApiError(409, 'Bunday login (username) allaqachon mavjud');
    }

    // --- ROL tekshiruvi ---
    const targetRole = await this.roles.assertRoleAssignable(body.role);
    // IMTIYOZ OSHIRISHDAN HIMOYA: o'zida yo'q ruxsatli rolni bera olmaydi,
    // va owner rolini faqat owner biriktira oladi.
    await this.roles.assertCanGrantRole(targetRole, currentUser as never);

    // --- FILIAL tekshiruvi ---
    const homeBranchId = body.homeBranchId || null;
    if (!homeBranchId) throw new ApiError(400, 'Filial tanlanishi shart');

    // Direktor faqat O'ZI kira oladigan filialga xodim qo'sha oladi. Bu
    // bo'lmasa u boshqa filialga odam qo'shib, keyin uning OCHIQ
    // MATNDAGI parolini `/:id/password` orqali o'qib olardi.
    assertCanAssignBranch(
      currentUser?.allowedBranchIds,
      currentUser?.canSeeAllBranches,
      homeBranchId,
    );

    const branch = await this.prisma.branch.findFirst({
      where: { id: String(homeBranchId), isDeleted: false },
      select: { id: true, name: true },
    });
    if (!branch) throw new ApiError(400, 'Filial topilmadi');

    // Qo'shimcha filiallar (ixtiyoriy) — har biri ham tekshiriladi.
    const branchAssignments: { branchId: string; role: string | null }[] = [];
    for (const a of body.branchAssignments || []) {
      assertCanAssignBranch(
        currentUser?.allowedBranchIds,
        currentUser?.canSeeAllBranches,
        a.branchId,
      );
      if (a.role) {
        const r = await this.roles.assertRoleAssignable(a.role);
        await this.roles.assertCanGrantRole(r, currentUser as never);
      }
      branchAssignments.push({ branchId: String(a.branchId), role: a.role || null });
    }

    // ⚠ SHU YERDA — barcha tekshiruvlardan KEYIN, birinchi yozuvdan OLDIN.
    this.assertHireSideEffectsMigrated(body);

    const passwordHash = await hashPassword(body.password);

    const user = await this.prisma.user.create({
      data: {
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        username,
        phone: phone || null,
        passwordHash,
        role: body.role,
        homeBranchId: branch.id,
        // Embedded massiv o'rniga alohida jadval — Prisma uni ichma-ich
        // `create` bilan bitta amalda yozadi (qo'shimcha so'rov shart emas).
        branchAssignments: branchAssignments.length
          ? { create: branchAssignments }
          : undefined,
        isActive: true,
        birthDate: body.birthDate ? new Date(body.birthDate) : null,
        // Kalendar kuni (UTC-midnight) — "bugun" mahalliy (Asia/Tashkent) kun bo'yicha.
        hiredAt: body.hiredAt ? parseLocalDay(body.hiredAt) : localTodayMidnight(),
      },
      include: SCOPE_INCLUDE,
    });

    return this.profiles.build(user as never);
  }

  /**
   * `compensation` / `openingBalance` bilan kelgan so'rovni OCHIQ rad
   * etadi. Xato SHAKLI `POST /auth/register-user` dagi bilan AYNAN bir
   * xil — ikkala marshrut bir xil ikki yon ta'sirga ega va klient ularni
   * bir xilda ushlashi kerak.
   */
  private assertHireSideEffectsMigrated(body: Record<string, any>) {
    if (body.compensation || body.openingBalance) {
      throw new ApiError(
        501,
        "Maosh stavkasi va boshlang'ich qoldiq bilan xodim qo'shish " +
          "NestJS'ga hali ko'chirilmagan (moliya moduli kerak). " +
          "Express (5000-port) to'liq ishlaydi.",
        {
          code: 'REGISTER_SIDE_EFFECTS_NOT_MIGRATED',
          details: {
            compensation: Boolean(body.compensation),
            openingBalance: Boolean(body.openingBalance),
          },
        },
      );
    }
  }

  /**
   * ISHGA OLISHNI TASDIQQA YUBORADI (filial delegatsiyasi `approval`
   * bo'lganda). Hech qanday `User` YARATILMAYDI — so'rov "buyruq
   * jurnali", haqiqiy ish tasdiqlangach bajariladi.
   *
   * ⚠ BU YERDA `compensation`/`openingBalance` TEKSHIRUVI YO'Q — VA BU
   * TO'G'RI. So'rov faqat PAYLOAD saqlaydi, hech qanday moliyaviy yon
   * ta'sir bajarmaydi. Ular tasdiqlash paytida ishlaydi, tasdiq
   * bajaruvchilari esa `expense-approvals` da allaqachon ochiq 501
   * (`APPROVAL_EXECUTORS_NOT_MIGRATED`) bilan to'silgan. Ya'ni pul
   * jimgina yo'qolishi mumkin bo'lgan yo'l YO'Q.
   */
  async requestHire(
    body: Record<string, any>,
    currentUser: { _id?: unknown; id?: string },
  ) {
    const username = String(body.username).toLowerCase().trim();
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");

    // Telefon bandligi TEKSHIRILMAYDI — takrorlanish ruxsat etilgan.
    const taken = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (taken) {
      throw new ApiError(409, 'Bunday login (username) allaqachon mavjud');
    }
    if (!body.homeBranchId) throw new ApiError(400, 'Filial tanlanishi shart');

    const branch = await this.prisma.branch.findFirst({
      where: { id: String(body.homeBranchId), isDeleted: false },
      select: { id: true, name: true },
    });
    if (!branch) throw new ApiError(400, 'Filial topilmadi');

    return this.approvals.createRequest({
      branchId: branch.id,
      kind: APPROVAL_KINDS.STAFF_HIRE,
      // ⚠ payload ichida PAROL bor. U o'qish javoblarida (list/getById)
      // olib tashlanadi — `expense-approvals` dagi `stripSensitive()`.
      payload: { ...body, username, phone: phone || undefined },
      // Bitta login uchun bitta kutilayotgan so'rov.
      subjectKey: `staff_hire:${username}`,
      subjectName: `${body.firstName || ''} ${body.lastName || ''}`.trim(),
      contextName: branch.name || '',
      requestNote: body.requestNote,
      currentUser: currentUser as never,
    });
  }
}
