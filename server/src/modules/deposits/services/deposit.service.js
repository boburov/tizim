import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import {
  resolveBranchFromUser,
  branchFilter,
  branchUserFilter,
} from "../../../helpers/branchContext.helper.js";
import { EXPENSE_KINDS } from "../../../constants/approvals.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import {
  checkExpenseLimit,
  createRequest,
} from "../../expenseApprovals/services/expenseApproval.service.js";
import * as studentPaymentService from "../../finance/services/studentPayment.service.js";
import * as financialTx from "../../finance/services/financialTransaction.service.js";
import { runFinanceTxn } from "../../finance/services/financeTxn.helper.js";

// ═══════════════════════════════════════════════════════════════════════
// O'QUVCHI DEPOZITI (oldindan to'lov / garov).
//
// MONGO → PRISMA
//   { student: id }        → { studentId: id }
//   { deposit: id }        → { depositId: id }
//   { payment: id }        → { paymentId: id }
//   $inc: { balance: d }   → { balance: { increment: d } }  (shartsiz)
//                          → xom `UPDATE ... WHERE balance >= -d` (shartli)
//   session                → tx
//   err.code 11000         → err.code "P2002"
//
// BALANS ATOMIKLIGI: yechishda `balance >= -delta` sharti YOZUV BILAN
// BIR AMALDA bajarilishi SHART. Mongo buni `findOneAndUpdate(filter, $inc)`
// bilan qilardi. Prisma'ning `update({ increment })` da `where` faqat
// unique maydonlarni qabul qiladi, ya'ni shartni u yerga qo'yib bo'lmaydi;
// `updateMany` esa yangilangan qatorni qaytarmaydi. Shuning uchun shartli
// yo'l xom SQL bilan yozilgan - `RETURNING` orqali yangi balans darhol
// olinadi va "o'qi → tekshir → yoz" poygasi umuman paydo bo'lmaydi.
//
// `StudentDeposit.studentId` UNIQUE - shuning uchun hisob ochish
// `upsert` bilan: ikki parallel to'ldirish ikkita hisob yaratib,
// o'quvchi pulining yarmini "ko'rinmas" qilib qo'ya olmaydi.
// ═══════════════════════════════════════════════════════════════════════

const SAFE_STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
};

const db = (tx) => tx || prisma;

// Chaqiruvchi ochiq tranzaksiya bersa — UNGA QO'SHILAMIZ, aks holda o'zimiz
// ochamiz.
//
// NEGA MUHIM: Prisma'da ICHMA-ICH interaktiv tranzaksiya YO'Q. Ochiq
// tranzaksiya ichida `prisma.$transaction()` chaqirilsa u ALOHIDA
// ulanishda, ALOHIDA tranzaksiya bo'lib ochiladi — ya'ni tashqi amal
// qaytarilsa ichkisi KOMMIT bo'lgancha qolardi (aynan biz yopmoqchi
// bo'lgan tuynuk), ustiga ikkalasi bir xil qatorni qulflasa
// o'z-o'zini bloklab qo'yardi.
const withTxn = (tx, work) => (tx ? work(tx) : runFinanceTxn(work));
const actorId = (u) => u?.id || u?._id || null;

const ensureStudent = async (studentId, { tx } = {}) => {
  const student = await db(tx).user.findFirst({
    where: { id: String(studentId), role: ROLES.STUDENT, isDeleted: false },
    select: { id: true, firstName: true, lastName: true, homeBranchId: true },
  });
  if (!student) throw new ApiError(400, "O'quvchi topilmadi");
  return student;
};

