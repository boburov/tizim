import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  COIN_OWNER_ONLY_PERMISSIONS,
} from '../../common/constants/coin.js';
import { OWNER_ONLY_PERMISSIONS } from '../../common/constants/permission-scope.js';
import { ApiError } from '../../common/errors/api-error.js';
import { PermissionService } from '../../common/rbac/permission.service.js';
import {
  RolesHelperService,
  assertCanGrantPermissions,
  assertCanAssignRoleType,
  assertOwnerOnlyKeysNotGranted,
  assertNotSystemRole,
} from '../../common/rbac/roles.helper.js';
import {
  ACTION_ORDER,
  getActionLabel,
  getActionOrder,
  ROLE_TYPES,
  DEFAULT_ROLE_PATH,
  type RoleTypeValue,
} from '../../common/constants/permissions.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-request.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROLLAR — `server/src/modules/roles/services/roles.service.js` KO'CHIRMASI.
 *
 * ── ⚠ MUTATSIYALAR VA ROL KESHI ⚠ ──
 *
 * `invalidateRoleCache()` JARAYONGA XOS: u faqat SHU jarayonning keshini
 * tozalaydi. Express va NestJS bir vaqtda ishlab turganda ikkalasi ham
 * yozsa, birida qilingan o'zgarish ikkinchisining keshini tozalamasdi va
 * u 5 daqiqagacha eski ruxsatlar bilan ishlab turardi.
 *
 * SHUNING UCHUN KELISHUV O'ZGARMAYDI: bu metodlar KODDA mavjud va
 * testlanadi, lekin **HAQIQIY TRAFIK to'liq cutover'gacha Express'da
 * qoladi** — ya'ni amalda YOZUVCHI DOIM BITTA bo'ladi. Redis ham,
 * pub/sub ham, TTL qisqartirish ham KERAK EMAS: ular mavjud bo'lmagan
 * muammoni "hal qilardi".
 *
 * Cutover'dan keyin NestJS yagona jarayon bo'ladi va `invalidateRoleCache()`
 * yana o'z-o'zicha yetarli bo'ladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `roles.service.js` dagi `shapeRole` ning aynan ko'chirmasi. */
