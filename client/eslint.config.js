// Globals
import globals from "globals";

// Eslint
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

/*
 * Tema tokenlarini chetlab o'tadigan QAT'IY NEYTRAL ranglarni bloklaydi.
 *
 * Sabab: `bg-white`, `text-gray-700`, `border-slate-200` kabi sinflar dark
 * rejimda o'zgarmaydi - natijada qorong'i sahifada oq karta yoki ko'rinmas
 * matn paydo bo'ladi. O'rniga semantik tokenlar ishlatiladi:
 *   bg-white -> bg-card / bg-background      text-gray-900 -> text-foreground
 *   bg-gray-100 -> bg-muted                  text-gray-500 -> text-muted-foreground
 *   border-gray-200 -> border-border
 *
 * ATAYLAB QAMRALMAGANLAR:
 *  - FAQAT `bg-` va `border-` uchun `500` pog'onasi (`bg-slate-500`) - bu
 *    o'rta neytral IKKALA temada ham oq matn bilan 4.5:1 beradi. Token
 *    bo'lolmaydigan joylarda (doim oq yozuvli status knoblari) ataylab shu
 *    ishlatiladi. `text-gray-500` esa BLOKLANADI - u matn rangi va dark
 *    rejimda xiralashib ketadi (o'rniga `text-muted-foreground`).
 *  - Status ranglari (emerald/amber/rose/...) - ular ma'no tashiydi va
 *    `dark:` varianti yoki `success`/`warning`/`destructive` tokeni bilan
 *    beriladi.
 *  - `bg-black/NN` - modal scrimlari ikkala temada ham to'q bo'lishi kerak.
 */
const NEUTRALS = String.raw`(gray|slate|zinc|neutral|stone)`;
const NEUTRAL_COLOR_RE = String.raw`(^|\s)(` +
  // fon/chegara: 500 dan boshqa hamma pog'ona
  String.raw`(bg|border)-${NEUTRALS}-(50|100|200|300|400|600|700|800|900)` +
  // matn va qolganlari: 500 ham bloklanadi
  String.raw`|(text|ring|divide|placeholder|from|via|to)-${NEUTRALS}-(50|100|200|300|400|500|600|700|800|900)` +
  String.raw`|bg-white` +
  String.raw`)(\/\d+)?(\s|$)`;

const NO_HARDCODED_COLORS = [
  "error",
  {
    selector: `Literal[value=/${NEUTRAL_COLOR_RE}/]`,
    message:
      "Qat'iy neytral rang dark rejimda o'zgarmaydi. Semantik token ishlating (bg-card, bg-muted, text-foreground, text-muted-foreground, border-border).",
  },
  {
    selector: `TemplateElement[value.raw=/${NEUTRAL_COLOR_RE}/]`,
    message:
      "Qat'iy neytral rang dark rejimda o'zgarmaydi. Semantik token ishlating (bg-card, bg-muted, text-foreground, text-muted-foreground, border-border).",
  },
];

export default defineConfig([
  globalIgnores(["dist"]),

  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-restricted-syntax": NO_HARDCODED_COLORS,
    },
  },
]);
