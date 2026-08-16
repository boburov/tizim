/**
 * BOSHLANG'ICH QOLDIQ - domen konstantalari.
 *
 * `models/openingBalance.model.js` dan ko'chirildi: bu qiymatlar bazaga
 * bog'liq emas va Mongoose model fayllari migratsiya oxirida o'chiriladi.
 * Jadval tuzilmasi endi `prisma/schema.prisma` da (model OpeningBalance).
 */

// Bitta odam uchun ruxsat etilgan eng katta boshlang'ich summa.
// Validator, import sehrgari va servis - uchalasi shu chegaraga tayanadi.
export const OPENING_MAX_AMOUNT = 500_000_000;

/**
 * `pendingReason` - MATERIALIZATSIYA NIMANI KUTAYOTGANI.
 *
 * DIQQAT - PRISMA ENUM TARJIMASI: bazada "yo'q" holati BO'SH SATR ("")
 * bo'lib saqlanadi, Prisma klienti esa uni `"none"` deb qaytaradi
 * (`enum OpeningPendingReason { none @map("") }`).
 *
 * Ya'ni KOD `"none"` bilan ishlaydi, MIJOZGA esa tarixiy `""` ketishi
 * kerak. Ikkisini aralashtirish jimgina buzadi: `{ pendingReason: "" }`
 * bilan filtrlash Prisma'da xato beradi (bu xavfsiz), lekin javobda
 * `"none"` ni qoldirish klientdagi `ob.pendingReason || ""` tekshiruvidan
 * O'TIB KETADI (u truthy) va yozuv "guruh kutmoqda" deb ko'rinardi.
 */
export const OPENING_PENDING = Object.freeze({
  NONE: "none", // Prisma klient qiymati; bazada ""
  AWAITING_GROUP: "awaiting_group",
});

/** Javob chegarasi uchun: klient tarixiy bo'sh satrni kutadi. */
export const pendingReasonForClient = (v) =>
  !v || v === OPENING_PENDING.NONE ? "" : v;
