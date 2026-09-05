/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARXITEKTURA SKANERI — MODULLARARO BOG'LIQLIK XARITASI VA CHEGARA QOIDALARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bitta manba, uch iste'molchi:
 *   • `npm run arch:map`       — xaritani odam o'qiydigan ko'rinishda chiqaradi
 *   • `npm run arch:baseline`  — hozirgi buzilishlarni `test/architecture.baseline.json`
 *                                ga yozadi (faqat QISQARTIRISH uchun, o'sish uchun emas)
 *   • `test/architecture.test.mjs` — YANGI buzilish bo'lsa yiqiladi
 *
 * ── NEGA O'Z SKANER, dependency-cruiser YETARLI EMASMI ──
 * dependency-cruiser ham o'rnatilgan (`.dependency-cruiser.cjs`) va sikl
 * hamda chuqur importni u ham topadi. Lekin uning natijasi "hozir
 * necha buzilish bor" degan MUTLAQ son — 170 ta mavjud buzilish bilan u
 * birinchi kundan qizil va hech kim unga qaramaydi. Bu skaner esa
 * BASELINE bilan ishlaydi: eski buzilishlar ro'yxatda, yangisi — xato.
 * Ya'ni CI bugungi qarzni kechiradi, lekin yangi qarz olishga yo'l
 * qo'ymaydi. Qarz kamayganda baseline qisqaradi va qayta o'smaydi.
 *
 * ── QOIDALAR ──
 *
 *  R1 DEEP_IMPORT   `modules/A` faqat `modules/B/B.module.js` yoki
 *                   `modules/B/index.js` orqali B ga kirishi mumkin.
 *                   B ning servis/helper/validator fayliga to'g'ridan-
 *                   to'g'ri import — chegara buzilishi.
 *                   ⚠ `index.ts` — modulning OMMAVIY API'si. U yo'q bo'lsa,
 *                   modul hozircha hech narsani eksport qilmaydi.
 *
 *  R2 VALIDATOR     Boshqa modulning `*.validators.js` fayli import
 *                   qilinmaydi — DTO faqat o'z modulida. Hozir 0 ta; bu
 *                   qoida shu holatni QULFLAYDI.
 *
 *  R3 COMMON_UP     `common/**` `modules/**` dan import qilmaydi. Common
 *                   pastki qatlam; teskari yo'nalish — sikl urug'i.
 *
 *  R4 CYCLE         Modul darajasidagi grafda sikl (A→B→A). Fayl
 *                   darajasida emas — modul darajasida, chunki Nest
 *                   modullari o'zaro `forwardRef` siz yuklana olmaydi.
 *
 *  R5 COMMON_LEAK   `common/` ichidagi, aslida bitta modulga tegishli
 *                   fayl — iste'molchisi 1-2 modul bo'lsa va ular bitta
 *                   domen bo'lsa. Bu qoida FAQAT hisobot beradi (xato
 *                   emas): "domenga xos" mashina hal qila oladigan
 *                   savol emas, odam ko'rib chiqadi (8-faza).
 *
 * ── NIMA SANALMAYDI ──
 *   • `import type` — tip bog'liqligi ish vaqtida yo'q, sikl yaratmaydi.
 *     Lekin R1 uchun SANALADI: tip bo'lsa ham begona modulning ichki
 *     shakliga bog'lanish — chegara buzilishi.
 *   • `app.module.ts`, `main.ts`, `seeds/`, `jobs/`, `bot/`, `health/` —
 *     ular ORKESTRATOR, hamma modulni bilishi tabiiy. Ular skanerdan
 *     chiqarilmaydi, lekin R1 ularga tatbiq etilmaydi.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** R1 tatbiq etilmaydigan orkestrator qatlamlari. */
const ORCHESTRATORS = new Set(['app', 'main', 'seeds', 'jobs', 'bot', 'health', 'config', 'prisma', 'middleware']);

/** Modulning ommaviy API fayllari — shular orqali kirish ruxsat etilgan. */
const isPublicEntry = (moduleName, fileBase) =>
  fileBase === 'index' || fileBase === `${moduleName}.module`;

