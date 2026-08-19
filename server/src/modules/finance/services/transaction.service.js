import { randomBytes } from "node:crypto";
import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as studentPaymentService from "./studentPayment.service.js";
import * as depositService from "../../deposits/services/deposit.service.js";
import { runFinanceTxn } from "./financeTxn.helper.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import * as financialTx from "./financialTransaction.service.js";

// Bir martada qabul qilinadigan maksimal summa (kassa xatosini cheklash uchun).
const MAX_PAYMENT_AMOUNT = 50_000_000;

// MONGO → PRISMA
//   { payment } → { paymentId },  { student } → { studentId }, { group } → { groupId }
//   err.code 11000 → err.code "P2002"
//   session → tx
//   new mongoose.Types.ObjectId() → gen24Hex()  (batch kaliti)
const actorId = (u) => u?.id || u?._id || null;

// BATCH KALITI. Mongo'da `new ObjectId()` KLIENT tomonida yaratilardi va
// hech qaysi jadvalga tegishli emas edi - u shunchaki bitta to'lovning
// bo'laklarini bog'lab turadigan noyob belgi. `batchId` ustuni VarChar(24),
// shuning uchun bir xil shakldagi 24-belgili hex yaratamiz.
const gen24Hex = () => randomBytes(12).toString("hex");

// Idempotentlik dublikati - takror so'rovni "yangi pul emas" deb qaytaradi.
const duplicateResult = (existing) => ({
  allocated: 0,
  duplicate: true,
  transactions: existing ? [existing] : [],
});

// To'lovni taqsimlash tartibi: avval TANLANGAN oy, keyin shu o'quvchining shu
// guruhdagi boshqa qoldiq oylari (ENG ESKISIDAN). Tanlangan oy to'liq to'langan
// bo'lsa ham ro'yxatda qoladi (loop ichida 0 ulush bilan o'tib ketiladi).
const buildAllocationOrder = async (selected, tx = null) => {
  const others = await (tx || prisma).studentPayment.findMany({
    where: {
      studentId: selected.studentId,
      groupId: selected.groupId,
      id: { not: selected.id },
      writtenOff: false,
      // Ustunni ustunga solishtirish - Mongo `$expr` ekvivalenti.
      expectedAmount: { gt: prisma.studentPayment.fields.paidAmount },
    },
    orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
  });
  return [selected, ...others];
};

