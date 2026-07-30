// Theme
import { useTheme as useNextTheme } from "next-themes";

export const THEME_OPTIONS = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
});

/**
 * Tema bilan ishlash uchun hook.
 *
 * `next-themes` (v0.4) `theme` va `resolvedTheme` ni useState initializer
 * ichida SINXRON hisoblaydi, ya'ni birinchi renderdayoq to'g'ri qiymat
 * keladi. Shuning uchun bu yerda `mounted` degan qo'shimcha state ham,
 * useEffect ham kerak emas - ikonka "sakramaydi".
 *
 * @returns {{
 *   theme: "light"|"dark"|"system",   // foydalanuvchi tanlovi
 *   resolvedTheme: "light"|"dark",    // haqiqatda qo'llangan tema
 *   isDark: boolean,
 *   isSystem: boolean,
 *   systemTheme: "light"|"dark",
 *   setTheme: (value: string) => void,
 *   toggleTheme: () => void,
 *   ready: boolean,                   // tema aniqlanganmi
 * }}
 */
const useTheme = () => {
  const { theme, setTheme, resolvedTheme, systemTheme } = useNextTheme();

  const isDark = resolvedTheme === THEME_OPTIONS.DARK;

  // Light <-> Dark o'rtasida almashtiradi. Foydalanuvchi "system" da
  // bo'lsa, joriy ko'rinishning teskarisiga o'tkazamiz.
  const toggleTheme = () =>
    setTheme(isDark ? THEME_OPTIONS.LIGHT : THEME_OPTIONS.DARK);

  return {
    theme,
    resolvedTheme,
    systemTheme,
    isDark,
    isSystem: theme === THEME_OPTIONS.SYSTEM,
    setTheme,
    toggleTheme,
    ready: Boolean(resolvedTheme),
  };
};

export default useTheme;
