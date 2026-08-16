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
export const TRANSFER_STATUSES = Object.freeze({
  IN_TRANSIT: "in_transit",
  RECEIVED: "received",
  DISPUTED: "disputed",
  CANCELED: "canceled",
});

export const SHIFT_STATUSES = Object.freeze({
  OPEN: "open",
  CLOSED: "closed",
});