// To'lov qabul qiladi. Tanlangan oydan ortgan summa avtomatik ravishda shu
// o'quvchining keyingi qoldiq oylariga (eng eskisidan) DIRECT tranzaksiya bo'lib
// taqsimlanadi - har oy uchun alohida yozuv, bitta batchId bilan (bekor qilishda
// birga void). Barcha qarz yopilgach ortgan pul GAROV sifatida depozitga tushadi.
// Cheklov shartli-atomik update bilan (parallel double-click capdan o'tmaydi);
// idempotencyKey berilsa takror so'rov yangi pul yozmaydi.
export const create = async (
  { paymentId, amount, method, paidAt, note, idempotencyKey },
  currentUser,
) => {
  // FILIAL: boshqa filial o'quvchisiga to'lov yozib bo'lmaydi.
  const payment = await prisma.studentPayment.findFirst({
    where: { id: String(paymentId), ...branchFilter() },
  });
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  // Arxivlangan guruhga to'lov qabul qilinmaydi (avval arxivdan chiqarish kerak).
  assertGroupActive(
    await prisma.group.findUnique({
      where: { id: payment.groupId },
      select: { id: true, isActive: true, isDeleted: true, endDate: true },
    }),
  );

  const total = Number(amount);
  if (!Number.isFinite(total) || total <= 0) {
    throw new ApiError(400, "Summa noto'g'ri");
  }
  if (total > MAX_PAYMENT_AMOUNT) {
    throw new ApiError(400, "Bir martada 50 000 000 so'mdan ko'p kiritib bo'lmaydi");
  }

  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");
  // Kelajak sanaga kirim yozib bo'lmaydi (kassa kunlik hisobi buzilmasin)
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "To'lov sanasi kelajakda bo'lishi mumkin emas");
  }

  if (idempotencyKey) {
    const existing = await prisma.paymentTransaction.findFirst({
      where: { idempotencyKey },
    });
    if (existing) return duplicateResult(withLegacyId(existing));
  }

  // ══════════════════════════════════════════════════════════════════
  // BUTUN SO'ROV — BITTA TRANZAKSIYA
  // ══════════════════════════════════════════════════════════════════
  //
  // Ilgari har ULUSH alohida tranzaksiyada edi, ortiqcha pulni
  // depozitga o'tkazish esa yana boshqasida. Ya'ni so'rov quyidagi
  // holatda tugashi MUMKIN edi:
  //
  //     1-ulush        ✅ kommit
  //     2-ulush        ✅ kommit
  //     ortiqcha→depozit ❌ xato
  //     so'rov          ❌ xato qaytardi
  //
  // Foydalanuvchi "to'lov o'tmadi" degan javob oladi, lekin pulning
  // bir qismi ALLAQACHON yozilgan bo'ladi. Keyin u qayta uradi va
  // to'lov IKKI MARTA tushadi. Moliyaviy tizimda bu qabul qilinmaydi.
  //
  // ENDI: taqsimlash ham, ortiqchani depozitga o'tkazish ham BITTA
  // tranzaksiyada. Yo hammasi, yo hech narsa.
  //
  // NEGA `depositService.topup` GA `tx` UZATILADI: Prisma'da ichma-ich
  // interaktiv tranzaksiya yo'q — u o'zi `runFinanceTxn` ochsa,
  // ALOHIDA ulanishda ochilardi va tashqi rollback unga ta'sir
  // qilmasdi (aynan yopmoqchi bo'lgan tuynuk), ustiga ikkalasi bir xil
  // depozit qatorini qulflab, o'zini-o'zi bloklab qo'yardi.
  const batchId = gen24Hex();
  let outcome;
  try {
    outcome = await runFinanceTxn(async (tx) => {
      // Taqsimlash tartibi TRANZAKSIYA ICHIDA o'qiladi — barcha
      // qatorlar bitta izchil suratdan olinadi.
      const order = await buildAllocationOrder(payment, tx);
      const transactions = [];
      let left = total;
      // Idempotency kaliti faqat BATCH'ning birinchi yozuviga biriktiriladi.
      let pendingKey = idempotencyKey || null;

      for (const plan of order) {
        if (left <= 0) break;
        // Yomon qarz (write-off) yopilgan - to'lov unga taqsimlanmaydi
        // (ortgan pul boshqa oylarga yoki depozitga tushadi).
        if (plan.writtenOff) continue;
        const remaining = Math.max(
          0,
          (plan.expectedAmount || 0) - (plan.paidAmount || 0),
        );
        const take = Math.min(left, remaining);
        if (take <= 0) continue;

        // Balans shartli-atomik oshiriladi. null → parallel so'rov shu
        // oyni allaqachon yopgan; keyingi oyga o'tamiz.
        // eslint-disable-next-line no-await-in-loop
        const updated = await studentPaymentService.applyPaidDelta(plan.id, take, {
          capToRemaining: true,
          tx,
        });
        if (!updated) continue;

        // eslint-disable-next-line no-await-in-loop
        const created = await tx.paymentTransaction.create({
          data: {
            // FILIAL: oylik plandan meros (plan guruhdan olgan).
            branchId: plan.branchId,
            paymentId: plan.id,
            studentId: plan.studentId,
            groupId: plan.groupId,
            year: plan.year,
            month: plan.month,
            amount: take,
            source: "direct",
            method,
            paidAt: day,
            note: note || "",
            idempotencyKey: pendingKey,
            batchId,
            createdById: actorId(currentUser),
          },
        });

        // JURNAL + AUDIT + o'lchovlar — markaziy servis orqali.
        // eslint-disable-next-line no-await-in-loop
        await financialTx.postStudentPayment(
          { paymentTransactionId: created.id },
          currentUser,
          { tx },
        );

        transactions.push(created);
        pendingKey = null;
        left -= take;
      }

      // Barcha qarzdan ortgan summa GAROV bo'lib depozitga tushadi
      // (topup → autoApply boshqa guruhlardagi qoldiqni ham eng
      // eskisidan qoplaydi, qolgani balansda qoladi).
      let depositCredited = 0;
      if (left > 0) {
        await depositService.topup(
          payment.studentId,
          { amount: left, method, paidAt, note: note || "Ortiqcha to'lov - garovga" },
          currentUser,
          { tx },
        );
        depositCredited = left;
      }

      return { transactions, depositCredited };
    });
  } catch (err) {
    // Parallel takror so'rov qisman unique idempotency indeksga urildi -
    // dublikatni qaytaramiz (Mongo 11000 → Prisma P2002).
    if (err?.code === "P2002" && idempotencyKey) {
      const existing = await prisma.paymentTransaction.findFirst({
        where: { idempotencyKey },
      });
      if (existing) return duplicateResult(withLegacyId(existing));
    }
    throw err;
  }

  const { transactions, depositCredited } = outcome;

  return {
    allocated: transactions.length,
    transactions: withLegacyIds(transactions),
    depositCredited,
  };
};

