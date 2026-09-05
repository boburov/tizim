/** @type {import('dependency-cruiser').IConfiguration} */
/**
 * dependency-cruiser — IKKINCHI FIKR. Asosiy nazorat `scripts/arch-scan.mjs`
 * (baseline bilan). Bu konfiguratsiya o'sha qoidalarning MUSTAQIL
 * ifodasi: ikki vosita bir xil narsani aytsa — skaner to'g'ri; farq
 * qilsa — skanerdagi xatoni ushlash imkoni.
 *
 * `npm run arch:cruise` — grafni chizish va sikllarni ko'rish uchun.
 * CI'da ISHLAMAYDI: mavjud qarz bilan u doim qizil, baseline'i yo'q.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Modul darajasidagi sikl — Nest modullari forwardRef siz yuklanmaydi.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-cross-module-validators',
      severity: 'error',
      comment: "Boshqa modulning validatorlari — DTO o'z modulida.",
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/.*\\.validators\\.ts$', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'no-deep-module-import',
      severity: 'warn',
      comment: "Modul faqat boshqa modulning `index.ts` yoki `*.module.ts` orqali kiradi.",
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        // ⚠ `pathNot` massivining har elementi ALOHIDA regex — `$1`/`\2`
        // guruh havolasi elementlar orasida ishlamaydi. Shuning uchun
        // `*.module.ts` umumiy naqsh bilan ruxsat etiladi.
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$', '^src/modules/[^/]+/[^/]+\\.module\\.ts$'],
      },
    },
    {
      name: 'common-does-not-import-modules',
      severity: 'error',
      comment: "`common/` pastki qatlam.",
      from: { path: '^src/common/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-orphans',
      severity: 'info',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', 'main\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
    reporterOptions: { dot: { collapsePattern: '^src/modules/[^/]+' } },
  },
};
