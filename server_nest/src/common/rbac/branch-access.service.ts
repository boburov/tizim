import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../errors/api-error.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from './permission.service.js';

/**
 * `server/src/helpers/branchAccess.helper.js` NING KO'CHIRMASI.
 * Filialga kirish huquqini hisoblash. Auth middleware'dan keyin ishlaydi.
 */

export interface BranchScope {
  branchId: string | null;
  allowedBranchIds: string[];
  canSeeAllBranches: boolean;
}

export interface ScopedUser {
  role: string;
  homeBranchId?: string | null;
  branchAssignments?: { branchId: string; role?: string | null }[];
}

/**
 * Nishon foydalanuvchi joriy foydalanuvchining ko'lamida turadimi.
 *
 * ⚠ DIQQAT: parollar OCHIQ MATNDA saqlanadi. Shuning uchun
 * `/:id/password` shu tekshiruvsiz qolsa, filial direktori boshqa
 * filial xodimining parolini o'qib olardi.
 */
export const assertTargetInScope = (
  actorAllowedIds: string[] | undefined,
  canSeeAll: boolean,
  targetUser: ScopedUser,
): void => {
  if (canSeeAll) return;

  const targetBranchIds = new Set<string>();
  if (targetUser.homeBranchId) targetBranchIds.add(String(targetUser.homeBranchId));
  for (const a of targetUser.branchAssignments || []) {
    if (a?.branchId) targetBranchIds.add(String(a.branchId));
  }

  // Nishon hech qaysi filialga biriktirilmagan — faqat view_all ko'radi.
  if (targetBranchIds.size === 0) {
    throw new ApiError(403, "Bu foydalanuvchiga kirish huquqingiz yo'q");
  }

  const overlap = (actorAllowedIds || []).some((id) => targetBranchIds.has(String(id)));
  if (!overlap) {
    throw new ApiError(403, "Bu foydalanuvchiga kirish huquqingiz yo'q");
  }
};

/**
 * IMTIYOZ OSHIRISHDAN HIMOYA. Filial direktori faqat O'ZI kira oladigan
 * filialga foydalanuvchi biriktira/ko'chira oladi.
 */
