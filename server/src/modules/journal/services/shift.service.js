import Shift, { SHIFT_STATUSES } from "../../../models/shift.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ACCOUNT_KINDS, ENTRY_KINDS } from "../../../constants/ledger.js";
import {
  branchFilter,
  resolveBranchForWrite,
  isBranchAllowed,
} from "../../../helpers/branchContext.helper.js";
import * as journal from "./journal.service.js";

// KASSA SMENASI - ochish, yopish, sanoq.
//
// ── SMENA NEGA KERAK ──
// Naqd pul - yagona "yo'qolishi mumkin" bo'lgan aktiv. Terminal va Click
// summasi bank tomonidan tasdiqlanadi, naqd esa faqat SANOQ bilan.
// Smena yopilmasa, "qancha bo'lishi kerak edi" degan savolga
// solishtiradigan nuqta bo'lmaydi va kamomad oylab sezilmay qoladi.

/** Kassirning ochiq smenasi (bo'lmasa null). */
export const findOpen = (branchId, cashierId) =>
  Shift.findOne({
    branchId,
    cashierId,
    status: SHIFT_STATUSES.OPEN,
  });

/**
 * SMENA OCHISH.
 *
 * `openingCash` QO'LDA kiritilmaydi - jurnaldagi joriy naqd qoldiq
 * olinadi. Aks holda kassir smena boshida istagan raqamni yozib,
 * yopilishdagi farqni yashira olardi.
 */
export const open = async ({ cashierId, note }, currentUser) => {
  const branchId = await resolveBranchForWrite(currentUser, null);
  const cashier = cashierId || currentUser?._id;
  if (!cashier) throw new ApiError(400, "Kassir aniqlanmadi");

  const existing = await findOpen(branchId, cashier);
  if (existing) {
    throw new ApiError(409, "Bu kassirning ochiq smenasi allaqachon bor");
  }

  const openingCash = await journal.accountBalance(branchId, ACCOUNT_KINDS.CASH);

  return Shift.create({
    branchId,
    cashierId: cashier,
    openedAt: new Date(),
    openedBy: currentUser?._id || null,
    // Manfiy qoldiq (nazariy jihatdan bo'lmasligi kerak) nolga keltiriladi -
    // model `min: 0` talab qiladi va manfiy ochilish summasi keyingi
    // hisoblarni chalkashtirardi.
    openingCash: Math.max(0, openingCash),
    status: SHIFT_STATUSES.OPEN,
    varianceNote: note || "",
  });
};

/**
 * SMENA YOPISH - sanoq va farqni jurnalga yozish.
 *
 * ── FARQ QANDAY YOZILADI ──
 * KAMOMAD (sanoq < kutilgan): naqd hisobi kamayadi, `shortage` hisobi
 * o'sadi. Bu XARAJAT EMAS - alohida hisob, chunki u yo'qotish va mas'ul
 * shaxsga bog'lanadi (constants/ledger.js).
 *
 * ORTIQCHA (sanoq > kutilgan): naqd o'sadi, qarshi tomon `shortage`
 * hisobining teskarisi - ya'ni oldingi kamomad qoplanadi yoki ortiqcha
 * qayd etiladi. Ortiqcha ham xato belgisi: u odatda yozilmagan to'lov
 * yoki noto'g'ri qaytim demakdir.
 *
 * FARQ NOL bo'lsa jurnalga HECH NARSA yozilmaydi - bo'sh yozuv shovqin.
 */
export const close = async (shiftId, { countedCash, note }, currentUser) => {
  const shift = await Shift.findById(shiftId);
  if (!shift) throw new ApiError(404, "Smena topilmadi");
  if (!isBranchAllowed(shift.branchId)) {
    throw new ApiError(403, "Bu smenaga kirish huquqingiz yo'q");
  }
  if (shift.status !== SHIFT_STATUSES.OPEN) {
    throw new ApiError(409, "Smena allaqachon yopilgan");
  }

  const counted = Math.round(Number(countedCash));
  if (!Number.isFinite(counted) || counted < 0) {
    throw new ApiError(400, "Sanalgan summa manfiy bo'lmagan son bo'lishi kerak");
  }

  const closedAt = new Date();

  // KUTILGAN SUMMA - jurnaldan. Smena davridagi harakat emas, JORIY
  // qoldiq olinadi: kassada hozir qancha pul turishi kerakligini
  // aynan shu ko'rsatadi.
  const expected = await journal.accountBalance(shift.branchId, ACCOUNT_KINDS.CASH);
  const variance = counted - expected;

  if (variance !== 0) {
    const isShortage = variance < 0;
    const amount = Math.abs(variance);

    await journal.post({
      branchId: shift.branchId,
      date: closedAt,
      kind: ENTRY_KINDS.SHIFT_CLOSE,
      memo: isShortage
        ? `Smena yopilishi: kamomad ${amount}`
        : `Smena yopilishi: ortiqcha ${amount}`,
      lines: isShortage
        ? [
            { accountKind: ACCOUNT_KINDS.SHORTAGE, debit: amount },
            { accountKind: ACCOUNT_KINDS.CASH, credit: amount },
          ]
        : [
            { accountKind: ACCOUNT_KINDS.CASH, debit: amount },
            { accountKind: ACCOUNT_KINDS.SHORTAGE, credit: amount },
          ],
      refModel: "Shift",
      refId: shift._id,
      createdBy: currentUser?._id || null,
    });
  }

  shift.closedAt = closedAt;
  shift.closedBy = currentUser?._id || null;
  shift.expectedCash = expected;
  shift.countedCash = counted;
  shift.variance = variance;
  if (note) shift.varianceNote = note;
  shift.status = SHIFT_STATUSES.CLOSED;
  await shift.save();

  return shift;
};

/** Smenalar ro'yxati - filial ko'lami bilan. */
export const list = async ({ status, cashierId, page = 1, limit = 50 } = {}) => {
  const filter = { ...branchFilter() };
  if (status) filter.status = status;
  if (cashierId) filter.cashierId = cashierId;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Shift.find(filter)
      .sort({ openedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("cashierId", { firstName: 1, lastName: 1, username: 1 })
      .populate("branchId", { name: 1, code: 1 })
      .lean(),
    Shift.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};
