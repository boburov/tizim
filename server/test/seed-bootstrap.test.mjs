/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOZA BAZANI BOOTSTRAP QILISH — O'LCHANADIGAN INVARIANT.
 *
 * ── NEGA BU TEST BOR ──
 *
 * Express → NestJS ko'chirishida seed'lar TUSHIB QOLGAN edi: 399 marshrut,
 * 25 fon ishi va butun bot ko'chirilgan, lekin `src/seeds/` ko'chirilmagan.
 * Ular `server_legacy/` da qolgan edi va u yerda `.env` yo'q — ya'ni ular
 * ISHGA TUSHMASDI ham.
 *
 * Buni HECH BIR mavjud test ushlamadi va ushlay olmasdi: barcha testlar
 * ALLAQACHON TO'LDIRILGAN bazaga HTTP so'rov yuboradi. Ishlab turgan
 * o'rnatma uchun hech narsa buzilmagan edi — buzilgani faqat YANGI
 * o'rnatma va FALOKATDAN TIKLASH edi, ya'ni aynan hech kim sinamaydigan
 * yo'l.
 *
 * Shuning uchun bu test boshqacha ishlaydi: u HTTP ga umuman tegmaydi,
 * ALOHIDA toza baza yaratadi, migratsiyalarni yotqizadi, seed'larni
 * yurgizadi va natijani o'lchaydi.
 *
 * ── NIMA O'LCHANADI ──
 *   1. Toza bazada seed'lar umuman ISHLAYDIMI (chiqish kodi 0);
 *   2. Ruxsat katalogi kod konstantalari bilan AYNAN tengmi;
 *   3. Rollar (owner/teacher/student/director/reception) to'g'ri qurilganmi;
 *   4. Owner hisobi yaratilganmi — busiz tizimga KIRIB BO'LMAYDI;
 *   5. IDEMPOTENTLIK: ikkinchi yurishda holat O'ZGARMAYDI.
 *
 * ── TOZALASH ──
 * Sinov bazasi OXIRIDA o'chiriladi va o'chirilgani O'LCHANADI. Tozalash
 * sinaladigan narsaga (seed, API) TAYANMAYDI — u to'g'ridan-to'g'ri
 * `DROP DATABASE`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLES,
  SYSTEM_ROLE_META,
  splitPermissionKey,
  getModuleMeta,
} from '../dist/common/constants/permissions.js';
import { BRANCH_LOCAL_PERMISSIONS } from '../dist/common/constants/permission-scope.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_DB = 'seed_bootstrap_probe';

const R = { pass: 0, fail: 0 };
const check = (name, fn) => {
  try { fn(); R.pass += 1; console.log(`  ✅ ${name}`); }
  catch (e) { R.fail += 1; console.log(`  ❌ ${name} — ${e.message.split('\n')[0]}`); }
};

// ── URL yordamchi: bazaviy DATABASE_URL dan boshqa baza nomiga o'tish ──
const baseUrl = process.env.DATABASE_URL;
assert.ok(baseUrl, 'DATABASE_URL yo\'q — testni `node --env-file=.env` bilan yurgizing');

const withDatabase = (name) => {
  const u = new URL(baseUrl);
  u.pathname = `/${name}`;
  return u.toString();
};

const probeUrl = withDatabase(PROBE_DB);
// `postgres` — ma'muriy ulanish: CREATE/DROP DATABASE sinov bazasining
// O'ZIGA ulanib turib bajarib bo'lmaydi.
const adminUrl = withDatabase('postgres');

const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });

