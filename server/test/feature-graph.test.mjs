/**
 * BOG'LIQLIK GRAFIGI — REYESTR HAQIQIY KODGA MOS KELADIMI.
 *
 * NEGA KERAK: dev panel bo'limni o'chirishga ruxsat berishdan oldin
 * `requires` ro'yxatiga qaraydi. Bu ma'lumot koddan ajralib qolsa panel
 * "o'chirish xavfsiz" deydi-yu, bog'liq modul ish vaqtida yiqiladi —
 * yoki bundan ham yomoni, JIMGINA noto'g'ri natija beradi (davomat
 * o'chirilganda xodim KPI bonusi noto'g'ri hisoblanadi).
 *
 * Reyestr `scripts/gen-feature-registry.mjs` bilan generatsiya qilinadi;
 * bu test uni har yurishda qayta tekshiradi, ya'ni qo'lda tahrir yoki
 * kod o'zgarishi jimgina o'tib ketolmaydi.
 *
 * ⚠ MANBA `src/` DAN O'QILADI, `dist/` DAN EMAS. Reyestrda dekorator
 * yo'q, ya'ni Node uni to'g'ridan-to'g'ri o'qiy oladi. Bu ataylab:
 * eskirgan `dist/` bilan test YASHIL bo'lib, hech narsani isbotlamasdi.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FEATURES,
  FEATURE_BY_KEY,
  SWITCHABLE_KEYS,
  ROUTE_TO_FEATURE,
  featureForPath,
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

const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ── Kodni o'qish ──────────────────────────────────────────────────────────
const moduleFiles = new Map(); // klass nomi -> fayl yo'li
const controllerRoutes = new Set(); // haqiqiy @Controller prefikslari
for (const dir of readdirSync(MODULES_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of readdirSync(path.join(MODULES_DIR, dir.name))) {
    if (!file.endsWith('.ts')) continue;
    const full = path.join(MODULES_DIR, dir.name, file);
    const raw = readFileSync(full, 'utf8');
    if (file.endsWith('.module.ts')) {
      for (const m of strip(raw).matchAll(/export class (\w+Module)\b/g)) {
        moduleFiles.set(m[1], full);
      }
    }
    if (file.endsWith('.controller.ts')) {
      for (const m of raw.matchAll(/@Controller\(\s*['"`]([^'"`]*)['"`]/g)) {
        controllerRoutes.add(m[1]);
      }
    }
  }
}

/** `@Module({ imports: [...] })` ichidagi modul klasslari (izohlarsiz). */
const importsOf = (file) => {
  const src = strip(readFileSync(file, 'utf8'));
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

test('har bir `requires` reyestrda mavjud va o\'ziga ishora qilmaydi', () => {
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
    assert.equal(new Set(chain).size, chain.length, `${f.key}: ota zanjirida aylana`);
  }
});

test('imkoniyat (capability) o\'zi NestJS moduli emas', () => {
  for (const f of FEATURES) {
    if (f.parent) assert.equal(f.nestModules, undefined, `${f.key}: ortiqcha nestModules`);
  }
});

// ── ⚠ AYLANA YO'Q: aks holda o'chirib bo'lmaydigan tugun paydo bo'ladi ──
test('BOG\'LIQLIK grafigida aylana yo\'q (o\'chirib bo\'lmaydigan tugun bo\'lmasin)', () => {
  // Aylana bo'lsa A ni o'chirish B ochiq deb to'siladi va aksincha —
  // ikkalasi ham MANGU ochiq qolardi. Generator bunday modullarni
  // bitta kalitga birlashtiradi; bu test birlashmaganini ushlaydi.
  const graph = Object.fromEntries(FEATURES.map((f) => [f.key, f.requires || []]));
  const state = {}; // 1 = ko'rilmoqda, 2 = tugadi
  const walk = (node, trail) => {
    if (state[node] === 2) return;
    assert.notEqual(
      state[node],
      1,
      `AYLANA: ${[...trail, node].join(' → ')}. ` +
        `Generatordagi MERGE ga qo'shing — aks holda bu kalitlarni hech ` +
        `qachon o'chirib bo'lmaydi.`,
    );
    state[node] = 1;
    for (const next of graph[node] || []) walk(next, [...trail, node]);
    state[node] = 2;
  };
  for (const key of Object.keys(graph)) walk(key, []);
});

