/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODUL IMKONIYATLARI REYESTRI — LOYIHA BO'YICHA YOQIB/O'CHIRILADIGAN
 * BO'LIMLAR RO'YXATI.
 *
 * ── NEGA `PERMISSIONS` GA QO'SHILMAYDI ──
 *
 * `common/constants/permissions.ts` PARITET ORAKULI bilan muzlatilgan:
 * unga yangi kalit qo'shilsa `constants-parity.test.mjs` uch joyda qizil
 * bo'ladi. Shuning uchun yangi bo'lim O'Z REYESTRINI olib yuradi — xuddi
 * `common/constants/coin.ts` dagidek.
 *
 * ── RUXSAT EMAS, LITSENZIYA ──
 *
 * `Permission` — "menda shu ishga HAQ bormi" (rol). Bu reyestr esa
 * "bu bo'lim shu loyihada UMUMAN BORMI" (tarif). Ikkisi ORTOGONAL:
 * ruxsati bor foydalanuvchi ham tarifda yo'q bo'limga kira olmaydi.
 *
 * ── YAGONA HAQIQAT MANBAI ──
 *
 * Kalitlar shu yerda tug'iladi. `admin_server` dagi `Feature` qatorlari
 * bu yerdan sinxronlanadi (`npm run features:emit` → `features.generated.json`
 * → `admin_server/scripts/sync-features.mjs`). Teskarisi EMAS: bog'liqlik
 * grafigi (`requires`) kod bo'lishi SHART, chunki uni haqiqiy NestJS
 * import'lariga qarshi tekshirib turamiz (`test/feature-graph.test.mjs`).
 *
 * ⚠ YANGI KALIT STANDART HOLDA O'CHIQ. Mavjud loyihalarga u migratsiya
 * orqali ochiq beriladi (grandfather), yangi loyihalarga esa faqat
 * tarifga biriktirilgandan keyin. Ya'ni yangi PULLIK bo'lim hech qachon
 * tasodifan bepul tarqalmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Bo'limni o'chirish qanchalik xavfli.
 *
 *  • `leaf`         — uni HECH KIM import qilmaydi, xotirjam o'chiriladi.
 *  • `near-leaf`    — 1-2 ta chaqiruvchi bor, ular alohida himoyalansin.
 *  • `load-bearing` — ko'p modul unga tayanadi. AVVAL har bir tayanuvchi
 *                     "yo'q bo'lsa ham to'g'ri ishlash" holatiga
 *                     keltirilmaguncha O'CHIRILMAYDI.
 */
export type FeatureTier = 'leaf' | 'near-leaf' | 'load-bearing';

export interface FeatureDef {
  /** Tarif kaliti. Modul uchun — modul papkasi nomi (`imports`). */
  key: string;
  /**
   * Ota kalit. Faqat IMKONIYAT (capability) uchun to'ldiriladi.
   *
   * ⚠ QAT'IY QOIDA: otasi o'chiq bo'lsa bola HAM o'chiq. Bu `resolve`
   * bosqichida majburlanadi, intizomga tashlab qo'yilmaydi — aks holda
   * "davomat o'chiq, lekin davomat-excel ochiq" kabi ziddiyat paydo
   * bo'lardi.
   */
  parent?: string;
  /**
   * Shu bo'lim ISHLASHI uchun ochiq bo'lishi SHART bo'lgan boshqa
   * kalitlar. Faqat REYESTRDAGI kalitlar yoziladi (toggle qilinmaydigan
   * modul bu yerga tushmaydi).
   *
   * Dev panel shu ro'yxatga qarab o'chirishni RAD ETADI va to'sqinlik
   * qilayotgan kalit nomini aytadi.
   */
  requires?: string[];
  /** Dev panel va mijoz UI'sida ko'rinadigan nom. */
  label: string;
  tier: FeatureTier;
  /**
   * NestJS modul klassi nomi. `test/feature-graph.test.mjs` shu nom
   * orqali `requires` ni HAQIQIY import'lar bilan solishtiradi, ya'ni
   * bog'liqlik ma'lumoti eskira olmaydi.
   *
   * Imkoniyat (capability) uchun bo'sh — u alohida modul emas.
   */
  nestModule?: string;
}

/**
 * ⚠ FAZA 1 — ATAYLAB BITTA MODUL.
 *
 * Butun mexanizm (reyestr → darvoza → `/features` → dev panel) bitta
 * XAVFSIZ BARG ustida to'liq isbotlanadi. `imports` tanlandi, chunki:
 *   • uni hech kim import qilmaydi — maosh yoki login'ni buzolmaydi;
 *   • 5 ta sochilgan tugmasi bor — UI'ni yashirish hikoyasini to'liq
 *     tekshiradi;
 *   • mijozning asl so'rovi aynan shu edi ("excel'dan foydalanuvchi").
 *
 * Qolgan ~18 barg Faza 2 da, `attendance` kabi tayanch modullar esa
 * Faza 3 da — har bir tayanuvchi tuzatilgandan KEYIN.
 */
export const FEATURES: readonly FeatureDef[] = Object.freeze([
  {
    key: 'imports',
    label: 'Excel import',
    tier: 'leaf',
    nestModule: 'ImportsModule',
  },
  {
    key: 'imports.finance',
    parent: 'imports',
    label: 'Excel import — to\'lov va maosh',
    tier: 'leaf',
  },
]);

/** Kalit bo'yicha tez qidirish. */
export const FEATURE_BY_KEY: ReadonlyMap<string, FeatureDef> = new Map(
  FEATURES.map((f) => [f.key, f]),
);

/** Faqat MODUL kalitlari (otasi yo'qlar). */
export const MODULE_KEYS: readonly string[] = Object.freeze(
  FEATURES.filter((f) => !f.parent).map((f) => f.key),
);

/** Barcha kalitlar — migratsiya va sinxronlash uchun. */
export const ALL_FEATURE_KEYS: readonly string[] = Object.freeze(
  FEATURES.map((f) => f.key),
);

/**
 * Ota zanjiri: `imports.finance` → `['imports.finance', 'imports']`.
 *
 * Aylanadan himoyalangan: reyestr xato yozilsa cheksiz sikl o'rniga
 * to'xtaydi (kalitlar soni chegara bo'lib xizmat qiladi).
 */
export const featureChain = (key: string): string[] => {
  const chain: string[] = [];
  let cursor: string | undefined = key;
  while (cursor && chain.length <= FEATURES.length) {
    chain.push(cursor);
    cursor = FEATURE_BY_KEY.get(cursor)?.parent;
  }
  return chain;
};

/**
 * `key` ni o'chirish TO'SILADIMI — ya'ni uni `requires` da ushlab
 * turgan, hozir OCHIQ bo'lgan kalitlar bormi.
 *
 * Dev panel shu funksiyadan foydalanadi: to'siq KONFIGURATSIYA
 * paytida, odam o'qiy oladigan joyda chiqsin — mijozning maosh
 * hisobida emas.
 */
export const blockersForDisabling = (
  key: string,
  isEnabled: (k: string) => boolean,
): string[] =>
  FEATURES.filter(
    (f) => f.key !== key && f.requires?.includes(key) && isEnabled(f.key),
  ).map((f) => f.key);
