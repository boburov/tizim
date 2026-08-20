import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../errors/api-error.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { hasPermission } from './permission.service.js';
import { getBranchContext, isBranchAllowed } from '../als/branch-context.js';

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
  // ⚠ `undefined` ATAYLAB QABUL QILINADI va FALSY sifatida ishlaydi —
  // Express'dagi bilan aynan bir xil. Bu FAIL-CLOSED: ko'lam noma'lum
  // bo'lsa tekshiruv o'tkazib yuborilmaydi, aksincha — bajariladi.
  canSeeAll: boolean | undefined,
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
  canSeeAll: boolean | undefined,
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

  /**
   * Markazda FAQAT BITTA filial bormi — bo'lsa o'sha filial ID'si.
   *
   * `take: 2`: aniq sonini bilish shart emas, "bittami yoki ko'pmi" yetarli.
   *
   * FILIALSIZ BAZA ham shu yerda hal qilinadi: markazda kamida bitta
   * filial bo'lishi invariant, lekin baza server ostida tozalanishi
   * mumkin (`npm run db:reset`). O'shanda yozishni "filial tanlanmagan"
   * deb rad etish o'rniga invariantni TIKLAYMIZ — aks holda markaz
   * server qayta ishga tushmaguncha hech narsa yarata olmasdi.
   *
   * ⚠ KESHLANMAYDI: `isMultiBranch()` dan farqli, bu funksiya YOZISH
   * yo'lida turadi va noto'g'ri keshlangan qiymat yangi yozuvni
   * XATO FILIALGA tushirardi.
   */
  private async resolveSoleBranchId(): Promise<string | null> {
    const branches = await this.prisma.branch.findMany({
      where: { isDeleted: false },
      select: { id: true },
      take: 2,
    });

    if (branches.length === 0) {
      const main = await this.ensureMainBranch();
      return main?.id ? String(main.id) : null;
    }

    return branches.length === 1 ? String(branches[0].id) : null;
  }

  /**
   * YOZISH uchun filialni aniqlaydi —
   * `helpers/branchContext.helper.js::resolveBranchForWrite` KO'CHIRMASI.
   *
   * Yangi hujjat (xona, guruh, lid) DOIM aniq bitta filialga tegishli.
   * Manba tartibi:
   *   1. Formada OCHIQ tanlangan filial (`requestedBranchId`)
   *   2. Aktiv filial (`x-branch-id` konteksti)
   *   3. Markazda yagona filial bo'lsa — o'sha
   *   4. Foydalanuvchining asosiy filiali (kontekstsiz job/seed uchun)
   *
   * ⚠ XATOLAR `ApiError` BO'LISHI SHART, oddiy `Error` + `statusCode`
   * EMAS — aks holda xato filtri statusni o'qimay 500 qaytarardi va
   * "Avval aniq filialni tanlang" xabari foydalanuvchiga YETIB
   * BORMASDI.
   *
   * ⚠ BOSQICH TARTIBI O'ZGARTIRILMASIN. Har bir shox aniq sabab bilan;
   * xususan (1) dagi `isBranchAllowed` — IMTIYOZ OSHIRISHDAN HIMOYA:
   * usiz A filial direktori so'rov tanasini qo'lda tahrirlab B filialga
   * yozib qo'yardi.
   */
  async resolveBranchForWrite(
    user?: { homeBranchId?: string | null } | null,
    requestedBranchId: unknown = null,
  ): Promise<string> {
    const ctx = getBranchContext();

    // 1) OCHIQ TANLANGAN filial.
    if (requestedBranchId) {
      if (!isBranchAllowed(requestedBranchId)) {
        throw new ApiError(403, "Bu filialga yozish huquqingiz yo'q");
      }
      return String(requestedBranchId);
    }

    // 2) Aniq filial tanlangan — eng oddiy holat.
    if (ctx?.branchId) return String(ctx.branchId);

    // 3) YAGONA FILIAL: "Barcha filiallar" va "o'sha filial" ayni bir
    // narsa, ya'ni noaniqlik YO'Q — so'rashning ma'nosi ham yo'q.
    const soleId = await this.resolveSoleBranchId();
    if (soleId && isBranchAllowed(soleId)) return String(soleId);

    // 4) "BARCHA FILIALLAR" rejimida yozish TAQIQLANADI (filial bir
    // nechta). Ilgari bu yerda foydalanuvchining uy filialiga jimgina
    // tushardik — lekin owner konsolidatsiya ko'rinishida turib guruh
    // yaratsa, u KUTMAGAN filialga tushib qolardi.
    if (ctx && ctx.canSeeAllBranches) {
      throw new ApiError(
        400,
        '«Barcha filiallar» rejimida yaratib bo\'lmaydi. Avval aniq filialni tanlang',
      );
    }

    // Kontekstsiz (seed/job) — foydalanuvchining asosiy filiali.
    if (user?.homeBranchId) return String(user.homeBranchId);

    // Faqat bitta filialga kirishi bo'lsa — o'sha.
    if (ctx?.allowedBranchIds?.length === 1) return String(ctx.allowedBranchIds[0]);

    throw new ApiError(400, "Filial tanlanmagan - yozish uchun aniq filial kerak");
  }

  /**
   * GURUHDAN filialni oladi (moliya yozuvlari uchun).
   *
   * NEGA foydalanuvchidan EMAS: to'lov/maosh yozuvi DOIM guruhga
   * tegishli, guruh esa aniq bitta filialda. Filialni foydalanuvchi
   * kontekstidan olsak, owner "barcha filiallar" rejimida turib to'lov
   * qilganda yoki fon vazifasi ishlaganda NOTO'G'RI filial yozilardi.
   */
  async resolveBranchFromGroup(groupId: string): Promise<string> {
    const group = await this.prisma.group.findUnique({
      where: { id: String(groupId) },
      select: { branchId: true },
    });
    if (!group?.branchId) {
      throw new ApiError(400, "Guruhning filiali aniqlanmadi");
    }
    return String(group.branchId);
  }

}