// ── Kodga qarshi tekshiruv ────────────────────────────────────────────────
test('e\'lon qilingan `nestModules` HAQIQATAN mavjud', () => {
  for (const f of FEATURES) {
    for (const cls of f.nestModules || []) {
      assert.ok(moduleFiles.has(cls), `${f.key}: ${cls} topilmadi`);
    }
  }
});

test('e\'lon qilingan `routes` HAQIQIY @Controller prefiksi', () => {
  // ⚠ Bu global darvozaning YAGONA himoyasi: prefiks noto'g'ri yozilsa
  // darvoza JIMGINA hech narsani to'smasdi.
  for (const f of FEATURES) {
    for (const r of f.routes || []) {
      assert.ok(controllerRoutes.has(r), `${f.key}: "${r}" kontrolleri yo'q`);
    }
  }
});

test('har bir gate qilinadigan kontroller prefiksi reyestrda qamralgan', () => {
  // Teskari yo'nalish: yangi modul qo'shilib reyestrga tushmasa,
  // u tarif darvozasidan TASHQARIDA qolardi — jimgina bepul.
  const declared = new Set(FEATURES.flatMap((f) => f.routes || []));
  const missing = [...controllerRoutes].filter((r) => !declared.has(r));
  assert.deepEqual(
    missing,
    [],
    `Reyestrga tushmagan marshrut(lar): ${missing.join(', ')}. ` +
      `scripts/gen-feature-registry.mjs ni qayta yurgizing.`,
  );
});

test('MODUL IMPORTLARI `requires` da to\'liq aks etgan', () => {
  const keyOfClass = new Map();
  for (const f of FEATURES) {
    for (const cls of f.nestModules || []) keyOfClass.set(cls, f.key);
  }
  const coreKeys = new Set(FEATURES.filter((f) => f.core).map((f) => f.key));

  for (const f of FEATURES) {
    if (!f.nestModules) continue;
    const declared = new Set(f.requires || []);

    for (const cls of f.nestModules) {
      for (const imported of importsOf(moduleFiles.get(cls))) {
        const key = keyOfClass.get(imported);
        // O'z guruhi, reyestrsiz modul yoki O'ZAK — `requires` ga tushmaydi.
        if (!key || key === f.key || coreKeys.has(key)) continue;
        assert.ok(
          declared.has(key),
          `${f.key} → ${imported} ni import qiladi, lekin requires da "${key}" yo'q. ` +
            `scripts/gen-feature-registry.mjs ni qayta yurgizing.`,
        );
      }
    }
  }
});

// ── Yo'l bo'yicha topish ──────────────────────────────────────────────────
test('featureForPath chuqur yo\'lni ham to\'g\'ri topadi', () => {
  assert.equal(featureForPath('/imports/students/preview'), 'imports');
  assert.equal(featureForPath('imports'), 'imports');
});

test('QULFLANGAN marshrutlar darvozadan TASHQARIDA', () => {
  // ⚠ Eng muhim shart: `/features` yopilib qolsa mijoz nima o'chganini
  // bilolmasdi, `/internal/entitlements` yopilsa esa admin panel
  // yangilash turtkisini yubora olmasdi — ya'ni bo'limni QAYTA YOQISH
  // yo'li yo'qolardi. Tenant TIKLANMAS holatga tushardi.
  //
  // ⚠ SHART `f.locked`, ilgarigidek `f.core` EMAS. `core` modullar endi
  // haqiqatan darvozaga tushadi (talab: har bir feature sotiladi va
  // o'chiriladi); `locked` esa atigi ikkita — `auth` va `features`.
  for (const f of FEATURES) {
    if (!f.locked) continue;
    for (const r of f.routes || []) {
      assert.equal(ROUTE_TO_FEATURE.get(r), undefined, `${r} darvoza ostida qolgan`);
    }
  }
  assert.equal(featureForPath('/features'), undefined);
  assert.equal(featureForPath('/internal/entitlements/refresh'), undefined);
  assert.equal(featureForPath('/auth/login'), undefined);

  // Teskari yo'nalish: `core` (lekin qulflanmagan) modul darvozaga
  // TUSHISHI shart. Aks holda panelda o'chiriladi-yu, bo'lim ishlab
  // turaverardi — ya'ni sotuv qarori kuchga kirmasdi.
  const gatedCore = FEATURES.filter(
    (f) => f.core && !f.locked && !f.gatedElsewhere && (f.routes || []).length,
  );
  assert.ok(gatedCore.length > 0, "hech bo'lmasa bitta core modul darvozada bo'lishi kerak");
  for (const f of gatedCore) {
    assert.equal(
      ROUTE_TO_FEATURE.get(f.routes[0]),
      f.key,
      `${f.key} core, lekin darvozadan tashqarida qolgan`,
    );
  }
});