const run = (cmd, args, extraEnv = {}) =>
  execFileSync(cmd, args, {
    cwd: SERVER_DIR,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** Baza holatining kanonik surati — solishtirish uchun. */
const snapshot = async (prisma) => {
  const permissions = await prisma.permission.findMany({
    select: { key: true, label: true, group: true, module: true, action: true,
              moduleLabel: true, moduleOrder: true },
    orderBy: { key: 'asc' },
  });
  const roles = await prisma.role.findMany({
    select: { value: true, label: true, description: true, isSystem: true,
              isFrozen: true, roleType: true, defaultPath: true,
              permissions: { select: { key: true } } },
    orderBy: { value: 'asc' },
  });
  const users = await prisma.user.findMany({
    select: { username: true, role: true, isActive: true },
    orderBy: { username: 'asc' },
  });
  const templates = await prisma.notificationTemplate.findMany({
    select: { name: true, body: true, category: true }, orderBy: { name: 'asc' },
  });
  const feedbackTypes = await prisma.feedbackType.findMany({
    select: { name: true }, orderBy: { name: 'asc' },
  });
  const holidays = await prisma.holiday.findMany({
    select: { name: true, month: true, day: true, audience: true, message: true },
    orderBy: { name: 'asc' },
  });
  const expenseCategories = await prisma.expenseCategory.findMany({
    select: { code: true, name: true, kind: true, sortOrder: true, isSystem: true },
    orderBy: { code: 'asc' },
  });
  return {
    permissions,
    roles: roles.map((r) => ({ ...r, permissions: r.permissions.map((p) => p.key).sort() })),
    users, templates, feedbackTypes, holidays, expenseCategories,
  };
};

console.log('\n\x1b[1mToza bazani bootstrap qilish (seed)\x1b[0m\n');

let probe = null;
let dropped = false;

try {
  // ── Toza baza ──
  // Oldingi yiqilgan yurishdan qolgan bo'lsa ham ishlashi uchun avval DROP.
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${PROBE_DB}"`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${PROBE_DB}"`);
  console.log(`  · sinov bazasi yaratildi: ${PROBE_DB}`);

  run('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: probeUrl });
  console.log('  · migratsiyalar yotqizildi');

  probe = new PrismaClient({ datasources: { db: { url: probeUrl } } });

  const before = await probe.permission.count();
  check(`seed'dan OLDIN permissions = 0 (aslida ${before})`, () => {
    assert.equal(before, 0);
  });
  const usersBefore = await probe.user.count();
  check(`seed'dan OLDIN users = 0 (aslida ${usersBefore})`, () => {
    assert.equal(usersBefore, 0);
  });

  // ── Seed'lar ──
  const SEEDS = [
    'permissions.seed.js',
    'owner.seed.js',
    'communication-defaults.seed.js',
    'expense-categories.seed.js',
  ];
  for (const s of SEEDS) {
    check(`seed yurdi: ${s}`, () => {
      run('node', [`dist/seeds/${s}`], { DATABASE_URL: probeUrl });
    });
  }

  const snap1 = await snapshot(probe);

  // ── 1) Ruxsat katalogi ──
  check(`ruxsat katalogi kod bilan AYNAN teng (${Object.values(PERMISSIONS).length} kalit)`, () => {
    assert.deepEqual(
      snap1.permissions.map((p) => p.key).sort(),
      Object.values(PERMISSIONS).slice().sort(),
    );
  });

  check('har bir ruxsat qatorining yorlig\'i/moduli kod bilan mos', () => {
    for (const row of snap1.permissions) {
      const meta = PERMISSION_LABELS[row.key];
      const { module, action } = splitPermissionKey(row.key);
      const moduleMeta = getModuleMeta(module);
      assert.equal(row.label, meta.label, `${row.key}.label`);
      assert.equal(row.group, meta.group, `${row.key}.group`);
      assert.equal(row.module, module, `${row.key}.module`);
      assert.equal(row.action, action, `${row.key}.action`);
      assert.equal(row.moduleLabel, moduleMeta.label, `${row.key}.moduleLabel`);
      assert.equal(row.moduleOrder, moduleMeta.order, `${row.key}.moduleOrder`);
    }
  });

  // ── 2) Rollar ──
  const roleBy = Object.fromEntries(snap1.roles.map((r) => [r.value, r]));

  check('tizim rollari yaratildi (owner/teacher/student)', () => {
    for (const value of [ROLES.OWNER, ROLES.TEACHER, ROLES.STUDENT]) {
      const r = roleBy[value];
      assert.ok(r, `"${value}" roli yo'q`);
      assert.equal(r.isSystem, true, `${value}.isSystem`);
      // isFrozen=true bo'lsa bu roldagilar tizimga KIRA OLMAYDI.
      assert.equal(r.isFrozen, false, `${value}.isFrozen`);
      assert.equal(r.roleType, SYSTEM_ROLE_META[value].roleType, `${value}.roleType`);
      assert.equal(r.defaultPath, SYSTEM_ROLE_META[value].defaultPath, `${value}.defaultPath`);
    }
  });

  check('owner BARCHA ruxsatni oladi', () => {
    assert.deepEqual(roleBy.owner.permissions, Object.values(PERMISSIONS).slice().sort());
  });

  check(`direktor = hammasi minus owner-only (${BRANCH_LOCAL_PERMISSIONS.length} ruxsat)`, () => {
    const r = roleBy.director;
    assert.ok(r, 'direktor roli yaratilmadi');
    assert.deepEqual(r.permissions, BRANCH_LOCAL_PERMISSIONS.slice().sort());
    // isSystem=false — owner uni matritsada tahrirlay olishi kerak.
    assert.equal(r.isSystem, false);
    assert.equal(r.isFrozen, false);
  });

  check('direktorda imtiyoz oshirish kalitlari YO\'Q', () => {
    // Bu ro'yxat hisoblanadi, lekin eng xavflilarini OCHIQ ham tekshiramiz:
    // ular sizib kirsa direktor boshqa filialni ko'radi / owner'ga tenglashadi.
    for (const key of [
      PERMISSIONS.SYSTEM_ADMIN_ACCESS,
      PERMISSIONS.BRANCHES_VIEW_ALL,
      PERMISSIONS.BRANCHES_UPDATE,
      PERMISSIONS.FINANCE_APPROVE,
      PERMISSIONS.APPROVALS_DECIDE_CONFIG,
    ]) {
      assert.ok(!roleBy.director.permissions.includes(key), `direktorda "${key}" bor!`);
    }
  });

  check('resepshin FAQAT lid ruxsatlarini oladi (leads.manage YO\'Q)', () => {
    assert.deepEqual(roleBy.reception.permissions,
      [PERMISSIONS.LEADS_CREATE, PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_UPDATE].sort());
    assert.equal(roleBy.reception.defaultPath, '/owner/leads');
  });

  check("o'qituvchi/o'quvchi standart ruxsatlari", () => {
    assert.deepEqual(roleBy.teacher.permissions, [
      PERMISSIONS.GROUPS_READ, PERMISSIONS.USERS_READ, PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_RECORD, PERMISSIONS.GRADES_READ, PERMISSIONS.GRADES_RECORD,
      PERMISSIONS.RATING_READ, PERMISSIONS.NOTIFICATIONS_SEND,
      PERMISSIONS.ASSIGNMENTS_READ, PERMISSIONS.ASSIGNMENTS_SEND,
    ].sort());
    assert.deepEqual(roleBy.student.permissions, [PERMISSIONS.RATING_READ]);
  });

  // ── 3) Owner hisobi ──
  check("owner hisobi yaratildi — busiz tizimga KIRIB BO'LMAYDI", () => {
    assert.equal(snap1.users.length, 1);
    assert.equal(snap1.users[0].username, 'owner');
    assert.equal(snap1.users[0].role, ROLES.OWNER);
    assert.equal(snap1.users[0].isActive, true);
  });

  // ── 4) Ma'lumotnomalar ──
  check("ma'lumotnomalar to'ldirildi (shablon/fikr turi/bayram/chiqim)", () => {
    assert.equal(snap1.templates.length, 6, 'shablon');
    assert.equal(snap1.feedbackTypes.length, 8, 'fikr turi');
    assert.equal(snap1.holidays.length, 6, 'bayram');
    assert.equal(snap1.expenseCategories.length, 11, 'chiqim kategoriyasi');
    // "Maosh" TIZIM kategoriyasi: maosh chiqimi SalaryTransaction'dan
    // keladi va hisobotda "payroll" turiga bog'lanadi.
    const salary = snap1.expenseCategories.find((c) => c.code === 'salary');
    assert.ok(salary, '"salary" kategoriyasi yo\'q');
    assert.equal(salary.isSystem, true);
    assert.equal(salary.kind, 'payroll');
  });

  // ── 5) IDEMPOTENTLIK ──
  for (const s of SEEDS) run('node', [`dist/seeds/${s}`], { DATABASE_URL: probeUrl });
  const snap2 = await snapshot(probe);

  check('IDEMPOTENT: ikkinchi yurishda holat AYNAN o\'zgarmadi', () => {
    assert.deepEqual(snap2, snap1);
  });

  check('IDEMPOTENT: dublikat qator paydo bo\'lmadi', () => {
    assert.equal(snap2.permissions.length, snap1.permissions.length, 'permissions');
    assert.equal(snap2.roles.length, snap1.roles.length, 'roles');
    assert.equal(snap2.users.length, snap1.users.length, 'users');
    assert.equal(snap2.templates.length, 6, 'shablon dublikati');
    assert.equal(snap2.feedbackTypes.length, 8, 'fikr turi dublikati');
    assert.equal(snap2.holidays.length, 6, 'bayram dublikati');
    assert.equal(snap2.expenseCategories.length, 11, 'chiqim dublikati');
  });
} finally {
  // ── TOZALASH ──
  // Sinaladigan narsaga TAYANMAYDI: to'g'ridan-to'g'ri DROP DATABASE.
  if (probe) await probe.$disconnect();
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${PROBE_DB}"`);
    dropped = true;
  } catch (e) {
    console.log(`  ⚠ sinov bazasini o'chirib bo'lmadi: ${e.message.split('\n')[0]}`);
  }
}

// Tozalash O'LCHANADI — yutilgan xato tufayli sinov bazasi qolib ketmasin.
check('tozalash: sinov bazasi o\'chirildi', () => {
  assert.equal(dropped, true, `"${PROBE_DB}" bazasi qolib ketdi — qo'lda o'chiring`);
});
const leftover = await admin.$queryRawUnsafe(
  `SELECT 1 FROM pg_database WHERE datname = $1`, PROBE_DB,
);
check('tozalash o\'lchandi: pg_database da qoldiq yo\'q', () => {
  assert.equal(leftover.length, 0, `"${PROBE_DB}" hamon mavjud`);
});
await admin.$disconnect();

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
process.exit(R.fail ? 1 : 0);