// O'quvchining depozit hisobi (yo'q bo'lsa yaratiladi).
// tx berilsa, ochiq tranzaksiya ichida o'qib-yozadi.
export const getOrCreate = async (student, { tx } = {}) => {
  const studentId = String(student);
  const client = db(tx);

  // ═══════════════════════════════════════════════════════════════════
  // POYGAGA CHIDAMLI YARATISH — VA NEGA `catch (P2002)` YETARLI EMAS
  // ═══════════════════════════════════════════════════════════════════
  //
  // Ilgari bu yerda `upsert` turardi, keyin unga `catch (P2002) → qayta
  // o'qish` qo'shildi. Tranzaksiyadan TASHQARIDA bu ishlaydi.
  // TRANZAKSIYA ICHIDA esa ISHLAMAYDI:
  //
  //   PostgreSQL'da tranzaksiya ichidagi HAR QANDAY xato butun
  //   tranzaksiyani ABORT holatiga o'tkazadi. Undan keyingi har bir
  //   so'rov "current transaction is aborted" bilan rad etiladi —
  //   ya'ni `catch` ichidagi qayta o'qish ham YIQILADI.
  //
  // Aynan shu ko'rindi: to'lov butunlay bitta tranzaksiyaga
  // ko'chirilgach, 10 ta parallel to'lovdan bittasi
  // `PrismaClientUnknownRequestError: studentDeposit.findUnique()`
  // bilan rad etila boshladi. Pul yo'qolmasdi (tranzaksiya to'liq
  // qaytardi), lekin so'rov bekorga yiqilardi.
  //
  // TO'G'RI YECHIM — xatoni USHLASH emas, UMUMAN CHIQARMASLIK:
  // `ON CONFLICT DO NOTHING` to'qnashuvni XATOSIZ hal qiladi, ya'ni
  // tranzaksiya SOG'LOM qoladi. Parallel yozuv hali kommit bo'lmagan
  // bo'lsa, INSERT uni KUTADI va keyin hech narsa qilmaydi; keyingi
  // SELECT esa (READ COMMITTED) allaqachon kommit bo'lgan qatorni
  // ko'radi.
  //
  // `updatedAt` OCHIQ berilishi shart: u Prisma tomonidagi `@updatedAt`
  // bo'lgani uchun bazada DEFAULT'i YO'Q (createdAt'dan farqli).
  await client.$executeRaw`
    INSERT INTO "student_deposits" ("studentId", "balance", "createdAt", "updatedAt")
    VALUES (${studentId}, 0, NOW(), NOW())
    ON CONFLICT ("studentId") DO NOTHING
  `;
  return client.studentDeposit.findUnique({ where: { studentId } });
};

export const balanceFor = async (student) => {
  const dep = await prisma.studentDeposit.findUnique({
    where: { studentId: String(student) },
    select: { balance: true },
  });
  return dep?.balance || 0;
};

// Balansni atomik o'zgartiradi. delta<0 (yechish) bo'lsa balans yetarli bo'lishi
// shart - aks holda qator yangilanmaydi (null) → chaqiruvchi xato beradi.
// tx berilsa, ochiq tranzaksiya ichida yoziladi.
const applyBalanceDelta = async (depositId, delta, { tx } = {}) => {
  const client = db(tx);
  const id = String(depositId);
  const d = Number(delta) || 0;

  // Kamaytirish: shart va yozuv BITTA amalda. `RETURNING` yangi balansni
  // beradi, ya'ni qo'shimcha o'qish (va u bilan birga poyga) shart emas.
  if (d < 0) {
    const rows = await client.$queryRaw`
      UPDATE "student_deposits"
      SET "balance" = "balance" + ${d}::numeric,
          "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND "balance" >= ${-d}::numeric
      RETURNING "id", "studentId", "balance"
    `;
    return rows.length ? rows[0] : null;
  }

  // Oshirish: shart yo'q, Prisma'ning atomik `increment` i yetarli.
  return client.studentDeposit.update({
    where: { id },
    data: { balance: { increment: d } },
  });
};

// --- DEPOZIT QO'SHISH / YECHISH ---