test('QULFLANGAN kalitlar — atigi ikkita, va aynan o\'shalar', () => {
  // ⚠ Bu ro'yxat O'SMASLIGI kerak. Har bir yangi `locked` kalit — bu
  // "sotib bo'lmaydigan" modul, ya'ni talabga zid. Ikkalasining sababi
  // `feature-registry.ts` da yozilgan va u sabab TEXNIK, tijorat emas.
  const locked = FEATURES.filter((f) => f.locked).map((f) => f.key).sort();
  assert.deepEqual(locked, ['auth', 'features']);

  // `NEVER_GATED` ro'yxati (`global-feature-gate.ts`) shu qarorni
  // TAKRORLAYDI — ikki qatlam ataylab. Bu yerda faqat reyestr tomonini
  // tekshiramiz: qulflangan kalit `SWITCHABLE_KEYS` ga tushmasin.
  for (const key of locked) {
    assert.ok(!SWITCHABLE_KEYS.includes(key), `${key} o'chirgichda ko'rinmasligi kerak`);
  }
});

// ── To'siq hisoblash ──────────────────────────────────────────────────────
test('blockersForDisabling ochiq bog\'liqni ushlaydi', () => {
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
  for (const f of FEATURES) assert.deepEqual(blockersForDisabling(f.key, none), []);
});

test('har bir o\'chirgich OXIR-OQIBAT o\'chirilishi mumkin', () => {
  // Kaskad: bog'liqlarni avval o'chirsak, kalitning o'zi ham o'chadimi.
  //
  // ⚠ QULFLANGAN bog'liqlik bundan MUSTASNO: `auth` va `features` hech
  // qachon o'chmaydi, ya'ni ularga tayanadigan bo'lim ham o'chirilmaydi.
  // Bu MA'LUM cheklov — test uni qayd etadi, yashirmaydi.
  //
  // ⚠ Ilgari bu ro'yxat butun `core` to'plamiga qarardi va ancha uzun
  // edi. Endi `core` o'chiriladi, ya'ni ro'yxat qisqardi — aynan shu
  // "har bir feature sotiladi" talabining o'lchovi.
  const lockedKeys = new Set(FEATURES.filter((f) => f.locked).map((f) => f.key));
  const blockedByCore = SWITCHABLE_KEYS.filter((k) =>
    FEATURES.some((f) => lockedKeys.has(f.key) && (f.requires || []).includes(k)),
  );
  console.log(
    `      (qulflangan bog'liqlik tufayli o'chmaydigan: ${blockedByCore.join(', ') || 'yo\'q'})`,
  );
  for (const key of SWITCHABLE_KEYS) {
    if (blockedByCore.includes(key)) continue;
    // Faqat shu kalit va unga bog'liq bo'lmaganlar ochiq deb faraz qilamiz.
    const dependents = new Set();
    const collect = (k) => {
      for (const f of FEATURES) {
        if ((f.requires || []).includes(k) && !dependents.has(f.key)) {
          dependents.add(f.key);
          collect(f.key);
        }
      }
    };
    collect(key);
    const enabled = (k) => k === key || !dependents.has(k);
    assert.deepEqual(
      blockersForDisabling(key, enabled),
      [],
      `${key}: bog'liqlari o'chirilgandan keyin ham to'silgan`,
    );
  }
});

console.log(
  `\n✅ ${passed} ta shart o'tdi (${FEATURES.length} ta kalit, ` +
    `${SWITCHABLE_KEYS.length} ta o'chirgich)\n`,
);
