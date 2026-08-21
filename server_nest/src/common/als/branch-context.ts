import { AsyncLocalStorage } from 'node:async_hooks';
import { ApiError } from '../errors/api-error.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL KONTEKSTI (request-scoped) — `helpers/branchContext.helper.js`.
 *
 * ⚠ BU FAYL TIZIMDAGI ENG XAVFLI JOY. ⚠
 *
 * `branchFilter()` bo'sh obyekt (`{}`) qaytarsa, u "FILTR YO'Q" degani —
 * ya'ni so'rov BARCHA filial ma'lumotini qaytaradi, 200 status bilan,
 * hech qanday xatosiz. Kontekst yo'qolsa aynan shu bo'ladi.
 *
 * SHUNING UCHUN AUTENTIFIKATSIYA GUARD EMAS, MIDDLEWARE:
 * guard `boolean` qaytaradi va keyingi bajarilishni `als.run()` ichiga
 * O'RAY OLMAYDI. Middleware esa `next()` ni o'rab beradi — Express'dagi
 * `requireAuth` bilan aynan bir xil.
 *
 * NEGA AsyncLocalStorage: filial ko'lami har bir so'rovda kerak, lekin uni
 * 40+ model va 100+ servis funksiyasiga parametr sifatida uzatish real
 * emas. ALS kontekstni request bo'ylab olib yuradi.
 *
 * NEGA AVTOMATIK FILTR EMAS: Prisma kengaytmasi bilan avto-filtr yasash
 * mumkin edi, lekin `$queryRaw` uni CHETLAB O'TADI — kodbazada 74 ta xom
 * SQL chaqiruvi bor (moliya hisobotlari aynan shu yerda). Avto-filtr
 * yolg'on xavfsizlik hissi berardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface BranchContext {
  branchId: string | null;
  allowedBranchIds: string[];
  canSeeAllBranches: boolean;
  userId: string | null;
}

const storage = new AsyncLocalStorage<BranchContext>();

/** "all" = barcha filiallar (faqat cross-branch huquqi borlar uchun). */
export const ALL_BRANCHES = 'all';

/** Kontekstni ochib, ichida callback'ni ishga tushiradi. */
export const runWithBranchContext = <T>(ctx: BranchContext, fn: () => T): T =>
  storage.run(ctx, fn);

/** Joriy request konteksti (kontekst tashqarisida undefined). */
export const getBranchContext = (): BranchContext | undefined => storage.getStore();

/** Joriy tanlangan filial. null = cross-branch rejim. */
export const getActiveBranchId = (): string | null =>
  storage.getStore()?.branchId || null;

export const getAllowedBranchIds = (): string[] =>
  storage.getStore()?.allowedBranchIds || [];

export const canSeeAllBranches = (): boolean =>
  Boolean(storage.getStore()?.canSeeAllBranches);

// Prisma'da kalit oddiy SATR (VarChar(24)) — ObjectId o'rami kerak emas.
const toObjectId = (id: unknown): string => String(id);

/**
 * O'QISH so'rovlari uchun filial filtri.
 *
 * Qaytaradi:
 *   {}                            — filtr kerak emas (owner, barcha filial)
 *   { branchId: <id> }            — bitta filial
 *   { branchId: { in: [...] } }   — bir nechta ruxsat etilgan filial
 *
 * ⚠ FAIL-CLOSED: hech qaysi filialga biriktirilmagan odam uchun
 * `{ in: [] }` qaytadi — ya'ni HECH NARSA ko'rmaydi. Bu ataylab:
 * ochiq qoldirishdan xavfsizroq.
 */
export const branchFilter = (field = 'branchId'): Record<string, unknown> => {
  const ctx = storage.getStore();
  if (!ctx) return {};

  if (ctx.branchId) return { [field]: String(ctx.branchId) };

  // Cross-branch: owner hamma narsani ko'radi -> filtr yo'q.
  if (ctx.canSeeAllBranches) return {};

  const allowed = ctx.allowedBranchIds || [];
  if (allowed.length === 0) return { [field]: { in: [] } };
  return { [field]: { in: allowed.map(String) } };
};

/**
 * `AND: [...]` ichiga qo'shish uchun bo'lak. Bo'sh massiv — spread xavfsiz.
 * (Mongo davrida bu `$match` bosqichi edi; nom saqlangan.)
 */
