import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  signAccess,
  signRefresh,
  verifyRefresh,
  type JwtSettings,
} from '../../common/utils/jwt.js';
import { hashPassword, comparePassword } from '../../common/utils/password.js';
import { sha256 } from '../../common/utils/hash-token.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { normalizePhone, isPhoneLike } from '../../common/utils/phone.js';
import { parseLocalDay, localTodayMidnight } from '../../common/utils/date.js';
import { PermissionService, hasPermission } from '../../common/rbac/permission.service.js';
import {
  BranchAccessService,
  assertCanAssignBranch,
} from '../../common/rbac/branch-access.service.js';
import { getActiveBranchId } from '../../common/als/branch-context.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { UserProfileService } from './user-profile.service.js';
import type { AppConfig } from '../../config/env.validation.js';
import type { ResolvedRole } from '../../common/rbac/permission.service.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private readonly jwt: JwtSettings;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly branchAccess: BranchAccessService,
    private readonly profiles: UserProfileService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.jwt = {
      accessSecret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      refreshSecret: config.get('JWT_REFRESH_SECRET', { infer: true }),
      accessTtl: config.get('JWT_ACCESS_TTL', { infer: true }),
      refreshTtl: config.get('JWT_REFRESH_TTL', { infer: true }),
    };
  }

  private buildRefreshExpiry = () => new Date(Date.now() + REFRESH_TTL_MS);

  async issueTokens(
    user: { id: string; role: string },
    { userAgent, ip }: { userAgent?: string; ip?: string },
  ) {
    const payload = { sub: String(user.id), role: user.role };
    const accessToken = signAccess(payload, this.jwt);
    const refreshToken = signRefresh(payload, this.jwt);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        userAgent,
        ip,
        expiresAt: this.buildRefreshExpiry(),
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Global `omit` tufayli `passwordHash` odatda umuman kelmaydi — lekin
   * login oqimi uni ATAYLAB so'raydi, shuning uchun bu yerda yana bir
   * bor olib tashlanadi (ikkinchi qulf).
   */
  sanitizeUser(user: Record<string, unknown> | null) {
    if (!user) return user;
    const { passwordHash, ...rest } = user;
    return withLegacyId(rest);
  }

  async login({
    login,
    password,
    userAgent,
    ip,
  }: {
    login: string;
    password: string;
    userAgent?: string;
    ip?: string;
  }) {
    const trimmed = String(login || '').trim();
    if (!trimmed) throw new ApiError(400, 'Login kerak');

    const phone = isPhoneLike(trimmed) ? normalizePhone(trimmed) : null;
    const filters: Record<string, unknown>[] = [{ username: trimmed.toLowerCase() }];
    if (phone) filters.push({ phone });

    // ═══════════════════════════════════════════════════════════════════
    // ⚠ `orderBy: { createdAt: "asc" }` — TARTIB KAFOLATI SHART.
    //
    // Telefon ATAYLAB unique EMAS (bitta raqamdan ota va o'g'il
    // foydalanishi mumkin). Mongo'da sort'siz `findOne` amalda barqaror
    // natija berardi. PostgreSQL'da esa ORDER BY siz qator tartibi
    // rejalashtiruvchiga bog'liq va HAR `lastLoginAt` UPDATE qatorni
    // heap oxiriga siljitadi — ya'ni keyingi urinishda BOSHQA odamning
    // qatori qaytib, TO'G'RI PAROL ham 401 berardi.
    //
    // `isActive`/`isDeleted` ham shart ichida: aks holda arxivlangan
    // qator faol qatorni "bosib" qo'yishi mumkin (fail-closed).
    // ═══════════════════════════════════════════════════════════════════
    const user = await this.prisma.user.findFirst({
      where: { OR: filters, isDeleted: false, isActive: true },
      omit: { passwordHash: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!user || !user.isActive || user.isDeleted) {
      throw new ApiError(401, "Login yoki parol noto'g'ri");
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) throw new ApiError(401, "Login yoki parol noto'g'ri");

    // MUZLATISH: roli muzlatilgan foydalanuvchi KIRA OLMAYDI.
    // ⚠ LOGIN'DA 403 (refresh'da esa 401 — pastga qarang). Farq ATAYLAB:
    // login paytida odam allaqachon login sahifasida, shuning uchun
    // unga SABABNI ko'rsatish kerak; 401 uni yana login sahifasiga
    // uloqtirib, cheksiz halqa hosil qilardi.
    const role = await this.permissions.resolveRole(user.role);
    if (role.isFrozen) {
      throw new ApiError(
        403,
        role.frozenReason
          ? `Rolingiz muzlatilgan: ${role.frozenReason}`
          : "Sizning rolingiz muzlatilgan. Administratorga murojaat qiling",
      );
    }

    const { accessToken, refreshToken } = await this.issueTokens(user, { userAgent, ip });

    // OXIRGI KIRISH — ATAYLAB shu yerda, `issueTokens` ichida EMAS:
    // u token yangilanganda ham chaqiriladi va maydon "oxirgi faollik"ka
    // aylanib qolardi.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user as never),
      // Custom rolda klient landing sahifani bilmaydi (ROLE_HOME map'ida yo'q).
      roleMeta: {
        value: role.value,
        label: role.label,
        roleType: role.roleType,
        defaultPath: role.defaultPath,
      },
    };
  }

  async rotateRefresh({
    rawRefresh,
    userAgent,
    ip,
  }: {
    rawRefresh: string | null;
    userAgent?: string;
    ip?: string;
  }) {
    if (!rawRefresh) throw new ApiError(401, 'Sessiya topilmadi');

    let payload;
    try {
      payload = verifyRefresh(rawRefresh, this.jwt);
    } catch {
      throw new ApiError(401, "Sessiya muddati tugagan");
    }

    const tokenHash = sha256(rawRefresh);
    const now = new Date();
    // ═══════════════════════════════════════════════════════════════════
    // ⚠ POYGA XAVFSIZ (race-safe) — SHARTNI O'ZGARTIRMANG.
    //
    // Shart ichida `revokedAt: null` turibdi, shuning uchun ikkita
    // parallel so'rovdan FAQAT BITTASI yozuvni yopa oladi va
    // `count === 1` oladi. Ikkinchisi 0 olib rad etiladi.
    //
    // Buni `findFirst` + `update` ga bo'lish poygani QAYTARADI.
    // ═══════════════════════════════════════════════════════════════════
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) throw new ApiError(401, 'Sessiya tugagan');

    const user = await this.prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!user || !user.isActive || user.isDeleted) {
      throw new ApiError(401, 'Foydalanuvchi topilmadi');
    }

    // MUZLATISH: ⚠ bu yerda 401 (login'da 403). Eski refresh yuqorida
    // ALLAQACHON revoke qilingan, ya'ni sessiya butunlay tugaydi va
    // klient interceptor'i login sahifasiga olib boradi.
    const role = await this.permissions.resolveRole(user.role);
    if (role.isFrozen) {
      throw new ApiError(
        401,
        "Sizning rolingiz muzlatilgan. Administratorga murojaat qiling",
      );
    }

    const { accessToken, refreshToken } = await this.issueTokens(user, { userAgent, ip });
    return { accessToken, refreshToken, user: this.sanitizeUser(user as never) };
  }

  async logout({ rawRefresh }: { rawRefresh: string | null }) {
    if (!rawRefresh) return;
    const tokenHash = sha256(rawRefresh);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * @param ctx auth middleware hisoblagan filial konteksti. Klient shu
   * ruxsatlar bo'yicha UI quradi, shuning uchun ular serverdagi HAQIQIY
   * ruxsatlar bilan bir xil bo'lishi SHART — aks holda tugma ko'rinadi-yu
   * bosilganda 403 chiqardi.
   */
  async me(
    user: Record<string, unknown>,
    ctx: { effectiveRole?: ResolvedRole; branchId?: string | null } = {},
  ) {
    const [baseRole, profile] = await Promise.all([
      this.permissions.resolveRole(String(user.role)),
      this.profiles.build(user),
    ]);

    const role = ctx.effectiveRole || baseRole;

    // FILIAL: klient tanlagichni shu ro'yxatdan quradi.
    // ⚠ Ro'yxat ASOSIY rol ruxsatlari bilan hisoblanadi — foydalanuvchi
    // qaysi filialda turganidan qat'i nazar, o'zi kira oladigan BARCHA
    // filiallarni tanlagichda ko'rishi kerak.
    const readBranchState = async () => {
      const allowedIds = await this.branchAccess.resolveAllowedBranchIds(
        user as never,
        baseRole.permissions,
      );
      const [list, total] = await Promise.all([
        allowedIds.length
          ? this.prisma.branch.findMany({
              where: { id: { in: allowedIds }, isDeleted: false, isActive: true },
              select: { id: true, name: true, code: true, isMain: true },
              orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
            })
          : [],
        this.prisma.branch.count({ where: { isDeleted: false, isActive: true } }),
      ]);
      return { list: list.map((b) => withLegacyId(b)), total };
    };

    let { list: branches, total: branchCount } = await readBranchState();

    // FILIALSIZ BAZA — O'Z-O'ZINI TIKLASH.
    //
    // Baza ishlab turgan server ostida tozalansa markaz filialsiz qolib,
    // jarayon qayta ishga tushmaguncha TIQILIB turardi: klient bo'sh
    // ro'yxatdan "Barcha filiallar" rejimini yasab, formalarda TANLOVSIZ
    // majburiy "Filial" maydonini ko'rsatardi.
    //
    // Tekshiruv aynan shu yerda: `/auth/me` har sessiyada baribir
    // chaqiriladi va filiallar soni ALLAQACHON o'qilyapti.
    if (branchCount === 0) {
      await this.branchAccess.ensureMainBranch();
      ({ list: branches, total: branchCount } = await readBranchState());
    }

    return {
      user: this.sanitizeUser(user),
      role: role.value || user.role,
      baseRole: user.role,
      permissions: role.permissions,
      branches,
      canSeeAllBranches: hasPermission(
        baseRole.permissions,
        PERMISSIONS.BRANCHES_VIEW_ALL,
      ),
      multiBranch: await this.branchAccess.isMultiBranch(),
      branchCount,
      homeBranchId: user.homeBranchId ? String(user.homeBranchId) : null,
      roleMeta: {
        value: role.value,
        label: role.label,
        roleType: role.roleType,
        defaultPath: role.defaultPath,
        isSystem: role.exists ? role.isSystem : true,
        permissionsVersion: role.permissionsVersion,
      },
      profile,
    };
  }

  async updateProfile(
    currentUser: { id?: string; _id?: string },
    body: Record<string, unknown>,
  ) {
    const userId = String(currentUser.id || currentUser._id);
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) throw new ApiError(404, 'Foydalanuvchi topilmadi');

    // Faqat KELGAN maydonlar yoziladi — berilmagani umuman tegilmaydi.
    const data: Record<string, unknown> = {};

    // Telefon takrorlanishi BLOKLANMAYDI (schema'da unique EMAS).
    if (body.phone !== undefined) {
      const phone = body.phone ? normalizePhone(body.phone) : null;
      if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");
      data.phone = phone || null;
    }
    if (body.firstName !== undefined) data.firstName = String(body.firstName).trim();
    if (body.lastName !== undefined) data.lastName = String(body.lastName).trim();
    if (body.birthDate !== undefined) {
      data.birthDate = body.birthDate ? new Date(body.birthDate as string) : null;
    }
    if (body.gender !== undefined) data.gender = body.gender || null;

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return this.sanitizeUser(user as never);
  }

  async changePassword(
    currentUser: { id?: string; _id?: string },
    { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
  ) {
    const userId = String(currentUser.id || currentUser._id);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: false },
    });
    if (!user) throw new ApiError(404, 'Foydalanuvchi topilmadi');

    const ok = await comparePassword(currentPassword, user.passwordHash);
    if (!ok) throw new ApiError(400, "Joriy parol noto'g'ri");

    // ⚠ PAROL YANGILASH VA ESKI SESSIYALARNI YOPISH — BITTA TRANZAKSIYADA.
    //
    // Ikki alohida so'rov bo'lsa, oradagi xato "parol o'zgardi, lekin
    // eski sessiyalar TIRIK" degan xavfli holatni qoldirardi.
    // BU IKKISINI AJRATMANG.
    const newHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async registerUser(
    body: Record<string, any>,
    scope: {
      allowedBranchIds?: string[];
      canSeeAllBranches?: boolean;
      userId?: string | null;
    } = {},
  ) {
    // ═══════════════════════════════════════════════════════════════════
    // ⚠⚠ KO'CHIRILMAGAN YON TA'SIRLAR — JIMGINA TASHLAB KETILMAYDI ⚠⚠
    //
    // Express `registerUser` ikkita IXTIYORIY yon ta'sir bajaradi:
    //   • `compensation`   → teacherCompensation.setCompensation
    //   • `openingBalance` → openingBalance.create
    //
    // Ikkalasi ham ko'chirilmagan MOLIYA zanjiriga tayanadi
    // (teacherSalary 1151 qator; deposits + staffPayroll). Bu Faza F ishi.
    //
    // Ularni JIMGINA o'tkazib yuborish PUL MA'LUMOTINI YO'QOTARDI —
    // aynan Express kodi ehtiyot bo'ladigan holat (u xatoni
    // `openingBalanceError` bo'lib javobga qaytaradi). Shuning uchun
    // bu yerda OCHIQ rad etiladi.
    // ═══════════════════════════════════════════════════════════════════
    if (body.compensation || body.openingBalance) {
      throw new ApiError(
        501,
        "Maosh stavkasi va boshlang'ich qoldiq bilan xodim qo'shish " +
          "NestJS'ga hali ko'chirilmagan (moliya moduli kerak). " +
          'Express (5000-port) to\'liq ishlaydi.',
        {
          code: 'REGISTER_SIDE_EFFECTS_NOT_MIGRATED',
          details: {
            compensation: Boolean(body.compensation),
            openingBalance: Boolean(body.openingBalance),
          },
        },
      );
    }

    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");

    const username = String(body.username).toLowerCase().trim();

    // TELEFON TAKRORLANISHI RUXSAT ETILADI; login (username) esa YAGONA —
    // u autentifikatsiya kaliti.
    const usernameTaken = await this.prisma.user.findUnique({ where: { username } });
    if (usernameTaken) {
      throw new ApiError(409, "Bunday login (username) allaqachon mavjud");
    }

    if (![ROLES.TEACHER, ROLES.STUDENT].includes(body.role)) {
      throw new ApiError(400, "Noto'g'ri rol");
    }

    // FILIAL MAJBURIY: filialsiz odam `userBranchCondition()` bo'yicha
    // faqat view_all egalariga ko'rinadi — ya'ni "umumiy"da osilib
    // qoladi va o'z filialida YO'Q bo'lardi.
    const homeBranchId = body.homeBranchId || getActiveBranchId() || null;
    if (!homeBranchId) {
      throw new ApiError(
        400,
        "Filial tanlanmagan. Foydalanuvchi qo'shish uchun avval aniq filialni tanlang",
      );
    }

    // IMTIYOZ OSHIRISHDAN HIMOYA: tanlangan filial chaqiruvchining O'Z
    // ko'lamida ekani tekshiriladi — aks holda bir filial direktori
    // boshqasiga odam qo'shib, keyin uning parolini o'qib olardi.
    assertCanAssignBranch(scope.allowedBranchIds, Boolean(scope.canSeeAllBranches), homeBranchId);

    const passwordHash = await hashPassword(body.password);

    const doc: Record<string, unknown> = {
      firstName: String(body.firstName).trim(),
      lastName: String(body.lastName).trim(),
      username,
      phone: phone || null,
      passwordHash,
      role: body.role,
      isActive: true,
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      homeBranchId,
    };

    if (body.role === ROLES.STUDENT) {
      doc.gender = body.gender || null;
      // Kalendar kuni (UTC-midnight) — "bugun" MAHALLIY kun bo'yicha,
      // aks holda 00:00–05:00 oralig'ida kechagi kun tushardi.
      doc.enrolledAt = body.enrolledAt ? parseLocalDay(body.enrolledAt) : localTodayMidnight();
    }
    if (body.role === ROLES.TEACHER) {
      doc.hiredAt = body.hiredAt ? parseLocalDay(body.hiredAt) : localTodayMidnight();
    }

    const user = await this.prisma.user.create({ data: doc as never });
    return this.sanitizeUser(user as never);
  }
}