// isOpening - boshlang'ich qoldiq importi (qarang: openingBalance.service.js).
// Yozish yo'li ATAYLAB shu yagona funksiya: balansni oshirish, ledger yozuvi
// va autoApply bir joyda turibdi. Import uchun alohida nusxa yozilsa, ertaga
// shu uch qadamdan biri o'zgarib, ikkinchi nusxa eskirib qolardi.
export const topup = async (
  studentId,
  { amount, method, paidAt, note, isOpening = false },
  currentUser,
  { tx: outerTx } = {},
) => {
  // FILIAL: o'quvchining filiali (ensureStudent allaqachon yozuvni oladi).
  const student = await ensureStudent(studentId, { tx: outerTx });
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new ApiError(400, "Summa noto'g'ri");
  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri sana");
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Sana kelajakda bo'lishi mumkin emas");
  }

  const deposit = await getOrCreate(student.id, { tx: outerTx });
  // ── ATOMIK: balans + tranzaksiya + jurnal + audit ──
  // JURNAL: pul kassaga kirdi, lekin DAROMAD EMAS - o'quvchining
  // depoziti (majburiyat). Qarang constants/ledger.js DEPOSIT izohi.
  const txn = await withTxn(outerTx, async (tx) => {
    const updated = await applyBalanceDelta(deposit.id, amt, { tx });
    const row = await tx.depositTransaction.create({
      data: {
        branchId: student.homeBranchId || null,
        studentId: deposit.studentId,
        depositId: deposit.id,
        type: "topup",
        amount: amt,
        method: method || "cash",
        balanceAfter: updated.balance,
        note: note || "",
        isOpening: Boolean(isOpening),
        paidAt: day,
        createdById: actorId(currentUser),
      },
    });
    await financialTx.postDepositTopup(
      { depositTransactionId: row.id },
      currentUser,
      { tx },
    );
    return row;
  });

  // Pul qo'yilishi bilan mavjud qarzlarni darhol qoplaymiz (eng eskisidan).
  // TASHQI TRANZAKSIYA bo'lsa — o'sha tranzaksiyada.
  await autoApply(student.id, currentUser, { tx: outerTx });
  // txn - chaqiruvchi audit izini yozishi uchun (openingBalance.service.js
  // materializedRefs). Depozit yozuvi esa avvalgidek qaytadi.
  const fresh = await getOrCreate(student.id, { tx: outerTx });
  const out = withLegacyId(fresh);
  out.$lastTransactionId = txn.id;
  return out;
};

// Yechish uchun umumiy tekshiruvlar. To'g'ridan-to'g'ri yo'lda ham,
// tasdiqlangan so'rovni bajarishda ham AYNAN SHU qoidalar qo'llanadi.
const validateWithdraw = async (studentId, { amount, paidAt }) => {
  const student = await ensureStudent(studentId);
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new ApiError(400, "Summa noto'g'ri");
  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri sana");
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Sana kelajakda bo'lishi mumkin emas");
  }
  return { student, amt, day };
};

// Balansni kamaytirib, ledger yozuvini yozadi.
const writeWithdraw = async ({
  studentId,
  student,
  amt,
  day,
  method,
  note,
  createdBy,
  expenseApprovalId = null,
}) => {
  const deposit = await getOrCreate(studentId);
  // ── ATOMIK: qo'lda rollback O'RNIGA tranzaksiya ──
  // Ilgari balans kamaytirilib, xato bo'lsa `catch` da qaytarilardi;
  // qaytarishning o'zi yiqilsa o'quvchining puli yo'qolgandek qolardi.
  await runFinanceTxn(async (tx) => {
    const updated = await applyBalanceDelta(deposit.id, -amt, { tx });
    if (!updated) {
      throw new ApiError(
        400,
        `To'lovda yetarli mablag' yo'q (balans: ${deposit.balance} so'm)`,
      );
    }
    const row = await tx.depositTransaction.create({
      data: {
        branchId: student.homeBranchId || null,
        studentId: deposit.studentId,
        depositId: deposit.id,
        type: "withdraw",
        amount: amt,
        method: method || "cash",
        balanceAfter: updated.balance,
        note: note || "",
        paidAt: day,
        createdById: createdBy ? String(createdBy) : null,
        expenseApprovalId: expenseApprovalId ? String(expenseApprovalId) : null,
      },
    });

    // JURNAL: majburiyat kamaydi, pul kassadan chiqdi.
    await financialTx.postDepositWithdraw(
      { depositTransactionId: row.id },
      createdBy ? { id: createdBy } : null,
      { tx },
    );
    return row;
  });
  return withLegacyId(await getOrCreate(studentId));
};

