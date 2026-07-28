import Branch from "../models/branch.model.js";
import ApiError from "../utils/ApiError.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { hasPermission } from "./permission.helper.js";

// Filialga kirish huquqini hisoblash. requireAuth'dan keyin ishlaydi.

/**
 * Foydalanuvchi kira oladigan filiallar ro'yxati (ObjectId string massiv).
 * Owner / branches.view_all bo'lsa - barcha faol filiallar.
 */
export const resolveAllowedBranchIds = async (user, permissions) => {
  // Owner ["*"] yoki aniq view_all ruxsati - hamma filial.
  if (hasPermission(permissions, PERMISSIONS.BRANCHES_VIEW_ALL)) {
    const all = await Branch.find({ isDeleted: false }).select("_id").lean();
    return all.map((b) => String(b._id));
  }

  const ids = new Set();
  if (user.homeBranchId) ids.add(String(user.homeBranchId));
  for (const a of user.branchAssignments || []) {
    if (a?.branchId) ids.add(String(a.branchId));
  }
  return [...ids];
};

/**
 * Foydalanuvchining shu filialdagi ROLI.
 * branchAssignments'da o'ziga xos rol bo'lsa o'sha, aks holda asosiy `role`.
 * Shu tufayli bitta odam A filialda direktor, B filialda o'qituvchi bo'la oladi.
 */
export const resolveRoleForBranch = (user, branchId) => {
  if (!branchId) return user.role;
  const assignment = (user.branchAssignments || []).find(
    (a) => String(a.branchId) === String(branchId),
  );
  return assignment?.role || user.role;
};

/**
 * So'rovdagi filialni validatsiya qiladi va yakuniy scope'ni qaytaradi.
 *
 * @returns {{branchId: string|null, allowedBranchIds: string[], canSeeAllBranches: boolean}}
 *   branchId=null => cross-branch rejim (konsolidatsiya ko'rinishi)
 */
export const resolveBranchScope = async ({ user, permissions, requestedBranchId }) => {
  const canSeeAll = hasPermission(permissions, PERMISSIONS.BRANCHES_VIEW_ALL);
  const allowedBranchIds = await resolveAllowedBranchIds(user, permissions);

  // "all" so'ralgan: faqat view_all huquqi borlar uchun.
  // Huquq bo'lmasa XATO TASHLAMAYMIZ - o'z ko'lamiga tushiramiz (pastga o'tadi).
  if (requestedBranchId === "all" && canSeeAll) {
    return { branchId: null, allowedBranchIds, canSeeAllBranches: true };
  }

  // Aniq filial so'ralgan va u RUXSAT ETILGAN bo'lsa - o'shani ishlatamiz.
  //
  // DIQQAT: ruxsat etilmagan/mavjud bo'lmagan filial so'ralsa 403 TASHLAMAYMIZ.
  // Sabab: filial ID client'da localStorage'da turadi va eskirib qolishi mumkin
  // (filial o'chirilgan, foydalanuvchi undan chiqarilgan, baza tozalangan).
  // Agar bu yerda 403 tashlasak, /auth/me ham yiqiladi va foydalanuvchi
  // TIZIMGA UMUMAN KIRA OLMAY QOLADI - eski header uni doimiy qulflab qo'yardi.
  //
  // Xavfsizlik yo'qolmaydi: quyida foydalanuvchi baribir FAQAT o'z
  // filiallari doirasiga tushadi (branchFilter $in bilan cheklaydi).
  if (requestedBranchId && requestedBranchId !== "all") {
    const allowed = allowedBranchIds.some((id) => id === String(requestedBranchId));
    if (allowed) {
      return {
        branchId: String(requestedBranchId),
        allowedBranchIds,
        canSeeAllBranches: canSeeAll,
      };
    }
    // Yaroqsiz - e'tiborsiz qoldiramiz va standart ko'lamga tushamiz.
  }

  // Filial so'ralmagan (header yo'q).
  // view_all bo'lsa - konsolidatsiya ko'rinish (cross-branch).
  if (canSeeAll) {
    return { branchId: null, allowedBranchIds, canSeeAllBranches: true };
  }

  // Oddiy xodim: bitta filiali bo'lsa - o'shaniki, ko'p bo'lsa cross-branch
  // (lekin faqat o'z filiallari doirasida - branchFilter $in qiladi).
  if (allowedBranchIds.length === 1) {
    return {
      branchId: allowedBranchIds[0],
      allowedBranchIds,
      canSeeAllBranches: false,
    };
  }

  return { branchId: null, allowedBranchIds, canSeeAllBranches: false };
};

/**
 * PRIVILEGE ESCALATION HIMOYASI.
 * Filial direktori faqat O'ZI kira oladigan filialga foydalanuvchi
 * biriktira/ko'chira oladi. Aks holda u xodimni boshqa filialga o'tkazib,
 * o'sha filial ma'lumotiga yo'l ocha olardi.
 */
export const assertCanAssignBranch = (actorAllowedIds, canSeeAll, targetBranchId) => {
  if (canSeeAll) return;
  if (!targetBranchId) {
    throw new ApiError(400, "Filial ko'rsatilishi shart");
  }
  const ok = (actorAllowedIds || []).some((id) => String(id) === String(targetBranchId));
  if (!ok) {
    throw new ApiError(403, "Bu filialga foydalanuvchi biriktira olmaysiz");
  }
};

/**
 * Nishon foydalanuvchi joriy foydalanuvchining ko'lamida turadimi.
 * Boshqa filial xodimini tahrirlash/parolini ko'rishni to'sadi.
 *
 * DIQQAT: parollar OCHIQ MATNDA saqlanadi va owner ularni ko'ra oladi.
 * Shuning uchun /:id/password endpoint'i shu tekshiruvsiz qolsa,
 * filial direktori boshqa filial xodimining parolini o'qib olardi.
 */
export const assertTargetInScope = (actorAllowedIds, canSeeAll, targetUser) => {
  if (canSeeAll) return;

  const targetBranchIds = new Set();
  if (targetUser.homeBranchId) targetBranchIds.add(String(targetUser.homeBranchId));
  for (const a of targetUser.branchAssignments || []) {
    if (a?.branchId) targetBranchIds.add(String(a.branchId));
  }

  // Nishon hech qaysi filialga biriktirilmagan - faqat view_all ko'radi.
  if (targetBranchIds.size === 0) {
    throw new ApiError(403, "Bu foydalanuvchiga kirish huquqingiz yo'q");
  }

  const overlap = (actorAllowedIds || []).some((id) => targetBranchIds.has(String(id)));
  if (!overlap) {
    throw new ApiError(403, "Bu foydalanuvchiga kirish huquqingiz yo'q");
  }
};
