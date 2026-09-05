import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SANA SXEMALARI — MAHALLIY KALENDAR KUNI QOIDASI (Asia/Tashkent)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `modules/attendance/attendance.validators.ts` DAN KO'CHIRILDI. Ular
 * u yerda tug'ilgan, lekin uchta modul (attendance, teacher-attendance,
 * grades) bir xil qoidaga muhtoj va ikkitasi attendance'ning
 * validatorini to'g'ridan-to'g'ri import qilardi — begona modulning
 * DTO fayliga bog'lanish. Qoida DOMENGA XOS EMAS: "sana yozuvda aniq
 * kalendar kuni bo'lsin" davomatga ham, bahoga ham, har qanday kunlik
 * yozuvga ham tegishli. Shuning uchun `common/`.
 *
 * ⚠ `common/utils/date.ts` (`parseLocalDay`, `isFutureLocalDay`) bilan
 * BIR JUFT: bu fayl KIRISHNI tekshiradi, u fayl QIYMATNI aylantiradi.
 */

/**
 * O'QISH uchun sana — moslashuvchan: "YYYY-MM-DD" satri ham, ISO
 * instant ham qabul qilinadi. Satr holati SAQLANADI — servis o'zi
 * `parseLocalDay` bilan mahalliy kunga keltiradi.
 */
export const dateInputSchema = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak"),
    z.coerce.date(),
  ])
  .transform((v) => (v instanceof Date ? v.toISOString() : v));

/**
 * ⚠⚠ YOZISH uchun sana — QAT'IY "YYYY-MM-DD", ISO INSTANT QABUL
 * QILINMAYDI.
 *
 * Sabab (A-2 timezone bug): mijoz `new Date().toISOString()` yuborsa,
 * u UTC instant. Toshkentda 23:30 da yozilgan davomat UTC'da 18:30 —
 * o'sha kun. Lekin 02:00 da yozilgani UTC'da OLDINGI kunning 21:00 i
 * bo'lib, +5 soat siljish bilan KEYINGI kunga o'tib ketardi va
 * davomat NOTO'G'RI kunga yozilardi. Yozuvda kalendar kuni ANIQ
 * bo'lishi shart.
 */
export const recordDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak");