// ── Fayllarni yig'ish ────────────────────────────────────────────────────
const walk = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|mts)$/.test(name) && !name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
};

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** `src/` ga nisbatan yo'l → { layer, module } */
export const classify = (rel) => {
  const parts = rel.split(path.sep);
  if (parts[0] === 'modules') return { layer: 'modules', module: parts[1] || null, unit: `modules/${parts[1]}` };
  if (parts[0] === 'common') return { layer: 'common', module: null, unit: 'common' };
  const top = parts[0].replace(/\.(ts|mts)$/, '');
  if (top === 'app.module') return { layer: 'app', module: null, unit: 'app' };
  return { layer: top, module: null, unit: top };
};

const IMPORT_RE = /(?:import|export)\s+(type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]|import\s+(type\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Barcha fayl → import qatorlarini yig'adi (faqat nisbiy importlar). */
export const collectImports = () => {
  const files = walk(SRC);
  const edges = []; // { from, to, typeOnly, spec }
  for (const file of files) {
    const rel = path.relative(SRC, file);
    const src = strip(readFileSync(file, 'utf8'));
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[2] || m[4] || m[5];
      if (!spec || !spec.startsWith('.')) continue;
      const typeOnly = Boolean(m[1] || m[3]);
      // `.js` → `.ts` (ESM Nest importlari .js bilan yoziladi)
      let target = path.resolve(path.dirname(file), spec).replace(/\.js$/, '.ts');
      if (!existsSync(target)) {
        if (existsSync(target.replace(/\.ts$/, '') + '/index.ts')) target = target.replace(/\.ts$/, '') + '/index.ts';
        else if (existsSync(target + '.ts')) target = target + '.ts';
        else continue; // tashqi yoki topilmadi — skaner emas, tsc ishi
      }
      edges.push({ from: rel, to: path.relative(SRC, target), typeOnly, spec });
    }
  }
  return { files: files.map((f) => path.relative(SRC, f)), edges };
};

// ── Qoidalar ─────────────────────────────────────────────────────────────
export const analyze = () => {
  const { files, edges } = collectImports();
  const violations = [];
  const moduleGraph = new Map(); // unit -> Set(unit)

  for (const e of edges) {
    const from = classify(e.from);
    const to = classify(e.to);

    // Modul grafi (sikl uchun) — faqat ish vaqtidagi bog'liqlik.
    if (from.layer === 'modules' && to.layer === 'modules' && from.module !== to.module && !e.typeOnly) {
      if (!moduleGraph.has(from.unit)) moduleGraph.set(from.unit, new Set());
      moduleGraph.get(from.unit).add(to.unit);
    }

    // R1 — chuqur import
    if (
      from.layer === 'modules' &&
      to.layer === 'modules' &&
      from.module !== to.module &&
      !ORCHESTRATORS.has(from.layer)
    ) {
      const base = path.basename(e.to, '.ts');
      if (!isPublicEntry(to.module, base)) {
        violations.push({ rule: 'DEEP_IMPORT', from: e.from, to: e.to });
      }
      // R2 — validator
      if (base.endsWith('.validators')) {
        violations.push({ rule: 'VALIDATOR_IMPORT', from: e.from, to: e.to });
      }
    }

    // R3 — common yuqoriga qaramaydi
    if (from.layer === 'common' && to.layer === 'modules') {
      violations.push({ rule: 'COMMON_IMPORTS_MODULE', from: e.from, to: e.to });
    }
  }

  // R4 — sikl (Tarjan o'rniga oddiy DFS: graf kichik, 49 tugun)
  const cycles = [];
  const seenCycle = new Set();
  const dfs = (node, stack, onPath) => {
    for (const next of moduleGraph.get(node) || []) {
      if (onPath.has(next)) {
        const cyc = [...stack.slice(stack.indexOf(next)), next];
        const key = [...cyc].slice(0, -1).sort().join('>');
        if (!seenCycle.has(key)) { seenCycle.add(key); cycles.push(cyc); }
        continue;
      }
      onPath.add(next); stack.push(next);
      dfs(next, stack, onPath);
      stack.pop(); onPath.delete(next);
    }
  };
  for (const n of moduleGraph.keys()) dfs(n, [n], new Set([n]));
  for (const c of cycles) violations.push({ rule: 'CYCLE', from: c[0], to: c.join(' → ') });

  // R5 — common ichidagi domen sizishi (hisobot)
  const commonConsumers = new Map(); // common fayl -> Set(module unit)
  for (const e of edges) {
    const to = classify(e.to);
    const from = classify(e.from);
    if (to.layer !== 'common') continue;
    if (!commonConsumers.has(e.to)) commonConsumers.set(e.to, new Set());
    if (from.layer === 'modules') commonConsumers.get(e.to).add(from.unit);
    else commonConsumers.get(e.to).add(from.unit);
  }
  const leaks = [];
  for (const [file, consumers] of commonConsumers) {
    const mods = [...consumers].filter((u) => u.startsWith('modules/'));
    const others = [...consumers].filter((u) => !u.startsWith('modules/') && u !== 'common');
    // Faqat 1-2 modul ishlatsa va boshqa qatlam ishlatmasa — nomzod.
    if (mods.length > 0 && mods.length <= 2 && others.length === 0) {
      leaks.push({ file, consumers: mods.sort() });
    }
  }

  return { files, edges, violations, moduleGraph, leaks };
};

