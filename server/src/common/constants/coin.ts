/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TANGA VA MARKET — KONSTANTALAR
 *
 * ── NEGA `constants/permissions.ts` GA QO'SHILMADI ──
 *
 * O'sha fayl MUZLATILGAN Express oracle'i bilan solishtiriladi
 * (`test/constants-parity.test.mjs` → `test/fixtures/express-constants.json`).
 * Oracle ko'chirish tugagan paytdagi shartnomani qayd etadi va u
 * ATAYLAB o'zgarmaydi. Yangi kalitni o'sha `PERMISSIONS` obyektiga
 * qo'shish uchta tekshiruvni bir vaqtda qizil qilardi:
 *
 *   1. `PERMISSIONS aynan bir xil`      — kalit oracle'da yo'q;
 *   2. `PERMISSION_LABELS to'liq`       — yorliq oracle'da yo'q;
 *   3. `hamma kalit ko'lamga tegishli`  — OWNER_ONLY + BRANCH_LOCAL
 *      yig'indisi endi jami bilan teng kelmasdi.
 *
 * Oracle'ni "yangilash" esa uni MA'NOSIZ qilardi: u aynan shu turdagi
 * jimgina ajralishni tutish uchun mavjud.
 *
 * Shuning uchun yangi bo'lim o'z reyestrini olib yuradi va u
 * `permissions.seed.ts` da MAVJUDLARIGA QO'SHILADI. Ish vaqtida farq
 * yo'q: `PermissionsGuard` kalitni `req.permissions` (baza) dan
 * qidiradi, konstantalar obyektidan emas.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const COIN_PERMISSIONS = Object.freeze({
  /** Boshqa odamning balansi va tarixi. O'ZINIKI ruxsatsiz ko'rinadi. */
  COIN_READ: 'coin.read',
  /** Qo'lda tanga berish / olib qo'yish. */
  COIN_MANAGE: 'coin.manage',
  /** ⚠ ASOSIY O'CHIRGICH + topish stavkalari. FAQAT owner. */
  COIN_SETTINGS: 'coin.settings',
  /** Buyurtmalar ro'yxati (admin ko'rinishi). */
  MARKET_READ: 'market.read',
  /** Mahsulot qo'shish / tahrirlash / o'chirish. */
  MARKET_MANAGE: 'market.manage',
  /** Buyurtma holatini siljitish (tasdiq, tayyor, topshirildi, rad). */
  MARKET_FULFILL: 'market.fulfill',
} as const);

export const COIN_PERMISSION_LABELS: Readonly<
  Record<string, { label: string; group: string }>
> = Object.freeze({
  [COIN_PERMISSIONS.COIN_READ]: { label: "Tangalarni ko'rish", group: 'coin' },
  [COIN_PERMISSIONS.COIN_MANAGE]: { label: 'Qo\'lda tanga berish', group: 'coin' },
  [COIN_PERMISSIONS.COIN_SETTINGS]: { label: 'Tanga sozlamalari', group: 'coin' },
  [COIN_PERMISSIONS.MARKET_READ]: { label: "Buyurtmalarni ko'rish", group: 'market' },
  [COIN_PERMISSIONS.MARKET_MANAGE]: { label: 'Mahsulotlarni boshqarish', group: 'market' },
  [COIN_PERMISSIONS.MARKET_FULFILL]: { label: 'Buyurtmani bajarish', group: 'market' },
});

/**
 * ⚠ FAQAT OWNER.
 *
 * `coin.settings` butun bo'limni o'chirib qo'yadigan tugmani ochadi.
 * Filial direktoriga berilsa u BOSHQA filiallarning ham tangasini
 * to'xtatib qo'yardi — sozlama markazga umumiy (filialga bo'linmaydi).
 *
 * Qolganlari ATAYLAB filial ichida: mahsulotni va buyurtmani o'z
 * filialida administrator boshqaradi (talab: "super admin va admin
 * mahsulot qo'sha oladi").
 */
export const COIN_OWNER_ONLY_PERMISSIONS: readonly string[] = Object.freeze([
  COIN_PERMISSIONS.COIN_SETTINGS,
]);

const coinOwnerOnly = new Set<string>(COIN_OWNER_ONLY_PERMISSIONS);

/** Filial rahbariga tushadigan tanga/market kalitlari (hammasi minus istisno). */
export const COIN_BRANCH_LOCAL_PERMISSIONS: readonly string[] = Object.freeze(
  Object.values(COIN_PERMISSIONS).filter((key) => !coinOwnerOnly.has(key)),
);

/** `roles.service.ts` matritsasi jadval sarlavhalarini shundan oladi. */
export const COIN_MODULE_META = Object.freeze({
  coin: { label: 'Tangalar', order: 215 },
  market: { label: 'Market', order: 216 },
});

// ─────────────────────── BUYURTMA HOLATLARI ───────────────────────
//
// Qiymatlar Prisma `MarketOrderStatus` enumi bilan AYNAN bir xil
// bo'lishi SHART — aks holda yozuv bazada rad etiladi.

export const MARKET_ORDER_STATUSES = [
  'pending',
  'approved',
  'ready',
  'delivered',
  'rejected',
  'canceled',
] as const;

export type MarketOrderStatusValue = (typeof MARKET_ORDER_STATUSES)[number];

export const MARKET_ORDER_STATUS_LABELS: Readonly<Record<MarketOrderStatusValue, string>> =
  Object.freeze({
    pending: 'Tasdiq kutilmoqda',
    approved: 'Tasdiqlandi',
    ready: 'Olib ketishga tayyor',
    delivered: 'Topshirildi',
    rejected: 'Rad etildi',
    canceled: 'Bekor qilindi',
  });

/**
 * HOLAT GRAFI — qaysi holatdan qaysisiga o'tish mumkin.
 *
 * ⚠ `delivered` VA `rejected`/`canceled` — YAKUNIY. Ulardan chiqish yo'li
 * ATAYLAB yo'q: `rejected` → `approved` o'tishi tanga qaytarilgandan
 * KEYIN mahsulotni ham berish degani bo'lardi, ya'ni ikki marta
 * to'lash. Xato qilingan bo'lsa yangi buyurtma ochiladi — tarix esa
 * nima bo'lganini ko'rsatib turadi.
 */
export const MARKET_ORDER_TRANSITIONS: Readonly<
  Record<MarketOrderStatusValue, readonly MarketOrderStatusValue[]>
> = Object.freeze({
  pending: ['approved', 'rejected', 'canceled'],
  approved: ['ready', 'delivered', 'rejected'],
  ready: ['delivered', 'rejected'],
  delivered: [],
  rejected: [],
  canceled: [],
});

/** Tanga QAYTARILADIGAN yakuniy holatlar. */
export const MARKET_REFUND_STATUSES: readonly MarketOrderStatusValue[] = Object.freeze([
  'rejected',
  'canceled',
]);

/** O'quvchi O'ZI bekor qila oladigan holatlar. */
export const MARKET_STUDENT_CANCELABLE: readonly MarketOrderStatusValue[] = Object.freeze([
  'pending',
]);
