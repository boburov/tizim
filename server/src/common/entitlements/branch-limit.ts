/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL CHEGARASI — MAJBURLASH QOIDASI (tenant tomoni).
 *
 * ── NEGA ALOHIDA FAYL VA SOF FUNKSIYA ──
 *
 * Bu qoida PUL bilan bog'liq: noto'g'ri hisoblansa yo mijoz to'lagan
 * filialini ocholmaydi, yo biz bepul filial tarqatamiz. Shuning uchun u
 * bazadan, HTTP'dan va NestJS konteyneridan MUSTAQIL — bazasiz sinaladi
 * (`test/branch-limit.test.mjs`).
 *
 * ── QIYMAT QAYERDAN KELADI ──
 *
 * IKKI manba, ATAYLAB ikkitasi:
 *
 *   1) `.env` (BRANCHES_ENABLED / BRANCH_LIMIT) — admin panel
 *      provisioning/reconfigure paytida yozadi. Jarayon KO'TARILISHI
 *      bilan mavjud.
 *   2) heartbeat javobi (`max_branches` / `branches_enabled`) — har 15
 *      daqiqada yangilanadi, restart TALAB QILMAYDI.
 *
 * Biri ikkinchisini almashtirmaydi. Heartbeat KESHI bo'sh holda
 * ko'tariladi va "cheksiz" deb o'qiladi (`EntitlementsService` ataylab
 * OCHIQ yiqiladi — aloqa uzilganda mijozni bloklamaslik uchun). Filial
 * chegarasida bu OCHIQ ESHIK bo'lardi: har restartdan keyingi ~15
 * daqiqalik oynada cheksiz filial ochsa bo'lardi. `.env` shu oynani
 * yopadi.
 *
 * Shuning uchun: heartbeat qiymati BOR bo'lsa u ustun (tirik), YO'Q
 * bo'lsa `.env` (oxirgi ma'lum, ishonchli).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `-1` = cheksiz — admin serverdagi kelishuv bilan bir xil. */
export const UNLIMITED = -1;

/** Mijozga qaytadigan biznes xato kodi. Frontend aynan shunga qaraydi. */
export const BRANCH_LIMIT_REACHED = 'BRANCH_LIMIT_REACHED';

/** Ko'p filialli rejim o'chirilganda ruxsat etilgan filiallar soni. */
export const SINGLE_CENTER_BRANCH_LIMIT = 1;

export interface BranchLimitSources {
  /** Heartbeat keshidagi `max_branches`. Kelmagan bo'lsa `null`. */
  entitlementLimit?: number | null;
  /** Heartbeat keshidagi `branches_enabled`. Kelmagan bo'lsa `null`. */
  entitlementBranchesEnabled?: boolean | null;
  /** `.env` dagi `BRANCH_LIMIT`. */
  envLimit: number;
  /** `.env` dagi `BRANCHES_ENABLED`. */
  envBranchesEnabled: boolean;
}

export interface EffectiveBranchConfig {
  branchesEnabled: boolean;
  /** `-1` = cheksiz. */
  limit: number;
  /** Qiymat qaysi manbadan olindi — log va diagnostika uchun. */
  source: 'heartbeat' | 'env';
}

const usableLimit = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && (v > 0 || v === UNLIMITED);

/**
 * AMALDAGI konfiguratsiyani hisoblaydi.
 *
 * ⚠ REJIM VA CHEGARA BIRGA OLINADI. Ilgari ular ajralib ketishi mumkin
 * edi: heartbeat "yakka markaz" deb aytib, `.env` da eski chegara turib
 * qolardi. Shuning uchun manba TANLANADI, aralashtirilmaydi.
 */
export function resolveEffectiveBranchConfig(
  src: BranchLimitSources,
): EffectiveBranchConfig {
  const fromHeartbeat =
    usableLimit(src.entitlementLimit) &&
    typeof src.entitlementBranchesEnabled === 'boolean';

  const branchesEnabled = fromHeartbeat
    ? (src.entitlementBranchesEnabled as boolean)
    : src.envBranchesEnabled;

  // Yakka markazda chegara rejimning O'ZIDAN kelib chiqadi — manba nima
  // deyishidan qat'i nazar. Bu admin serverdagi qoida bilan aynan bir xil.
  if (!branchesEnabled) {
    return {
      branchesEnabled: false,
      limit: SINGLE_CENTER_BRANCH_LIMIT,
      source: fromHeartbeat ? 'heartbeat' : 'env',
    };
  }

  if (fromHeartbeat) {
    return { branchesEnabled: true, limit: src.entitlementLimit as number, source: 'heartbeat' };
  }

  return {
    branchesEnabled: true,
    limit: usableLimit(src.envLimit) ? src.envLimit : UNLIMITED,
    source: 'env',
  };
}

export interface BranchCreationVerdict {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number | null;
  /** Rad etilganda — biznes kodi, aks holda `null`. */
  code: string | null;
  /** Rad etilganda — mijozga ko'rsatiladigan xabar. */
  message: string | null;
}

/**
 * YANGI FILIAL OCHISH MUMKINMI.
 *
 * ⚠ `>=` — tekshiruv yozuvdan OLDIN bo'ladi: 5/5 da oltinchisi sig'maydi.
 * Bu `enforceLimit` va admin paneldagi hisob bilan aynan bir xil.
 *
 * ⚠ CHEGARADAN OSHIB KETGAN LOYIHA HAM SHU YERGA TUSHADI (masalan
 * migratsiyadan oldin 8 ta filial ochilgan, chegara esa 5). Mavjud
 * filiallarga TEGILMAYDI — faqat yangisi to'siladi.
 */
export function evaluateBranchCreation(input: {
  used: number;
  limit: number;
  branchesEnabled: boolean;
}): BranchCreationVerdict {
  const used = Math.max(0, Number(input.used) || 0);
  const { limit, branchesEnabled } = input;

  if (limit === UNLIMITED) {
    return { allowed: true, used, limit, remaining: null, code: null, message: null };
  }

  const remaining = Math.max(0, limit - used);

  if (used < limit) {
    return { allowed: true, used, limit, remaining, code: null, message: null };
  }

  // ⚠ XABAR IKKI XIL: sabab ham ikki xil va mijozning keyingi qadami ham
  // boshqacha. "Yakka markaz" da tarif oshirish YORDAM BERMAYDI — rejimni
  // yoqish kerak, va buni faqat biz qila olamiz.
  const message = branchesEnabled
    ? `Filiallar chegarasi tugadi (${used}/${limit}). Yangi filial ochish uchun tarifni kengaytiring.`
    : "Bu loyiha yakka markaz sifatida sozlangan — qo'shimcha filial ochib bo'lmaydi.";

  return { allowed: false, used, limit, remaining: 0, code: BRANCH_LIMIT_REACHED, message };
}