export const violationKey = (v) => `${v.rule}|${v.from}|${v.to}`;

// ── CLI ──────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv[2] || 'map';
  const r = analyze();
  if (mode === 'baseline') {
    const { writeFileSync } = await import('node:fs');
    const out = path.join(ROOT, 'test', 'architecture.baseline.json');
    const keys = r.violations.map(violationKey).sort();
    let prev = [];
    if (existsSync(out)) prev = JSON.parse(readFileSync(out, 'utf8')).violations || [];
    const grown = keys.filter((k) => !prev.includes(k));
    if (prev.length && grown.length) {
      console.error(`\n✖ Baseline O'SMAYDI. ${grown.length} ta YANGI buzilish — ularni tuzating, baseline'ga yozmang:\n`);
      for (const g of grown) console.error('  ' + g);
      process.exit(1);
    }
    writeFileSync(out, JSON.stringify({
      _comment: 'Mavjud arxitektura qarzi. FAQAT qisqaradi — `npm run arch:baseline`. Yangi buzilish bu ro\'yxatga tushmaydi.',
      generatedAt: new Date().toISOString().slice(0, 10),
      violations: keys,
    }, null, 2) + '\n');
    console.log(`Baseline yozildi: ${keys.length} ta buzilish (oldin ${prev.length})`);
    process.exit(0);
  }

  // map
  const byRule = {};
  for (const v of r.violations) (byRule[v.rule] ||= []).push(v);
  console.log(`\nFayllar: ${r.files.length}   Import qatorlari: ${r.edges.length}\n`);
  console.log('BUZILISHLAR:');
  for (const [rule, list] of Object.entries(byRule)) console.log(`  ${rule.padEnd(24)} ${list.length}`);

  // Eng ko'p import qilinadigan modullar
  const inbound = new Map();
  for (const [from, tos] of r.moduleGraph) for (const t of tos) inbound.set(t, (inbound.get(t) || 0) + 1);
  console.log('\nENG KO\'P BOG\'LANILGAN MODULLAR (kiruvchi modul soni):');
  for (const [m, n] of [...inbound].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${m.padEnd(34)} ${n}`);

  if (byRule.CYCLE?.length) {
    console.log('\nSIKLLAR:');
    for (const c of byRule.CYCLE) console.log('  ' + c.to);
  }

  console.log(`\nCOMMON ICHIDAGI DOMEN SIZISHI NOMZODLARI (${r.leaks.length}):`);
  for (const l of r.leaks.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`  ${l.file.padEnd(52)} ← ${l.consumers.join(', ')}`);
  }
  if (mode === 'verbose') {
    console.log('\nDEEP_IMPORT to\'liq ro\'yxat:');
    for (const v of byRule.DEEP_IMPORT || []) console.log(`  ${v.from}  →  ${v.to}`);
  }
}
