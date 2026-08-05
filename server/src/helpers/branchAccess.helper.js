import Branch from "../models/branch.model.js";
import ApiError from "../utils/ApiError.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { hasPermission } from "./permission.helper.js";
import env from "../config/env.js";
import logger from "../config/logger.js";

// Filialga kirish huquqini hisoblash. requireAuth'dan keyin ishlaydi.

// ASOSIY FILIAL KESHI.
//
// Yakka markaz rejimida bu har SO'ROVDA kerak bo'ladi - keshsiz har
// so'rovga bitta ortiqcha DB o'qishi qo'shilardi. Kesh xavfsiz: yakka
// rejimda yangi filial ochib bo'lmaydi (POST /branches 403) va `isMain`
// ni o'zgartiradigan endpoint yo'q.
let mainBranchIdCache;

export const clearMainBranchCache = () => {
  mainBranchIdCache = undefined;
};

/**
 * Markazning ASOSIY filiali (isMain). Yakka markaz rejimida hamma narsa
 * shunga qisqartiriladi.
 *
 * Zaxira tartibi (Branch.create `isMain: count === 0` qo'yadi, ya'ni odatda
 * har doim bittasi bor - lekin qo'lda tahrirlangan bazaga ham chidamli):
 *   1. isMain: true bo'lgan eng eski filial
 *   2. umuman eng eski filial
 *   3. null - hali filial yaratilmagan (yangi o'rnatma)
 */
export const resolveMainBranchId = async () => {
  if (mainBranchIdCache !== undefined) return mainBranchIdCache;

  const main =
    (await Branch.findOne({ isMain: true, isDeleted: false })
      .select("_id")
      .sort({ createdAt: 1 })
      .lean()) ||
    (await Branch.findOne({ isDeleted: false })
      .select("_id")
      .sort({ createdAt: 1 })
      .lean());

  mainBranchIdCache = main ? String(main._id) : null;
  return mainBranchIdCache;
};

// Mavjud filiallardan "asosiysi" (asosiy bo'lmasa - eng eskisi).
const findAnyBranch = () =>
  Branch.findOne({ isDeleted: false })
    .select("_id name isMain isActive")
    .sort({ isMain: -1, createdAt: 1 })
    .lean();

/**
 * INVARIANT: markazda KAMIDA BITTA filial BO'LADI.
 *
 * NEGA KERAK: `branchId` Group/Lead/to'lov modellarida `required: true`,
 * ya'ni filialsiz bazada HAR QANDAY yozish amali yiqilardi - lid ham,
 * guruh ham, foydalanuvchi ham.
 *
 * NEGA FAQAT BOOT YETARLI EMAS: bu ilgari faqat `index.js` da, server
 * ko'tarilayotganda chaqirilardi. Baza esa server ISHLAB TURGANDA
 * tozalanadi (`npm run db:reset`, qo'lda drop, migratsiya) - o'shanda
 * kafolat jimgina buzilib, markaz jarayon qayta ishga tushmaguncha
 * filialsiz qolardi. Shuning uchun endi bu funksiya ARZON va HAR JOYDAN
 * chaqirsa bo'ladigan qilingan: /auth/me va yozish yo'li uni o'zi
 * chaqiradi (pastdagi chaqiruv joylariga qarang).
 *
 * IDEMPOTENT: filial bo'lsa yaratmaydi, borini qaytaradi.
 *
 * @returns {Promise<object|null>} mavjud yoki yangi yaratilgan filial
 */
export const ensureMainBranch = async () => {
  // Bitta so'rovda ham tekshiruv, ham NATIJA: chaqiruvchiga ko'pincha
  // filial ID'sining o'zi kerak (yozish uchun), shuning uchun
  // countDocuments emas - findOne.
  const existing = await findAnyBranch();
  if (existing) return existing;

  try {
    const branch = await Branch.create({
      name: "Asosiy filial",
      code: "MAIN",
      isMain: true,
      isActive: true,
    });
    // Kesh `undefined` bo'lmasligi mumkin (bu chaqiruvdan oldin kimdir
    // resolveMainBranchId() qilgan bo'lsa u yerda `null` yozilib qolgan).
    clearMainBranchCache();
    logger.info({ branchId: String(branch._id) }, "Asosiy filial avtomatik yaratildi");
    return branch.toObject();
  } catch (err) {
    // POYGA: ikkita so'rov (yoki instans) bir vaqtda ulgursa, `isMain`
    // unique partial indeksi ikkinchisini rad etadi. Bu xato EMAS -
    // filial baribir bor, o'shani qaytaramiz.
    if (err?.code !== 11000) throw err;
    clearMainBranchCache();
    return findAnyBranch();
  }
};

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

  // YAKKA MARKAZ REJIMI (MULTI_BRANCH=false).
  //
  // Hamma narsa ASOSIY filialga qisqartiriladi: markaz bitta joydan iborat
  // ko'rinadi. Client yuborgan filial sarlavhasi e'tiborsiz qoldiriladi -
  // UI'da tanlagich yo'q, demak header faqat eskirgan localStorage'dan yoki
  // qo'lda yuborilgan so'rovdan kelishi mumkin.
  //
  // MUZLATISH shu yerda sodir bo'ladi: qolgan filiallar ko'lamdan chiqadi,
  // ya'ni ularning ma'lumoti na o'qiladi, na yoziladi. Bu FAQAT o'qish
  // vaqtidagi ko'lam - bazaga hech narsa yozilmaydi, shuning uchun bayroqni
  // qaytarish hamma narsani joyiga qaytaradi.
  if (!env.MULTI_BRANCH) {
    const mainId = await resolveMainBranchId();

    // Hali birorta filial yo'q (yangi o'rnatma) - tabiiy ko'lamda qolamiz,
    // aks holda foydalanuvchi bo'sh ekranga qamalib qolardi.
    if (!mainId) {
      return { branchId: null, allowedBranchIds, canSeeAllBranches: canSeeAll };
    }

    // IMTIYOZ OSHIRISHDAN HIMOYA: asosiy filialni foydalanuvchining O'Z
    // ro'yxati bilan kesishtiramiz. Faqat B filialiga biriktirilgan direktor
    // aks holda asosiy filial ma'lumotini ko'rib qolardi - u hech qachon
    // ruxsat etilmagan. Uning filiali muzlatilgan, demak ko'lami bo'sh.
    const scoped = allowedBranchIds.includes(mainId) ? [mainId] : [];

    return {
      branchId: scoped.length ? mainId : null,
      allowedBranchIds: scoped,
      canSeeAllBranches: false,
    };
  }

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
