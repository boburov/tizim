import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import logger from "../../../config/logger.js";
import { localTodayMidnight } from "../../../helpers/attendance.helper.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import * as studentPaymentService from "./studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";

// ═════════════════════════════════════════════════════════════════
// GURUHNING OYLIK NARXI (GroupFee).
//
// MONGO → PRISMA
//   { group: id }  → { groupId: id }
//   findOneAndUpdate(..., { $setOnInsert }, { upsert: true })
//                  → prisma.groupFee.upsert({ where: <compound>, create, update })
//   err.code 11000 → err.code "P2002"
//
// IDEMPOTENTLIK: `@@unique([groupId, year, month])` - HAQIQIY (qisman
// emas) unique indeks, shuning uchun Prisma'ning tabiiy `upsert` i
// ishlatiladi. Bir guruh-oy uchun ikkinchi narx qatori bazada
// yaratilishi MUMKIN EMAS.
//
// `session` → `tx`: chaqiruvchi ochiq tranzaksiya klientini uzatishi
// mumkin. Berilmasa oddiy klient - imzo o'zgarmadi.
// ═════════════════════════════════════════════════════════════════

const db = (tx) => tx || prisma;

const actorId = (u) => u?.id || u?._id || null;

const feeKey = (groupId, year, month) => ({
  groupId_year_month: { groupId: String(groupId), year, month },
});

// O'tgan oy to'lovini topadi (carry-forward uchun)
const prevMonthAmount = async (group, year, month, tx) => {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prev = await db(tx).groupFee.findUnique({
    where: feeKey(group, prevYear, prevMonth),
    select: { amount: true },
  });
  return prev ? prev.amount : 0;
};

/**
 * KURS NARXIDAN MEROS (Faza 3).
 *
 * Guruhda o'tgan oy tarifi bo'lmasa (yangi guruh yoki birinchi oy),
 * KURS narxiga tushamiz: bazaviy narx yoki filial istisnosi
 * (coursePrice.service.js dagi yechim tartibi).
 *
 * NEGA KERAK: narx matritsasi qurilgan edi, lekin uni HECH KIM
 * chaqirmasdi - ya'ni kurs narxi hech qachon hisob-kitobga
 * ta'sir qilmasdi va matritsa bezak bo'lib qolgan edi.
 *
 * XATO YUTILADI: narx topilmasa 0 qaytadi va guruh avvalgidek
 * "tarifi belgilanmagan" holatda qoladi. Kurs narxi tufayli
 * GroupFee yaratilmay qolishi ancha yomonroq bo'lardi.
 */
const inheritedCourseAmount = async (group, year, month) => {
  try {
    const { resolveGroupPrice, PRICE_SOURCES } = await import(
      "../../courses/services/coursePrice.service.js"
    );
    const resolved = await resolveGroupPrice(group, { year, month });
    // GROUP_FEE manbasini QAYTA ishlatmaymiz - biz aynan shu yozuvni
    // yaratmoqchimiz, ya'ni u hali yo'q. Faqat KATALOG narxi kerak.
    if (resolved?.amount && resolved.source !== PRICE_SOURCES.GROUP_FEE) {
      return resolved.amount;
    }
  } catch (err) {
    logger.warn({ err, group }, "Kurs narxini meros qilib bo'lmadi");
  }
  return 0;
};

