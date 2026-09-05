// @ts-check
import tseslint from 'typescript-eslint';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESLINT — SERVER. IKKI VAZIFA: KOD SIFATI (yengil) + ARXITEKTURA CHEGARASI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NEGA SHU PAYTGACHA YO'Q EDI ──
 * `package.json` da `"lint": "eslint ..."` skripti turardi, lekin
 * konfiguratsiya fayli yo'q edi — `npm run lint` yiqilardi va hech kim
 * yurgizmasdi. Natija: ~110 ta modullararo chuqur import, 7 ta sikl,
 * 3 ta begona validator importi — hech biri hech qachon ushlanmagan.
 *
 * ── IKKI QATLAM ──
 *   1) `no-restricted-imports` — TEZ, har saqlashda IDE'da ko'rinadi.
 *      Faqat naqsh bilan ifodalanadigan qoidalar: begona `*.validators`,
 *      `common/` dan `modules/` ga.
 *   2) `scripts/arch-scan.mjs` + `test/architecture.test.mjs` — graf
 *      talab qiladigan qoidalar (sikl, chuqur import) va BASELINE.
 *      ESLint mavjud 110 buzilishni "kechira" olmaydi — u faqat
 *      qator-qator ishlaydi. Shu sabab chuqur import qoidasi bu yerda
 *      EMAS, testda: u yerda eski qarz ro'yxatda, yangisi xato.
 *
 * ── KOD SIFATI QOIDALARI YENGIL ──
 * `recommended` to'plami butun kodbazada bir necha yuz ogohlantirish
 * berardi va arxitektura xatolari orasida ko'milib qolardi. Shuning
 * uchun faqat HAQIQIY xatoni ko'rsatadiganlar `error`, uslub
 * qoidalari o'chirilgan. Uslub — prettier ishi, lint emas.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/**', 'test/**', 'scripts/**', '*.js', '*.cjs', '*.mjs'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // ── Uslub emas, xato bo'lganlar qoladi; qolgani o'chiriladi ──
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // Nest dekoratorli sinflar bo'sh konstruktor ishlatadi.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // `as never` — Prisma tip to'siqlarini aylanib o'tishning qabul qilingan usuli.
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-require-imports': 'error',
    },
  },

  // ── ARXITEKTURA: modullar ichida ──────────────────────────────────────
  {
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // R2: begona modulning validatorlari — DTO faqat o'z modulida.
              // `../x/x.validators.js` shakli. O'z modulining validatori
              // `./x.validators.js` — bu naqshga tushmaydi.
              group: ['../*/*.validators.js', '../*/*/*.validators.js'],
              message:
                "Boshqa modulning validatorlari import qilinmaydi. DTO/validator o'z modulida qoladi; " +
                "kerak bo'lsa o'zingizniki yozing yoki umumiy qismini `common/` ga chiqaring (faqat haqiqatan umumiy bo'lsa).",
            },
          ],
        },
      ],
    },
  },


  // ── ARXITEKTURA R1: CHUQUR IMPORT (chuqurlik bo'yicha) ────────────────
  //
  // ⚠ NEGA UCHTA ALOHIDA BLOK, BITTA REGEX EMAS.
  //
  // `../` ning ma'nosi FAYL QAYERDA turganiga bog'liq:
  //   `src/modules/x/a.ts`        → `../y/` = qo'shni MODUL
  //   `src/modules/x/sub/a.ts`    → `../../y/` = qo'shni modul,
  //                                 `../../../common/` = umumiy qatlam
  //
  // Bitta umumiy regex yozilganda u `../../common/errors/api-error.js`
  // va `../../config/env.validation.js` kabi MUTLAQO QONUNIY importlarni
  // ham bloklab, 196 ta yolg'on xato bergan edi. Shuning uchun har
  // chuqurlik o'z `files` doirasi bilan alohida tekshiriladi.
  ...[
    { files: ['src/modules/*/*.ts'], up: '\\.\\./' },
    { files: ['src/modules/*/*/*.ts'], up: '\\.\\./\\.\\./' },
    { files: ['src/modules/*/*/*/*.ts'], up: '\\.\\./\\.\\./\\.\\./' },
  ].map(({ files, up }) => ({
    files,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Begona modulning ICHKI fayli. `index.js` — ommaviy API,
              // u ruxsat etiladi. O'z modulining fayllari `./x.js`
              // shaklida bo'lib, bu naqshga umuman tushmaydi.
              regex: `^${up}[^/]+/(?!index\\.js)[^/]+\\.js$`,
              message:
                "Boshqa modulning ICHKI fayliga to'g'ridan-to'g'ri import qilinmaydi. " +
                "Uning `index.ts` ommaviy API'sidan foydalaning (`../<modul>/index.js`); " +
                "kerakli narsa u yerda bo'lmasa — ATAYLAB qo'shing, shunda sirt ko'rinib turadi.",
            },
          ],
        },
      ],
    },
  })),

  // ── ARXITEKTURA: common yuqoriga qaramaydi ────────────────────────────
  {
    files: ['src/common/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // R3: `common/` pastki qatlam. `modules/` dan import — sikl urug'i
              // va "umumiy" degan so'zning ma'nosini yo'qotadi.
              group: ['**/modules/**'],
              message:
                "`common/` `modules/` dan import qilmaydi. Bu kod bitta modulga tegishli bo'lsa — o'sha modulga ko'chiring; " +
                "haqiqatan umumiy bo'lsa — modulga bog'liqlikni interfeys/inyeksiya orqali teskari qiling.",
            },
          ],
        },
      ],
    },
  },
);
