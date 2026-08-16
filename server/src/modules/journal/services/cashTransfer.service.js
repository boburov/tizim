import prisma from "../../../config/prisma.js";
import { TRANSFER_STATUSES } from "../../../constants/treasury.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import { ACCOUNT_KINDS, ENTRY_KINDS } from "../../../constants/ledger.js";
import {
  resolveBranchForWrite,
  isBranchAllowed,
  branchFilter,
} from "../../../helpers/branchContext.helper.js";
import * as journal from "./journal.service.js";

// INKASSATSIYA - filial kassasidan markazga (yoki boshqa filialga) pul.
//
// ══════════════════════════════════════════════════════════════════
// JURNAL YOZUVLARI - eng nozik qism, shuning uchun to'liq izohlanadi
// ══════════════════════════════════════════════════════════════════
//
// A filial B filialga 5 000 000 jo'natdi.
//
// ── 1-QADAM: JO'NATISH (A filialda bitta yozuv) ──
//   Debet  transit(A)  5 000 000    ← pul "yo'lda", lekin hali A niki
//   Kredit cash(A)     5 000 000    ← kassadan chiqdi
//
//   A ning kassasi kamaydi, lekin umumiy mablag'i O'ZGARMADI - u
//   shunchaki "yo'lda". Aynan shu sababdan `transit` XAZINA hisoblari
//   ro'yxatiga kiradi (TREASURY_KINDS).
//
// ── 2-QADAM: QABUL QILISH (IKKI yozuv, har filialda bittadan) ──
//
//   A filialda:
//     Debet  due_from(B)  5 000 000  ← endi B bizga qarzdor
//     Kredit transit(A)   5 000 000  ← yo'ldagi pul yopildi
//
//   B filialda:
//     Debet  cash(B)      5 000 000  ← pul kassaga kirdi
//     Kredit due_to(A)    5 000 000  ← A ga qarzdormiz
//
//   Har bir yozuv O'Z ICHIDA muvozanatda - shuning uchun har filialning
//   jurnali mustaqil to'g'ri qoladi.
//
//   INVARIANT: due_from(A→B) === due_to(B→A). Buni
//   journal.checkInterBranchBalance() tekshiradi.
//
// ── ELIMINATION ──
//   Barcha shu yozuvlar `isInternal: true`. Konsolidatsiyalangan
//   hisobotda ular chiqarib tashlanadi - aks holda bir xil 5 mln ikki
//   marta sanalardi (A ning chiqimi + B ning kirimi).
//
// ── FARQ (kam yetib kelsa) ──
//   B faqat HAQIQATAN kelgan summani kassaga oladi, A esa farqni
//   `shortage(A)` ga yozadi: pul A ning javobgarligida yo'qolgan.

const actorId = (u) => u?.id || u?._id || null;

const assertBranchExists = async (id) => {
  const b = await prisma.branch.findFirst({
    where: { id: String(id), isDeleted: false },
    select: { id: true },
  });
  if (!b) throw new ApiError(400, "Filial topilmadi");
  return b;
};

/**
 * HOLATNI ATOMIK O'ZGARTIRADI (compare-and-set).
 *
 * ═══════════════════════════════════════════════════════════════════
 * BU ENG XAVFLI JOY EDI. Mongo'da naqsh shunday edi:
 *
 *   const t = await CashTransfer.findById(id);
 *   if (t.status !== IN_TRANSIT) throw;    // <- O'QISH
 *   ... journal.post() x2 ...              // <- PULNI YOZISH
 *   t.status = RECEIVED; await t.save();   // <- YOZISH
 *
 * Ikki `receive` bir vaqtda kelsa IKKALASI ham `in_transit` ni o'qiydi,
 * IKKALASI ham tekshiruvdan o'tadi va IKKALASI ham jurnal yozuvlarini
 * yozadi. Natija: `due_from` / `due_to` va kassa IKKI BAROBAR oshadi -
 * ya'ni yo'qdan pul paydo bo'ladi.
 *
 * `updateMany` esa bitta `UPDATE ... WHERE id = ? AND status = ?`
 * SQL'iga aylanadi: qatorni QULFLAB o'zgartiradi. Ikkinchi so'rov
 * `count: 0` oladi va hech narsa yozmaydi.
 *
 * SHUNING UCHUN HOLAT AVVAL O'ZGARADI, jurnal keyin yoziladi - va
 * ikkalasi BITTA tranzaksiyada (chaqiruvchi `tx` beradi).
 * ═══════════════════════════════════════════════════════════════════
 */