export const withdraw = async (studentId, { amount, method, paidAt, note }, currentUser) => {
  const { student, amt, day } = await validateWithdraw(studentId, { amount, paidAt });

  // CHIQIM LIMITI: limitdan oshsa pul HOZIR chiqmaydi - tasdiq so'raladi.
  const { needsApproval, threshold } = await checkExpenseLimit({
    branchId: student.homeBranchId,
    amount: amt,
    permissions: currentUser?.permissions,
  });

  if (needsApproval) {
    const approval = await createRequest({
      branchId: student.homeBranchId,
      kind: EXPENSE_KINDS.DEPOSIT_WITHDRAW,
      amount: amt,
      threshold,
      payload: {
        studentId: String(student.id),
        method: method || "cash",
        paidAt: day,
        note: note || "",
      },
      subjectName: `${student.firstName} ${student.lastName || ""}`.trim(),
      contextName: "Depozitdan yechish",
      currentUser,
    });
    return { pendingApproval: true, approval };
  }

  return writeWithdraw({
    studentId: student.id,
    student,
    amt,
    day,
    method,
    note,
    createdBy: actorId(currentUser),
  });
};

/**
 * TASDIQLANGAN yechishni bajaradi (expenseApproval.service'dan chaqiriladi).
 * Avval mavjud tranzaksiya tekshiriladi - aynan bir marta kafolati.
 *
 * QISMAN UNIQUE INDEKS: (expenseApprovalId) WHERE expenseApprovalId IS NOT NULL.
 * Ya'ni bir tasdiq bo'yicha ikkinchi yechish BAZADA ham to'siladi - pastdagi
 * tekshiruv faqat tez yo'l, haqiqiy kafolat indeksda.
 */
export const executeApprovedWithdraw = async (approval) => {
  const approvalId = String(approval.id ?? approval._id);
  const existing = await prisma.depositTransaction.findFirst({
    where: { expenseApprovalId: approvalId },
  });
  if (existing) return withLegacyId(existing);

  const { studentId, method, paidAt, note } = approval.payload || {};

  // QAYTA VALIDATSIYA: so'rovdan keyin balans kamaygan bo'lishi mumkin.
  const { student, amt, day } = await validateWithdraw(studentId, {
    amount: approval.amount,
    paidAt,
  });

  await writeWithdraw({
    studentId: student.id,
    student,
    amt,
    day,
    method,
    note,
    createdBy: approval.requestedById || approval.requestedBy,
    expenseApprovalId: approvalId,
  });

  const created = await prisma.depositTransaction.findFirst({
    where: { expenseApprovalId: approvalId },
  });
  return created ? withLegacyId(created) : null;
};

// --- QOPLAMA (depozit → oylik plan) ---

