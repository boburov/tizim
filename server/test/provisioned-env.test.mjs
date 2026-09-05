/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEV SYSTEM SHARTNOMASI — PROVISIONING YOZADIGAN `.env` TENANT SXEMASIDAN
 * O'TADIMI?
 *
 * ── NEGA BU TEST BOR ──
 *
 * `.env` ni IKKI tomon birga hosil qiladi:
 *   1. `admin_server` → `SettingsService.renderEnvFiles()` (boshqariladigan
 *      qiymatlar + registr sozlamalari)
 *   2. `provision.sh` → kripto sirlar (`JWT_ACCESS_SECRET`,
 *      `JWT_REFRESH_SECRET`, `COOKIE_SECRET`) — ular `openssl rand` bilan
 *      YARATILADI yoki eski `.env` dan ko'chiriladi.
 *
 * Ikkalasi BOSHQA-BOSHQA repoda va bir-birini bilmaydi. Ular ajralib
 * ketsa tenant server ko'tarilmaydi — zod `validateEnv` uni ishga
 * tushishda RAD etadi va pm2 qayta-qayta yiqiladi. Bu esa faqat JONLI
 * provisioning paytida bilinardi.
 *
 * Bu test o'sha shartnomani INFRATUZILMA YARATMASDAN tekshiradi.
 *
 * ── NIMANI TEKSHIRMAYDI ──
 * Haqiqiy `provision.sh` yurishini (baza, pm2, nginx, GitHub repo). U
 * hamon qo'lda, tashlab yuboriladigan domenda sinaladi.
 *
 * ── O'TKAZIB YUBORILADI (skip) ──
 * `admin_server/dist` qurilmagan yoki admin bazasi mavjud emas bo'lsa —
 * CI'da tenant repo yolg'iz turishi mumkin.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { validateEnv } from '../dist/config/env.validation.js';

const R = { pass: 0, fail: 0, skip: 0, notes: [] };
const check = (n, cond, d = 'shart bajarilmadi') => {
  if (cond) { R.pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${n}`); }
  else { R.fail += 1; R.notes.push(`${n} — ${d}`); console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`); }
};
const skip = (n, why) => { R.skip += 1; console.log(`  \x1b[33m∼\x1b[0m ${n} \x1b[2m(${why})\x1b[0m`); };

console.log('\n\x1b[1mPROVISIONING `.env` ↔ TENANT SXEMASI SHARTNOMASI\x1b[0m\n');

const ADMIN = new URL('../../admin_server/', import.meta.url).pathname;

if (!existsSync(`${ADMIN}dist/app.module.js`)) {
  skip('render', 'admin_server/dist qurilmagan');
  console.log(`\n\x1b[1mNATIJA:\x1b[0m ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.skip} o'tkazildi\n`);
  process.exit(0);
}

// admin_server'ni O'Z node_modules'i bilan ishga tushiramiz (alohida loyiha).
const SCRIPT = `
import { NestFactory } from '@nestjs/core';
import { AppModule } from './dist/app.module.js';
import { SettingsService } from './dist/settings/settings.service.js';
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
const t = await app.get(SettingsService).listTenantsForEnvTest?.() ?? null;
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const tenant = await p.tenant.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
if (!tenant) { console.log('__NO_TENANT__'); await p.$disconnect(); await app.close(); process.exit(0); }
const { serverEnv } = await app.get(SettingsService).renderEnvFiles(tenant.id);
console.log('__ENV_START__'); console.log(serverEnv);
await p.$disconnect(); await app.close();
`;

let out = '';
try {
  out = execFileSync('node', ['--input-type=module', '-e', SCRIPT], {
    cwd: ADMIN, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
  });
} catch (err) {
  skip('render', `admin bazasi mavjud emas: ${String(err.message).slice(0, 60)}`);
  console.log(`\n\x1b[1mNATIJA:\x1b[0m ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.skip} o'tkazildi\n`);
  process.exit(0);
}