const claimTransfer = async (tx, id, { from, data, conflict }) => {
  const { count } = await tx.cashTransfer.updateMany({
    where: { id: String(id), status: from },
    data,
  });
  if (!count) throw new ApiError(409, conflict);
  return tx.cashTransfer.findUnique({ where: { id: String(id) } });
};

/**
 * JO'NATISH. Pul kassadan chiqadi va "yo'lda" holatiga o'tadi.
 */
export const send = async ({ toBranchId, amount, note, shiftId }, currentUser) => {
  const fromBranchId = await resolveBranchForWrite(currentUser, null);
  await assertBranchExists(toBranchId);

  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApiError(400, "Summa musbat son bo'lishi kerak");
  }
  if (String(fromBranchId) === String(toBranchId)) {
    throw new ApiError(400, "Filial o'ziga pul jo'nata olmaydi");
  }

  // KASSADA YETARLI PUL BORMI.
  //
  // Tekshirmasak jurnal manfiy naqd qoldiq ko'rsatardi - bu fizik
  // jihatdan mumkin emas va hisobotni ma'nosiz qilardi.
  const cash = await journal.accountBalance(fromBranchId, ACCOUNT_KINDS.CASH);
  if (value > cash) {
    throw new ApiError(
      400,
      `Kassada yetarli naqd yo'q. Mavjud: ${cash}, so'ralgan: ${value}`,
    );
  }

  const sentAt = new Date();

  // O'TKAZMA VA JURNAL BITTA TRANZAKSIYADA.
  //
  // Ilgari ular alohida edi: `create()` o'tgan-u, `post()` yiqilsa
  // bazada "yo'ldagi pul" yozuvi qolardi, jurnalda esa uning izi
  // YO'Q edi. Kassa qoldig'i bilan o'tkazmalar ro'yxati bir-biriga
  // zid bo'lib qolardi va buni faqat `journalVerify` topardi.
  const transfer = await prisma.$transaction(async (tx) => {
    const row = await tx.cashTransfer.create({
      data: {
        fromBranchId: String(fromBranchId),
        toBranchId: String(toBranchId),
        amount: value,
        status: TRANSFER_STATUSES.IN_TRANSIT,
        sentById: actorId(currentUser),
        sentAt,
        shiftId: shiftId || null,
        note: note || "",
      },
    });

    await journal.post({
      branchId: fromBranchId,
      date: sentAt,
      kind: ENTRY_KINDS.TRANSFER_SEND,
      memo: `Inkassatsiya jo'natildi: ${value}`,
      lines: [
        { accountKind: ACCOUNT_KINDS.TRANSIT, debit: value },
        { accountKind: ACCOUNT_KINDS.CASH, credit: value },
      ],
      refModel: "CashTransfer",
      refId: row.id,
      isInternal: true,
      counterpartyBranchId: toBranchId,
      createdBy: actorId(currentUser),
      tx,
    });

    return row;
  });

  return withLegacyId(transfer);
};

/**
 * QABUL QILISH. Sanoq bilan - farq bo'lsa u ham yoziladi.
 *
 * Faqat QABUL QILUVCHI filial bajaradi: jo'natuvchi o'zi "yetib keldi"
 * deb belgilay olsa, yo'ldagi pul nazorati ma'nosini yo'qotardi.
 */
