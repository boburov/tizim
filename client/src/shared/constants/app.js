// Tizim nomi, logotip va brend ranglari .env orqali sozlanadi (VITE_APP_*)
import { parseHsl, validateHsl } from "@/shared/utils/color";
import {
  buildLightTokens,
  buildDarkTokens,
} from "@/shared/lib/theme/brandTokens";

export const APP_NAME = import.meta.env.VITE_APP_NAME || "Bayyina";
export const APP_LOGO = import.meta.env.VITE_APP_LOGO || "/logo.svg";

export const APP_THEME = {
  // Light rejim
  primary: import.meta.env.VITE_APP_PRIMARY,
  background: import.meta.env.VITE_APP_BACKGROUND,

  // Dark rejim - MAJBURIY EMAS. Berilmasa, yuqoridagilardan avtomatik
  // hosil qilinadi (tus saqlanadi, yorug'lik kontrast yetguncha oshadi).
  primaryDark: import.meta.env.VITE_APP_PRIMARY_DARK,
  backgroundDark: import.meta.env.VITE_APP_BACKGROUND_DARK,
};

const STYLE_ELEMENT_ID = "app-brand-theme";

const toCssBlock = (selector, tokens) => {
  const body = Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return body ? `${selector} {\n${body}\n}` : "";
};

/**
 * .env dagi brend ranglarini qo'llaydi - light va dark rejim uchun alohida.
 *
 * MUHIM: ilgari bu funksiya `documentElement.style.setProperty()` ishlatardi.
 * Inline style `.dark { ... }` qoidalaridan ustun turadi, shuning uchun dark
 * rejim hech qachon ishlamas edi. Endi o'rniga <style> teg qo'shiladi va
 * qoidalar `:root:not(.dark)` / `:root.dark` bilan alohida chegaralanadi.
 */
/**
 * .env dagi rang qiymatlarini tekshiradi va muammoni konsolga chiqaradi.
 *
 * Ataylab BLOKLAMAYDI: noto'g'ri qiymat sababli ishlab turgan panel
 * ochilmay qolishi kerak emas. Xatoni ushlash uchun asosiy to'siq -
 * `npm run check:contrast` (CI'da ishlaydi), bu esa ishlab chiqish
 * paytida darhol ko'rinadigan ogohlantirish.
 */
const warnOnInvalidTheme = () => {
  if (!import.meta.env.DEV) return;

  const issues = [
    validateHsl(APP_THEME.primary, "VITE_APP_PRIMARY"),
    validateHsl(APP_THEME.background, "VITE_APP_BACKGROUND"),
    validateHsl(APP_THEME.primaryDark, "VITE_APP_PRIMARY_DARK"),
    validateHsl(APP_THEME.backgroundDark, "VITE_APP_BACKGROUND_DARK"),
  ].flatMap((result) => result.issues);

  if (issues.length === 0) return;

  console.warn(
    `[tema] .env dagi rang qiymatlarida muammo bor:\n` +
      issues.map((issue) => `  - ${issue}`).join("\n"),
  );
};

export const applyAppTheme = () => {
  if (typeof document === "undefined") return;

  warnOnInvalidTheme();

  const brand = {
    primary: parseHsl(APP_THEME.primary),
    background: parseHsl(APP_THEME.background),
    primaryDark: parseHsl(APP_THEME.primaryDark),
    backgroundDark: parseHsl(APP_THEME.backgroundDark),
  };

  if (!Object.values(brand).some(Boolean)) return;

  const css = [
    toCssBlock(":root:not(.dark)", buildLightTokens(brand)),
    toCssBlock(":root.dark", buildDarkTokens(brand)),
  ]
    .filter(Boolean)
    .join("\n\n");

  let style = document.getElementById(STYLE_ELEMENT_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
};
