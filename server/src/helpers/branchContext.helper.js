import { AsyncLocalStorage } from "node:async_hooks";
import prisma from "../config/prisma.js";
import ApiError from "../utils/ApiError.js";
import { ensureMainBranch } from "./branchAccess.helper.js";

// FILIAL KONTEKSTI (request-scoped).
//
// NEGA AsyncLocalStorage: filial ko'lami (scope) har bir so'rovda kerak,
// lekin uni 40+ model va 100+ service funksiyasiga parametr sifatida
// uzatish real emas. ALS kontekstni request bo'ylab olib yuradi.
//
// NEGA avtomatik pre('find') hook EMAS: softDelete.plugin.js muallifi
// aynan shu sababdan avto-filtrni rad etgan - u aggregate()da ISHLAMAYDI.
// Bu kodbazada 32 ta aggregate chaqiruvi bor (moliya hisobotlari shu
// yerda), ya'ni avto-filtr yolg'on xavfsizlik hissi berardi.
// Shuning uchun: ochiq filtr (branchFilter) + aggregate uchun majburiy
// helper (branchMatchStage) + dev rejimida ogohlantiruvchi to'siq.

const storage = new AsyncLocalStorage();

// "all" = barcha filiallar (faqat cross-branch huquqi borlar uchun).
export const ALL_BRANCHES = "all";

/**
 * Kontekstni ochib, ichida callback'ni ishga tushiradi.
 * @param {{branchId: string|null, allowedBranchIds: string[], canSeeAllBranches: boolean, userId: string|null}} ctx
 * @param {Function} fn
 */
export const runWithBranchContext = (ctx, fn) => storage.run(ctx, fn);

/** Joriy request kontekstini qaytaradi (kontekst tashqarisida undefined). */
export const getBranchContext = () => storage.getStore();

/**
 * Joriy tanlangan filial ID'si.
 * null = cross-branch rejim (barcha ruxsat etilgan filiallar).
 */
export const getActiveBranchId = () => {
  const ctx = storage.getStore();
  if (!ctx) return null;
  return ctx.branchId || null;
};

/** Foydalanuvchi kira oladigan filiallar ro'yxati (ObjectId string). */
export const getAllowedBranchIds = () => {
  const ctx = storage.getStore();
  return ctx?.allowedBranchIds || [];
};

/** Owner yoki cross-branch huquqiga ega bo'lgan foydalanuvchimi. */
export const canSeeAllBranches = () => Boolean(storage.getStore()?.canSeeAllBranches);

// Prisma'da kalit oddiy SATR (VarChar(24)) - ObjectId o'rami kerak emas.
// Nom saqlangan: u 30+ joyda chaqiriladi va migratsiya davomida
// almashtirishlar sonini kamaytiradi.
const toObjectId = (id) => String(id);

/**
 * Mongoose query uchun filial filtri.
 *
 * Ishlatilishi (softDelete'dagi `notDeleted` namunasi kabi):
 *   const docs = await Group.find({ ...branchFilter(), isDeleted: false });
 *
 * Qaytaradi:
 *   {}                                  - filtr kerak emas (barcha filial)
 *   { branchId: <id> }                  - bitta filial
 *   { branchId: { $in: [...] } }        - bir nechta ruxsat etilgan filial
 *
 * @param {string} [field="branchId"] - modeldagi maydon nomi
 */
export const branchFilter = (field = "branchId") => {
  const ctx = storage.getStore();
  if (!ctx) return {};

  // Aniq bitta filial tanlangan.
  if (ctx.branchId) return { [field]: String(ctx.branchId) };

  // Cross-branch: owner hamma narsani ko'radi -> filtr yo'q.
  if (ctx.canSeeAllBranches) return {};

  // Cross-branch, lekin cheklangan: faqat biriktirilgan filiallar.
  const allowed = ctx.allowedBranchIds || [];
  if (allowed.length === 0) {
    // Hech qaysi filialga biriktirilmagan -> hech narsa ko'rmaydi.
    // Bo'sh $in ataylab: fail-closed (ochiq qoldirishdan xavfsizroq).
    return { [field]: { in: [] } };
  }
  return { [field]: { in: allowed.map(String) } };
};