export const assertCanAssignBranch = (
  actorAllowedIds: string[] | undefined,
  canSeeAll: boolean,
  targetBranchId: unknown,
): void => {
  if (canSeeAll) return;
  if (!targetBranchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
  const ok = (actorAllowedIds || []).some((id) => String(id) === String(targetBranchId));
  if (!ok) throw new ApiError(403, "Bu filialga foydalanuvchi biriktira olmaysiz");
};

/**
 * Foydalanuvchining SHU FILIALDAGI roli.
 * `branchAssignments` da o'ziga xos rol bo'lsa o'sha, aks holda asosiy rol.
 * Shu tufayli bitta odam A filialda direktor, B da o'qituvchi bo'la oladi.
 */
export const resolveRoleForBranch = (
  user: ScopedUser,
  branchId: string | null,
): string => {
  if (!branchId) return user.role;
  const assignment = (user.branchAssignments || []).find(
    (a) => String(a.branchId) === String(branchId),
  );
  return assignment?.role || user.role;
};

@Injectable()
export class BranchAccessService {
  private readonly logger = new Logger('BranchAccess');

  // ASOSIY FILIAL / KO'P FILIALLILIK KESHI — har so'rovda kerak bo'ladi.
  private mainBranchIdCache: string | null | undefined;
  private multiBranchCache: boolean | undefined;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  clearMainBranchCache(): void {
    this.mainBranchIdCache = undefined;
    this.multiBranchCache = undefined;
  }

  /**
   * MARKAZ KO'P FILIALLIMI — BAZADAN aniqlanadi (env bayrog'i EMAS).
   * Faol filiallar soni > 1 bo'lsa markaz ko'p filialli.
   */
  async isMultiBranch(): Promise<boolean> {
    if (this.multiBranchCache !== undefined) return this.multiBranchCache;
    const rows = await this.prisma.branch.findMany({
      where: { isDeleted: false, isActive: true },
      select: { id: true },
      take: 2,
    });
    this.multiBranchCache = rows.length > 1;
    return this.multiBranchCache;
  }

  /** Markazning ASOSIY filiali (isMain), zaxira bilan. */
  async resolveMainBranchId(): Promise<string | null> {
    if (this.mainBranchIdCache !== undefined) return this.mainBranchIdCache;
    const main =
      (await this.prisma.branch.findFirst({
        where: { isMain: true, isDeleted: false },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })) ||
      (await this.prisma.branch.findFirst({
        where: { isDeleted: false },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      }));
    this.mainBranchIdCache = main ? String(main.id) : null;
    return this.mainBranchIdCache;
  }

  private findAnyBranch() {
    return this.prisma.branch.findFirst({
      where: { isDeleted: false },
      select: { id: true, name: true, isMain: true, isActive: true },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * INVARIANT: markazda KAMIDA BITTA filial BO'LADI. Idempotent.
   * `branchId` ko'p modelda majburiy — filialsiz bazada har qanday
   * yozish amali yiqilardi.
   */
  async ensureMainBranch() {
    const existing = await this.findAnyBranch();
    if (existing) return existing;
    try {
      const branch = await this.prisma.branch.create({
        data: { name: 'Asosiy filial', code: 'MAIN', isMain: true, isActive: true },
      });
      this.clearMainBranchCache();
      this.logger.log(`Asosiy filial avtomatik yaratildi (${branch.id})`);
      return branch;
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      this.clearMainBranchCache();
      return this.findAnyBranch();
    }
  }

  /** Foydalanuvchi kira oladigan filiallar. view_all → barchasi. */
  async resolveAllowedBranchIds(
    user: ScopedUser,
    permissions: string[],
  ): Promise<string[]> {
    if (hasPermission(permissions, PERMISSIONS.BRANCHES_VIEW_ALL)) {
      const all = await this.prisma.branch.findMany({
        where: { isDeleted: false },
        select: { id: true },
      });
      return all.map((b) => String(b.id));
    }

    const ids = new Set<string>();
    if (user.homeBranchId) ids.add(String(user.homeBranchId));
    for (const a of user.branchAssignments || []) {
      if (a?.branchId) ids.add(String(a.branchId));
    }
    return [...ids];
  }

  /**
   * So'rovdagi filialni validatsiya qiladi va yakuniy ko'lamni qaytaradi.
   *
   * ⚠ QAROR JADVALI O'ZGARTIRILMASIN — har bir shox aniq sabab bilan.
   */
  async resolveBranchScope({
    user,
    permissions,
    requestedBranchId,
  }: {
    user: ScopedUser;
    permissions: string[];
    requestedBranchId?: string | null;
  }): Promise<BranchScope> {
    const canSeeAll = hasPermission(permissions, PERMISSIONS.BRANCHES_VIEW_ALL);
    const allowedBranchIds = await this.resolveAllowedBranchIds(user, permissions);

    // YAKKA MARKAZ REJIMI — hamma narsa ASOSIY filialga qisqartiriladi.
    if (!(await this.isMultiBranch())) {
      const mainId = await this.resolveMainBranchId();

      // Hali birorta filial yo'q (yangi o'rnatma) — tabiiy ko'lamda
      // qolamiz, aks holda foydalanuvchi bo'sh ekranga qamalib qolardi.
      if (!mainId) {
        return { branchId: null, allowedBranchIds, canSeeAllBranches: canSeeAll };
      }

      // IMTIYOZ OSHIRISHDAN HIMOYA: asosiy filialni foydalanuvchining O'Z
      // ro'yxati bilan kesishtiramiz. Faqat B filialiga biriktirilgan
      // direktor aks holda asosiy filial ma'lumotini ko'rib qolardi.
      const scoped = allowedBranchIds.includes(mainId) ? [mainId] : [];

      return {
        branchId: scoped.length ? mainId : null,
        allowedBranchIds: scoped,
        canSeeAllBranches: false,
      };
    }

    // "all" so'ralgan: faqat view_all huquqi borlar uchun.
    if (requestedBranchId === 'all' && canSeeAll) {
      return { branchId: null, allowedBranchIds, canSeeAllBranches: true };
    }

    // ⚠ Ruxsat etilmagan filial so'ralsa 403 TASHLAMAYMIZ — E'TIBORSIZ
    // QOLDIRAMIZ. Filial ID client'da localStorage'da turadi va eskirishi
    // mumkin (filial o'chirilgan, foydalanuvchi undan chiqarilgan). Bu
    // yerda 403 tashlansa `/auth/me` ham yiqilardi va foydalanuvchi
    // TIZIMGA UMUMAN KIRA OLMAY QOLARDI.
    //
    // Xavfsizlik yo'qolmaydi: pastda foydalanuvchi baribir FAQAT o'z
    // filiallari doirasiga tushadi va `branchFilter` uni `in` bilan
    // cheklaydi.
    if (requestedBranchId && requestedBranchId !== 'all') {
      const allowed = allowedBranchIds.some((id) => id === String(requestedBranchId));
      if (allowed) {
        return {
          branchId: String(requestedBranchId),
          allowedBranchIds,
          canSeeAllBranches: canSeeAll,
        };
      }
      // Yaroqsiz — e'tiborsiz qoldiramiz va standart ko'lamga tushamiz.
    }

    if (canSeeAll) {
      return { branchId: null, allowedBranchIds, canSeeAllBranches: true };
    }

    if (allowedBranchIds.length === 1) {
      return {
        branchId: allowedBranchIds[0],
        allowedBranchIds,
        canSeeAllBranches: false,
      };
    }

    return { branchId: null, allowedBranchIds, canSeeAllBranches: false };
  }
}