// Guruh+oy uchun to'lov yozuvi mavjudligini ta'minlaydi (carry-forward bilan).
// tx berilsa, ochiq tranzaksiya ichida o'qib-yozadi.
export const ensureGroupFee = async (group, year, month, { tx } = {}) => {
  const client = db(tx);
  const groupId = String(group);

  const existing = await client.groupFee.findUnique({ where: feeKey(groupId, year, month) });
  if (existing) return withLegacyId(existing);

  // MEROS TARTIBI: o'tgan oy tarifi -> KURS narxi -> 0.
  //
  // O'tgan oy USTUN: guruhga qo'lda qo'yilgan narx katalog narxidan
  // muhimroq (u aniq bu guruh uchun qabul qilingan qaror).
  let amount = await prevMonthAmount(groupId, year, month, tx);
  if (!amount) amount = await inheritedCourseAmount(groupId, year, month);

  try {
    // `update: {}` - Mongo'dagi `$setOnInsert` ning aynan ekvivalenti:
    // qator allaqachon bo'lsa HECH NARSA o'zgartirilmaydi (qo'lda
    // qo'yilgan narx avtomatik meros bilan bosib ketilmasin).
    const row = await client.groupFee.upsert({
      where: feeKey(groupId, year, month),
      create: { groupId, year, month, amount, source: "auto" },
      update: {},
    });
    return withLegacyId(row);
  } catch (err) {
    // POYGA: ikki jarayon bir vaqtda yaratmoqchi bo'ldi.
    if (err?.code === "P2002") {
      const again = await client.groupFee.findUnique({ where: feeKey(groupId, year, month) });
      return again ? withLegacyId(again) : null;
    }
    throw err;
  }
};

// Guruhning eng yaqin mavjud fee summasini topadi (berilgan oyga nisbatan).
// O'sha oyda yoki undan OLDINGI eng yaqin tarif (o'sha vaqtda amalda bo'lgan narx);
// topilmasa eng erta mavjud tarif. Hech narsa bo'lmasa 0.
// Eski o'quvchilarni qo'shganda o'tgan oylarda GroupFee bo'lmasa, qarz 0 chiqmasligi
// uchun shu summa backfill qilinadi. Kelajakdagi (oshirilgan) tarif o'tmishga
// tatbiq qilinmaydi - aks holda o'quvchi o'sha vaqtdagidan ortiq qarzdor bo'lardi.
// EKSPORT: previewBackdate shu funksiyani ishlatadi - u FAQAT O'QIYDI
// (hech narsa yaratmaydi), shuning uchun "bu amal qancha qarz yaratadi?"
// savoliga yon ta'sirsiz javob berish uchun aynan mos.
export const nearestFeeAmount = async (group, year, month) => {
  const idx = year * 12 + (month - 1);
  const fees = await prisma.groupFee.findMany({
    where: { groupId: String(group) },
    select: { year: true, month: true, amount: true },
  });
  if (!fees.length) return 0;
  let priorBest = null; // <= idx ichida eng yaqin (o'sha vaqtdagi tarif)
  let earliest = null; // hammasi kelajakda bo'lsa - eng erta tarif
  for (const f of fees) {
    const fIdx = f.year * 12 + (f.month - 1);
    if (fIdx <= idx) {
      if (!priorBest || fIdx > priorBest.idx) priorBest = { idx: fIdx, amount: f.amount };
    } else if (!earliest || fIdx < earliest.idx) {
      earliest = { idx: fIdx, amount: f.amount };
    }
  }
  if (priorBest) return priorBest.amount;
  return earliest ? earliest.amount : 0;
};

// Berilgan oy uchun GroupFee mavjudligini ta'minlaydi; bo'lmasa eng yaqin mavjud
// tarif summasi bilan yaratadi (carry-forward emas - o'tmishga backfill).
export const ensureGroupFeeBackfill = async (group, year, month) => {
  const groupId = String(group);
  const existing = await prisma.groupFee.findUnique({ where: feeKey(groupId, year, month) });
  if (existing) return withLegacyId(existing);

  const amount = await nearestFeeAmount(groupId, year, month);
  try {
    const row = await prisma.groupFee.upsert({
      where: feeKey(groupId, year, month),
      create: { groupId, year, month, amount, source: "auto" },
      update: {},
    });
    return withLegacyId(row);
  } catch (err) {
    if (err?.code === "P2002") {
      const again = await prisma.groupFee.findUnique({ where: feeKey(groupId, year, month) });
      return again ? withLegacyId(again) : null;
    }
    throw err;
  }
};