/**
 * Aggregation pipeline uchun $match bosqichi.
 *
 * MAJBURIY: Mongoose pre('find') hook'lari aggregate()da ISHLAMAYDI,
 * shuning uchun har bir aggregate pipeline shu bilan boshlanishi kerak:
 *
 *   const rows = await StudentPayment.aggregate([
 *     ...branchMatchStage(),
 *     { $match: { year, month } },
 *     ...
 *   ]);
 *
 * Filtr kerak bo'lmasa bo'sh massiv qaytaradi (spread xavfsiz).
 *
 * @param {string} [field="branchId"]
 * @returns {Array<{$match: object}>}
 */
// Mongo aggregate'da bu `$match` bosqichi edi. Prisma'da quvur yo'q -
// shuning uchun `where` bo'lagi massiv ichida qaytariladi, chaqiruvchi
// uni `AND: [...]` ga qo'shadi. Bo'sh massiv - spread xavfsiz.
export const branchMatchStage = (field = "branchId") => {
  const filter = branchFilter(field);
  if (Object.keys(filter).length === 0) return [];
  return [filter];
};

/**
 * Yangi hujjat yaratishda biriktiriladigan filial.
 * Aniq filial tanlanmagan bo'lsa xato - yozish amali doim aniq
 * filialga tegishli bo'lishi shart.
 */
export const requireActiveBranchId = () => {
  const branchId = getActiveBranchId();
  if (!branchId) return null;
  return String(branchId);
};

/**
 * GURUH orqali filialga bog'langan modellar uchun $match bosqichi.
 *
 * Attendance, Grade, GroupMembership kabi modellarda branchId YO'Q -
 * ular guruhga tegishli, guruh esa filialga. Bu helper avval joriy
 * ko'lamdagi guruh ID'larini oladi, keyin ular bo'yicha $match qiladi.
 *
 * NEGA $lookup EMAS: $lookup har hujjat uchun join qiladi (sekin) va
 * uni ham filtrlash kerak bo'lardi. Guruhlar soni kichik (yuzlab),
 * shuning uchun ID ro'yxati bilan $in ancha tez.
 *
 * @param {string} [field="group"] - modeldagi guruh maydoni nomi
 * @returns {Promise<Array<{$match: object}>>}
 */
export const branchGroupMatchStage = async (field = "group") => {
  const filter = branchFilter();
  // Ko'lam cheklanmagan (owner "barcha filiallar") - filtr shart emas.
  if (Object.keys(filter).length === 0) return [];

  const groups = await prisma.group.findMany({
    where: filter,
    select: { id: true },
  });
  return [{ [field]: { in: groups.map((g) => g.id) } }];
};

/**
 * Yuqoridagining oddiy query (aggregate emas) uchun varianti.
 * @returns {Promise<object>} - {} yoki { group: { $in: [...] } }
 */
export const branchGroupFilter = async (field = "group") => {
  const stages = await branchGroupMatchStage(field);
  return stages.length ? stages[0] : {};
};

/**
 * O'QUVCHI orqali filialga bog'langan modellar uchun $match bosqichi.
 *
 * branchGroupMatchStage'ning egizagi, lekin BOSHQA yo'l bilan: depozit
 * guruhga emas, O'QUVCHIGA tegishli (qarang: studentDeposit.model.js).
 * O'quvchining filiali esa `homeBranchId` / `branchAssignments` da.
 *
 * NEGA KERAK BO'LDI: StudentDeposit modelida `branchId` YO'Q va uni
 * qo'shish ham to'g'ri emas - depozit o'quvchi bilan birga ko'chadi.
 * Filtrsiz esa `StudentDeposit.find({ balance: { $gt: 0 } })` butun
 * markazning balanslarini qaytarardi (tests/branchScopeExploit.test.js
 * shu sizishni tutgan edi).
 *
 * userBranchCondition() ni QAYTA ISHLATADI - "foydalanuvchi qaysi
 * filialda" qoidasi ikki joyda ikki xil bo'lib qolmasligi uchun.
 *
 * @param {string} [field="student"] - modeldagi foydalanuvchi maydoni nomi
 * @returns {Promise<Array<{$match: object}>>}
 */
export const branchUserMatchStage = async (field = "student") => {
  const condition = userBranchCondition();
  // null = cheklov yo'q (kontekstsiz job/seed yoki owner "barcha filiallar").
  if (!condition) return [];

  const users = await prisma.user.findMany({
    where: condition,
    select: { id: true },
  });
  // Bo'sh ro'yxat ham TO'G'RI natija: hech qaysi filialga biriktirilmagan
  // foydalanuvchi hech kimni ko'rmasligi kerak (fail-closed).
  return [{ [field]: { in: users.map((u) => u.id) } }];
};

