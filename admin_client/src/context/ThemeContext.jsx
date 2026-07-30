import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'theme';

export const THEMES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
});

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return Object.values(THEMES).includes(value) ? value : THEMES.SYSTEM;
  } catch {
    return THEMES.SYSTEM;
  }
};

/** `theme` tanlovini haqiqiy "light" | "dark" ga aylantiradi. */
const resolve = (theme) =>
  theme === THEMES.SYSTEM ? (prefersDark() ? THEMES.DARK : THEMES.LIGHT) : theme;

/** <html> ga `dark` klassi va `color-scheme` ni qo'llaydi. */
const applyToDocument = (resolved) => {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === THEMES.DARK);
  root.style.colorScheme = resolved;
};

/**
 * Tema konteksti — tashqi kutubxonasiz.
 *
 * Saqlash kaliti ("theme") va qiymatlari index.html dagi FOUC oldini
 * oluvchi skript bilan bir xil, shuning uchun sahifa ochilishida
 * miltillash bo'lmaydi.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);
  const [resolvedTheme, setResolvedTheme] = useState(() => resolve(readStored()));

  // Tanlov o'zgarganda — DOM va localStorage ni yangilaymiz.
  useEffect(() => {
    const resolved = resolve(theme);
    setResolvedTheme(resolved);
    applyToDocument(resolved);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* localStorage yopiq bo'lsa — shunchaki saqlamaymiz */
    }
  }, [theme]);

  // "system" rejimida OS sozlamasi o'zgarsa — darhol moslashamiz
  // (sahifani yangilash shart emas).
  useEffect(() => {
    if (theme !== THEMES.SYSTEM) return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const resolved = prefersDark() ? THEMES.DARK : THEMES.LIGHT;
      setResolvedTheme(resolved);
      applyToDocument(resolved);
    };

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  // Boshqa tabda tema almashsa — bu tab ham ergashadi.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setThemeState(readStored());
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((value) => {
    setThemeState(Object.values(THEMES).includes(value) ? value : THEMES.SYSTEM);
  }, []);

  const isDark = resolvedTheme === THEMES.DARK;

  const toggleTheme = useCallback(
    () => setTheme(isDark ? THEMES.LIGHT : THEMES.DARK),
    [isDark, setTheme],
  );

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        isDark,
        isSystem: theme === THEMES.SYSTEM,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme ThemeProvider ichida bo'lishi kerak");
  return ctx;
}
