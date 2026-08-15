import mongoose from "mongoose";
import CoursePrice from "../../../models/coursePrice.model.js";
import Course from "../../../models/course.model.js";
import Group from "../../../models/group.model.js";
import GroupFee from "../../../models/groupFee.model.js";
import ApiError from "../../../utils/ApiError.js";
import { isBranchAllowed } from "../../../helpers/branchContext.helper.js";

// NARX YECHUVCHI (resolver) + narx matritsasini boshqarish.
//
// Batafsil sabab va yechim tartibi: models/coursePrice.model.js.

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

/** Manbalar - javobda "narx qayerdan keldi" ko'rinishi uchun. */
export const PRICE_SOURCES = Object.freeze({
  GROUP_FEE: "group_fee",
  BRANCH_PRICE: "branch_price",
  BASE_PRICE: "base_price",
  NONE: "none",
});

/**
 * Berilgan sanada AMALDA bo'lgan narx.
 *
 * Filial istisnosi bazaviydan USTUN: avval (kurs, filial) qidiriladi,
 * topilmasa (kurs, null).
 */
const findPriceRow = async (courseId, branchId, at) => {
  const when = at || new Date();
  const base = {
    courseId: toObjectId(courseId),
    isDeleted: false,
    validFrom: { $lte: when },
    $or: [{ validTo: null }, { validTo: { $gt: when } }],
  };

  if (branchId) {
    const branchRow = await CoursePrice.findOne({
      ...base,
      branchId: toObjectId(branchId),
    })
      .sort({ validFrom: -1 })
      .lean();
    if (branchRow) return { row: branchRow, source: PRICE_SOURCES.BRANCH_PRICE };
  }

  const baseRow = await CoursePrice.findOne({ ...base, branchId: null })
    .sort({ validFrom: -1 })
    .lean();
  if (baseRow) return { row: baseRow, source: PRICE_SOURCES.BASE_PRICE };

  return null;
};

/**
 * GURUH uchun amaldagi narx.
 *
 * Tartib: GroupFee (qo'lda) -> filial narxi -> bazaviy narx -> yo'q.
 *
 * NEGA GroupFee ENG KUCHLI: u aniq bir guruhga, aniq bir oyga qo'lda
 * qo'yilgan qaror. Katalog narxi uni bosib ketsa, owner qo'lda kiritgan
 * istisno jimgina yo'qolardi.
 *
 * @returns {Promise<{amount: number|null, source: string, priceId: string|null}>}
 */
export const resolveGroupPrice = async (groupId, { year, month } = {}) => {
  const group = await Group.findById(groupId)
    .select("courseId branchId")
    .lean();
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  // 1) Guruhga qo'lda qo'yilgan narx (oy bo'yicha).
  if (year && month) {
    const fee = await GroupFee.findOne({
      group: toObjectId(groupId),
      year: Number(year),
      month: Number(month),
      isDeleted: { $ne: true },
    })
      .select("amount")
      .lean();
    if (fee) {
      return {
        amount: fee.amount,
        source: PRICE_SOURCES.GROUP_FEE,
        priceId: null,
      };
    }
  }

  // 2-3) Katalog narxi. Kurs biriktirilmagan bo'lsa - meros yo'q.
  if (!group.courseId) {
    return { amount: null, source: PRICE_SOURCES.NONE, priceId: null };
  }

  // Sana: oy berilgan bo'lsa o'sha oyning 1-sanasi (tarixiy qayta
  // hisoblashda O'SHA PAYTDAGI narx olinishi uchun), aks holda bugun.
  const at = year && month ? new Date(Date.UTC(Number(year), Number(month) - 1, 1)) : new Date();

  const found = await findPriceRow(group.courseId, group.branchId, at);
  if (!found) return { amount: null, source: PRICE_SOURCES.NONE, priceId: null };

  return {
    amount: found.row.amount,
    source: found.source,
    priceId: String(found.row._id),
  };
};

/**
 * Kurs bo'yicha butun matritsa: bazaviy narx + filial istisnolari.
 *
 * FILIAL KO'LAMI: cheklangan foydalanuvchi faqat O'Z filiallarining
 * istisnolarini ko'radi. Bazaviy narx hammaga ko'rinadi - u global
 * katalogning bir qismi.
 */