/** Yuqoridagining oddiy query (aggregate emas) uchun varianti. */
export const branchUserFilter = async (field = "student") => {
  const stages = await branchUserMatchStage(field);
  return stages.length ? stages[0] : {};
};

/**
 * Markazda FAQAT BITTA filial bormi - bo'lsa o'sha filial ID'si.
 *
 * `limit(2)`: aniq sonini bilish shart emas, "bittami yoki ko'pmi" yetarli.
 *
 * FILIALSIZ BAZA ham shu yerda hal qilinadi: markazda kamida bitta filial
 * bo'lishi invariant, lekin baza server ostida tozalanishi mumkin
 * (`npm run db:reset`). O'shanda yozishni "filial tanlanmagan" deb rad
 * etish o'rniga invariantni TIKLAYMIZ - aks holda markaz server qayta
 * ishga tushmaguncha hech narsa yarata olmasdi.
 */
const resolveSoleBranchId = async () => {
  const branches = await prisma.branch.findMany({
    where: { isDeleted: false },
    select: { id: true },
    take: 2,
  });

  if (branches.length === 0) {
    const main = await ensureMainBranch();
    return main?.id || null;
  }

  return branches.length === 1 ? branches[0].id : null;
};

/**
 * YOZISH uchun filialni aniqlaydi.
 *
 * Yangi hujjat (guruh, lid) DOIM aniq bitta filialga tegishli bo'ladi.
 * Manba tartibi:
 *   1. Formada OCHIQ tanlangan filial (`requestedBranchId`)
 *   2. Aktiv filial (x-branch-id konteksti)
 *   3. Markazda yagona filial bo'lsa - o'sha
 *   4. Foydalanuvchining asosiy filiali (kontekstsiz job/seed uchun)
 *
 * @param {object} [user] - fallback uchun (homeBranchId)
 * @param {string} [requestedBranchId] - formada tanlangan filial
 * @returns {Promise<string>}
 * @throws {Error} filial aniqlanmasa
 */
// ⚠ XATOLAR `ApiError` BO'LISHI SHART, oddiy `Error` + `statusCode` EMAS.
//
// `middleware/errorHandler.js` `statusCode` ni FAQAT `err instanceof
// ApiError` bo'lganda o'qiydi. Oddiy `Error` ga `err.statusCode = 400`
// qo'yilsa u JIMGINA e'tiborsiz qoladi va foydalanuvchi aniq xabar
// ("Avval aniq filialni tanlang") o'rniga "Serverda xatolik yuz berdi"
// degan 500 ni ko'radi - ya'ni to'g'ri yozilgan xabar hech qachon
// yetib bormasdi. Bu yerdagi to'rtta throw shu sababdan almashtirildi.
export const resolveBranchForWrite = async (user, requestedBranchId = null) => {
  const ctx = storage.getStore();

  // 1) OCHIQ TANLANGAN filial: client "Barcha filiallar" rejimida turib
  // formada qaysi filialga yozishni ko'rsatgan.
  //
  // IMTIYOZ OSHIRISHDAN HIMOYA: tanlangan filial chaqiruvchining O'Z
  // ko'lamida ekani tekshiriladi - aks holda A filial direktori so'rovni
  // qo'lda o'zgartirib B filialga yozib qo'yardi.
  if (requestedBranchId) {
    if (!isBranchAllowed(requestedBranchId)) {
      throw new ApiError(403, "Bu filialga yozish huquqingiz yo'q");
    }
    return toObjectId(requestedBranchId);
  }

  // 2) Aniq filial tanlangan - eng oddiy holat.
  if (ctx?.branchId) return toObjectId(ctx.branchId);

  // 3) YAGONA FILIAL: "Barcha filiallar" va "o'sha filial" ayni bir narsa,
  // ya'ni noaniqlik YO'Q - so'rashning ma'nosi ham yo'q.
  //
  // Bu client'ning eskirgan holatiga qarshi himoya: localStorage'da qolib
  // ketgan "all" qiymati tufayli bitta filialli markazda har bir yaratish
  // amali xato bilan tugardi. Ruxsat baribir tekshiriladi - hech qaysi
  // filialga biriktirilmagan xodim shu yo'l bilan yozib qo'ymasin.
  const soleId = await resolveSoleBranchId();
  if (soleId && isBranchAllowed(soleId)) return toObjectId(soleId);

  // 4) "BARCHA FILIALLAR" rejimida yozish TAQIQLANADI (filial bir nechta).
  //
  // Ilgari bu yerda foydalanuvchining uy filialiga jimgina tushardik -
  // lekin owner konsolidatsiya ko'rinishida turib guruh yaratsa, u
  // KUTMAGAN filialga tushib qolardi. Yozish amali doim ANIQ filialga
  // bo'lishi kerak, shuning uchun aniq xato beramiz.
  if (ctx && ctx.canSeeAllBranches) {
    throw new ApiError(
      400,
      "«Barcha filiallar» rejimida yaratib bo'lmaydi. Avval aniq filialni tanlang",
    );
  }

  // Kontekstsiz (seed/job) - foydalanuvchining asosiy filiali.
  if (user?.homeBranchId) return toObjectId(user.homeBranchId);

  // Faqat bitta filialga kirishi bo'lsa - o'sha.
  if (ctx?.allowedBranchIds?.length === 1) return toObjectId(ctx.allowedBranchIds[0]);

  throw new ApiError(400, "Filial tanlanmagan - yozish uchun aniq filial kerak");
};

