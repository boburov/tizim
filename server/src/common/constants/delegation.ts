/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DELEGATSIYA MATRITSASI — `server/src/constants/delegation.js` KO'CHIRMASI.
 *
 * Filial rahbari qaysi SOZLAMA amalini o'zi hal qila oladi, qaysinisi
 * owner tasdig'iga tushadi.
 *
 * ── ⚠ IKKI XIL "STANDART" — ATAYLAB AJRATILGAN ──
 *
 * `DEFAULT_DELEGATION_MODE = "auto"` — qoida UMUMAN kiritilmagan bo'lsa.
 *   Matritsa "ruxsat berish ro'yxati" emas, "CHEKLOV ro'yxati".
 *
 * `FALLBACK_DELEGATION_MODE = "approval"` — qoida BOR, lekin BUZUQ
 *   (noma'lum rejim, bazaga qo'lda yozilgan qiymat). Bu yerda
 *   FAIL-CLOSED SHART: buzuq qiymatni "auto" deb o'qish bazaga tekkan
 *   har qanday odamga cheksiz huquq berardi.
 *
 * Ikkalasini bitta konstanta qilib BO'LMAYDI: birinchisi qulaylik uchun
 * ochiq, ikkinchisi xavfsizlik uchun yopiq bo'lishi kerak.
 *
 * Ma'lumot qismi Express modulidan node orqali O'QIB generatsiya qilindi;
 * funksiyalar qo'lda ko'chirildi va `test/constants-parity.test.mjs`
 * ularni tasodifiy kirish bilan Express versiyasiga solishtiradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const DELEGATION_MODES = Object.freeze({
  "AUTO": "auto",
  "THRESHOLD": "threshold",
  "APPROVAL": "approval",
  "FORBIDDEN": "forbidden"
} as const);

export const ALL_DELEGATION_MODES = Object.values(DELEGATION_MODES);

/** Qoidada saqlanadigan chegara maydonlari. */
export const DELEGATION_LIMIT_FIELDS: readonly string[] = Object.freeze([
  "maxAmount",
  "minAmount",
  "maxPercent"
]);

/**
 * Chegara YO'NALISHI — PRINSIPIAL tafovut.
 *
 * Chegirma va maosh uchun XAVF — KATTA raqam (`ceiling`). Guruh NARXI
 * uchun esa xavf TESKARI — KICHIK raqam: narxni tushirish barcha
 * o'quvchiga chegirma berish bilan bir xil iqtisodiy ta'sirga ega,
 * shuning uchun u yerda chegara POL bo'ladi (`floor`).
 */
export const LIMIT_DIRECTIONS = Object.freeze({
  "CEILING": "ceiling",
  "FLOOR": "floor"
} as const);

export interface DelegatableKindSpec {
  label: string;
  modes: string[];
  limits: string[];
  direction: string | null;
}

export const DELEGATABLE_KINDS: Readonly<Record<string, DelegatableKindSpec>> =
  Object.freeze({
  "staff_hire": {
    "label": "Ishga olish",
    "modes": [
      "auto",
      "approval",
      "forbidden"
    ],
    "limits": [],
    "direction": null
  },
  "discount_set": {
    "label": "Chegirma belgilash",
    "modes": [
      "auto",
      "threshold",
      "approval",
      "forbidden"
    ],
    "limits": [
      "maxAmount",
      "maxPercent"
    ],
    "direction": "ceiling"
  },
  "group_fee_set": {
    "label": "Guruh oylik narxi",
    "modes": [
      "auto",
      "threshold",
      "approval",
      "forbidden"
    ],
    "limits": [
      "minAmount"
    ],
    "direction": "floor"
  },
  "salary_terms": {
    "label": "Maosh stavkasi (guruh davri)",
    "modes": [
      "auto",
      "threshold",
      "approval",
      "forbidden"
    ],
    "limits": [
      "maxAmount",
      "maxPercent"
    ],
    "direction": "ceiling"
  },
  "teacher_compensation_set": {
    "label": "O'qituvchi standart stavkasi",
    "modes": [
      "auto",
      "threshold",
      "approval",
      "forbidden"
    ],
    "limits": [
      "maxAmount",
      "maxPercent"
    ],
    "direction": "ceiling"
  }
});

export const ALL_DELEGATABLE_KINDS = Object.keys(DELEGATABLE_KINDS);

/** Qoida kiritilmagan — filial rahbari o'zi hal qiladi. */
export const DEFAULT_DELEGATION_MODE = "auto";

/** Qoida BOR, lekin buzuq — fail-closed. */
export const FALLBACK_DELEGATION_MODE = "approval";

export interface DelegationRule {
  mode: string;
  maxAmount: number | null;
  minAmount: number | null;
  maxPercent: number | null;
}

