/**
 * DARSNI BEKOR QILISH SABABLARI.
 *
 * `models/lessonCancellation.model.js` dan ko'chirildi - bu ro'yxat bazaga
 * bog'liq emas va model fayllari migratsiya oxirida o'chiriladi.
 * Qiymatlar `prisma/schema.prisma` dagi `enum CancellationReason` bilan
 * AYNAN bir xil bo'lishi shart.
 */
export const CANCELLATION_REASONS = [
  "teacher_absent", // o'qituvchi kelmadi
  "facility", // xona/jihoz/svet muammosi
  "weather", // ob-havo
  "other",
];