if (out.includes('__NO_TENANT__')) {
  skip('render', 'ACTIVE tenant yo\'q');
  console.log(`\n\x1b[1mNATIJA:\x1b[0m ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.skip} o'tkazildi\n`);
  process.exit(0);
}

const envText = out.split('__ENV_START__')[1] || '';
const rendered = {};
for (const line of envText.split('\n')) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m) rendered[m[1]] = m[2];
}

check('render bo\'sh emas', Object.keys(rendered).length > 5, `${Object.keys(rendered).length} kalit`);

// `provision.sh` qo'shadigan kripto sirlar (openssl rand -hex 32).
const HEX64 = 'a'.repeat(64);
const full = {
  ...rendered,
  JWT_ACCESS_SECRET: HEX64,
  JWT_REFRESH_SECRET: HEX64,
  COOKIE_SECRET: HEX64,
};

console.log('\n\x1b[1m1) Zod sxemasi qabul qiladimi\x1b[0m');
let cfg = null;
try {
  cfg = validateEnv(full);
  check('validateEnv() o\'tdi — tenant ko\'tariladi', true);
} catch (err) {
  check('validateEnv() o\'tdi — tenant ko\'tariladi', false, String(err.message).slice(0, 300));
}

console.log('\n\x1b[1m2) Kutilgan qiymatlar\x1b[0m');
check('DATABASE_URL provisioning tomonidan yozilgan', Boolean(rendered.DATABASE_URL));
check('NEST_PORT = PORT (nginx shu portga proxy qiladi)',
  rendered.NEST_PORT === rendered.PORT, `NEST_PORT=${rendered.NEST_PORT} PORT=${rendered.PORT}`);
check('NODE_ENV=production', rendered.NODE_ENV === 'production', rendered.NODE_ENV);

console.log('\n\x1b[1m3) Cutover’dan keyingi fon ishlari — Express O\'CHIRILGAN\x1b[0m');
check('NEST_WORKERS_ENABLED=true', rendered.NEST_WORKERS_ENABLED === 'true',
  `qiymat: ${rendered.NEST_WORKERS_ENABLED} — fon ishlari umuman ishlamaydi`);
check('NEST_WORKER_JOBS=* (fail-closed: bo\'sh = hech biri)',
  rendered.NEST_WORKER_JOBS === '*', `qiymat: ${rendered.NEST_WORKER_JOBS}`);
check('NEST_IMPORT_WORKER=true (aks holda import abadiy "queued")',
  rendered.NEST_IMPORT_WORKER === 'true', `qiymat: ${rendered.NEST_IMPORT_WORKER}`);

console.log('\n\x1b[1m4) Bot pollingi TOKENGA bog\'liq\x1b[0m');
const hasToken = Boolean(rendered.TELEGRAM_BOT_TOKEN);
const enabled = rendered.TELEGRAM_BOT_ENABLED === 'true';
check('tokensiz polling YOQILMAYDI (aks holda jarayon yiqiladi)',
  hasToken && enabled ? rendered.NEST_BOT_POLLING === 'true' : rendered.NEST_BOT_POLLING === 'false',
  `token=${hasToken} enabled=${enabled} polling=${rendered.NEST_BOT_POLLING}`);

if (cfg) {
  console.log('\n\x1b[1m5) Sxemadan keyingi amaldagi qiymatlar\x1b[0m');
  check('cfg.NEST_WORKERS_ENABLED mantiqiy true', cfg.NEST_WORKERS_ENABLED === true, String(cfg.NEST_WORKERS_ENABLED));
  check('cfg.BRANCH_LIMIT son', typeof cfg.BRANCH_LIMIT === 'number', String(cfg.BRANCH_LIMIT));
}

console.log(`\n\x1b[1mNATIJA:\x1b[0m ${R.fail ? '\x1b[31m' : '\x1b[32m'}${R.pass} o'tdi\x1b[0m, ${R.fail} yiqildi, ${R.skip} o'tkazildi\n`);
if (R.fail) { for (const n of R.notes) console.log(`  • ${n}`); process.exit(1); }
