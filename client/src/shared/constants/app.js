// Tizim nomi .env orqali sozlanadi; logo/favicon public/ papkadan olinadi
import { parseHsl } from "@/shared/utils/color";
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
export const applyAppTheme = () => {
  if (typeof document === "undefined") return;

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
