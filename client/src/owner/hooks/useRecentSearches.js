import { useCallback, useSyncExternalStore } from "react";

// So'nggi qidiruv natijalari localStorage'da saqlanadi (faqat ochilgan yozuvlar).
const STORAGE_KEY = "owner:recent-searches";
const MAX_RECENT = 5;

const read = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

const write = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage mavjud emas yoki to'lgan - jim o'tib ketamiz
  }
};

// Bir nechta GlobalSearch instansi (sidebar + topbar) bir xil holatda bo'lishi uchun
// modul darajasidagi store. useSyncExternalStore orqali hammasi refreshsiz yangilanadi.
let memory = read();
const subscribers = new Set();

const subscribe = (fn) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

const getSnapshot = () => memory;

const setRecentStore = (list) => {
  memory = list.slice(0, MAX_RECENT);
  write(memory);
  for (const fn of subscribers) fn();
};

// Boshqa tabda o'zgargan localStorage'ni ham qabul qilamiz
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      memory = read();
      for (const fn of subscribers) fn();
    }
  });
}

// type: "page" | "student" | "teacher" | "group"
// har bir yozuv: { id, type, title, subtitle, url }
const useRecentSearches = () => {
  const recent = useSyncExternalStore(subscribe, getSnapshot);

  const addRecent = useCallback((entry) => {
    if (!entry || !entry.id || !entry.url) return;
    setRecentStore([entry, ...memory.filter((it) => it.id !== entry.id)]);
  }, []);

  const clearRecent = useCallback(() => {
    setRecentStore([]);
  }, []);

  return { recent, addRecent, clearRecent };
};

export default useRecentSearches;
