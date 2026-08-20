import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES, ROLE_TYPES } from '../../common/constants/permissions.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { hashPassword } from '../../common/utils/password.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import {
  toUtcMidnight,
  parseLocalDay,
  isFutureLocalDay,
} from '../../common/utils/date.js';
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
  ) {}

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
}
