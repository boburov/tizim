import { PERMISSIONS } from "./permissions.js";

// RUXSAT KO'LAMI REYESTRI - qaysi ruxsat GLOBAL, qaysi biri FILIAL ICHIDA.
//
// ASOSIY QOIDA (owner qarori):
//   Filial rahbari O'Z FILIALIDA hamma narsani qila oladi.
//   Faqat GLOBAL va FILIALLARARO ishlar owner'da qoladi.
//
// Shuning uchun ro'yxat TESKARI tuzilgan: bu yerda faqat ISTISNOLAR
// sanaladi, qolgan HAMMA ruxsat avtomatik ravishda filial rahbariga
// tegishli bo'ladi.
//
// NEGA TESKARI: to'g'ridan-to'g'ri ro'yxat tuzilsa, har safar yangi
// ruxsat qo'shilganda uni direktor ro'yxatiga ham qo'shish ESDAN
// CHIQARDI va direktor jimgina "yarim ishlaydigan" holatga tushardi -
// aynan shu narsa `grades.record` bilan sodir bo'lgan (direktor davomat
// belgilay olardi, lekin baho qo'ya olmasdi). Endi yangi ruxsat
// avtomatik ravishda filial rahbariga tushadi; global bo'lsa uni shu
// yerga ATAYLAB qo'shish kerak.

export const OWNER_ONLY_PERMISSIONS = Object.freeze([
  // ── 1) IMTIYOZ OSHIRISH YO'LLARI ──
  // Bularsiz qolgan hamma narsa xavfsiz; bular bilan esa direktor o'z
  // ko'lamini o'zi kengaytira olardi.

  // Owner-ga tenglashtiradi: requireRole(OWNER) shu kalitni ham qabul
  // qiladi (middleware/requireRole.js), ya'ni butun owner-only bo'limni
  // ochib yuboradi.
  PERMISSIONS.SYSTEM_ADMIN_ACCESS,

  // BARCHA filiallarni ko'rish. Direktorga berilsa u boshqa filialning
  // moliyasini, o'quvchilarini va xodimlarini ko'radi - ya'ni "filial
  // ichida" tushunchasi umuman yo'qoladi.
  // (tests/privEscalation.test.js aynan shu drift'ni tutgan edi.)
  PERMISSIONS.BRANCHES_VIEW_ALL,

  // Filial ochish/tahrirlash/o'chirish. Tahrirlash ayniqsa xavfli:
  // delegatsiya matritsasi Branch hujjatida saqlanadi, ya'ni direktor
  // o'ziga qo'yilgan cheklovni O'ZI olib tashlay olardi.
  PERMISSIONS.BRANCHES_CREATE,
  PERMISSIONS.BRANCHES_UPDATE,
  PERMISSIONS.BRANCHES_DELETE,

  // Tasdiqlash huquqlari - delegatsiya matritsasini BUTUNLAY chetlab
  // o'tadi (checkConfigApproval / checkExpenseLimit ularni birinchi
  // bo'lib tekshiradi). Direktorda bo'lsa, owner biror amalni
  // "tasdiqqa" qaytarmoqchi bo'lganda bu hech qanday ta'sir qilmasdi.
  PERMISSIONS.APPROVALS_DECIDE_CONFIG,
  PERMISSIONS.FINANCE_APPROVE,

  // Rol YARATISH/O'CHIRISH - butun markazga taalluqli.
  // ROLES_UPDATE ataylab BERILADI: ishga olishda rol biriktirish kerak,
  // va assertCanGrantPermissions o'zida yo'q ruxsatni berishga yo'l
  // qo'ymaydi (helpers/roles.helper.js).
  PERMISSIONS.ROLES_CREATE,
  PERMISSIONS.ROLES_DELETE,

  // ── 2) GLOBAL KATALOGLAR ──
  // Markazlashgan spravochnik: filiallar o'zicha yangi nom o'ylab
  // topmasligi kerak, aks holda hisobotlarni birlashtirib bo'lmaydi.
  PERMISSIONS.COURSES_MANAGE,
  PERMISSIONS.ARCHIVE_REASONS_MANAGE,
  PERMISSIONS.FEEDBACK_TYPES_MANAGE,
  PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE,
  PERMISSIONS.HOLIDAYS_MANAGE,

  // ── 3) MARKAZ RESURSLARI (filialga bo'linmaydi) ──

  // Fayl saqlagich kvotasi butun markazga umumiy (StoredFile/StorageUsage
  // modellarida branchId YO'Q). Bu ruxsat begona faylni o'chirish va
  // tozalash siyosatini o'zgartirish demak - bitta filial rahbari
  // boshqalarning fayllarini o'chirib yuborishi mumkin edi.
  PERMISSIONS.STORAGE_MANAGE,

  // AI risk vaznlari BARCHA filialning ballarini siljitadi.
  // AI_READ va AI_ASSISTANT ataylab beriladi - ular faqat o'qiydi.
  PERMISSIONS.AI_CONFIG,
]);

const ownerOnlySet = new Set(OWNER_ONLY_PERMISSIONS);

/** Ruxsat faqat owner'gami. */
export const isOwnerOnlyPermission = (key) => ownerOnlySet.has(key);

/**
 * FILIAL RAHBARI OLADIGAN RUXSATLAR = hammasi minus istisnolar.
 *
 * Hisoblanadi, qo'lda yozilmaydi - shuning uchun yangi ruxsat qo'shilsa
 * u avtomatik ravishda shu ro'yxatga tushadi.
 */
export const BRANCH_LOCAL_PERMISSIONS = Object.freeze(
  Object.values(PERMISSIONS).filter((key) => !ownerOnlySet.has(key)),
);