export const listForCourse = async (courseId) => {
  const course = await Course.findById(courseId).select("title code").lean();
  if (!course) throw new ApiError(404, "Kurs topilmadi");

  const rows = await CoursePrice.find({
    courseId: toObjectId(courseId),
    isDeleted: false,
    validTo: null,
  })
    .populate("branchId", { name: 1, code: 1 })
    .lean();

  const visible = rows.filter((r) => !r.branchId || isBranchAllowed(r.branchId._id));

  // `isPending` - narx KELAJAKDA boshlanadi.
  //
  // NEGA KERAK: bu ro'yxat `validTo: null` qatorlarni beradi, ya'ni
  // "amaldagi YOZUV"ni. Lekin `validFrom` kelajakda bo'lsa, u hali
  // HISOBLANMAYDI - guruhlar eski narxda to'laydi. Bayroqsiz owner
  // matritsada 600 000 ni ko'rib, hisobotda 500 000 ni topardi va
  // buni xato deb o'ylardi.
  const now = new Date();
  const annotate = (r) => ({
    ...r,
    isPending: new Date(r.validFrom).getTime() > now.getTime(),
  });

  return {
    course,
    base: visible.filter((r) => !r.branchId).map(annotate)[0] || null,
    branches: visible.filter((r) => r.branchId).map(annotate),
  };
};

/**
 * Narx belgilash (yoki o'zgartirish).
 *
 * ESKI NARX O'CHIRILMAYDI - uning `validTo` si yopiladi va yangi qator
 * ochiladi. Sabab: o'tgan oylarni qayta hisoblaganda O'SHA PAYTDAGI narx
 * kerak. O'chirilsa, tarix qayta yozilib ketardi.
 */
export const setPrice = async (
  { courseId, branchId = null, amount, validFrom, note },
  currentUser,
) => {
  const course = await Course.findById(courseId).select("_id").lean();
  if (!course) throw new ApiError(404, "Kurs topilmadi");

  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    throw new ApiError(400, "Narx manfiy bo'lmagan son bo'lishi kerak");
  }

  // FILIAL ISTISNOSI faqat O'Z filialiga. Aks holda A filial direktori
  // B filialning narxini o'zgartirib qo'yardi.
  if (branchId && !isBranchAllowed(branchId)) {
    throw new ApiError(403, "Bu filialga narx belgilash huquqingiz yo'q");
  }

  const from = validFrom ? new Date(validFrom) : new Date();
  const branch = branchId ? toObjectId(branchId) : null;

  const open = await CoursePrice.findOne({
    courseId: toObjectId(courseId),
    branchId: branch,
    validTo: null,
    isDeleted: false,
  });

  if (open) {
    // Bir xil summa - yangi qator ochish shart emas (shovqin bo'lardi).
    if (Number(open.amount) === value) return open;

    if (from.getTime() <= new Date(open.validFrom).getTime()) {
      throw new ApiError(
        400,
        "Yangi narx amaldagi narx boshlangan sanadan keyin boshlanishi kerak",
      );
    }
    open.validTo = from;
    await open.save();
  }

  return CoursePrice.create({
    courseId: toObjectId(courseId),
    branchId: branch,
    amount: value,
    validFrom: from,
    note: String(note || "").trim(),
    createdBy: currentUser?._id || null,
  });
};

/**
 * Filial istisnosini olib tashlash - kurs BAZAVIY narxga qaytadi.
 * Bazaviy narxni o'chirib bo'lmaydi (u yagona zaxira).
 */
export const clearBranchPrice = async (courseId, branchId, currentUser) => {
  if (!branchId) {
    throw new ApiError(400, "Bazaviy narxni o'chirib bo'lmaydi - uni o'zgartiring");
  }
  if (!isBranchAllowed(branchId)) {
    throw new ApiError(403, "Bu filialga narx belgilash huquqingiz yo'q");
  }

  const open = await CoursePrice.findOne({
    courseId: toObjectId(courseId),
    branchId: toObjectId(branchId),
    validTo: null,
    isDeleted: false,
  });
  if (!open) throw new ApiError(404, "Bu filial uchun istisno narx yo'q");

  // Davrni YOPAMIZ (o'chirmaymiz) - tarix saqlanadi.
  open.validTo = new Date();
  await open.save();
  return open;
};