// Tranzaksiyani bekor qiladi (soft-delete), balansni atomik kamaytiradi.
// Avansli to'lov (batch) bo'lsa - BUTUN batch birga void bo'ladi: bitta bo'lakni
// o'chirib kelgusi oylarda "fantom avans" qoldirib bo'lmaydi.
//
// BUTUN void (softDelete + har bo'lak uchun paidAmount qaytarish) bitta MongoDB
// tranzaksiyasida bajariladi. Aks holda yarmida xato bo'lsa: tranzaksiya o'chirilgan
// bo'lib (isDeleted=true), lekin paidAmount qaytarilmay qolardi - kassadan pul
// chiqqani holda yozuv "to'langan" ko'rinib, audit izsiz pul yo'qolardi (#1A, #1B).
export const remove = async (id, currentUser) => {
  return runFinanceTxn(async (tx) => {
    // FILIAL: boshqa filial to'lovini bekor qilib bo'lmaydi. Bu amal
    // depozitga pul qaytaradi, ya'ni haqiqiy moliyaviy ta'sirga ega.
    const trx = await tx.paymentTransaction.findFirst({
      where: { id: String(id), ...branchFilter(), isDeleted: false },
    });
    if (!trx) throw new ApiError(404, "Tranzaksiya topilmadi");

    const batch = trx.batchId
      ? await tx.paymentTransaction.findMany({
          where: { batchId: trx.batchId, isDeleted: false },
        })
      : [trx];

    const removed = [];
    for (const t of batch) {
      // eslint-disable-next-line no-await-in-loop
      await tx.paymentTransaction.update({
        where: { id: t.id },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
      });
      // eslint-disable-next-line no-await-in-loop
      await studentPaymentService.applyPaidDelta(t.paymentId, -t.amount, { tx });

      // YOMON QARZ TUZATISHI.
      //
      // `writeOffAmount` write-off PAYTIDAGI qoldiq bilan muzlatiladi
      // (expected − paid). Shu oyning to'lovi keyin bekor qilinsa, haqiqiy
      // yo'qotish o'sha summaga OSHADI, lekin writeOffAmount eski qiymatda
      // qolib ketardi.
      //
      // Natijada hisobotda: `billed`/`paid` write-off qilinganlarni chiqarib
      // tashlaydi, `badDebt` esa eskirgan raqamni oladi - ya'ni bekor
      // qilingan summa hech qayerda ko'rinmay, JIMGINA yo'qolardi.
      //
      // Bekor qilishni bloklash mumkin emas: write-off'ni qaytarish oqimi
      // yo'q va foydalanuvchi tuzoqqa tushib qolardi. Shuning uchun
      // yo'qotish RAQAMI tuzatiladi.
      // eslint-disable-next-line no-await-in-loop
      const paymentDoc = await tx.studentPayment.findUnique({
        where: { id: t.paymentId },
        select: { writtenOff: true },
      });
      if (paymentDoc?.writtenOff) {
        // eslint-disable-next-line no-await-in-loop
        await tx.studentPayment.update({
          where: { id: t.paymentId },
          data: { writeOffAmount: { increment: t.amount } },
        });
      }

      // Depozitdan qoplangan to'lov bekor qilinsa - pul DEPOZITGA qaytadi (naqdga emas).
      // Refund void bilan bir xil tranzaksiyada - tashqi abort'da double-credit bo'lmasin.
      if (t.source === "deposit") {
        // eslint-disable-next-line no-await-in-loop
        await depositService.refundToDeposit(t.studentId, t.amount, { tx });
      }
      removed.push(t.id);
    }
    return { id: trx.id, _id: trx.id, removed };
  });
};