/**
 * GURUHDAN filialni oladi (moliya yozuvlari uchun).
 *
 * NEGA foydalanuvchidan EMAS: to'lov/maosh yozuvi DOIM guruhga tegishli,
 * guruh esa aniq bitta filialda. Agar filialni foydalanuvchi kontekstidan
 * olsak, owner "barcha filiallar" rejimida turib to'lov qilsa yoki fon
 * vazifasi (Agenda job) ishlasa - noto'g'ri filial yozilardi.
 * Guruhdan olish har doim to'g'ri va kontekstga bog'liq emas.
 *
 * @param {string} groupId
 * @returns {Promise<string>}
 */
export const resolveBranchFromGroup = async (groupId) => {
  const group = await prisma.group.findUnique({
    where: { id: String(groupId) },
    select: { branchId: true },
  });
  if (!group?.branchId) {
    throw new ApiError(400, "Guruhning filiali aniqlanmadi");
  }
  return group.branchId;
};

/**
 * FOYDALANUVCHI uchun filial sharti.
 *
 * Foydalanuvchilar guruhlardan FARQLI - ular ikki yo'l bilan filialga
 * bog'lanadi:
 *   homeBranchId            - asosiy filial (o'quvchilar, xodimlar)
 *   branchAssignments[]     - qo'shimcha (o'qituvchi 2 filialda dars beradi)
 * Shuning uchun oddiy branchFilter() yaramaydi - $or kerak.
 *
 * QAYTARADI: shart obyekti yoki null (filtr kerak emas).
 *
 * DIQQAT: chaqiruvchi buni `filter.$and` ga qo'shishi SHART, `filter.$or`
 * ga EMAS - ro'yxat funksiyalarida $or odatda qidiruv uchun band bo'ladi
 * va ikkinchi $or birinchisini jimgina bosib ketardi.
 *
 * FILIALSIZ foydalanuvchilar (eski/biriktirilmagan) faqat view_all
 * huquqi borlarga ko'rinadi - fail-closed.
 */
export const userBranchCondition = () => {
  const ctx = storage.getStore();
  if (!ctx) return null; // kontekstsiz (job/seed) - cheklamaymiz

  // Owner / view_all - hamma foydalanuvchini ko'radi (filialsizlarni ham).
  if (ctx.canSeeAllBranches && !ctx.branchId) return null;

  // Aniq filial tanlangan - faqat o'sha filial odamlari.
  if (ctx.branchId) {
    const id = String(ctx.branchId);
    // `branchAssignments` endi ALOHIDA jadval, shuning uchun ichki nuqta
    // yozuvi ("branchAssignments.branchId") o'rniga relation filtri `some`.
    return {
      OR: [{ homeBranchId: id }, { branchAssignments: { some: { branchId: id } } }],
    };
  }

  // Cross-branch, cheklangan: ruxsat etilgan filiallar doirasi.
  const allowed = (ctx.allowedBranchIds || []).map(String);
  if (allowed.length === 0) {
    // Hech qaysi filialga biriktirilmagan -> hech kimni ko'rmaydi.
    return { id: { in: [] } };
  }
  return {
    OR: [
      { homeBranchId: { in: allowed } },
      { branchAssignments: { some: { branchId: { in: allowed } } } },
    ],
  };
};

