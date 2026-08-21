import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../errors/api-error.js';
import { ROLES, ROLE_TYPES } from '../constants/permissions.js';
import { hasPermission } from './permission.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `server/src/helpers/roles.helper.js` NING KO'CHIRMASI.
 *
 * Bazaga tegmaydigan funksiyalar MODUL DARAJASIDA qoldirildi (Express'da
 * ham shunday chaqiriladi va ularni sinf metodiga aylantirish har bir
 * chaqiruv joyini o'zgartirishni talab qilardi). Bazaga tegadiganlari
 * `RolesHelperService` ichida — ular `prisma` ni DI orqali oladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** "Bosh buxgalter" → "bosh-buxgalter" */
export const slugifyRole = (label: unknown): string =>
  String(label || '')
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/**
 * PRIVILEGE ESCALATION HIMOYASI.
 *
 * Rol yaratayotgan/tahrirlayotgan foydalanuvchi O'ZIDA yo'q ruxsatni
 * boshqa rolga BERA OLMAYDI. Owner `["*"]` bo'lgani uchun undan o'tadi.
 */
export const assertCanGrantPermissions = (
  currentPermissions: string[] | undefined | null,
  permissionKeys: string[],
): void => {
  const missing = permissionKeys.filter((key) => !hasPermission(currentPermissions, key));
  if (missing.length) {
    throw new ApiError(
      403,
      "O'zingizda mavjud bo'lmagan ruxsatni bera olmaysiz: " + missing.join(', '),
    );
  }
};

/** Built-in rolni himoya qilish. */
export const assertNotSystemRole = (
  role: { isSystem?: boolean | null },
  action = "o'zgartirib",
): void => {
  if (role.isSystem) {
    throw new ApiError(400, `Tizim rolini ${action} bo'lmaydi`);
  }
};

/** Owner o'z rolini yoki o'zini qulflab qo'ymasligi uchun. */
export const assertNotSelfRoleChange = (
  currentUser: { id?: unknown; _id?: unknown },
  targetUserId: unknown,
): void => {
  if (String(currentUser.id || currentUser._id) === String(targetUserId)) {
    throw new ApiError(400, "O'z rolingizni o'zgartira olmaysiz");
  }
};

export interface RoleCatalogEntry {
  value: string;
  label: string;
  roleType: string;
  isFrozen: boolean;
  isSystem: boolean;
}

/**
 * XODIM = o'quvchi TIPIDAGI rollardan boshqa hamma (owner + staff + teacher).
 *
 * Rol NOMIGA emas TIPIGA qaraydi: "Katta o'qituvchi" nomli custom rol
 * `roleType="teacher"` bo'lsa xodim hisoblanadi. Shu sababli qattiq
 * ro'yxat yozilmaydi: ertaga yaratilgan rol avtomatik to'g'ri tomonga tushadi.
 */
export const staffRoleFilter = (
  catalog: Map<string, RoleCatalogEntry>,
): { notIn: string[] } => {
  const studentValues = [...catalog.values()]
    .filter((r) => r.roleType === ROLE_TYPES.STUDENT)
    .map((r) => r.value);
  // Katalog bo'sh yoki student roli o'chirilgan bo'lsa ham built-in
  // qiymat chetlab o'tilmasin.
  if (!studentValues.includes(ROLES.STUDENT)) studentValues.push(ROLES.STUDENT);
  return { notIn: studentValues };
};

/** `roleType` bo'yicha tekshiruv — rol NOMIGA emas, TIPIGA qaraydi. */
export const isTeacherLike = (roleDoc: { roleType?: string } | null | undefined): boolean =>
  roleDoc?.roleType === ROLE_TYPES.TEACHER;
export const isStudentLike = (roleDoc: { roleType?: string } | null | undefined): boolean =>
  roleDoc?.roleType === ROLE_TYPES.STUDENT;
export const isOwnerLike = (roleDoc: { roleType?: string } | null | undefined): boolean =>
  roleDoc?.roleType === ROLE_TYPES.OWNER;

@Injectable()
export class RolesHelperService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Nom band bo'lsa oxiriga raqam qo'shadi: buxgalter, buxgalter-2, ... */
  async generateUniqueRoleValue(label: unknown): Promise<string> {
    const base = slugifyRole(label) || 'rol';
    let value = base;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await this.prisma.role.findUnique({ where: { value }, select: { id: true } })) {
      n += 1;
      value = `${base}-${n}`;
    }
    return value;
  }

  /**
   * ROL KATALOGI: value → { value, label, roleType, isFrozen, isSystem }.
   *
   * `Role` jadvali kichik (odatda 20 dan kam qator), shuning uchun bitta
   * to'liq o'qish har qator uchun `resolveRole()` chaqirishdan (N+1) arzonroq.
   */
  async loadRoleCatalog(): Promise<Map<string, RoleCatalogEntry>> {
    const docs = await this.prisma.role.findMany({
      select: {
        value: true,
        label: true,
        roleType: true,
        isFrozen: true,
        isSystem: true,
      },
    });
    return new Map(docs.map((r) => [r.value, r as RoleCatalogEntry]));
  }

  /**
   * Rol mavjudmi va foydalanuvchiga biriktirsa bo'ladimi.
   * `User.role` da enum bo'lmagani uchun YAGONA himoya shu.
   */
  async assertRoleAssignable(value: string) {
    const role = await this.prisma.role.findUnique({ where: { value } });
    if (!role) throw new ApiError(400, 'Bunday rol mavjud emas');
    if (role.isFrozen) {
      throw new ApiError(400, "Muzlatilgan rolni foydalanuvchiga biriktirib bo'lmaydi");
    }
    return role;
  }

  /**
   * ROLNI BIRIKTIRISHDAN OLDINGI HIMOYA.
   *
   * `assertCanGrantPermissions` ruxsatlar RO'YXATINI tekshiradi (rol
   * yaratishda), bu esa TAYYOR ROLNI odamga biriktirishni tekshiradi.
   * Ikkalasi ham kerak: aks holda direktor o'zi yarata olmaydigan kuchli
   * rolni mavjudlaridan tanlab, odamga biriktirib qo'yardi.
   */
  async assertCanGrantRole(
    targetRole: { id?: unknown; _id?: unknown; value?: string; roleType?: string } | null,
    currentUser: { permissions?: string[]; role?: string } | null | undefined,
  ): Promise<void> {
    const actorPerms = currentUser?.permissions || [];

    // Owner (`["*"]`) hamma narsani qila oladi.
    if (hasPermission(actorPerms, '*')) return;

    // OWNER rolini faqat owner biriktira oladi.
    if (targetRole?.value === ROLES.OWNER || targetRole?.roleType === ROLE_TYPES.OWNER) {
      throw new ApiError(403, "Ega rolini biriktirish huquqingiz yo'q");
    }

    const populated = await this.prisma.role.findUnique({
      where: { id: String(targetRole?.id || targetRole?._id) },
      include: { permissions: { select: { key: true } } },
    });
    const keys = (populated?.permissions || []).map((p) => p.key);
    assertCanGrantPermissions(actorPerms, keys);
  }

  /** Oxirgi owner o'chirilmasin/rolidan ayrilmasin. */
  async assertNotLastOwner(targetUserId: unknown): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: String(targetUserId) },
    });
    if (!target || target.role !== ROLES.OWNER) return;

    const owners = await this.prisma.user.count({
      where: {
        role: ROLES.OWNER,
        isActive: true,
        isDeleted: false,
        id: { not: String(targetUserId) },
      },
    });
    if (owners === 0) {
      throw new ApiError(400, "Tizimdagi yagona egani o'zgartirib bo'lmaydi");
    }
  }

  /** Rolda nechta o'chirilmagan foydalanuvchi bor. */
  countRoleUsers(value: string): Promise<number> {
    return this.prisma.user.count({ where: { role: value, isDeleted: false } });
  }
}