/**
 * Mongoose `Map` ham, oddiy obyekt ham (lean / JSON) bir xil o'qilsin.
 *
 * ⚠ `Map` shoxi SAQLANADI: baza Postgres bo'lsa ham, ko'chirilmagan
 * chaqiruvchilar va eski seed'lar hamon `Map` uzatishi mumkin.
 */
export const normalizeDelegation = (
  delegation: unknown,
): Record<string, any> => {
  if (!delegation) return {};
  const d = delegation as { entries?: unknown };
  if (typeof d.entries === 'function' && !Array.isArray(delegation)) {
    return Object.fromEntries((d.entries as () => Iterable<[string, any]>)());
  }
  return { ...(delegation as Record<string, any>) };
};

const emptyRule = (mode: string): DelegationRule => ({
  mode,
  maxAmount: null,
  minAmount: null,
  maxPercent: null,
});

/**
 * Bitta tur uchun qoidani qaytaradi.
 * Qoida yo'q → `auto`; qoida buzuq → `approval` (fail-closed).
 */
export const resolveRule = (delegation: unknown, kind: string): DelegationRule => {
  const map = normalizeDelegation(delegation);
  const raw = map[kind];
  const spec = DELEGATABLE_KINDS[kind];

  // ⚠ NOMA'LUM TUR — matritsa bu turga umuman taalluqli emas.
  // Bu YAGONA joy bo'lib, u yerda "qoida yo'q" degani "auto" EMAS:
  // moliyaviy tasdiqlar BOSHQA mexanizm bilan boshqariladi va ularni
  // jimgina ochib yuborish xato bo'lardi.
  if (!spec) return emptyRule(FALLBACK_DELEGATION_MODE);

  if (!raw || !raw.mode) return emptyRule(DEFAULT_DELEGATION_MODE);

  // HIMOYA QATLAMI: bazaga to'g'ridan-to'g'ri yozilgan noto'g'ri rejim
  // shu yerda to'xtatiladi. Validator faqat API orqali kelgan yozuvni
  // ushlaydi, bu esa O'QISHDA ishlaydi.
  if (!spec.modes.includes(raw.mode)) return emptyRule(FALLBACK_DELEGATION_MODE);

  return {
    mode: raw.mode,
    maxAmount: raw.maxAmount ?? null,
    minAmount: raw.minAmount ?? null,
    maxPercent: raw.maxPercent ?? null,
  };
};

/**
 * Matritsani tekshiradi. Xato bo'lsa MATN, to'g'ri bo'lsa `null` qaytaradi.
 * Xato matnlari Express bilan AYNAN bir xil — klient ularni ko'rsatadi.
 */
export const validateDelegation = (delegation: unknown): string | null => {
  const map = normalizeDelegation(delegation);

  for (const [kind, rule] of Object.entries(map)) {
    const spec = DELEGATABLE_KINDS[kind];
    if (!spec) return `Delegatsiya qilib bo'lmaydigan tur: ${kind}`;
    if (!rule || typeof rule !== 'object') return `${spec.label}: qoida noto'g'ri`;

    const mode = rule.mode;
    if (!(ALL_DELEGATION_MODES as string[]).includes(mode)) {
      return `${spec.label}: noma'lum rejim "${mode}"`;
    }
    if (!spec.modes.includes(mode)) {
      // Eng muhim xabar: maosh turlarida `auto` shu yerda to'xtatiladi.
      return `${spec.label}: "${mode}" rejimi bu tur uchun ruxsat etilmagan`;
    }

    // Chegara faqat THRESHOLD'da ma'noga ega.
    if (mode === DELEGATION_MODES.THRESHOLD) {
      const provided = spec.limits.filter(
        (f) => rule[f] !== null && rule[f] !== undefined,
      );
      if (provided.length === 0) {
        return `${spec.label}: "threshold" rejimi uchun kamida bitta chegara kerak (${spec.limits.join(', ')})`;
      }
      for (const field of provided) {
        const v = Number(rule[field]);
        if (!Number.isFinite(v) || v < 0) {
          return `${spec.label}: ${field} musbat son bo'lishi kerak`;
        }
        if (field === 'maxPercent' && v > 100) {
          return `${spec.label}: maxPercent 100 dan oshmasligi kerak`;
        }
      }
    }

    // Bu turga tegishli bo'lmagan chegara JIMGINA e'tiborsiz
    // qoldirilmaydi — aks holda owner "10% qo'ydim" deb o'ylab yurardi,
    // aslida esa qoida umuman qo'llanmasdi.
    for (const field of DELEGATION_LIMIT_FIELDS) {
      const has = rule[field] !== null && rule[field] !== undefined;
      if (has && !spec.limits.includes(field)) {
        return `${spec.label}: ${field} bu tur uchun qo'llanmaydi (${spec.limits.join(', ') || "chegara yo'q"})`;
      }
    }
  }

  return null;
};
