import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId } from "../../../utils/serialize.js";
import { isBranchAllowed } from "../../../helpers/branchContext.helper.js";

// NARX YECHUVCHI (resolver) + narx matritsasini boshqarish.
//
// Batafsil sabab va yechim tartibi: models/coursePrice.model.js.

const toObjectId = (id) => (id ? String(id) : null);

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
    validFrom: { lte: when },
    OR: [{ validTo: null }, { validTo: { gt: when } }],
  };

  if (branchId) {
    const branchRow = await prisma.coursePrice.findFirst({
      where: { ...base, branchId: toObjectId(branchId) },
      orderBy: { validFrom: "desc" },
    });
    if (branchRow) return { row: branchRow, source: PRICE_SOURCES.BRANCH_PRICE };
  }

  const baseRow = await prisma.coursePrice.findFirst({
    where: { ...base, branchId: null },
    orderBy: { validFrom: "desc" },
  });
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
  const group = await prisma.group.findUnique({
    where: { id: String(groupId) },
    select: { courseId: true, branchId: true },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  // 1) Guruhga qo'lda qo'yilgan narx (oy bo'yicha).
  if (year && month) {
    const fee = await prisma.groupFee.findFirst({
      where: {
        groupId: toObjectId(groupId),
        year: Number(year),
        month: Number(month),
      },
      select: { amount: true },
    });
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
    priceId: String(found.row.id),
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
  const course = await prisma.course.findUnique({
    where: { id: String(courseId) },
    select: { id: true, title: true, code: true },
  });
  if (!course) throw new ApiError(404, "Kurs topilmadi");

  const rows = await prisma.coursePrice.findMany({
    where: { courseId: toObjectId(courseId), isDeleted: false, validTo: null },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });

  const visible = rows.filter((r) => !r.branchId || isBranchAllowed(r.branchId));

  // `isPending` - narx KELAJAKDA boshlanadi.
  //
  // NEGA KERAK: bu ro'yxat `validTo: null` qatorlarni beradi, ya'ni
  // "amaldagi YOZUV"ni. Lekin `validFrom` kelajakda bo'lsa, u hali
  // HISOBLANMAYDI - guruhlar eski narxda to'laydi. Bayroqsiz owner
  // matritsada 600 000 ni ko'rib, hisobotda 500 000 ni topardi va
  // buni xato deb o'ylardi.
  const now = new Date();
  const annotate = (r) => ({
    ...withLegacyId(r),
    // Klient `branchId` ni obyekt sifatida kutadi (eski populate shakli).
    branchId: r.branch ? withLegacyId(r.branch) : null,
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
  const course = await prisma.course.findUnique({
    where: { id: String(courseId) },
    select: { id: true },
  });
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

  const open = await prisma.coursePrice.findFirst({
    where: {
      courseId: toObjectId(courseId),
      branchId: branch,
      validTo: null,
      isDeleted: false,
    },
  });

  if (open) {
    // Bir xil summa - yangi qator ochish shart emas (shovqin bo'lardi).
    if (Number(open.amount) === value) return withLegacyId(open);

    if (from.getTime() <= new Date(open.validFrom).getTime()) {
      throw new ApiError(
        400,
        "Yangi narx amaldagi narx boshlangan sanadan keyin boshlanishi kerak",
      );
    }
  }

  // ESKI DAVRNI YOPISH va YANGISINI OCHISH - BITTA TRANZAKSIYADA.
  //
  // Mongo'da bu ikki alohida yozuv edi: oradagi xato "eski narx yopilgan,
  // yangisi yo'q" holatini qoldirardi va kurs NARXSIZ qolib, hisob-kitob
  // jimgina 0 ga tushardi. Endi ikkalasi birga bajariladi yoki umuman
  // bajarilmaydi.
  const [, created] = await prisma.$transaction([
    open
      ? prisma.coursePrice.update({ where: { id: open.id }, data: { validTo: from } })
      : prisma.coursePrice.count(), // no-op (tranzaksiya shakli bir xil qolsin)
    prisma.coursePrice.create({
      data: {
        courseId: toObjectId(courseId),
        branchId: branch,
        amount: value,
        validFrom: from,
        note: String(note || "").trim(),
        createdById: currentUser?.id || currentUser?._id || null,
      },
    }),
  ]);

  return withLegacyId(created);
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

  const open = await prisma.coursePrice.findFirst({
    where: {
      courseId: toObjectId(courseId),
      branchId: toObjectId(branchId),
      validTo: null,
      isDeleted: false,
    },
  });
  if (!open) throw new ApiError(404, "Bu filial uchun istisno narx yo'q");

  // Davrni YOPAMIZ (o'chirmaymiz) - tarix saqlanadi.
  const closed = await prisma.coursePrice.update({
    where: { id: open.id },
    data: { validTo: new Date() },
  });
  return withLegacyId(closed);
};
