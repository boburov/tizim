import { randomBytes } from "node:crypto";
import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId } from "../../../utils/serialize.js";
import { resolveBranchForWrite, isBranchAllowed } from "../../../helpers/branchContext.helper.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import { runFinanceTxn } from "../../finance/services/financeTxn.helper.js";
import * as financialTx from "../../finance/services/financialTransaction.service.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * MOLIYAVIY AMALLAR — HTTP yuzasi
 * ══════════════════════════════════════════════════════════════════════
 *
 * STEP 4 da qaytarim, ichki o'tkazma va egasining puli uchun SERVIS
 * yozilgan edi, lekin ularni chaqiradigan ENDPOINT yo'q edi — ya'ni
 * imkoniyat kodda bor, foydalanuvchi uchun esa yo'q. STEP 5.1 da
 * ruxsatlar ham tayyorlandi (`finance.manage_refunds`,
 * `finance.manage_transfers`), lekin hech narsani qo'riqlamasdi.
 *
 * Bu modul o'sha bo'shliqni yopadi va BOSHQA HECH NARSA QILMAYDI:
 *   • buxgalteriya mantig'i YO'Q — hammasi financialTransaction'da
 *   • hisob-kitob YO'Q
 *   • yangi jadval YO'Q
 *
 * ── IDEMPOTENTLIK ──
 * Har amal `idempotencyKey` qabul qiladi (klient forma ochilganda bir
 * marta yaratadi). U `postingKey` ga aylanadi va DB darajasidagi unique
 * indeks takroriy yozuvni to'sadi — "Yuborish" tugmasi ikki marta
 * bosilsa ham pul ikki marta harakatlanmaydi.
 *
 * Kalit berilmasa server o'zi yaratadi. Bu ATAYLAB ruxsat etilgan
 * (skript va integratsiya uchun), lekin UI HAR DOIM o'zi yuboradi —
 * aks holda tarmoq uzilib qayta urinilganda himoya yo'qolardi.
 */

const actorId = (u) => u?.id || u?._id || null;
const genKey = () => randomBytes(12).toString("hex");

const resolveDay = (value) => {
  const day = value ? parseLocalDay(value) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Sana noto'g'ri");
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Sana kelajakda bo'lishi mumkin emas");
  }
  return day;
};

/**
 * QAYTARIM: hujjat yaratiladi va DARHOL bajariladi — bitta tranzaksiyada.
 *
 * NEGA IKKALASI BIRGA: "yaratildi, lekin bajarilmadi" holatidagi qaytarim
 * hech kimga foyda bermaydi — pul kassada turaveradi, hujjat esa
 * hisobotda "kutilmoqda" bo'lib osilib qoladi. Tasdiq zanjiri kerak
 * bo'lsa u `Approval` orqali qo'shiladi (mavjud mexanizm), bu yerda
 * emas.
 *
 * Summa tekshiruvi (`qaytarim <= to'langan`) `postRefund` ichida —
 * takrorlanmaydi.
 */
export const createRefund = async (body, currentUser) => {
  const student = await prisma.user.findFirst({
    where: { id: String(body.studentId), role: "student", isDeleted: false },
    select: { id: true, homeBranchId: true },
  });
  if (!student) throw new ApiError(404, "O'quvchi topilmadi");

  // FILIAL: o'quvchining filiali; ko'lam tekshiriladi.
  const branchId = await resolveBranchForWrite(currentUser, student.homeBranchId);
  if (!branchId) throw new ApiError(400, "Filial aniqlanmadi");

  let groupId = body.groupId || null;
  let membershipId = null;
  if (body.originalTransactionId) {
    const orig = await prisma.paymentTransaction.findUnique({
      where: { id: String(body.originalTransactionId) },
      select: { id: true, studentId: true, groupId: true, isDeleted: true, paymentId: true },
    });
    if (!orig || orig.isDeleted) throw new ApiError(404, "Asl to'lov topilmadi");
    if (String(orig.studentId) !== String(student.id)) {
      throw new ApiError(400, "Asl to'lov boshqa o'quvchiga tegishli");
    }
    groupId = groupId || orig.groupId;
    const plan = await prisma.studentPayment.findUnique({
      where: { id: orig.paymentId }, select: { membershipId: true },
    });
    membershipId = plan?.membershipId || null;
  }

  return runFinanceTxn(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        branchId,
        studentId: student.id,
        groupId,
        membershipId,
        originalTransactionId: body.originalTransactionId || null,
        amount: Math.round(Number(body.amount)),
        method: body.method || "cash",
        reason: body.reason || "",
        requestedById: actorId(currentUser),
        createdById: actorId(currentUser),
        approvedById: actorId(currentUser),
        approvedAt: new Date(),
        executedAt: resolveDay(body.date),
      },
    });
    await financialTx.postRefund({ refundId: refund.id }, currentUser, { tx });
    return withLegacyId(await tx.refund.findUnique({ where: { id: refund.id } }));
  });
};

/** ICHKI O'TKAZMA — bitta filial ichida hisobdan hisobga. */
export const createTransfer = async (body, currentUser) => {
  const branchId = await resolveBranchForWrite(currentUser, body.branchId ?? null);
  if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
  if (!isBranchAllowed(currentUser, branchId)) {
    throw new ApiError(403, "Bu filialda amal bajarib bo'lmaydi");
  }

  const res = await financialTx.postTransfer(
    {
      branchId,
      fromMethod: body.fromMethod,
      toMethod: body.toMethod,
      amount: Math.round(Number(body.amount)),
      reference: body.idempotencyKey || genKey(),
      date: resolveDay(body.date),
      memo: body.memo || "",
    },
    currentUser,
  );
  return { entryId: res.entry?.id || null, duplicate: Boolean(res.duplicate) };
};

/**
 * EGASINING PULI — investitsiya yoki yechib olish.
 *
 * Yagona kirish nuqtasi: yo'nalish `direction` maydonida. Ikki alohida
 * endpoint o'rniga bitta — ular AYNAN bir xil tekshiruvlardan o'tadi va
 * faqat yozuv yo'nalishi bilan farq qiladi.
 */
export const createOwnerCapital = async (body, currentUser) => {
  const branchId = await resolveBranchForWrite(currentUser, body.branchId ?? null);
  if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
  if (!isBranchAllowed(currentUser, branchId)) {
    throw new ApiError(403, "Bu filialda amal bajarib bo'lmaydi");
  }

  const args = {
    branchId,
    amount: Math.round(Number(body.amount)),
    method: body.method || "cash",
    reference: body.idempotencyKey || genKey(),
    date: resolveDay(body.date),
    memo: body.memo || "",
    ownerId: actorId(currentUser),
  };

  const res = body.direction === "withdrawal"
    ? await financialTx.postOwnerWithdrawal(args, currentUser)
    : await financialTx.postOwnerInvestment(args, currentUser);

  return {
    direction: body.direction,
    entryId: res.entry?.id || null,
    duplicate: Boolean(res.duplicate),
  };
};
