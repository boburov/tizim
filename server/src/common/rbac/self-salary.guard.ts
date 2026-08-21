import { ApiError } from '../errors/api-error.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'ZIGA O'ZI MAOSH BELGILASHGA QARSHI TO'SIQ
 * (`helpers/selfSalary.guard.js` KO'CHIRMASI).
 *
 * NEGA KERAK: filial rahbariga o'z filialida to'liq huquq berilgan,
 * jumladan o'qituvchi stavkasini belgilash. Lekin u O'ZINI o'qituvchi
 * sifatida ham yozdirib (`staff_hire` + rol biriktirish) O'ZIGA istagan
 * stavkani qo'yib olishi mumkin edi.
 *
 * NEGA BUTUN TOIFA BLOKLANMAYDI: dastlab maosh turlariga `auto` rejimi
 * umuman berilmagan edi, ya'ni HAR BIR stavka owner tasdig'iga tushardi.
 * Bu haqiqiy muammoni hal qilardi, lekin yo'l-yo'lakay oddiy ishni ham
 * to'sib qo'yardi — direktor 20 ta o'qituvchisining stavkasini qo'ya
 * olmasdi. Aniq to'siq to'g'riroq.
 *
 * NEGA RUXSATDAN QAT'I NAZAR: bu BIZNES INVARIANTI, huquq masalasi emas.
 * Owner ham o'ziga stavka qo'ymasligi kerak.
 *
 * ⚠ AKTYOR ID'si IKKI NOMDA bo'lishi mumkin: `_id` (eski chaqiruvchilar)
 * va `id` (sof Prisma obyektlari). FAQAT `_id` ga tayanish XAVFSIZLIK
 * TESHIGI bo'lardi — Prisma obyektida u yo'q, ya'ni tekshiruv
 * "kontekstsiz" deb JIMGINA o'tkazib yuborilardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const assertNotSelfSalary = (
  currentUser: { id?: string; _id?: string } | null | undefined,
  targetTeacherId: string | { id?: string; _id?: string } | null | undefined,
): void => {
  const actorRaw = currentUser?.id || currentUser?._id;

  // Kontekstsiz (seed / job / migratsiya) — tekshirilmaydi.
  if (!actorRaw || !targetTeacherId) return;

  const actor = String(actorRaw);
  const t = targetTeacherId as { id?: string; _id?: string };
  const target = String(t?.id || t?._id || targetTeacherId);

  if (actor === target) {
    throw new ApiError(
      403,
      "O'zingizga maosh stavkasi belgilay olmaysiz - buni rahbaringiz qiladi",
    );
  }
};

export default assertNotSelfSalary;
