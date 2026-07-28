import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";

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

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

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
  if (ctx.branchId) return { [field]: toObjectId(ctx.branchId) };

  // Cross-branch: owner hamma narsani ko'radi -> filtr yo'q.
  if (ctx.canSeeAllBranches) return {};

  // Cross-branch, lekin cheklangan: faqat biriktirilgan filiallar.
  const allowed = ctx.allowedBranchIds || [];
  if (allowed.length === 0) {
    // Hech qaysi filialga biriktirilmagan -> hech narsa ko'rmaydi.
    // Bo'sh $in ataylab: fail-closed (ochiq qoldirishdan xavfsizroq).
    return { [field]: { $in: [] } };
  }
  return { [field]: { $in: allowed.map(toObjectId) } };
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
export const branchMatchStage = (field = "branchId") => {
  const filter = branchFilter(field);
  if (Object.keys(filter).length === 0) return [];
  return [{ $match: filter }];
};

/**
 * Yangi hujjat yaratishda biriktiriladigan filial.
 * Aniq filial tanlanmagan bo'lsa xato - yozish amali doim aniq
 * filialga tegishli bo'lishi shart.
 */
export const requireActiveBranchId = () => {
  const branchId = getActiveBranchId();
  if (!branchId) return null;
  return toObjectId(branchId);
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

  // Sikldan qochish uchun modelni to'g'ridan-to'g'ri olamiz.
  const Group = mongoose.models.Group;
  if (!Group) return [];

  const groups = await Group.find(filter).select("_id").lean();
  return [{ $match: { [field]: { $in: groups.map((g) => g._id) } } }];
};

/**
 * Yuqoridagining oddiy query (aggregate emas) uchun varianti.
 * @returns {Promise<object>} - {} yoki { group: { $in: [...] } }
 */
export const branchGroupFilter = async (field = "group") => {
  const stages = await branchGroupMatchStage(field);
  return stages.length ? stages[0].$match : {};
};

/**
 * YOZISH uchun filialni aniqlaydi.
 *
 * Yangi hujjat (guruh, lid) DOIM aniq bitta filialga tegishli bo'ladi -
 * "barcha filiallar" rejimida yozib bo'lmaydi, chunki qaysi filialga
 * yozish noma'lum. Bunday holda foydalanuvchi filial tanlashi kerak.
 *
 * @param {object} [user] - fallback uchun (homeBranchId)
 * @returns {mongoose.Types.ObjectId}
 * @throws {Error} filial aniqlanmasa
 */
export const resolveBranchForWrite = (user) => {
  const ctx = storage.getStore();

  // Aniq filial tanlangan - eng oddiy holat.
  if (ctx?.branchId) return toObjectId(ctx.branchId);

  // "BARCHA FILIALLAR" rejimida yozish TAQIQLANADI.
  //
  // Ilgari bu yerda foydalanuvchining uy filialiga jimgina tushardik -
  // lekin owner konsolidatsiya ko'rinishida turib guruh yaratsa, u
  // KUTMAGAN filialga tushib qolardi. Yozish amali doim ANIQ filialga
  // bo'lishi kerak, shuning uchun aniq xato beramiz.
  if (ctx && ctx.canSeeAllBranches) {
    const err = new Error(
      "«Barcha filiallar» rejimida yaratib bo'lmaydi. Avval aniq filialni tanlang",
    );
    err.statusCode = 400;
    throw err;
  }

  // Kontekstsiz (seed/job) - foydalanuvchining asosiy filiali.
  if (user?.homeBranchId) return toObjectId(user.homeBranchId);

  // Faqat bitta filialga kirishi bo'lsa - o'sha.
  if (ctx?.allowedBranchIds?.length === 1) return toObjectId(ctx.allowedBranchIds[0]);

  const err = new Error("Filial tanlanmagan - yozish uchun aniq filial kerak");
  err.statusCode = 400;
  throw err;
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
 * @param {mongoose.Types.ObjectId|string} groupId
 * @returns {Promise<mongoose.Types.ObjectId>}
 */
export const resolveBranchFromGroup = async (groupId) => {
  const Group = mongoose.models.Group;
  if (!Group) {
    const err = new Error("Group modeli topilmadi");
    err.statusCode = 500;
    throw err;
  }
  const group = await Group.findById(groupId).select("branchId").lean();
  if (!group?.branchId) {
    const err = new Error("Guruhning filiali aniqlanmadi");
    err.statusCode = 400;
    throw err;
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
    const id = toObjectId(ctx.branchId);
    return { $or: [{ homeBranchId: id }, { "branchAssignments.branchId": id }] };
  }

  // Cross-branch, cheklangan: ruxsat etilgan filiallar doirasi.
  const allowed = (ctx.allowedBranchIds || []).map(toObjectId);
  if (allowed.length === 0) {
    // Hech qaysi filialga biriktirilmagan -> hech kimni ko'rmaydi.
    return { _id: { $in: [] } };
  }
  return {
    $or: [
      { homeBranchId: { $in: allowed } },
      { "branchAssignments.branchId": { $in: allowed } },
    ],
  };
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
 * @param {mongoose.Types.ObjectId|string} studentId
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
export const resolveBranchFromUser = async (studentId) => {
  const User = mongoose.models.User;
  if (!User) return null;
  const user = await User.findById(studentId).select("homeBranchId").lean();
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