// Tanlangan oy uchun barcha faol guruhlar + o'sha oy to'lovi (jadval uchun).
export const list = async ({ year, month, search }) => {
  // FILIAL: guruhlar filtrlansa, ularning narxlari ham avtomatik cheklanadi
  // (fees quyida aynan shu guruh ID'lari bo'yicha olinadi).
  const where = { ...branchFilter(), isActive: true, isDeleted: false };
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }
  const groups = await prisma.group.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const fees = groups.length
    ? await prisma.groupFee.findMany({
        where: {
          groupId: { in: groups.map((g) => g.id) },
          year: Number(year),
          month: Number(month),
        },
      })
    : [];
  const byGroup = new Map(fees.map((f) => [String(f.groupId), f]));

  return groups.map((g) => {
    const fee = byGroup.get(String(g.id));
    return {
      // Client `row.group._id` o'qiydi - moslik saqlanadi.
      group: { id: g.id, _id: g.id, name: g.name },
      year: Number(year),
      month: Number(month),
      feeId: fee ? fee.id : null,
      amount: fee ? fee.amount : null,
      source: fee ? fee.source : null,
    };
  });
};

// Bitta guruhning barcha oylik to'lovlari (sub-sahifa). Joriy oyni ta'minlaydi.
export const byGroup = async (groupId) => {
  // FILIAL: boshqa filial guruhining narx tarixi ochilmasin.
  const group = await prisma.group.findFirst({
    where: { id: String(groupId), ...branchFilter() },
    select: { id: true, name: true },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  const today = localTodayMidnight();
  await ensureGroupFee(group.id, today.getUTCFullYear(), today.getUTCMonth() + 1);

  const fees = await prisma.groupFee.findMany({
    where: { groupId: group.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return {
    group: { id: group.id, _id: group.id, name: group.name },
    fees: withLegacyIds(fees),
  };
};

// Guruh+oy to'lovini o'rnatadi (upsert). Narx faqat shu (yil, oy) ga ta'sir qiladi -
// qo'shimcha sana yo'q. O'chirish yo'q. To'lovlarni qayta hisoblaydi.
export const upsert = async ({ groupId, year, month, amount }, currentUser) => {
  // FILIAL: bu YOZUV amali - boshqa filial guruhining narxini o'zgartirish
  // butun o'quvchi to'lovlari va o'qituvchi maoshini qayta hisoblardi.
  const group = await prisma.group.findFirst({
    where: { id: String(groupId), ...branchFilter() },
    select: { id: true, name: true, isActive: true, isDeleted: true, endDate: true },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  assertGroupActive(group);

  const by = actorId(currentUser);
  const fee = await prisma.groupFee.upsert({
    where: feeKey(group.id, year, month),
    create: {
      groupId: group.id,
      year,
      month,
      amount,
      source: "manual",
      createdById: by,
      updatedById: by,
    },
    update: { amount, source: "manual", updatedById: by },
  });

  // Avval o'quvchilar (billed manbai), keyin o'qituvchi foiz maoshi.
  //
  // O'QUVCHI QAYTA HISOBI BEST-EFFORT EMAS: narx o'zgardi-yu, o'quvchi
  // qarzi eski summada qolsa - kirim hisoboti yolg'on bo'lardi. Xato
  // yuqoriga qaytadi va chaqiruvchi 500 oladi.
  await studentPaymentService.recalcForGroupMonth(group.id, year, month);
  try {
    await teacherSalaryService.recalcForGroupMonth(group.id, year, month);
  } catch (err) {
    logger.warn({ err }, "Guruh to'lovi o'zgarishida o'qituvchi maoshi qayta hisoblanmadi");
  }
  return withLegacyId(fee);
};

// --- GURUH NARXI TASDIG'I (owner tasdig'i talab qilinganda) ---
//
// NEGA CHEGIRMA BILAN BIR QATORDA: guruh oylik narxini 1 000 000 dan
// 400 000 ga tushirish - barcha o'quvchiga 60% chegirma berish bilan
// IQTISODIY JIHATDAN BIR XIL. Faqat chegirmani tasdiqqa qo'yish "old
// eshikni qulflab, yon eshikni ochiq qoldirish" bo'lardi.
//
// TASDIQLANMAGUNCHA GroupFee o'zgarmaydi: uning `amount` maydoni
// buildSnapshot() dagi baseFee - ya'ni yozilishi bilanoq barcha
// o'quvchining expected summasi qayta hisoblanardi.

/**
 * Guruh narxini TASDIQQA yuboradi (yozmaydi).
 *
 * Yengil tekshiruv: guruh mavjud va joriy filial ko'lamida ekanligi.
 * To'liq qoidalar (guruh aktivligi, qayta hisoblash) tasdiqlash paytida
 * qayta ishlaydi.
 */
export const requestGroupFee = async ({ groupId, year, month, amount, requestNote }, currentUser) => {
  const approvalService = await import(
    "../../expenseApprovals/services/expenseApproval.service.js"
  );
  const { APPROVAL_KINDS } = await import("../../../constants/approvals.js");

  // Filial ko'lami so'rov paytida ham tekshiriladi - direktor boshqa filial
  // guruhiga so'rov yubora olmasin.
  const group = await prisma.group.findFirst({
    where: { id: String(groupId), ...branchFilter() },
    select: { id: true, name: true, branchId: true, isActive: true, isDeleted: true, endDate: true },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  assertGroupActive(group);

  // Owner "qanchadan qanchaga" ekanini ko'rishi uchun eski narx snapshot'i.
  const existing = await prisma.groupFee.findUnique({
    where: feeKey(group.id, year, month),
    select: { amount: true },
  });

  return approvalService.createRequest({
    branchId: group.branchId,
    kind: APPROVAL_KINDS.GROUP_FEE_SET,
    payload: {
      groupId: String(group.id),
      year,
      month,
      amount,
      previousAmount: existing ? existing.amount : null,
    },
    // Bitta guruh-oy uchun bitta kutilayotgan so'rov.
    subjectKey: `group_fee:${String(group.id)}:${year}:${month}`,
    subjectName: group.name || "",
    contextName: `${month}/${year}`,
    requestNote,
    currentUser,
  });
};

/**
 * Tasdiqlangan guruh narxi so'rovini BAJARADI.
 *
 * upsert() ning O'ZINI chaqiradi - guruh aktivligi tekshiruvi va ikki
 * bosqichli qayta hisoblash (o'quvchi to'lovlari -> o'qituvchi foiz maoshi)
 * shu yerda qayta ishlaydi.
 *
 * FILIAL KONTEKSTI MAJBURAN o'rnatiladi: upsert() ichida branchFilter() bor,
 * u esa TASDIQLOVCHINING joriy ko'rinishiga bog'liq. Owner "Toshkent" filialini
 * tanlab turib Buxoro guruhining so'rovini tasdiqlasa, guruh topilmay so'rov
 * bekorga FAILED bo'lardi. So'rovning O'Z filiali - yagona to'g'ri kontekst.
 */
export const executeApprovedGroupFee = async (approval) => {
  const { runWithBranchContext } = await import("../../../helpers/branchContext.helper.js");
  const p = approval?.payload || {};
  const branchId = String(approval.branchId);
  const requesterId = approval?.requestedById || approval?.requestedBy || null;

  return runWithBranchContext(
    {
      branchId,
      allowedBranchIds: [branchId],
      canSeeAllBranches: false,
      userId: String(requesterId || ""),
    },
    () =>
      upsert(
        { groupId: p.groupId, year: p.year, month: p.month, amount: p.amount },
        { id: requesterId, _id: requesterId },
      ),
  );
};

// Berilgan oy uchun barcha faol guruhlarga to'lov yozuvini ta'minlaydi (carry-forward).
export const generateMonth = async (year, month) => {
  const groups = await prisma.group.findMany({
    where: { isActive: true, isDeleted: false },
    select: { id: true },
  });
  let created = 0;
  for (const g of groups) {
    // eslint-disable-next-line no-await-in-loop
    const existed = await prisma.groupFee.findUnique({
      where: feeKey(g.id, year, month),
      select: { id: true },
    });
    if (existed) continue;
    // eslint-disable-next-line no-await-in-loop
    await ensureGroupFee(g.id, year, month);
    created += 1;
  }
  return { groups: groups.length, created };
};