const shapeRole = (doc: any, userCount = 0) => ({
  id: String(doc.id),
  _id: String(doc.id),
  value: doc.value,
  label: doc.label,
  description: doc.description || '',
  roleType: doc.roleType,
  defaultPath: doc.defaultPath,
  isSystem: Boolean(doc.isSystem),
  isFrozen: Boolean(doc.isFrozen),
  frozenAt: doc.frozenAt || null,
  frozenReason: doc.frozenReason || '',
  permissionIds: (doc.permissions || []).map((p: any) => String(p?.id ? p.id : p)),
  permissionKeys: (doc.permissions || []).filter((p: any) => p?.key).map((p: any) => p.key),
  userCount,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/**
 * Egadan boshqa hech kimga berilmaydigan kalitlar.
 *
 * ⚠ IKKI RO'YXAT BIRLASHTIRILADI — `migrate-director-full-access.seed.ts`
 * ham AYNAN shu ikkalasini olib tashlaydi. Bittasi unutilsa, seed
 * tozalaydigan kalitni yozish yo'li ochiq qolardi va ular bir-biri bilan
 * kurashardi.
 */
const ALL_OWNER_ONLY_KEYS: readonly string[] = Object.freeze([
  ...OWNER_ONLY_PERMISSIONS,
  ...COIN_OWNER_ONLY_PERMISSIONS,
]);

@Injectable()
export class RolesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly helper: RolesHelperService,
  ) {}

  /**
   * MATRITSA — tizimda MAVJUD ruxsatlardan module × action jadvalini quradi.
   *
   * Frontend hech narsani hardcode qilmaydi: qatorlar ham, ustunlar ham
   * shu javobdan keladi. Yangi ruxsat qo'shilsa jadvalga o'zi tushadi.
   */
  async getMatrix() {
    const perms = await this.prisma.permission.findMany();

    const actionSet = new Set<string>();
    const moduleMap = new Map<
      string,
      { module: string; label: string; order: number; cells: Record<string, unknown> }
    >();

    for (const p of perms) {
      actionSet.add(p.action);

      if (!moduleMap.has(p.module)) {
        moduleMap.set(p.module, {
          module: p.module,
          label: p.moduleLabel || p.module,
          order: p.moduleOrder ?? 999,
          cells: {},
        });
      }
      // Katak = shu modulda shu action mavjud degani. Katak yo'q bo'lsa
      // frontend BO'SH chizadi (checkbox umuman ko'rsatilmaydi).
      moduleMap.get(p.module)!.cells[p.action] = {
        id: String(p.id),
        key: p.key,
        label: p.label,
      };
    }

    const actions = [...actionSet]
      .sort((a, b) => getActionOrder(a) - getActionOrder(b) || a.localeCompare(b))
      .map((action) => ({
        key: action,
        label: getActionLabel(action),
        // Standart CRUD ustunlarimi yoki modulga xos qo'shimcha action.
        isCore: ACTION_ORDER.slice(0, 4).includes(action),
      }));

    const modules = [...moduleMap.values()].sort(
      (a, b) => a.order - b.order || a.label.localeCompare(b.label),
    );

    return { actions, modules };
  }

  async list() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { select: { id: true, key: true } } },
      orderBy: [{ isSystem: 'desc' }, { label: 'asc' }],
    });

    // Har rolda nechta foydalanuvchi borligini BITTA groupBy bilan olamiz.
    const counts = await this.prisma.user.groupBy({
      by: ['role'],
      where: { isDeleted: false },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.role, c._count._all]));

    return roles.map((r) => shapeRole(r, countMap.get(r.value) || 0));
  }

  async getByValue(value: string) {
    const role = await this.prisma.role.findUnique({
      where: { value },
      include: { permissions: { select: { id: true, key: true } } },
    });
    if (!role) throw new ApiError(404, 'Rol topilmadi');
    return shapeRole(role, await this.helper.countRoleUsers(value));
  }

  /**
   * Berilgan identifikatorlar haqiqiy ruxsatligini tekshiradi va ularning
   * kalitlarini qaytaradi (escalation tekshiruvi uchun kerak).
   */
  private async resolvePermissionIds(permissionIds: string[] = []) {
    if (!permissionIds.length) return { ids: [] as string[], keys: [] as string[] };
    const docs = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds.map(String) } },
      select: { id: true, key: true },
    });
    if (docs.length !== new Set(permissionIds.map(String)).size) {
      throw new ApiError(400, "Noto'g'ri ruxsat identifikatori yuborildi");
    }
    return { ids: docs.map((d) => d.id), keys: docs.map((d) => d.key) };
  }

  async create(
    body: {
      label: string;
      description?: string;
      permissionIds?: string[];
      roleType?: RoleTypeValue;
      defaultPath?: string;
    },
    _currentUser: AuthenticatedUser | undefined,
    currentPermissions: string[] | undefined,
  ) {
    const label = String(body.label).trim();

    const exists = await this.prisma.role.findFirst({ where: { label } });
    if (exists) throw new ApiError(409, 'Bunday nomli rol allaqachon mavjud');

    const { ids, keys } = await this.resolvePermissionIds(body.permissionIds);
    // Privilege escalation himoyasi.
    assertCanGrantPermissions(currentPermissions, keys);
    // ⚠ YANGI ROL HECH QACHON `owner` bo'lmaydi (o'sha nom band), ya'ni
    // owner-only kalitlar bu yerda har doim rad etiladi.
    assertOwnerOnlyKeysNotGranted(null, keys, ALL_OWNER_ONLY_KEYS);
    // Rol TIPI ruxsat emas — yuqoridagi tekshiruv uni ko'rmaydi.
    assertCanAssignRoleType(currentPermissions, body.roleType);

    const value = await this.helper.generateUniqueRoleValue(label);

    const role = await this.prisma.role.create({
      data: {
        value,
        label,
        description: body.description || '',
        // Ko'p-ko'pga bog'lanish: `connect` join jadvaliga qator qo'shadi.
        permissions: { connect: ids.map((id) => ({ id })) },
        roleType: body.roleType || ROLE_TYPES.STAFF,
        defaultPath: body.defaultPath || DEFAULT_ROLE_PATH,
        isSystem: false,
      },
    });

    this.permissions.invalidateRoleCache(value);
    return this.getByValue(role.value);
  }

  async update(
    value: string,
    body: {
      label?: string;
      description?: string;
      permissionIds?: string[];
      roleType?: RoleTypeValue;
      defaultPath?: string;
    },
    _currentUser: AuthenticatedUser | undefined,
    currentPermissions: string[] | undefined,
  ) {
    const role = await this.prisma.role.findUnique({ where: { value } });
    if (!role) throw new ApiError(404, 'Rol topilmadi');

    const data: Record<string, unknown> = {};

    // Tizim rolining ruxsatlarini o'zgartirish mumkin, lekin tipini/nomini yo'q.
    if (role.isSystem && (body.roleType || body.label)) {
      throw new ApiError(400, "Tizim rolining nomi va tipini o'zgartirib bo'lmaydi");
    }

    if (body.label !== undefined && !role.isSystem) {
      const label = String(body.label).trim();
      const taken = await this.prisma.role.findFirst({
        where: { label, id: { not: role.id } },
      });
      if (taken) throw new ApiError(409, 'Bunday nomli rol allaqachon mavjud');
      data.label = label;
    }

    if (body.permissionIds !== undefined) {
      const { ids, keys } = await this.resolvePermissionIds(body.permissionIds);
      assertCanGrantPermissions(currentPermissions, keys);
      assertOwnerOnlyKeysNotGranted(role.value, keys, ALL_OWNER_ONLY_KEYS);
      // `set` — BARCHA eski bog'lanishni almashtiradi.
      data.permissions = { set: ids.map((id) => ({ id })) };
      data.permissionsVersion = { increment: 1 };
    }

    if (body.description !== undefined) data.description = body.description;
    if (body.defaultPath !== undefined) data.defaultPath = body.defaultPath;
    if (body.roleType !== undefined && !role.isSystem) {
      // Rol TIPI ruxsat emas — `assertOwnerOnlyKeysNotGranted` uni ko'rmaydi.
      assertCanAssignRoleType(currentPermissions, body.roleType);
      data.roleType = body.roleType;
    }

    await this.prisma.role.update({ where: { value }, data });
    this.permissions.invalidateRoleCache(value);
    return this.getByValue(value);
  }

  /**
   * MUZLATISH — muzlatilgan rol egasi tizimga kira olmaydi: login rad
   * etiladi va mavjud sessiya `AuthMiddleware` da uziladi.
   */
  async setFrozen(
    value: string,
    { isFrozen, reason }: { isFrozen: boolean; reason?: string },
    currentUser: AuthenticatedUser,
  ) {
    const role = await this.prisma.role.findUnique({ where: { value } });
    if (!role) throw new ApiError(404, 'Rol topilmadi');

    assertNotSystemRole(role, 'muzlatib');

    // O'zining roli — o'zini tizimdan qulflab qo'ymasin.
    if (currentUser.role === value) {
      throw new ApiError(400, "O'z rolingizni muzlata olmaysiz");
    }

    await this.prisma.role.update({
      where: { value },
      data: {
        isFrozen: Boolean(isFrozen),
        frozenAt: isFrozen ? new Date() : null,
        frozenById: isFrozen ? String(currentUser.id || currentUser._id) : null,
        frozenReason: isFrozen ? reason || '' : '',
      },
    });
    // Keshni darhol tozalaymiz — muzlatish keyingi so'rovdayoq ishlaydi.
    this.permissions.invalidateRoleCache(value);

    return this.getByValue(value);
  }

  async remove(value: string, { migrateTo }: { migrateTo?: string } = {}) {
    const role = await this.prisma.role.findUnique({ where: { value } });
    if (!role) throw new ApiError(404, 'Rol topilmadi');

    assertNotSystemRole(role, "o'chirib");

    const userCount = await this.helper.countRoleUsers(value);
    if (userCount > 0) {
      if (!migrateTo) {
        throw new ApiError(
          400,
          `Bu rolda ${userCount} ta foydalanuvchi bor. Avval ularni boshqa rolga o'tkazing`,
        );
      }
      const target = await this.prisma.role.findUnique({ where: { value: migrateTo } });
      if (!target) throw new ApiError(400, "Ko'chiriladigan rol topilmadi");
      if (target.isFrozen) {
        throw new ApiError(400, "Muzlatilgan rolga ko'chirib bo'lmaydi");
      }
      await this.prisma.user.updateMany({
        where: { role: value },
        data: { role: migrateTo },
      });
      this.permissions.invalidateRoleCache(migrateTo);
    }

    await this.prisma.role.delete({ where: { value } });
    this.permissions.invalidateRoleCache(value);

    return { value, migratedUsers: userCount };
  }
}
