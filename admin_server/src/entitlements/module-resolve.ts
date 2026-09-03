/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODUL O'CHIRGICHLARINI YECHISH — SOF FUNKSIYA, YAGONA NUSXA.
 *
 * ⚠ NEGA ALOHIDA FAYLDA
 *
 * Bu mantiq IKKI joyda kerak:
 *   • `forTenant()`      — bitta loyiha, tenant serverga ketadigan javob;
 *   • `moduleSummary()`  — hamma loyiha, panel kartalaridagi pill'lar.
 *
 * Ikkinchisi birinchisini loop'da chaqirsa har loyiha uchun 4 ta so'rov
 * ketardi (N+1). Lekin mantiqni KO'CHIRIB yozish undan ham yomon:
 * kartada "Davomat yoqilgan" ko'rinib, mijozda o'chiq bo'lishi mumkin
 * edi va bu farqni HECH NARSA ushlamasdi.
 *
 * Shuning uchun so'rovlar ikki xil (bittalab / ommaviy), YECHISH esa
 * bitta — mana shu funksiya.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Yechish uchun kerakli minimal feature ma'lumoti. */
export interface ModuleFeatureLike {
  key: string;
  /** Xavfli (panelda ogohlantirish), lekin O'CHIRILADI. */
  isCore: boolean;
  /** Hech qachon o'chmaydi — `auth` va `features`. */
  isLocked: boolean;
  parentKey: string | null;
}

export interface ResolveModulesInput {
  features: ModuleFeatureLike[];
  /** Tarif shu kalitni beradimi (PlanFeature.value > 0). */
  planGrants: (key: string) => boolean;
  /** Obuna butunlay tugagan yoki bekor qilinganmi. */
  subDead: boolean;
  /** Ustun qaror: `true`/`false`, yo'q bo'lsa `undefined`. */
  override: (key: string) => boolean | undefined;
}

/**
 * YECHISH TARTIBI:
 *     o'zak (doim 1) → override → tarif → standart O'CHIQ
 * va oxirida OTA ZANJIRI.
 *
 * @returns kalit → 1 (ochiq) yoki 0 (o'chiq)
 */
export const resolveModules = ({
  features,
  planGrants,
  subDead,
  override,
}: ResolveModulesInput): Map<string, number> => {
  const value = new Map<string, number>();

  for (const f of features) {
    // ⚠ QULFLANGAN KALIT DOIM OCHIQ — tarifdan ham, obunadan ham, ustun
    // qarordan ham qat'i nazar.
    //
    // ⚠ SHART `isLocked`, ILGARIGIDEK `isCore` EMAS. Bu WS-4 dagi asosiy
    // o'zgarish: `core` modullar endi SOTILADI va o'chiriladi. Qulflangani
    // atigi ikkitasi:
    //   • `auth`     — o'chsa tenantga hech kim kira olmaydi;
    //   • `features` — o'chsa `GET /features` ning o'zi 402 qaytaradi va
    //                  tenantni tashqaridan tuzatib bo'lmaydi.
    //
    // ⚠ TO'SIQ MANTIG'I ENDI BOSHQACHA ISHLAYDI. Ilgari core doim `1`
    // bo'lgani uchun u har doim "ochiq bog'liq" sifatida to'siq bo'lardi.
    // Endi core o'chirilishi mumkin — o'rniga `requires` grafigi to'ldi:
    // generator core nishonlarni ham yozadigan bo'ldi, ya'ni `groups` ni
    // o'chirishda `attendance` to'siq sifatida CHIQADI.
    if (f.isLocked) {
      value.set(f.key, 1);
      continue;
    }

    const ov = override(f.key);
    if (ov !== undefined) {
      // ⚠ USTUN QAROR HAMMASIDAN BALAND — obuna holatidan ham.
      // "Bu mijozga ochib qo'ydim" degan ochiq qaror avtomatik
      // qoidaga yutqazmasligi kerak.
      value.set(f.key, ov ? 1 : 0);
      continue;
    }

    // ⚠ STANDART O'CHIQ, "kelmagan = ochiq" EMAS. Limitlar uchun bo'sh
    // qiymat "cheksiz" degani (ochiq yiqilish); modul uchun aksincha:
    // reyestrga qo'shilgan yangi PULLIK bo'lim tarifga biriktirilmagunga
    // qadar hech kimga tarqalmasligi kerak.
    value.set(f.key, subDead ? 0 : planGrants(f.key) ? 1 : 0);
  }

  // OTA ZANJIRI: otasi yopiq bo'lsa bola ham yopiq. Ustun qaror ham
  // buni buzolmaydi — "davomat o'chiq, davomat-excel ochiq" degan
  // ziddiyat mijozga hech qachon yetib bormasligi kerak.
  const byKey = new Map(features.map((f) => [f.key, f]));
  const withParents = (key: string, seen = new Set<string>()): number => {
    if (seen.has(key)) return 0; // aylanadan himoya
    seen.add(key);
    const own = value.get(key) ?? 0;
    if (own <= 0) return 0;
    const parent = byKey.get(key)?.parentKey;
    if (!parent) return own;
    return withParents(parent, seen) > 0 ? own : 0;
  };

  const out = new Map<string, number>();
  for (const f of features) out.set(f.key, withParents(f.key));
  return out;
};
