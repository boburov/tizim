/**
 * MODUL REYESTRINI KODDAN GENERATSIYA QILADI.
 *
 * `requires` QO'LDA YOZILMAYDI — u haqiqiy `@Module({ imports: [...] })`
 * grafigidan chiqariladi. Shu sabab reyestr kod bilan hech qachon
 * ajralib qololmaydi; `test/feature-graph.test.mjs` buni har yurishda
 * qayta tekshiradi.
 *
 * ISHLATISH:  node scripts/gen-feature-registry.mjs > src/common/features/feature-registry.ts
 */
import { readdirSync, readFileSync } from 'node:fs';

const DIR = 'src/modules';

/**
 * BIR-BIRINI IMPORT QILADIGAN MODULLAR BITTA KALIT OSTIDA.
 *
 * ⚠ SABAB — AYLANA. `finance` → `deposits` → `finance` va
 * `finance` → `teacher-salary` → `finance`. Alohida kalit bo'lsa
 * ularning HECH BIRINI o'chirib bo'lmasdi: har biri ikkinchisi ochiq
 * ekan deb to'silardi va panelda hech qachon ishlamaydigan uchta
 * o'chirgich turardi. Ular bitta mahsulot bo'lagi — birga sotiladi,
 * birga o'chadi.
 */
const MERGE = {
  finance: ['finance', 'deposits', 'teacher-salary'],
};
const MERGED_INTO = Object.fromEntries(
  Object.entries(MERGE).flatMap(([main, list]) => list.map((m) => [m, main])),
);

/**
 * Label + tabiat.
 *
 * ── ⚠ `core` VA `locked` — IKKI XIL NARSA ──
 *
 *   `core: true`   — modul tizimning tayanchi. Panelda o'chirgich BOR,
 *                    lekin qizil ogohlantirish va qo'shimcha tasdiq
 *                    bilan. Ilgari bu "o'chirib bo'lmaydi" degani edi.
 *
 *   `locked: true` — o'chirgich UMUMAN yo'q, API 409 qaytaradi.
 *                    ATIGI IKKI KALIT:
 *                      • `auth`     — mahsulot qarori: o'chsa tenantga
 *                                     hech kim, hatto ega ham kira
 *                                     olmaydi va faqat biz qaytara olamiz;
 *                      • `features` — TEXNIK zaruriyat: bu endpoint
 *                                     o'chsa `GET /features` ning O'ZI
 *                                     402 qaytaradi va admin server
 *                                     `/internal/entitlements/refresh`
 *                                     bilan ham tuzata olmaydi. Tenant
 *                                     TIKLANMAS holatga tushardi.
 */
const META = {
  'activity-history':      ["Faoliyat tarixi"],
  'activity-logs':         ["Audit loglari"],
  'admin-dashboard':       ["Boshqaruv paneli"],
  'ai':                    ["AI maslahatchi", { key: 'ai_advisor', gatedElsewhere: true }],
  'archive-reasons':       ["Arxiv sabablari"],
  'assignments':           ["Vazifalar (uy ishi)"],
  'attendance':            ["Davomat"],
  'attendance-exemptions': ["Davomat imtiyozlari"],
  'attendance-settings':   ["Davomat sozlamalari"],
  'auth':                  ["Autentifikatsiya", { core: true, locked: true }],
  'bot-auth':              ["Telegram orqali kirish", { core: true }],
  'branch-analytics':      ["Filial tahlili"],
  'branches':              ["Filiallar", { core: true }],
  'coin':                  ["Tangalar"],
  'courses':               ["Kurslar katalogi", { core: true }],
  'deposits':              ["Oldindan to'lov"],
  'expense-approvals':     ["Chiqim tasdiqlari", { core: true }],
  'expenses':              ["Chiqimlar"],
  'exports':               ["Excel eksport"],
  'features':              ["Tarif imkoniyatlari", { core: true, locked: true }],
  'feedback':              ["Fikr-mulohaza"],
  'feedback-types':        ["Fikr turlari"],
  'finance':               ["Moliya"],
  'finance-analytics':     ["Moliya tahlili"],
  'finance-ops':           ["Moliya amallari"],
  'finance-report':        ["Moliya hisoboti"],
  'grades':                ["Baholash va reyting"],
  'groups':                ["Guruhlar", { core: true }],
  'holidays':              ["Bayramlar"],
  'imports':               ["Excel import"],
  'journal':               ["Kassa jurnali", { core: true }],
  'lead-options':          ["Lid kataloglari"],
  'leads':                 ["Lidlar (CRM)"],
  'ledger':                ["Shaxsiy moliyaviy tarix"],
  'lesson-cancellations':  ["Dars bekor qilish"],
  'market':                ["Market (tanga do'koni)"],
  'notification-templates':["Bildirishnoma shablonlari"],
  'notifications':         ["Bildirishnomalar"],
  'opening-balance':       ["Boshlang'ich qoldiq"],
  'roles':                 ["Rollar va ruxsatlar", { core: true }],
  'rooms':                 ["Xonalar"],
  'search':                ["Global qidiruv (⌘K)"],
  'staff-payroll':         ["Xodim maoshi va KPI"],
  'storage':               ["Fayl saqlagich"],
  'student-freeze':        ["O'quvchini muzlatish"],
  'system-notifications':  ["Tizim bildirishnomalari"],
  'teacher-attendance':    ["O'qituvchi davomati"],
  'teacher-salary':        ["O'qituvchi maoshi"],
  'users':                 ["Foydalanuvchilar", { core: true }],
};