/**
 * XAVFSIZLIK QO'RIQCHISI: berilgan foydalanuvchi joriy filial ko'lamida
 * ekanini tasdiqlaydi, aks holda 403 bilan yiqiladi.
 *
 * NEGA ALOHIDA QO'RIQCHI KERAK: ro'yxat funksiyalari filial shartini
 * `where` ichiga qo'shadi - begona qator umuman TOPILMAYDI, ya'ni ular
 * o'z-o'zidan xavfsiz. Lekin `getById(id)`, `historyByEmployee(employeeId)`
 * kabi yo'llar identifikatorni TO'G'RIDAN-TO'G'RI params/body dan oladi
 * va hech qanday filtr qo'llamaydi.
 *
 * TAHDID MODELI: filial direktori o'z panelida boshqa filial xodimini
 * KO'RMAYDI, lekin ID ni qo'lda kiritib so'rov yubora oladi. UI da
 * yashirish himoya emas - tekshiruv SERVER tomonda bo'lishi shart.
 *
 * `userBranchCondition()` bilan bir xil mantiqda ishlaydi (homeBranchId
 * YOKI branchAssignments), shuning uchun ro'yxat nimani ko'rsatsa,
 * qo'riqchi aynan o'shanga ruxsat beradi - ikki xil qoida bo'lib
 * qolmaydi.
 *
 * KENG RUXSATLILAR AVTOMATIK O'TADI: `userBranchCondition()` Super Admin
 * (canSeeAllBranches, filial tanlanmagan) va kontekstsiz chaqiruvlar
 * (job, seed, import) uchun `null` qaytaradi - u holda tekshiruv
 * o'tkazib yuboriladi.
 *
 * @param {string} userId
 * @param {string} [message] - foydalanuvchiga ko'rinadigan xato matni
 */
export const assertUserInBranchScope = async (userId, message) => {
  const cond = userBranchCondition();
  if (!cond) return; // Super Admin yoki kontekstsiz - cheklov yo'q.
  if (!userId) throw new ApiError(403, message || "Bu filial bo'yicha amal bajarib bo'lmaydi");

  const found = await prisma.user.findFirst({
    where: { AND: [{ id: String(userId) }, cond] },
    select: { id: true },
  });
  if (!found) {
    // 404 EMAS, 403: yozuv bor yoki yo'qligini oshkor qilmaymiz, lekin
    // "topilmadi" deyish chaqiruvchini adashtirardi (u ID ni to'g'ri
    // biladi). Xabar ikkala holatda ham bir xil.
    throw new ApiError(403, message || "Bu filial bo'yicha amal bajarib bo'lmaydi");
  }
};

/**
 * O'QUVCHIDAN filialni oladi (depozit yozuvlari uchun).
 *
 * Depozit guruhga emas, o'quvchiga bog'langan - shuning uchun filial
 * o'quvchining homeBranchId'sidan olinadi.
 *
 * DIQQAT: null qaytishi MUMKIN (o'quvchi hali filialga biriktirilmagan).
 * Chaqiruvchi buni xato deb hisoblamasligi kerak - DepositTransaction.branchId
 * ataylab `required: false`.
 *
 * @param {string} studentId
 * @returns {Promise<string|null>}
 */
export const resolveBranchFromUser = async (studentId) => {
  const user = await prisma.user.findUnique({
    where: { id: String(studentId) },
    select: { homeBranchId: true },
  });
  return user?.homeBranchId || null;
};

/**
 * Berilgan filial ID joriy foydalanuvchiga ruxsat etilganmi.
 * Boshqa filial hujjatiga yozish/o'qishni tekshirishda ishlatiladi.
 */
export const isBranchAllowed = (branchId) => {
  if (!branchId) return false;
  const ctx = storage.getStore();
  if (!ctx) return true; // kontekstsiz (job/seed) - cheklamaymiz
  if (ctx.canSeeAllBranches) return true;
  return (ctx.allowedBranchIds || []).some((id) => String(id) === String(branchId));
};
