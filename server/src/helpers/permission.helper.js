import Role from "../models/role.model.js";
import { ROLES, ROLE_TYPES, DEFAULT_ROLE_PATH } from "../constants/roles.js";

// Rol -> {permissions, isFrozen, roleType, ...} in-memory cache.
// collectPermissions har bir requestda chaqiriladi, shuning uchun populate
// so'rovini keshlaymiz. Rol o'zgarganda invalidateRoleCache() chaqiriladi.
const roleCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

export const invalidateRoleCache = (value) => {
  if (value) roleCache.delete(value);
  else roleCache.clear();
};

// Rolning to'liq runtime holati. Bitta joyda - login, requireAuth va /me
// shuni ishlatadi, shunda muzlatish qoidasi hamma yerda bir xil.
export const resolveRole = async (value) => {
  const cached = roleCache.get(value);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const doc = await Role.findOne({ value }).populate("permissions").lean();

  // Owner ["*"] bypass SAQLANADI: DB buzilsa yoki owner o'z ruxsatini
  // yo'qotsa ham tizimga kira olishi kerak (lockout'dan himoya).
  const isOwner = value === ROLES.OWNER;

  const data = {
    exists: Boolean(doc),
    value,
    label: doc?.label || value,
    // Rol DB'da topilmasa ham (eski/buzilgan hujjat) owner ishlayveradi.
    permissions: isOwner ? ["*"] : (doc?.permissions || []).map((p) => p.key),
    isSystem: Boolean(doc?.isSystem),
    // Built-in rol hech qachon muzlatilmaydi.
    isFrozen: isOwner ? false : Boolean(doc?.isFrozen),
    frozenReason: doc?.frozenReason || "",
    roleType: doc?.roleType || (isOwner ? ROLE_TYPES.OWNER : ROLE_TYPES.STAFF),
    defaultPath: doc?.defaultPath || DEFAULT_ROLE_PATH,
    permissionsVersion: doc?.permissionsVersion || 1,
  };

  roleCache.set(value, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
};

// Owner gets ["*"] (code-base rule: super-admin)
export const collectPermissions = async (role) => {
  const resolved = await resolveRole(role);
  return resolved.permissions;
};

// RUXSAT IYERARXIYASI: kuchli ruxsat kuchsizlarini QAMRAYDI.
//
// NEGA KERAK: `leads.manage` mavjud rollarga allaqachon berilgan. Lidlar
// ruxsati uchtaga bo'linganda (read / create / update / manage) o'sha
// rollar to'satdan lid YARATA OLMAY qolardi - ularda `leads.create`
// yo'q edi, chunki u kecha mavjud emasdi.
//
// Iyerarxiya buni migratsiyasiz hal qiladi: `leads.manage` bor odam
// avtomatik ravishda `leads.create` va `leads.update` ga ham ega.
//
// DIQQAT: bu ATAYLAB bir tomonlama. Teskarisi (create → manage) HECH
// QACHON bo'lmasligi kerak - aks holda lid qo'shish huquqi berilgan
// resepshin o'quvchilarni guruhga qabul qila olardi.
const PERMISSION_IMPLIES = Object.freeze({
  "leads.manage": ["leads.create", "leads.update"],
});

export const hasPermission = (permissions, key) => {
  if (!permissions) return false;
  if (permissions.includes("*")) return true;
  if (permissions.includes(key)) return true;

  // Kuchliroq ruxsat shu kalitni qamraydimi.
  for (const [parent, children] of Object.entries(PERMISSION_IMPLIES)) {
    if (children.includes(key) && permissions.includes(parent)) return true;
  }
  return false;
};

/**
 * Bir nechta kalitdan HAR QANDAY biri yetarli (OR).
 * Route bir nechta ruxsat darajasiga ochiq bo'lganda ishlatiladi.
 */
export const hasAnyPermission = (permissions, keys = []) =>
  keys.some((k) => hasPermission(permissions, k));
