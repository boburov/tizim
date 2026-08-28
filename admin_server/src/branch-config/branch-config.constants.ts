/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL CHEGARASI — BARCHA RAQAMLAR SHU YERDA.
 *
 * "5" soni butun kod bo'ylab TARQATILMAYDI. U faqat shu faylda, bitta
 * marta turadi va `DEFAULT_BRANCH_LIMIT` orqali o'qiladi. Standartni
 * o'zgartirish = shu qatorni (yoki `.env` dagi bitta o'zgaruvchini)
 * o'zgartirish.
 *
 * ⚠ `branchLimitOverride` QO'YILMAGAN loyihalar standartni AVTOMATIK
 * oladi — shuning uchun standartni ko'tarish migratsiya talab qilmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `-1` = cheksiz. `PlanFeature.value` bilan bir xil kelishuv. */
export const UNLIMITED = -1;

/**
 * Tarifda ham, loyihada ham qiymat yo'q bo'lganda amal qiladigan chegara.
 *
 * `.env` orqali sozlanadi (`DEFAULT_BRANCH_LIMIT`), sabab: sotuv siyosati
 * o'zgarganda deploy qilinadigan kod emas, bitta konfiguratsiya qatori
 * o'zgarishi kerak.
 */
export const DEFAULT_BRANCH_LIMIT = (() => {
  const raw = Number(process.env.DEFAULT_BRANCH_LIMIT);
  return Number.isInteger(raw) && (raw > 0 || raw === UNLIMITED) ? raw : 5;
})();

/** Yakka markaz rejimida ruxsat etilgan filiallar soni — aynan bitta. */
export const SINGLE_CENTER_BRANCH_LIMIT = 1;

/** Tarif/add-on imkoniyati kaliti (`Feature.key`). */
export const BRANCH_LIMIT_FEATURE_KEY = 'max_branches';

/**
 * Filiallar yoqilganini tenant serverga yetkazadigan BOOLEAN kalit.
 * Heartbeat javobidagi `limits` xaritasida 0/1 bo'lib ketadi.
 */
export const BRANCHES_ENABLED_FEATURE_KEY = 'branches_enabled';

/** Heartbeat metrikasi (`Feature.metricKey`, `UsageSnapshot.metricKey`). */
export const BRANCH_COUNT_METRIC = 'branch_count';

/** Tenant `.env` ga yoziladigan boshqariladigan kalitlar. */
export const BRANCHES_ENABLED_ENV_KEY = 'BRANCHES_ENABLED';
export const BRANCH_LIMIT_ENV_KEY = 'BRANCH_LIMIT';

/** Qo'lda qo'yiladigan chegaraning oqilona diapazoni (`-1` alohida). */
export const BRANCH_LIMIT_MIN = 1;
export const BRANCH_LIMIT_MAX = 1000;

/** Mijozga qaytadigan biznes xato kodi. */
export const BRANCH_LIMIT_REACHED = 'BRANCH_LIMIT_REACHED';

// ───────────────────────────────────────────────────────── sof hisoblash

export type BranchLimitSource = 'override' | 'plan' | 'default' | 'single-center';

export interface BranchLimitInput {
  /** Loyiha ko'p filialli rejimdami. */
  branchesEnabled: boolean;
  /** Developer Admin qo'lda qo'ygan qiymat (`Tenant.branchLimitOverride`). */
  override?: number | null;
  /** Tarifdagi `max_branches` (`PlanFeature.value`). */
  planLimit?: number | null;
  /** Sotib olingan qo'shimcha filiallar yig'indisi (add-on'lar). */
  addonBonus?: number;
}

export interface BranchLimitResult {
  /** Yakuniy chegara. `-1` = cheksiz. */
  limit: number;
  /** Qaysi manbadan kelgani — panelda ko'rsatiladi. */
  source: BranchLimitSource;
  /** Add-on'siz asosiy chegara (UI "5 + 2" ni shundan chizadi). */
  base: number;
  addonBonus: number;
  unlimited: boolean;
}

const isUsable = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && (v > 0 || v === UNLIMITED);

/**
 * YAKUNIY CHEGARANI HISOBLAYDI — SOF FUNKSIYA (baza ham, tarmoq ham yo'q).
 *
 * Ustunlik tartibi ATAYLAB shunday:
 *
 *   yakka markaz  →  1        (rejimning O'ZI chegara — savdo emas)
 *   override      →  qo'lda qo'yilgan qiymat
 *   tarif         →  `max_branches`
 *   standart      →  DEFAULT_BRANCH_LIMIT
 *   + add-on'lar  →  sotib olingan qo'shimchalar QO'SHILADI
 *
 * ⚠ CHEKSIZGA QO'SHILMAYDI: `-1 + 5 = 4` bo'lib qolardi — cheksiz
 * loyihani jimgina 4 ta filialga qisib qo'yardi.
 */
export function resolveBranchLimit(input: BranchLimitInput): BranchLimitResult {
  const addonBonus = Math.max(0, Number(input.addonBonus) || 0);

  if (!input.branchesEnabled) {
    // Yakka markaz — add-on ham, tarif ham buni ko'tara olmaydi. Rejimni
    // o'zgartirish kerak, filial sotib olish emas.
    return {
      limit: SINGLE_CENTER_BRANCH_LIMIT,
      source: 'single-center',
      base: SINGLE_CENTER_BRANCH_LIMIT,
      addonBonus: 0,
      unlimited: false,
    };
  }

  let base: number;
  let source: BranchLimitSource;

  if (isUsable(input.override)) {
    base = input.override;
    source = 'override';
  } else if (isUsable(input.planLimit)) {
    base = input.planLimit;
    source = 'plan';
  } else {
    base = DEFAULT_BRANCH_LIMIT;
    source = 'default';
  }

  if (base === UNLIMITED) {
    return { limit: UNLIMITED, source, base, addonBonus, unlimited: true };
  }

  return { limit: base + addonBonus, source, base, addonBonus, unlimited: false };
}

export interface BranchUsageView {
  used: number;
  limit: number;
  remaining: number | null;
  limitReached: boolean;
  unlimited: boolean;
}

/**
 * "Used: 3 / Limit: 5 / Remaining: 2" ko'rinishi.
 *
 * ⚠ `>=` — Express `enforceLimit` bilan aynan bir xil: tekshiruv YANGI
 * yozuv qo'shishdan OLDIN bo'ladi, ya'ni 5/5 da yana bittasi sig'maydi.
 */
export function branchUsage(used: number, limit: number): BranchUsageView {
  const u = Math.max(0, Number(used) || 0);
  if (limit === UNLIMITED) {
    return { used: u, limit: UNLIMITED, remaining: null, limitReached: false, unlimited: true };
  }
  return {
    used: u,
    limit,
    remaining: Math.max(0, limit - u),
    limitReached: u >= limit,
    unlimited: false,
  };
}