// Bitta planga depozitdan `amount` qoplaydi: plan.paidAmount += (cap qoldiqqacha) +
// balans -= + PaymentTransaction(source:"deposit", DAROMAD). Haqiqatda qo'llangan
// summani qaytaradi (cap tufayli kamroq bo'lishi mumkin).
const applyToPayment = async (deposit, payment, amount, currentUser, { tx: outerTx } = {}) => {
  const remaining = Math.max(0, (payment.expectedAmount || 0) - (payment.paidAmount || 0));
  const amt = Math.min(amount, remaining);
  if (amt <= 0) return 0;

  // ── ATOMIK: depozit balansi + plan balansi + tranzaksiya + jurnal ──
  //
  // Bu eng ko'p bosqichli amal edi va rollback IKKI POG'ONALI edi
  // (avval plan, keyin balans). Ikkalasidan biri yiqilsa pul yarim
  // holatda qolardi. Endi bitta tranzaksiya.
  const done = await withTxn(outerTx, async (tx) => {
    const balUpd = await applyBalanceDelta(deposit.id, -amt, { tx });
    if (!balUpd) return 0;

    const planUpd = await studentPaymentService.applyPaidDelta(payment.id, amt, {
      capToRemaining: true,
      tx,
    });
    if (!planUpd) return 0;

    const applied = await tx.paymentTransaction.create({
      data: {
        // FILIAL: oylik plandan meros.
        branchId: payment.branchId,
        paymentId: payment.id,
        studentId: payment.studentId,
        groupId: payment.groupId,
        year: payment.year,
        month: payment.month,
        amount: amt,
        source: "deposit",
        method: "cash",
        paidAt: localTodayMidnight(),
        note: "To'lovdan qoplandi",
        createdById: actorId(currentUser),
      },
    });

    // JURNAL: PUL HARAKATI YO'Q - depozit majburiyati daromadga
    // aylanadi. Kassa qoldig'i o'zgarmaydi (pul to'ldirishda kirgan).
    await financialTx.postDepositApply(
      { paymentTransactionId: applied.id },
      currentUser,
      { tx },
    );
    return amt;
  });
  // 0 → parallel so'rov ulgurdi yoki mablag' yetmadi (tranzaksiya
  // hech narsa yozmadi, qaytarish shart emas).
  return done;
};

// Qoldiq (expected>paid) planlar sharti - ustunni ustunga solishtirish.
const OUTSTANDING = {
  expectedAmount: { gt: prisma.studentPayment.fields.paidAmount },
};

// O'quvchi depozitidan barcha qoldiq planlarni ENG ESKISIDAN boshlab qoplaydi.
export const autoApply = async (studentId, currentUser, { tx } = {}) => {
  const client = db(tx);
  const deposit = await getOrCreate(studentId, { tx });
  if ((deposit.balance || 0) <= 0) return { applied: 0 };

  // Qoldiq planlar, eng eski oy avval. Yomon qarz (write-off) yopilgan -
  // depozitdan qoplanmaydi.
  //
  // TARTIB QAT'IY (year, month, createdAt): qulflash tartibi barcha
  // parallel so'rovlarda BIR XIL bo'lishi kerak, aks holda ikki so'rov
  // bir-birining qatorini kutib qolishi (deadlock) mumkin edi.
  const plans = await client.studentPayment.findMany({
    where: { studentId: deposit.studentId, writtenOff: false, ...OUTSTANDING },
    orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
  });

  let applied = 0;
  for (const plan of plans) {
    // eslint-disable-next-line no-await-in-loop
    const fresh = await client.studentDeposit.findUnique({ where: { id: deposit.id } });
    if ((fresh?.balance || 0) <= 0) break;
    // eslint-disable-next-line no-await-in-loop
    const used = await applyToPayment(fresh, plan, fresh.balance, currentUser, { tx });
    applied += used;
  }
  return { applied };
};

