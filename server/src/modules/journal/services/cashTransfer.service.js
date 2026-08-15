import CashTransfer, { TRANSFER_STATUSES } from "../../../models/cashTransfer.model.js";
import Branch from "../../../models/branch.model.js";
import ApiError from "../../../utils/ApiError.js";
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

const assertBranchExists = async (id) => {
  const b = await Branch.findOne({ _id: id, isDeleted: false }).select("_id").lean();
  if (!b) throw new ApiError(400, "Filial topilmadi");
  return b;
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
  const transfer = await CashTransfer.create({
    fromBranchId,
    toBranchId,
    amount: value,
    status: TRANSFER_STATUSES.IN_TRANSIT,
    sentBy: currentUser?._id || null,
    sentAt,
    shiftId: shiftId || null,
    note: note || "",
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
    refId: transfer._id,
    isInternal: true,
    counterpartyBranchId: toBranchId,
    createdBy: currentUser?._id || null,
  });

  return transfer;
};

/**
 * QABUL QILISH. Sanoq bilan - farq bo'lsa u ham yoziladi.
 *
 * Faqat QABUL QILUVCHI filial bajaradi: jo'natuvchi o'zi "yetib keldi"
 * deb belgilay olsa, yo'ldagi pul nazorati ma'nosini yo'qotardi.
 */
export const receive = async (transferId, { countedAmount, note }, currentUser) => {
  const transfer = await CashTransfer.findById(transferId);
  if (!transfer) throw new ApiError(404, "O'tkazma topilmadi");

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

  await journal.post({
    branchId: from,
    date: receivedAt,
    kind: ENTRY_KINDS.TRANSFER_RECEIVE,
    memo: discrepancy
      ? `Inkassatsiya qabul qilindi (farq ${discrepancy})`
      : "Inkassatsiya qabul qilindi",
    lines: aLines,
    refModel: "CashTransfer",
    refId: transfer._id,
    isInternal: true,
    counterpartyBranchId: to,
    createdBy: currentUser?._id || null,
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
      refId: transfer._id,
      isInternal: true,
      counterpartyBranchId: from,
      createdBy: currentUser?._id || null,
    });
  }

  transfer.countedOnArrival = counted;
  transfer.discrepancy = discrepancy;
  transfer.receivedBy = currentUser?._id || null;
  transfer.receivedAt = receivedAt;
  // Farq bo'lsa DISPUTED - hisobotda ajralib tursin va tekshirilsin.
  transfer.status = discrepancy === 0 ? TRANSFER_STATUSES.RECEIVED : TRANSFER_STATUSES.DISPUTED;
  if (note) transfer.discrepancyNote = note;
  await transfer.save();

  return transfer;
};

/**
 * BEKOR QILISH - pul kassaga qaytadi.
 *
 * Faqat JO'NATUVCHI filial, faqat hali qabul qilinmagan holatda.
 */
export const cancel = async (transferId, { note }, currentUser) => {
  const transfer = await CashTransfer.findById(transferId);
  if (!transfer) throw new ApiError(404, "O'tkazma topilmadi");

  if (transfer.status !== TRANSFER_STATUSES.IN_TRANSIT) {
    throw new ApiError(409, "Faqat yo'ldagi o'tkazmani bekor qilish mumkin");
  }
  if (!isBranchAllowed(transfer.fromBranchId)) {
    throw new ApiError(403, "Faqat jo'natuvchi filial bekor qila oladi");
  }

  const at = new Date();
  await journal.post({
    branchId: transfer.fromBranchId,
    date: at,
    kind: ENTRY_KINDS.TRANSFER_SEND,
    memo: "Inkassatsiya bekor qilindi - pul kassaga qaytdi",
    lines: [
      { accountKind: ACCOUNT_KINDS.CASH, debit: transfer.amount },
      { accountKind: ACCOUNT_KINDS.TRANSIT, credit: transfer.amount },
    ],
    refModel: "CashTransfer",
    refId: transfer._id,
    isInternal: true,
    counterpartyBranchId: transfer.toBranchId,
    createdBy: currentUser?._id || null,
  });

  transfer.status = TRANSFER_STATUSES.CANCELED;
  if (note) transfer.note = note;
  await transfer.save();
  return transfer;
};

/**
 * Ro'yxat.
 *
 * FILIAL KO'LAMI IKKI TOMONLAMA: filial O'ZI jo'natgan va O'ZIGA
 * kelayotgan o'tkazmalarni ko'radi. Bir tomonlama filtr bo'lsa,
 * qabul qiluvchi kutilayotgan pulni umuman ko'rmasdi.
 */
export const list = async ({ status, page = 1, limit = 50 } = {}) => {
  const scope = branchFilter("fromBranchId");
  const scopeTo = branchFilter("toBranchId");

  const filter = {};
  if (Object.keys(scope).length) {
    filter.$or = [scope, scopeTo];
  }
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    CashTransfer.find(filter)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("fromBranchId", { name: 1, code: 1 })
      .populate("toBranchId", { name: 1, code: 1 })
      .populate("sentBy", { firstName: 1, lastName: 1 })
      .populate("receivedBy", { firstName: 1, lastName: 1 })
      .lean(),
    CashTransfer.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};
