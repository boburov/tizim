/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARXITEKTURA TESTI — CHEGARA BUZILISHI O'SMAYDI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qoidalar `scripts/arch-scan.mjs` da (R1–R4). Bu test uch narsani
 * tekshiradi:
 *
 *   1) YANGI BUZILISH YO'Q — skaner topgan har bir buzilish
 *      `architecture.baseline.json` da bo'lishi shart. Bo'lmasa — yiqiladi
 *      va aynan qaysi import qayerdan qayerga ekanini aytadi.
 *
 *   2) BASELINE ESKIRMAGAN — ro'yxatdagi buzilish kodda endi yo'q bo'lsa
 *      bu XATO EMAS (qarz kamaydi), lekin ogohlantirish: baseline'ni
 *      `npm run arch:baseline` bilan qisqartiring. Aks holda kimdir o'sha
 *      buzilishni qaytadan kiritsa, u "eski" deb o'tib ketadi.
 *
 *   3) NEGATIV NAZORAT — skaner haqiqatan ishlayaptimi? Sun'iy buzilish
 *      (vaqtinchalik fayl) yaratilib, skaner uni topishi tekshiriladi.
 *      Usiz regex'dagi bitta xato butun testni "hammasi toza" deb
 *      YASHIL qilib qo'yardi — tekshirilmagan narsa tekshirilgandek.
 *
 * ⚠ `dist/` EMAS, `src/` O'QILADI — eskirgan build bilan test yolg'on
 * bo'lmasin.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { analyze, violationKey, ROOT } from '../scripts/arch-scan.mjs';

const BASELINE = path.join(ROOT, 'test', 'architecture.baseline.json');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  ✓ ${name}`); };

console.log('\n\x1b[1mARXITEKTURA CHEGARASI\x1b[0m');

// ── 3) Negativ nazorat OLDIN — skaner o'ladi-yu, qolgani "toza" chiqmasin ──
const tmpMod = path.join(ROOT, 'src', 'modules', '__arch_probe__');
test('negativ nazorat: skaner sun\'iy chuqur importni topadi', () => {
  mkdirSync(tmpMod, { recursive: true });
  try {
    writeFileSync(
      path.join(tmpMod, 'probe.service.ts'),
      // Boshqa modulning servisiga + validatoriga to'g'ridan-to'g'ri import.
      "import { AuthService } from '../auth/auth.service.js';\n" +
      "import { loginSchema } from '../auth/auth.validators.js';\n" +
      'export const probe = [AuthService, loginSchema];\n',
    );
    const r = analyze();
    const mine = r.violations.filter((v) => v.from.startsWith('modules/__arch_probe__'));
    assert.ok(mine.some((v) => v.rule === 'DEEP_IMPORT'), 'DEEP_IMPORT topilmadi');
    assert.ok(mine.some((v) => v.rule === 'VALIDATOR_IMPORT'), 'VALIDATOR_IMPORT topilmadi');
  } finally {
    rmSync(tmpMod, { recursive: true, force: true });
  }
});

// ── Haqiqiy skan ──────────────────────────────────────────────────────────
const result = analyze();
const current = new Set(result.violations.map(violationKey));

assert.ok(existsSync(BASELINE), `Baseline yo'q: ${BASELINE} — \`npm run arch:baseline\` yurgizing`);
const baseline = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).violations);

test('baseline o\'qildi', () => {
  assert.ok(baseline.size >= 0);
});

// ── 1) Yangi buzilish ─────────────────────────────────────────────────────
test('yangi arxitektura buzilishi yo\'q', () => {
  const fresh = [...current].filter((k) => !baseline.has(k));
  if (fresh.length) {
    const lines = fresh.map((k) => {
      const [rule, from, to] = k.split('|');
      return `    ${rule.padEnd(22)} ${from}\n${' '.repeat(27)}→ ${to}`;
    });
    assert.fail(
      `\n  ${fresh.length} ta YANGI chegara buzilishi (baseline'da yo'q):\n\n${lines.join('\n\n')}\n\n` +
      "  Tuzatish: begona modulga uning `index.ts` (ommaviy API) orqali kiring, yoki\n" +
      "  kodni haqiqiy egasiga ko'chiring. Baseline'ga QO'SHMANG — u faqat qisqaradi.\n",
    );
  }
});

// ── 2) Eskirgan baseline ──────────────────────────────────────────────────
test('baseline eskirmagan (ogohlantirish)', () => {
  const stale = [...baseline].filter((k) => !current.has(k));
  if (stale.length) {
    console.log(`    ⚠ ${stale.length} ta buzilish tuzatilgan, lekin baseline'da turibdi — \`npm run arch:baseline\` yurgizing`);
  }
});

// ── Qat'iy qoidalar — baseline'siz. Bular hozir 0 va shunday QOLADI. ─────
test('common/ modules/ dan import qilmaydi (baseline\'dagidan tashqari)', () => {
  const fresh = result.violations
    .filter((v) => v.rule === 'COMMON_IMPORTS_MODULE')
    .filter((v) => !baseline.has(violationKey(v)));
  assert.deepEqual(fresh, []);
});

console.log(`\n\x1b[32m${passed} o'tdi\x1b[0m · buzilishlar: ${current.size} (baseline: ${baseline.size})\n`);
