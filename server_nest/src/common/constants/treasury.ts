// ⚠ `server/src/constants/treasury.js` DAN AYNAN KO'CHIRILGAN.

/**
 * XAZINA LUG'ATLARI (inkassatsiya va kassa smenasi).
 *
 * `models/cashTransfer.model.js` va `models/shift.model.js` dan
 * ko'chirildi. Ular bazaga bog'liq emas, lekin Mongoose model fayllari
 * o'chirilganda birga yo'qolib ketardi.
 *
 * DIQQAT: `branchAnalytics/services/branchAlerts.service.js` ularni
 * AYNAN model fayllaridan import qiladi. Modellar o'chirilishidan oldin
 * o'sha import shu faylga ko'chirilishi SHART - aks holda server
 * ko'tarilmaydi.
 *
 * ⚠ `prisma/schema.prisma` dagi TransferStatus / ShiftStatus enumlari
 * bilan AYNAN bir xil bo'lishi kerak.
 */
export const TRANSFER_STATUSES = {
  IN_TRANSIT: "in_transit",
  RECEIVED: "received",
  DISPUTED: "disputed",
  CANCELED: "canceled",
} as const;

export const SHIFT_STATUSES = {
  OPEN: "open",
  CLOSED: "closed",
} as const;

/**
 * TO'LOV KANALLARI — `prisma/schema.prisma` dagi `PaymentMethod` enumi
 * bilan AYNAN bir xil bo'lishi SHART.
 *
 * Ajralib ketsa zod noto'g'ri qiymatni o'tkazadi va Postgres uni enum
 * xatosi bilan rad etadi — foydalanuvchi esa tushunarsiz 500 ko'radi
 * (aynan shu sabab `constants/expenses.js` da ham shunday ogohlantirish
 * bor).
 */
export const PAYMENT_METHODS = [
  "cash",
  "card",
  "click",
  "payme",
  "uzcard",
  "humo",
  "bank",
  "transfer",
] as const;