// Berilgan oyda plani bor + depoziti bor o'quvchilarga autoApply (oylik job hook).
export const autoApplyForMonth = async (year, month) => {
  const rows = await prisma.studentPayment.findMany({
    where: { year, month, writtenOff: false, ...OUTSTANDING },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  const studentIds = rows.map((r) => r.studentId);

  let applied = 0;
  for (const sid of studentIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await autoApply(sid);
      applied += r.applied;
    } catch (err) {
      logger.warn({ err, student: sid }, "Depozit avto-qoplash xatosi");
    }
  }
  return { students: studentIds.length, applied };
};

// Bir refund yozuvi: plan.paidAmount -= take, balans += take, refund ledger yozuvi.
const refundOverpayChunk = async (deposit, planId, take, note) => {
  await studentPaymentService.applyPaidDelta(planId, -take);
  const balUpd = await applyBalanceDelta(deposit.id, take);
  if (!balUpd) throw new ApiError(500, "To'lovga qaytarib bo'lmadi");
  await prisma.depositTransaction.create({
    data: {
      // FILIAL: bu yerda o'quvchi yozuvi yuklanmagan - qidirib olamiz.
      branchId: await resolveBranchFromUser(deposit.studentId),
      studentId: deposit.studentId,
      depositId: deposit.id,
      type: "refund",
      amount: take,
      balanceAfter: balUpd.balance,
      note,
      paidAt: localTodayMidnight(),
    },
  });
};

// Plan kamayganda (expected<paid) ortiqcha to'lovni depozitga qaytaradi.
// recalc'dan KEYIN best-effort chaqiriladi.
// Avval DEPOZIT-qoplama tranzaksiyalari (faqat kerakli ulush - qisman reverse,
// fantom pul yaratmaymiz), yetmasa qolgan ortiqcha to'g'ridan-to'g'ri to'lov ham
// depozitga qaytadi (qoida: "overpay depozitga qaytadi").
// capAmount berilsa - ortiqcha to'lov shu chegaraga nisbatan o'lchanadi (dars-asosli
// accrual'da TO'LIQ-OY obligatsiyasi), aks holda plan.expectedAmount ga nisbatan.
// Bu avansni (butun oy narxigacha to'langan) depozitga qaytarmaslik uchun kerak.
export const reconcileDepositOverpay = async (paymentId, { capAmount } = {}) => {
  const plan = await prisma.studentPayment.findUnique({ where: { id: String(paymentId) } });
  if (!plan) return;
  const cap = capAmount != null ? capAmount : plan.expectedAmount || 0;
  const excess = (plan.paidAmount || 0) - cap;
  if (excess <= 0) return;

  const deposit = await getOrCreate(plan.studentId);
  let reversed = 0;

  // 1) Depozit-qoplama tranzaksiyalarini qisman reverse qilamiz (eng yangidan).
  const depositTxns = await prisma.paymentTransaction.findMany({
    where: { paymentId: plan.id, source: "deposit", isDeleted: false },
    orderBy: { createdAt: "desc" },
  });

  for (const txn of depositTxns) {
    if (reversed >= excess) break;
    const take = Math.min(txn.amount, excess - reversed);
    if (take >= txn.amount) {
      // Butun tranzaksiya - o'chiramiz.
      // eslint-disable-next-line no-await-in-loop
      await prisma.paymentTransaction.update({
        where: { id: txn.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    } else {
      // Qisman - faqat ortiqcha ulushni yechamiz, qolgani qoplama bo'lib qoladi.
      // eslint-disable-next-line no-await-in-loop
      await prisma.paymentTransaction.update({
        where: { id: txn.id },
        data: { amount: { decrement: take } },
      });
    }
    // eslint-disable-next-line no-await-in-loop
    await refundOverpayChunk(
      deposit,
      plan.id,
      take,
      "Oylik to'lov kamayishi - to'lovga qaytarildi",
    );
    reversed += take;
  }

  // 2) Qolgan ortiqcha to'g'ridan-to'g'ri (cash) to'lov - uni ham depozitga qaytaramiz.
  const directExcess = excess - reversed;
  if (directExcess > 0) {
    await refundOverpayChunk(
      deposit,
      plan.id,
      directExcess,
      "Ortiqcha to'lov - to'lovga qaytarildi",
    );
  }
};

// Depozit-qoplama PaymentTransaction o'chirilganda pul NAQDGA emas, DEPOZITGA
// qaytadi (transaction.service.remove chaqiradi). Balans += + refund yozuvi.
// tx berilsa, qoplamani bekor qilgan tranzaksiya ichida atomik bajariladi -
// aks holda tashqi abort/retry'da depozit ikki marta kreditlanardi.
export const refundToDeposit = async (studentId, amount, { tx, note } = {}) => {
  const client = db(tx);
  const deposit = await getOrCreate(studentId, { tx });
  const upd = await applyBalanceDelta(deposit.id, amount, { tx });
  if (!upd) throw new ApiError(500, "To'lovga qaytarib bo'lmadi");
  await client.depositTransaction.create({
    data: {
      branchId: await resolveBranchFromUser(deposit.studentId),
      studentId: deposit.studentId,
      depositId: deposit.id,
      type: "refund",
      amount,
      balanceAfter: upd.balance,
      note: note || "To'lov bekor qilindi - to'lovga qaytarildi",
      paidAt: localTodayMidnight(),
    },
  });
};

// --- DEPOZIT TRANZAKSIYASINI BEKOR QILISH (topup/withdraw) ---

export const removeDepositTxn = async (id, currentUser) => {
  const txn = await prisma.depositTransaction.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!txn) throw new ApiError(404, "Tranzaksiya topilmadi");
  if (txn.type === "refund") {
    throw new ApiError(400, "Qaytarim tranzaksiyasini o'chirib bo'lmaydi");
  }

  // ── ⚠ ATOMAR + JURNAL STORNOSI (B21 bilan o'zgardi) ──
  // Balans o'zgarishi, soft-delete va JURNAL STORNOSI BITTA
  // tranzaksiyada. Ilgari jurnal TEGILMAY qolardi — bekor qilingan
  // to'ldirish kassa qoldig'ida ABADIY qolardi.
  //
  // ⚠ `refund` turi BEKOR QILINMAYDI (yuqorida 400): qaytarim — "pul
  // HAQIQATAN qaytdi", storno esa "operatsiya BO'LMAGAN".
  const deposit = await getOrCreate(txn.studentId);
  await runFinanceTxn(async (tx) => {
    if (txn.type === "topup") {
      // Pul kelmagan deb hisoblaymiz - balansdan ayiramiz (agar qoplanmagan bo'lsa).
      const balUpd = await applyBalanceDelta(deposit.id, -txn.amount, { tx });
      if (!balUpd) {
        throw new ApiError(400, "Bu pul allaqachon qoplangan - tranzaksiyani o'chirib bo'lmaydi");
      }
    } else {
      // withdraw bekor - pul qaytib keldi.
      await applyBalanceDelta(deposit.id, txn.amount, { tx });
    }
    await tx.depositTransaction.update({
      where: { id: txn.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });
    await financialTx.reverseByRef(
      { refModel: "DepositTransaction", refId: txn.id },
      currentUser,
      { tx, memo: "Storno: depozit amali bekor qilindi" },
    );
  });
  return { id: txn.id, _id: txn.id };
};

// --- O'QISH / HISOBOTLAR ---

// O'quvchining depozit summary'si (balans + jami kirim/chiqim/qoplangan).
export const summaryFor = async (studentId) => {
  const sid = String(studentId);
  const student = await prisma.user.findUnique({
    where: { id: sid },
    select: SAFE_STUDENT_SELECT,
  });
  if (!student) throw new ApiError(404, "O'quvchi topilmadi");
  const deposit = await getOrCreate(sid);

  const [ledgerRows, appliedAgg] = await Promise.all([
    prisma.depositTransaction.groupBy({
      by: ["type"],
      where: { studentId: sid, isDeleted: false },
      _sum: { amount: true },
    }),
    prisma.paymentTransaction.aggregate({
      where: { studentId: sid, source: "deposit", isDeleted: false },
      _sum: { amount: true },
    }),
  ]);

  const ledger = Object.fromEntries(
    ledgerRows.map((r) => [r.type, r._sum.amount ?? 0]),
  );

  return {
    student: withLegacyId(student),
    balance: deposit.balance || 0,
    totalTopup: ledger.topup || 0,
    totalWithdraw: ledger.withdraw || 0,
    totalRefund: ledger.refund || 0,
    totalApplied: appliedAgg._sum.amount ?? 0,
  };
};

// O'quvchi depozit tarixi: ledger (topup/withdraw/refund) + qoplamalar (apply),
// sana bo'yicha birlashtirilgan (eng yangisi yuqorida).
export const historyFor = async (studentId) => {
  const sid = String(studentId);
  const [ledger, applies] = await Promise.all([
    prisma.depositTransaction.findMany({
      where: { studentId: sid, isDeleted: false },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.paymentTransaction.findMany({
      where: { studentId: sid, source: "deposit", isDeleted: false },
      include: { group: { select: { id: true, name: true } } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const rows = [
    ...ledger.map((t) => ({
      id: t.id,
      _id: t.id,
      kind: t.type, // topup | withdraw | refund
      amount: t.amount,
      method: t.method,
      paidAt: t.paidAt,
      note: t.note,
      balanceAfter: t.balanceAfter,
      removable: t.type !== "refund",
    })),
    ...applies.map((t) => ({
      id: t.id,
      _id: t.id,
      kind: "apply", // depozit → oylik to'lov (daromad)
      amount: t.amount,
      paidAt: t.paidAt,
      group: t.group ? withLegacyId(t.group) : null,
      year: t.year,
      month: t.month,
      note: t.note,
      removable: false,
    })),
  ].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  return rows;
};

// Owner sahifa tab1: depozit tranzaksiyalari ro'yxati (barcha o'quvchilar, filtrli).
export const list = async ({ studentId, from, to, type, page = 1, limit = 50 }) => {
  // FILIAL KO'LAMI: DepositTransaction'da `branchId` bor (o'quvchining
  // homeBranchId'sidan yoziladi), shuning uchun to'g'ridan-to'g'ri filtr.
  //
  // `branchId: null` yozuvlar (filialga biriktirilmagan o'quvchi) aniq
  // filial tanlanganda KO'RINMAYDI - fail-closed. Ular owner'ning "barcha
  // filiallar" ko'rinishida chiqadi, chunki u yerda filtr umuman qo'yilmaydi.
  const where = { ...branchFilter(), isDeleted: false };
  if (studentId) where.studentId = String(studentId);
  if (type) where.type = type;
  if (from || to) {
    where.paidAt = {};
    if (from) where.paidAt.gte = parseLocalDay(from);
    if (to) where.paidAt.lte = parseLocalDay(to);
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.depositTransaction.findMany({
      where,
      include: { student: { select: SAFE_STUDENT_SELECT } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.depositTransaction.count({ where }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

// Owner sahifa tab2: hisobotlar. Jami ushlangan balans + davr bo'yicha kirim/chiqim/
// qoplangan + per-o'quvchi balanslar (balans>0).
export const report = async ({ from, to } = {}) => {
  const range = {};
  if (from || to) {
    range.paidAt = {};
    if (from) range.paidAt.gte = parseLocalDay(from);
    if (to) range.paidAt.lte = parseLocalDay(to);
  }

  // FILIAL KO'LAMI - uchala manba UCH XIL yo'l bilan filialga bog'langan:
  //
  //   DepositTransaction  -> o'zida `branchId` bor            -> branchFilter
  //   PaymentTransaction  -> o'zida `branchId` bor (required) -> branchFilter
  //   StudentDeposit      -> `branchId` YO'Q, o'quvchiga tegishli -> branchUserFilter
  //
  // Ilgari bu yerda filtr umuman yo'q edi va hisobot butun markazning
  // pulini bitta filial soni sifatida ko'rsatardi.
  const studentScope = await branchUserFilter("studentId");

  const [ledgerRows, appliedAgg, balances] = await Promise.all([
    prisma.depositTransaction.groupBy({
      by: ["type"],
      where: { ...branchFilter(), isDeleted: false, ...range },
      _sum: { amount: true },
    }),
    prisma.paymentTransaction.aggregate({
      where: { ...branchFilter(), source: "deposit", isDeleted: false, ...range },
      _sum: { amount: true },
    }),
    prisma.studentDeposit.findMany({
      where: { ...studentScope, balance: { gt: 0 } },
      include: { student: { select: SAFE_STUDENT_SELECT } },
      orderBy: { balance: "desc" },
    }),
  ]);

  const ledger = Object.fromEntries(ledgerRows.map((r) => [r.type, r._sum.amount ?? 0]));
  const heldTotal = balances.reduce((s, d) => s + (d.balance || 0), 0);

  return {
    heldTotal,
    totalTopup: ledger.topup || 0,
    totalWithdraw: ledger.withdraw || 0,
    totalRefund: ledger.refund || 0,
    totalApplied: appliedAgg._sum.amount ?? 0,
    balances: balances.map((d) => ({
      student: d.student ? withLegacyId(d.student) : null,
      balance: d.balance,
    })),
  };
};
