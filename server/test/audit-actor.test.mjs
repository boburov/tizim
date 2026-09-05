/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIT AKTYORI — LOGIN VA LOGOUT ANONIM QOLMASIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BU TEST BOR ──
 *
 * `AuditLogMiddleware` aktyorni `req.user` dan oladi. Lekin LOGIN va
 * LOGOUT autentifikatsiyadan OLDIN keladi va `AuthMiddleware` ularga
 * ulanmagan (`auth.module.ts` — faqat `me`, `change-password`,
 * `register-user`). Ya'ni `req.user` hech qachon paydo bo'lmaydi.
 *
 * Natija JONLI BAZADA o'lchandi: 2 866 ta "system" yozuvning 2 395 tasi
 * — LOGIN, hammasi `userId: null`. Audit jurnali "kim tizimga kirdi"
 * savoliga JAVOB BERA OLMASDI, garchi har muvaffaqiyatli login aynan
 * kim ekanini bilsa ham. Filial darajasidagi foydalanuvchi uchun bu
 * yanada yomon: `system` yozuvlari unga fail-closed yashiriladi, ya'ni
 * u loginlarni UMUMAN ko'rmasdi.
 *
 * Yechim: handler muvaffaqiyatdan keyin `req.auditActor` ni to'ldiradi,
 * middleware esa `res.on('finish')` da (handler tugagach) uni o'qiydi.
 *
 * ⚠ BU TEST BAZAGA YOZMAYDI. Prisma o'rniga soxta obyekt qo'yiladi va
 * `activityLog.create` ga NIMA uzatilgani tekshiriladi — ya'ni jonli
 * ma'lumot ifloslanmaydi va test har joyda ishlaydi.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AuditLogMiddleware } from '../dist/common/audit/audit-log.middleware.js';

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`  ✓ ${name}`); };

/** `create` ga uzatilgan `data` ni ushlab qoladigan soxta Prisma. */
const fakePrisma = () => {
  const calls = [];
  return { calls, activityLog: { create: async (arg) => { calls.push(arg.data); return arg.data; } } };
};

/** Minimal Express `req`/`res` — middleware faqat shularni o'qiydi. */
const fakeReq = (over = {}) => ({
  method: 'POST',
  originalUrl: '/api/auth/login',
  path: '/api/auth/login',
  body: { login: 'boburov7', password: 'maxfiy' },
  ip: '127.0.0.1',
  get: () => 'test-agent',
  ...over,
});

const run = async (req) => {
  const prisma = fakePrisma();
  const mw = new AuditLogMiddleware(prisma);
  const res = new EventEmitter();
  res.statusCode = 200;

  let nextCalled = false;
  mw.use(req, res, () => { nextCalled = true; });
  assert.ok(nextCalled, 'next() chaqirilmadi — so\'rov osilib qolardi');

  // Handler shu paytda ishlaydi va `auditActor` ni to'ldiradi.
  if (req.__afterHandler) req.__afterHandler(req);

  res.emit('finish');
  // Yozish `setImmediate` ichida — navbat bo'shashini kutamiz.
  await new Promise((r) => setImmediate(() => setImmediate(r)));
  return prisma.calls;
};

console.log('\n\x1b[1mAUDIT AKTYORI\x1b[0m');

await test('LOGIN: `auditActor` yozuvga tushadi (anonim EMAS)', async () => {
  const rows = await run(
    fakeReq({
      __afterHandler: (r) => {
        r.auditActor = { id: 'u-1', role: 'director', branchId: 'b-1' };
      },
    }),
  );
  assert.equal(rows.length, 1, 'yozuv yaratilmadi');
  assert.equal(rows[0].userId, 'u-1');
  assert.equal(rows[0].userRole, 'director');
  assert.equal(rows[0].branchId, 'b-1', "filial yozilmadi — direktor login'ni ko'rmasdi");
});

await test('LOGIN muvaffaqiyatsiz: aktyor yo\'q, lekin urinish qayd etiladi', async () => {
  // Handler xato tashladi → `auditActor` to'ldirilmaydi.
  const rows = await run(fakeReq({ __afterHandler: null }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, null);
  assert.equal(rows[0].userRole, 'system');
  // Kim urinayotgani BARIBIR saqlanadi — bu himoya uchun muhim.
  assert.equal(rows[0].actorLabel, 'boburov7');
});

await test('`req.user` bo\'lsa u USTUN turadi', async () => {
  const rows = await run(
    fakeReq({
      originalUrl: '/api/groups',
      path: '/api/groups',
      user: { id: 'real-user', role: 'owner' },
      branchId: 'b-real',
      // Soxta aktyor qo'yilsa ham e'tiborga olinmasligi kerak.
      __afterHandler: (r) => { r.auditActor = { id: 'SOXTA', role: 'SOXTA' }; },
    }),
  );
  assert.equal(rows[0].userId, 'real-user');
  assert.equal(rows[0].userRole, 'owner');
  assert.equal(rows[0].branchId, 'b-real');
});

await test('LOGOUT: aktyor tokendan aniqlanadi', async () => {
  const rows = await run(
    fakeReq({
      originalUrl: '/api/auth/logout',
      path: '/api/auth/logout',
      body: {},
      __afterHandler: (r) => { r.auditActor = { id: 'u-2', role: 'staff', branchId: null }; },
    }),
  );
  assert.equal(rows[0].userId, 'u-2');
  assert.equal(rows[0].userRole, 'staff');
  assert.equal(rows[0].branchId, null, "filialsiz — `null`, bu to'g'ri holat");
});

await test('PAROL YOZUVGA TUSHMAYDI', async () => {
  const rows = await run(
    fakeReq({ __afterHandler: (r) => { r.auditActor = { id: 'u-1', role: 'director' }; } }),
  );
  const body = JSON.stringify(rows[0].body ?? {});
  assert.ok(!body.includes('maxfiy'), `parol audit yozuviga tushdi: ${body}`);
});

await test("O'QISH so'rovi umuman yozilmaydi", async () => {
  const rows = await run(fakeReq({ method: 'GET' }));
  assert.equal(rows.length, 0);
});

console.log(`\n\x1b[32m${passed} o'tdi\x1b[0m\n`);
