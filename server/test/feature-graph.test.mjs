/**
 * BOG'LIQLIK GRAFIGI — REYESTR HAQIQIY IMPORT'LARGA MOS KELADIMI.
 *
 * NEGA KERAK: dev panel bo'limni o'chirishga ruxsat berishdan oldin
 * `requires` ro'yxatiga qaraydi. Agar bu ma'lumot kodning o'zidan
 * ajralib qolsa, panel "o'chirish xavfsiz" deb aytadi-yu, aslida
 * bog'liq modul ish vaqtida yiqiladi yoki — bundan ham yomoni —
 * JIMGINA noto'g'ri natija beradi (masalan davomat o'chirilganda
 * xodim KPI bonusi noto'g'ri hisoblanadi).
 *
 * Shuning uchun bog'liqlik ma'lumoti QO'LDA YOZILMAYDI, balki har
 * yurishda haqiqiy `@Module({ imports: [...] })` ro'yxatiga qarshi
 * tekshiriladi. Eskira olmaydi.
 *
 * ⚠ MANBA `src/` DAN O'QILADI, `dist/` DAN EMAS.
 * Reyestrda dekorator yo'q, ya'ni Node uni to'g'ridan-to'g'ri o'qiy
 * oladi (tip'lar tashlab yuboriladi). Bu ataylab: `dist/` eskirgan
 * bo'lsa test YASHIL bo'lib, hech narsani isbotlamasdi.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FEATURES,
  FEATURE_BY_KEY,
  featureChain,
  blockersForDisabling,
} from '../src/common/features/feature-registry.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES_DIR = path.join(ROOT, 'src', 'modules');

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/** Barcha `*.module.ts` fayllari: klass nomi → fayl yo'li. */
const moduleFiles = new Map();
for (const dir of readdirSync(MODULES_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of readdirSync(path.join(MODULES_DIR, dir.name))) {
    if (!file.endsWith('.module.ts')) continue;
    const full = path.join(MODULES_DIR, dir.name, file);
    const src = readFileSync(full, 'utf8');
    for (const m of src.matchAll(/export class (\w+Module)\b/g)) {
      moduleFiles.set(m[1], full);
    }
  }
}

/**
 * `@Module({ imports: [...] })` ichidagi modul klasslari.
 *
 * ⚠ Izohlar OLIB TASHLANADI: bu fayllar izohlarda boshqa modul
 * nomlarini tez-tez tilga oladi va ularni haqiqiy bog'liqlik deb
 * o'qish yolg'on qizil berardi.
 */
const importsOf = (file) => {
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const block = src.match(/@Module\(\{[\s\S]*?imports:\s*\[([\s\S]*?)\]/);
  if (!block) return [];
  return [...block[1].matchAll(/\b(\w+Module)\b/g)].map((m) => m[1]);
};

console.log('\nBOG\'LIQLIK GRAFIGI\n');

// ── Reyestrning o'z butunligi ────────────────────────────────────────────
test('kalitlar takrorlanmaydi', () => {
  const keys = FEATURES.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('har bir `parent` reyestrda mavjud', () => {
  for (const f of FEATURES) {
    if (!f.parent) continue;
    assert.ok(FEATURE_BY_KEY.has(f.parent), `${f.key}: otasi yo'q (${f.parent})`);
  }
});

test('har bir `requires` reyestrda mavjud', () => {
  for (const f of FEATURES) {
    for (const req of f.requires || []) {
      assert.ok(FEATURE_BY_KEY.has(req), `${f.key}: noma'lum bog'liqlik (${req})`);
      assert.notEqual(req, f.key, `${f.key}: o'ziga bog'liq`);
    }
  }
});

test('ota zanjirida AYLANA yo\'q', () => {
  for (const f of FEATURES) {
    const chain = featureChain(f.key);
    assert.equal(
      new Set(chain).size,
      chain.length,
      `${f.key}: ota zanjirida aylana (${chain.join(' → ')})`,
    );
  }
});

test('imkoniyat (capability) o\'zi NestJS moduli emas', () => {
  for (const f of FEATURES) {
    if (f.parent) assert.equal(f.nestModule, undefined, `${f.key}: ortiqcha nestModule`);
  }
});

// ── Kodga qarshi tekshiruv ────────────────────────────────────────────────
test('e\'lon qilingan `nestModule` HAQIQATAN mavjud', () => {
  for (const f of FEATURES) {
    if (!f.nestModule) continue;
    assert.ok(
      moduleFiles.has(f.nestModule),
      `${f.key}: ${f.nestModule} topilmadi`,
    );
  }
});

test('MODUL IMPORTLARI `requires` da to\'liq aks etgan', () => {
  // Toggle qilinadigan NestJS modullari: klass nomi → tarif kaliti.
  const gated = new Map(
    FEATURES.filter((f) => f.nestModule).map((f) => [f.nestModule, f.key]),
  );

  for (const f of FEATURES) {
    if (!f.nestModule) continue;
    const declared = new Set(f.requires || []);

    for (const imported of importsOf(moduleFiles.get(f.nestModule))) {
      const key = gated.get(imported);
      // Toggle qilinmaydigan modulga bog'liqlik `requires` ga tushmaydi —
      // u har doim mavjud.
      if (!key || key === f.key) continue;
      assert.ok(
        declared.has(key),
        `${f.key} → ${imported} ni import qiladi, lekin requires da "${key}" yo'q. ` +
          `Reyestrga qo'shing, aks holda dev panel "${key}" ni o'chirishga ` +
          `xato ruxsat beradi.`,
      );
    }
  }
});

// ── To'siq hisoblash ──────────────────────────────────────────────────────
test('blockersForDisabling ochiq bog\'liqni ushlaydi', () => {
  // Reyestrga bog'liq bo'lmagan sintetik holat — funksiyaning O'ZI
  // tekshiriladi, hozirgi ma'lumot emas.
  const all = () => true;
  for (const f of FEATURES) {
    for (const req of f.requires || []) {
      assert.ok(
        blockersForDisabling(req, all).includes(f.key),
        `${req} o'chirilganda ${f.key} to'siq bo'lishi kerak edi`,
      );
    }
  }
});

test('o\'chiq bog\'liq to\'siq bo\'lmaydi', () => {
  const none = () => false;
  for (const f of FEATURES) {
    assert.deepEqual(blockersForDisabling(f.key, none), []);
  }
});

console.log(`\n✅ ${passed} ta shart o'tdi (${FEATURES.length} ta kalit)\n`);
