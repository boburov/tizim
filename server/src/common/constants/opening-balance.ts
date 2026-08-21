/**
 * BOSHLANG'ICH QOLDIQ — domen konstantalari
 * (`server/src/constants/openingBalance.js`).
 */

/**
 * Bitta odam uchun ruxsat etilgan eng katta boshlang'ich summa.
 * Validator, import sehrgari va servis — uchalasi shu chegaraga tayanadi.
 *
 * ⚠ NUSXA BOR: `modules/users/users.validators.ts` da ham shu qiymat
 * inline yozilgan (`POST /users/staff` ko'chirilganda `openingBalance`
 * moduli hali yo'q edi). `users` boshqa ish to'lqiniga tegishli, shuning
 * uchun bu yerdan o'zgartirilmadi — o'sha faylga keyingi teginishda
 * shu konstantaga ulanishi kerak.
 */
export const OPENING_MAX_AMOUNT = 500_000_000;

/**
 * Import oldidan OGOHLANTIRISH beriladigan chegara (xato EMAS).
 * Nol xatosi (300 000 → 3 000 000) aynan shu oraliqda ushlanadi.
 */
export const OPENING_WARN_AMOUNT = 20_000_000;

/**
 * `pendingReason` — MATERIALIZATSIYA NIMANI KUTAYOTGANI.
 *
 * ⚠ PRISMA ENUM TARJIMASI: bazada "yo'q" holati BO'SH SATR ("") bo'lib
 * saqlanadi, Prisma klienti esa uni `"none"` deb qaytaradi
 * (`enum OpeningPendingReason { none @map("") }`).
 */
export const OPENING_PENDING = Object.freeze({
  NONE: 'none',
  AWAITING_GROUP: 'awaiting_group',
} as const);

/**
 * ⚠ EXPRESS'DA HECH QAYERDA CHAQIRILMAYDI — o'lik kod.
 *
 * Ya'ni javobga XOM enum qiymati (`"none"`) chiqadi, bo'sh satr EMAS.
 * Uni bu yerda "tuzatib" qo'llash paritetni BUZARDI: klient hozir
 * `"none"` oladi va NestJS boshqacha yuborsa shartnoma jimgina
 * o'zgargan bo'lardi. Ko'chirildi — lekin ISHLATILMAYDI, xuddi
 * Express'dagi kabi.
 */
export const pendingReasonForClient = (v: string | null | undefined): string =>
  !v || v === OPENING_PENDING.NONE ? '' : v;
