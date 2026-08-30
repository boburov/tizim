/**
 * MODUL DARVOZASI — YECHISH MANTIG'I.
 *
 * NEGA KERAK: bu darvoza YOPIQ yiqiladi va aynan shu tomoni xavfli.
 * Bitta noto'g'ri shart ikki xil falokat beradi:
 *   • juda ochiq — pullik bo'lim hammaga bepul tarqaladi;
 *   • juda yopiq — to'lagan mijozning ilovasi qorong'i bo'lib qoladi.
 * Ikkalasi ham JIMGINA sodir bo'ladi, shuning uchun shartlar shu yerda
 * bittalab qadab qo'yiladi.
 *
 * ⚠ BAZA KERAK EMAS. Servis to'g'ridan-to'g'ri quriladi (Nest DI'siz):
 * `EntitlementsService` — haqiqiy sinf, `ConfigService` esa oddiy
 * ob'yekt. Shuning uchun testni istalgan joyda yurgizsa bo'ladi.
 */
import assert from 'node:assert/strict';
import { EntitlementsService } from '../dist/common/entitlements/entitlements.service.js';
import {
  ModuleFeaturesService,
  MODULE_GRACE_MS,
} from '../dist/common/features/module-features.service.js';

/** Provision qilingan loyiha (uchala sozlama ham bor). */
const PROVISIONED = {
  ADMIN_API_URL: 'https://admin.example',
  TENANT_ID: 't1',
  HEARTBEAT_SECRET: 's3cret',
};

const makeService = (env = PROVISIONED) => {
  const entitlements = new EntitlementsService();
  const config = { get: (key) => env[key] };
  return { entitlements, features: new ModuleFeaturesService(entitlements, config) };
};

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log('\nMODUL DARVOZASI\n');

// ── Provision qilinmagan o'rnatma ────────────────────────────────────────
test('provision qilinmagan loyihada darvoza INERT — hamma bo\'lim ochiq', () => {
  const { features } = makeService({});
  // Kesh hech qachon to'lmaydi (heartbeat ham o'chiq), shuning uchun
  // yopiq yiqilish butun ilovani o'chirib qo'yardi.
  assert.equal(features.isModuleEnabled('imports'), true);
  assert.equal(features.isModuleEnabled('imports.finance'), true);
});

test('sozlamaning BITTASI yetishmasa ham darvoza inert', () => {
  for (const missing of Object.keys(PROVISIONED)) {
    const env = { ...PROVISIONED };
    delete env[missing];
    const { features } = makeService(env);
    assert.equal(
      features.isModuleEnabled('imports'),
      true,
      `${missing} yo'q bo'lganda darvoza yopilib qoldi`,
    );
  }
});

// ── Yopiq yiqilish ────────────────────────────────────────────────────────
test('heartbeat HECH QACHON kelmagan bo\'lsa — YOPIQ', () => {
  const { features } = makeService();
  assert.equal(features.isModuleEnabled('imports'), false);
});

test('kalit kelmagan bo\'lsa — YOPIQ (yangi kalit tasodifan bepul bo\'lmaydi)', () => {
  const { entitlements, features } = makeService();
  entitlements.set({ limits: { max_users: 100 } });
  assert.equal(features.isModuleEnabled('imports'), false);
});

test('kalit 0 bo\'lsa — YOPIQ', () => {
  const { entitlements, features } = makeService();
  entitlements.set({ limits: { imports: 0 } });
  assert.equal(features.isModuleEnabled('imports'), false);
});

test('kalit 1 bo\'lsa — OCHIQ', () => {
  const { entitlements, features } = makeService();
  entitlements.set({ limits: { imports: 1 } });
  assert.equal(features.isModuleEnabled('imports'), true);
});

// ── Ota zanjiri ───────────────────────────────────────────────────────────
test('otasi o\'chiq bo\'lsa bola HAM o\'chiq — reyestrda yozib bo\'lmaydigan holat', () => {
  const { entitlements, features } = makeService();
  // Ziddiyatli holat ATAYLAB berilmoqda: bola ochiq, otasi yopiq.
  entitlements.set({ limits: { imports: 0, 'imports.finance': 1 } });
  assert.equal(features.isModuleEnabled('imports.finance'), false);
});

test('otasi ochiq, bolasi berilmagan — bola YOPIQ', () => {
  const { entitlements, features } = makeService();
  entitlements.set({ limits: { imports: 1 } });
  assert.equal(features.isModuleEnabled('imports'), true);
  assert.equal(features.isModuleEnabled('imports.finance'), false);
});

test('ikkalasi ham ochiq — bola OCHIQ', () => {
  const { entitlements, features } = makeService();
  entitlements.set({ limits: { imports: 1, 'imports.finance': 1 } });
  assert.equal(features.isModuleEnabled('imports.finance'), true);
});

// ── Muhlat ────────────────────────────────────────────────────────────────
test('muhlat ichida oxirgi ma\'lum holat ishlatiladi', () => {
  const { entitlements, features } = makeService();
  const almost = new Date(Date.now() - (MODULE_GRACE_MS - 60_000));
  entitlements.set({ limits: { imports: 1 } }, almost);
  assert.equal(features.isModuleEnabled('imports'), true);
});

test('muhlat o\'tgach darvoza YOPILADI', () => {
  const { entitlements, features } = makeService();
  const tooOld = new Date(Date.now() - (MODULE_GRACE_MS + 60_000));
  entitlements.set({ limits: { imports: 1 } }, tooOld);
  assert.equal(features.isModuleEnabled('imports'), false);
});

test('muhlat 72 soat', () => {
  assert.equal(MODULE_GRACE_MS, 72 * 60 * 60 * 1000);
});

test('tiklashda ORIGINAL vaqt saqlanadi — muhlat qayta boshlanmaydi', () => {
  // ⚠ ENG MUHIM SHART. `set` ikkinchi argumentsiz chaqirilsa vaqt
  // "hozir" bo'lardi va uzoq aloqasiz turgan server har qayta ishga
  // tushganda muhlatni qaytadan boshlab, pullik modullarni cheksiz
  // bepul qoldirardi.
  const { entitlements, features } = makeService();
  const tooOld = new Date(Date.now() - (MODULE_GRACE_MS + 60_000));
  entitlements.set({ limits: { imports: 1 } }, tooOld);
  assert.equal(entitlements.get().updatedAt.getTime(), tooOld.getTime());
  assert.equal(features.isModuleEnabled('imports'), false);
});

// ── LIMIT semantikasi buzilmagan ─────────────────────────────────────────
test('LIMIT imkoniyatlari HAMON ochiq yiqiladi (ai unga tayanadi)', () => {
  const { entitlements } = makeService();
  // Kesh bo'sh — `isFeatureEnabled` "ha" deyishi SHART. Bu `ai` va
  // `max_users` uchun ataylab qilingan va o'zgartirilmasligi kerak.
  assert.equal(entitlements.isFeatureEnabled('ai_advisor'), true);
  assert.equal(entitlements.getLimit('max_users'), -1);
});

// ── Xarita ────────────────────────────────────────────────────────────────
test('enabledMap reyestrdagi HAMMA kalitni qaytaradi', () => {
  const { entitlements, features } = makeService();
  entitlements.set({ limits: { imports: 1 } });
  const map = features.enabledMap();
  assert.deepEqual(Object.keys(map).sort(), ['imports', 'imports.finance']);
  assert.equal(map.imports, true);
  assert.equal(map['imports.finance'], false);
});

console.log(`\n✅ ${passed} ta shart o'tdi\n`);