export const branchMatchStage = (field = 'branchId'): Record<string, unknown>[] => {
  const filter = branchFilter(field);
  if (Object.keys(filter).length === 0) return [];
  return [filter];
};

/** Yozishda biriktiriladigan filial (aniq tanlanmagan bo'lsa null). */
export const requireActiveBranchId = (): string | null => {
  const branchId = getActiveBranchId();
  if (!branchId) return null;
  return String(branchId);
};

/**
 * FOYDALANUVCHI uchun filial sharti.
 *
 * Foydalanuvchilar guruhlardan FARQLI — ular IKKI yo'l bilan filialga
 * bog'lanadi: `homeBranchId` va `branchAssignments[]`. Shuning uchun
 * oddiy `branchFilter()` yaramaydi.
 *
 * ⚠ Chaqiruvchi buni `AND` ga qo'shishi SHART, `OR` ga EMAS — ro'yxat
 * funksiyalarida `OR` odatda qidiruv uchun band va ikkinchi `OR`
 * birinchisini JIMGINA bosib ketardi.
 *
 * FILIALSIZ foydalanuvchilar faqat `view_all` huquqi borlarga
 * ko'rinadi — fail-closed.
 */
export const userBranchCondition = (): Record<string, unknown> | null => {
  const ctx = storage.getStore();
  if (!ctx) return null; // kontekstsiz (job/seed) - cheklamaymiz

  if (ctx.canSeeAllBranches && !ctx.branchId) return null;

  if (ctx.branchId) {
    const id = String(ctx.branchId);
    return {
      OR: [{ homeBranchId: id }, { branchAssignments: { some: { branchId: id } } }],
    };
  }

  const allowed = (ctx.allowedBranchIds || []).map(String);
  if (allowed.length === 0) return { id: { in: [] } };
  return {
    OR: [
      { homeBranchId: { in: allowed } },
      { branchAssignments: { some: { branchId: { in: allowed } } } },
    ],
  };
};

/**
 * Berilgan filial joriy foydalanuvchiga ruxsat etilganmi.
 * Kontekstsiz (job/seed) — cheklanmaydi.
 */
export const isBranchAllowed = (branchId: unknown): boolean => {
  if (!branchId) return false;
  const ctx = storage.getStore();
  if (!ctx) return true;
  if (ctx.canSeeAllBranches) return true;
  return (ctx.allowedBranchIds || []).some((id) => String(id) === String(branchId));
};

/**
 * SO'RALGAN FILIAL KO'LAMDAMI (`?branchId=` parametri uchun).
 *
 * QOIDA: aniq filial faqat KO'LAMNI TORAYTIRISHI mumkin, kengaytirishi
 * MUMKIN EMAS. Kengaytirishga urinish — 403.
 *
 * NEGA 403, "e'tiborsiz qoldirish" EMAS: `x-branch-id` SARLAVHASIDA
 * e'tiborsiz qoldirish o'rinli (u eskirgan localStorage'dan kelishi
 * mumkin va foydalanuvchini qulflab qo'ymaslik kerak). Bu yerda esa
 * parametrni foydalanuvchi ATAYLAB yozadi — jim qolib boshqa raqam
 * ko'rsatish "ma'lumot to'g'ri" degan yolg'on taassurot berardi.
 */
export const assertBranchInScope = (branchId: unknown): void => {
  if (!branchId) return;
  const ctx = storage.getStore();
  if (!ctx) return; // kontekstsiz (job, seed, migratsiya)

  const requested = String(branchId);

  // Aniq filial tanlangan bo'lsa, undan BOSHQASINI so'rash mumkin emas —
  // hatto ruxsat etilganini ham: ekrandagi filial va raqamlar bir-biriga
  // mos kelmay qolardi.
  if (ctx.branchId) {
    if (String(ctx.branchId) === requested) return;
    throw new ApiError(403, "Bu filial ma'lumotiga ruxsat yo'q");
  }

  if (ctx.canSeeAllBranches) return;

  const allowed = (ctx.allowedBranchIds || []).map(String);
  if (allowed.includes(requested)) return;

  throw new ApiError(403, "Bu filial ma'lumotiga ruxsat yo'q");
};

export { toObjectId };