// ── Grafikni o'qish ────────────────────────────────────────────────────────
const mods = {};
for (const d of readdirSync(DIR, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  let cls = null;
  let imports = [];
  const routes = new Set();
  for (const f of readdirSync(`${DIR}/${d.name}`)) {
    // ⚠ Ichki papkalar (`importers/`, `dto/`) o'tkazib yuboriladi —
    // ularni `readFileSync` bilan o'qish EISDIR beradi.
    if (!f.endsWith('.ts')) continue;
    const raw = readFileSync(`${DIR}/${d.name}/${f}`, 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (f.endsWith('.module.ts')) {
      const m = src.match(/export class (\w+Module)/);
      if (m) {
        cls = m[1];
        const b = src.match(/@Module\(\{[\s\S]*?imports:\s*\[([\s\S]*?)\]/);
        imports = b ? [...b[1].matchAll(/\b(\w+Module)\b/g)].map((x) => x[1]) : [];
      }
    }
    if (f.endsWith('.controller.ts')) {
      for (const m of raw.matchAll(/@Controller\(\s*['"`]([^'"`]*)['"`]/g)) routes.add(m[1]);
    }
  }
  if (cls) mods[d.name] = { cls, imports, routes: [...routes] };
}

const byCls = Object.fromEntries(Object.entries(mods).map(([dir, v]) => [v.cls, dir]));
const keyOf = (dir) => {
  const main = MERGED_INTO[dir];
  if (main && main !== dir) return keyOf(main);
  return META[dir]?.[1]?.key ?? dir;
};
const isCore = (dir) => Boolean(META[dir]?.[1]?.core);
const isLocked = (dir) => Boolean(META[dir]?.[1]?.locked);
const indeg = Object.fromEntries(Object.keys(mods).map((d) => [d, 0]));
for (const v of Object.values(mods))
  for (const i of v.imports) { const t = byCls[i]; if (t) indeg[t] += 1; }
const tierOf = (d) => (indeg[d] === 0 ? 'leaf' : indeg[d] <= 2 ? 'near-leaf' : 'load-bearing');

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
// Kalit bo'yicha guruhlash (birlashtirilganlar bitta yozuvga qo'shiladi).
const groups = {};
for (const dir of Object.keys(mods).sort()) {
  if (!META[dir]) { console.error(`⚠ META yo'q: ${dir}`); process.exit(1); }
  (groups[keyOf(dir)] ||= []).push(dir);
}

const entries = [];
for (const key of Object.keys(groups).sort()) {
  const dirs = groups[key];
  // Birlashgan guruhda "asosiy" — MERGE kalitining o'zi (alifbo bo'yicha
  // birinchisi EMAS: aks holda "Moliya" o'rniga "Oldindan to'lov" nom
  // bo'lib qolardi).
  const head = MERGE[key] ? key : dirs[0];
  const opt = META[head][1] || {};

  // ══════════════════════════════════════════════════════════════════
  // `requires` — O'CHIRILISHI MUMKIN BO'LGAN HAR BIR NISHON
  // ══════════════════════════════════════════════════════════════════
  //
  // ⚠ FILTR `!isLocked`, ILGARIGIDEK `!isCore` EMAS.
  //
  // Ilgari core nishonlar grafikka UMUMAN tushmasdi — mantiq shu edi:
  // core'ni o'chirib bo'lmaydi, demak unga bog'liqlikni yozish shovqin.
  // Endi core O'CHIRILADI, ya'ni o'sha "shovqin" yagona to'siq bo'lib
  // qoldi: `groups` o'chirilganda `attendance` JIMGINA buziladi, panel
  // esa hech qanday bog'liqlik ko'rsatmaydi.
  //
  // `locked` nishonlar ('auth', 'features') tushmaydi — ular hech qachon
  // o'chmaydi, ya'ni to'siq sifatida ham ma'nosiz.
  //
  // ⚠ GURUH ICHIDAGI bog'liqlik ham tushmaydi — u o'z-o'ziga bog'liqlik,
  // ya'ni aylana yasardi.
  const requires = [...new Set(
    dirs.flatMap((d) => mods[d].imports)
      .map((i) => byCls[i])
      .filter((t) => t && !isLocked(t) && keyOf(t) !== key)
      .map(keyOf),
  )].sort();

  // ⚠ `routes` DOIM yoziladi — `gatedElsewhere` bo'lsa ham. U hujjat
  // va QAMROV tekshiruvi uchun kerak: reyestrga tushmagan prefiks
  // darvozadan tashqarida qolgan bo'lardi va testda ko'rinmasdi.
  // Darvozadan chiqarish `ROUTE_TO_FEATURE` da bo'ladi, bu yerda emas.
  const routes = dirs.flatMap((d) => mods[d].routes);
  const worst = dirs.map(tierOf).includes('load-bearing')
    ? 'load-bearing'
    : dirs.map(tierOf).includes('near-leaf') ? 'near-leaf' : 'leaf';
  const label = dirs.length > 1
    ? `${META[head][0]} (${dirs.filter((d) => d !== head).map((d) => META[d][0]).join(', ')} bilan birga)`
    : META[head][0];

  entries.push(
    `  {\n` +
    `    key: '${esc(key)}',\n` +
    `    label: '${esc(label)}',\n` +
    `    tier: '${worst}',\n` +
    (opt.core ? `    core: true,\n` : '') +
    (opt.locked ? `    locked: true,\n` : '') +
    (opt.gatedElsewhere ? `    gatedElsewhere: true,\n` : '') +
    `    nestModules: [${dirs.map((d) => `'${esc(mods[d].cls)}'`).join(', ')}],\n` +
    `    routes: [${routes.map((r) => `'${esc(r)}'`).join(', ')}],\n` +
    (requires.length ? `    requires: [${requires.map((r) => `'${esc(r)}'`).join(', ')}],\n` : '') +
    `  },`,
  );
}
console.error(`✅ ${entries.length} ta modul`);
process.stdout.write(entries.join('\n') + '\n');