export const receive = async (transferId, { countedAmount, note }, currentUser) => {
  const transfer = await prisma.cashTransfer.findUnique({
    where: { id: String(transferId) },
  });
  if (!transfer) throw new ApiError(404, "O'tkazma topilmadi");

  // Bu ODDIY tekshiruv - foydalanuvchiga tushunarli xato berish uchun.
  // HAQIQIY himoya pastdagi `claimTransfer` da (atomik).
  if (transfer.status !== TRANSFER_STATUSES.IN_TRANSIT) {
    throw new ApiError(409, "Bu o'tkazma allaqachon ko'rib chiqilgan");
  }
  if (!isBranchAllowed(transfer.toBranchId)) {
    throw new ApiError(403, "Bu o'tkazmani faqat qabul qiluvchi filial tasdiqlaydi");
  }

  const counted =
    countedAmount === undefined || countedAmount === null
      ? transfer.amount
      : Math.round(Number(countedAmount));
  if (!Number.isFinite(counted) || counted < 0) {
    throw new ApiError(400, "Sanalgan summa manfiy bo'lmagan son bo'lishi kerak");
  }

  const receivedAt = new Date();
  const discrepancy = counted - transfer.amount;
  const from = transfer.fromBranchId;
  const to = transfer.toBranchId;

  // ── A filial: yo'ldagi pul yopiladi ──
  //
  // Transit TO'LIQ summaga yopiladi (jo'natilgani qancha bo'lsa),
  // qarshi tomon esa ikkiga bo'linadi: haqiqatan yetgani due_from ga,
  // yetmagani shortage ga. Shunda A ning jurnali muvozanatda qoladi.
  const aLines = [{ accountKind: ACCOUNT_KINDS.TRANSIT, credit: transfer.amount }];
  if (counted > 0) {
    aLines.unshift({
      accountKind: ACCOUNT_KINDS.DUE_FROM,
      debit: counted,
      counterpartyBranchId: to,
    });
  }
  if (discrepancy < 0) {
    // Kam yetdi - farq jo'natuvchining YO'QOTISHI.
    aLines.push({ accountKind: ACCOUNT_KINDS.SHORTAGE, debit: -discrepancy });
  } else if (discrepancy > 0) {
    // Ko'p yetdi - jo'natishda kam yozilgan. Ortiqcha ham xato belgisi.
    aLines.push({ accountKind: ACCOUNT_KINDS.SHORTAGE, credit: discrepancy });
  }

  // HOLAT AVVAL, PUL KEYIN - hammasi BITTA tranzaksiyada.
  //
  // Tartib ataylab shunday: `claimTransfer` qatorni qulflab holatni
  // o'zgartiradi, ya'ni ikkinchi bir vaqtdagi `receive` shu yerda
  // to'xtaydi va jurnalga UMUMAN yetib bormaydi. Jurnal yozuvlari
  // esa o'sha tranzaksiya ichida - biror biri yiqilsa holat ham
  // qaytariladi (rollback).
  const saved = await prisma.$transaction(async (tx) => {
    const claimed = await claimTransfer(tx, transferId, {
      from: TRANSFER_STATUSES.IN_TRANSIT,
      data: {
        countedOnArrival: counted,
        discrepancy,
        receivedById: actorId(currentUser),
        receivedAt,
        // Farq bo'lsa DISPUTED - hisobotda ajralib tursin va tekshirilsin.
        status:
          discrepancy === 0 ? TRANSFER_STATUSES.RECEIVED : TRANSFER_STATUSES.DISPUTED,
        ...(note ? { discrepancyNote: note } : {}),
      },
      conflict: "Bu o'tkazma allaqachon ko'rib chiqilgan",
    });

    await journal.post({
      branchId: from,
      date: receivedAt,
      kind: ENTRY_KINDS.TRANSFER_RECEIVE,
      memo: discrepancy
        ? `Inkassatsiya qabul qilindi (farq ${discrepancy})`
        : "Inkassatsiya qabul qilindi",
      lines: aLines,
      refModel: "CashTransfer",
      refId: claimed.id,
      isInternal: true,
      counterpartyBranchId: to,
      createdBy: actorId(currentUser),
      tx,
    });

    // ── B filial: HAQIQATAN kelgan summa kassaga kiradi ──
    if (counted > 0) {
      await journal.post({
        branchId: to,
        date: receivedAt,
        kind: ENTRY_KINDS.TRANSFER_RECEIVE,
        memo: `Inkassatsiya qabul qilindi: ${counted}`,
        lines: [
          { accountKind: ACCOUNT_KINDS.CASH, debit: counted },
          {
            accountKind: ACCOUNT_KINDS.DUE_TO,
            credit: counted,
            counterpartyBranchId: from,
          },
        ],
        refModel: "CashTransfer",
        refId: claimed.id,
        isInternal: true,
        counterpartyBranchId: from,
        createdBy: actorId(currentUser),
        tx,
      });
    }

    return claimed;
  });

  return withLegacyId(saved);
};

