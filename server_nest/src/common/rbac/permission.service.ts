import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES, ROLE_TYPES, DEFAULT_ROLE_PATH } from '../constants/permissions.js';

/**
 * `server/src/helpers/permission.helper.js` NING KO'CHIRMASI.
 */

export interface ResolvedRole {
  exists: boolean;
  value: string;
  label: string;
  permissions: string[];
  isSystem: boolean;
  isFrozen: boolean;
  frozenReason: string;
  roleType: string;
  defaultPath: string;
  permissionsVersion: number;
}

/**
 * RUXSAT IYERARXIYASI: kuchli ruxsat kuchsizlarini QAMRAYDI.
 *
 * NEGA KERAK: `leads.manage` mavjud rollarga allaqachon berilgan. Lidlar
 * ruxsati uchtaga bo'linganda o'sha rollar to'satdan lid YARATA OLMAY
 * qolardi — ularda `leads.create` yo'q edi, chunki u kecha mavjud emasdi.
 *
 * ⚠ BU ATAYLAB BIR TOMONLAMA. Teskarisi (create → manage) HECH QACHON
 * bo'lmasligi kerak — aks holda lid qo'shish huquqi berilgan resepshin
 * o'quvchilarni guruhga qabul qila olardi.
 */
const PERMISSION_IMPLIES: Readonly<Record<string, string[]>> = Object.freeze({
  'leads.manage': ['leads.create', 'leads.update'],
  'expenses.create': ['finance.create_expense'],
  'expenses.manage': ['finance.manage_expense', 'finance.create_expense'],
  'finance.manage': ['finance.manage_accounts', 'finance.manage_refunds'],
  'finance.pay': ['finance.manage_transfers'],
});

export const hasPermission = (
  permissions: string[] | undefined | null,
  key: string,
): boolean => {
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  if (permissions.includes(key)) return true;
  for (const [parent, children] of Object.entries(PERMISSION_IMPLIES)) {
    if (children.includes(key) && permissions.includes(parent)) return true;
  }
  return false;
};

/** Bir nechta kalitdan HAR QANDAY biri yetarli (OR). */
export const hasAnyPermission = (
  permissions: string[] | undefined | null,
  keys: string[] = [],
): boolean => keys.some((k) => hasPermission(permissions, k));

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PermissionService {
  /**
   * Rol keshi — Express'dagi bilan AYNAN bir xil (5 daqiqa).
   *
   * ⚠ FAZA 2 VAQTINCHA CHEKLOVI — YAGONA YOZUVCHI ⚠
   *
   * Bu kesh JARAYONGA XOS. Express va NestJS bir vaqtda ishlaganda
   * birida rol o'zgarsa, ikkinchisining keshi undan XABARSIZ qoladi va
   * 5 daqiqagacha eski ruxsatlar bilan ishlaydi.
   *
   * YECHIM (ataylab tanlangan): rol/ruxsat MUTATSIYALARI Faza 2 davomida
   * FAQAT Express'da qoladi. NestJS ularni umuman bajarmaydi — u faqat
   * o'qiydi. Bitta yozuvchi bo'lgani uchun jarayonlararo invalidatsiya
   * muammosi UMUMAN YUZAGA KELMAYDI.
   *
   * Shu sababli TTL qisqartirilmadi va Redis/pub-sub QO'SHILMADI —
   * ular mavjud bo'lmagan muammoni "hal qilardi".
   *
   * BU VAQTINCHA. Express olib tashlangach NestJS yagona jarayon bo'ladi
   * va `invalidateRoleCache()` yana yetarli bo'ladi.
   */
  private readonly roleCache = new Map<string, { data: ResolvedRole; expiresAt: number }>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  invalidateRoleCache(value?: string): void {
    if (value) this.roleCache.delete(value);
    else this.roleCache.clear();
  }

  /**
   * Rolning to'liq runtime holati. Bitta joyda — login, auth middleware
   * va `/me` shuni ishlatadi, shunda muzlatish qoidasi hamma yerda bir xil.
   */
  async resolveRole(value: string): Promise<ResolvedRole> {
    const cached = this.roleCache.get(value);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const doc = await this.prisma.role.findUnique({
      where: { value },
      include: { permissions: { select: { key: true } } },
    });

    // ⚠ Owner ["*"] bypass SAQLANADI: baza buzilsa yoki owner o'z
    // ruxsatini yo'qotsa ham tizimga kira olishi kerak (lockout'dan
    // himoya). BU SHOXNI OLIB TASHLAMANG.
    const isOwner = value === ROLES.OWNER;

    const data: ResolvedRole = {
      exists: Boolean(doc),
      value,
      label: doc?.label || value,
      permissions: isOwner ? ['*'] : (doc?.permissions || []).map((p) => p.key),
      isSystem: Boolean(doc?.isSystem),
      // Built-in rol hech qachon muzlatilmaydi.
      isFrozen: isOwner ? false : Boolean(doc?.isFrozen),
      frozenReason: doc?.frozenReason || '',
      roleType: doc?.roleType || (isOwner ? ROLE_TYPES.OWNER : ROLE_TYPES.STAFF),
      defaultPath: doc?.defaultPath || DEFAULT_ROLE_PATH,
      permissionsVersion: doc?.permissionsVersion || 1,
    };

    this.roleCache.set(value, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  }

  async collectPermissions(role: string): Promise<string[]> {
    return (await this.resolveRole(role)).permissions;
  }
}
