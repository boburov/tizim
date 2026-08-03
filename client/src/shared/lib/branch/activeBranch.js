// AKTIV FILIAL (localStorage + umumiy obuna).
//
// NEGA localStorage: axios interceptor React kontekstidan TASHQARIDA
// ishlaydi, ya'ni hook orqali qiymat ololmaydi. Shuning uchun tanlangan
// filial localStorage'da saqlanadi va interceptor uni to'g'ridan-to'g'ri
// o'qiydi (authToken bilan bir xil yondashuv).
//
// NEGA obuna (subscribe): filialni bir nechta komponent o'qiydi
// (AuthGuard, AppSidebar, UsersTable...). Agar har biri o'z useState'ini
// tutsa, birida o'zgargan qiymat boshqasiga YETIB BORMAYDI - tanlash
// ekrani yopilmay qolardi. useSyncExternalStore uchun yagona manba.

const STORAGE_KEY = "activeBranchId";

// "Barcha filiallar" - konsolidatsiya ko'rinish.
// Server buni faqat branches.view_all ruxsati bo'lsa qabul qiladi.
export const ALL_BRANCHES = "all";

// Obunachilar - qiymat o'zgarganda hammasi xabardor qilinadi.
const listeners = new Set();

// useSyncExternalStore getSnapshot uchun: HAR CHAQIRUVDA bir xil
// referens qaytishi shart, aks holda cheksiz qayta render bo'ladi.
let cached = null;
let cacheInit = false;

const readStorage = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY) || null;
};

export const getActiveBranchId = () => {
  if (!cacheInit) {
    cached = readStorage();
    cacheInit = true;
  }
  return cached;
};

export const setActiveBranchId = (branchId) => {
  const value = branchId ? String(branchId) : null;
  if (typeof window !== "undefined") {
    if (!value) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  }
  cached = value;
  cacheInit = true;
  // Barcha komponentlarni xabardor qilamiz.
  for (const fn of listeners) fn();
};

export const clearActiveBranchId = () => setActiveBranchId(null);

/** useSyncExternalStore uchun obuna. */
export const subscribeActiveBranch = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

/**
 * Saqlangan filial hali ham amal qiladimi.
 * Foydalanuvchi filialdan chiqarilgan yoki filial o'chirilgan bo'lsa,
 * eski qiymat localStorage'da qolib ketmasin (aks holda server 403 beradi).
 */
export const isBranchIdValid = (branchId, { branches, canSeeAllBranches }) => {
  if (!branchId) return false;

  // "Barcha filiallar" faqat ROSTDAN HAM bir nechta filial bo'lgandagina
  // mavjud - useActiveBranch'dagi optionCount bilan AYNI qoida.
  //
  // NEGA filiallar soni ham tekshiriladi: `canSeeAllBranches` yolg'iz
  // yetmaydi (egada u DOIM true). Ilgari markaz bitta filialga qisqarganda
  // localStorage'dagi eski "all" qiymati YAROQLI deb qolar, useActiveBranch
  // uni tuzatmas edi - natijada tanlagichda "Barcha filiallar" muzlab qolib,
  // har bir yaratish amali «Barcha filiallar» rejimida yaratib bo'lmaydi"
  // xatosi bilan tugardi.
  if (branchId === ALL_BRANCHES) {
    return Boolean(canSeeAllBranches) && (branches || []).length > 1;
  }

  return (branches || []).some((b) => String(b._id) === String(branchId));
};