/**
 * BEKOR QILISH - pul kassaga qaytadi.
 *
 * Faqat JO'NATUVCHI filial, faqat hali qabul qilinmagan holatda.
 */
export const cancel = async (transferId, { note }, currentUser) => {
  const transfer = await prisma.cashTransfer.findUnique({
    where: { id: String(transferId) },
  });
  if (!transfer) throw new ApiError(404, "O'tkazma topilmadi");

  if (transfer.status !== TRANSFER_STATUSES.IN_TRANSIT) {
    throw new ApiError(409, "Faqat yo'ldagi o'tkazmani bekor qilish mumkin");
  }
  if (!isBranchAllowed(transfer.fromBranchId)) {
    throw new ApiError(403, "Faqat jo'natuvchi filial bekor qila oladi");
  }

  const at = new Date();

  // `receive` bilan bir xil naqsh: holat atomik olinadi, pul o'sha
  // tranzaksiyada qaytariladi. Aks holda bir vaqtda kelgan
  // `cancel` + `receive` ikkalasi ham o'tib, pul ham kassaga
  // qaytarilib, ham qabul qilingan bo'lardi.
  const saved = await prisma.$transaction(async (tx) => {
    const claimed = await claimTransfer(tx, transferId, {
      from: TRANSFER_STATUSES.IN_TRANSIT,
      data: {
        status: TRANSFER_STATUSES.CANCELED,
        ...(note ? { note } : {}),
      },
      conflict: "Faqat yo'ldagi o'tkazmani bekor qilish mumkin",
    });

    await journal.post({
      branchId: claimed.fromBranchId,
      date: at,
      kind: ENTRY_KINDS.TRANSFER_SEND,
      memo: "Inkassatsiya bekor qilindi - pul kassaga qaytdi",
      lines: [
        { accountKind: ACCOUNT_KINDS.CASH, debit: claimed.amount },
        { accountKind: ACCOUNT_KINDS.TRANSIT, credit: claimed.amount },
      ],
      refModel: "CashTransfer",
      refId: claimed.id,
      isInternal: true,
      counterpartyBranchId: claimed.toBranchId,
      createdBy: actorId(currentUser),
      tx,
    });

    return claimed;
  });

  return withLegacyId(saved);
};

/**
 * Ro'yxat.
 *
 * FILIAL KO'LAMI IKKI TOMONLAMA: filial O'ZI jo'natgan va O'ZIGA
 * kelayotgan o'tkazmalarni ko'radi. Bir tomonlama filtr bo'lsa,
 * qabul qiluvchi kutilayotgan pulni umuman ko'rmasdi.
 */
export const list = async ({ status, page = 1, limit = 50 } = {}) => {
  const scopeFrom = branchFilter("fromBranchId");
  const scopeTo = branchFilter("toBranchId");

  const where = {};
  if (Object.keys(scopeFrom).length) {
    where.OR = [scopeFrom, scopeTo];
  }
  if (status) where.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.cashTransfer.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip,
      take: limit,
      // Mongo `.populate("fromBranchId", ...)` maydonning O'ZINI
      // obyektga almashtirardi. Prisma esa ALOHIDA relation qaytaradi
      // (`fromBranch`), ustun esa satr bo'lib qoladi. Klient eski
      // shaklni kutadi (`r.fromBranchId?.name`), shuning uchun javob
      // chegarasida `withPopulatedShape` bilan qayta tuziladi.
      include: {
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        sentBy: { select: { id: true, firstName: true, lastName: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.cashTransfer.count({ where }),
  ]);

  return {
    items: withLegacyIds(items.map(toLegacyShape)),
    total,
    page,
    limit,
  };
};

/**
 * Prisma relation'larini ESKI populate shakliga qaytaradi.
 *
 * Klient `r.fromBranchId?.name` deb o'qiydi - ya'ni maydonning o'zi
 * obyekt bo'lishi kerak. Buni javob CHEGARASIDA qilamiz: servis
 * ichida ustun satr bo'lib qolaveradi (filtrlash va solishtirish
 * uchun shu kerak).
 */
const toLegacyShape = (row) => ({
  ...row,
  fromBranchId: row.fromBranch || row.fromBranchId,
  toBranchId: row.toBranch || row.toBranchId,
  sentBy: row.sentBy || row.sentById,
  receivedBy: row.receivedBy || row.receivedById,
});
