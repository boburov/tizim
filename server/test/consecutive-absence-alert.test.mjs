/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B16 — "KETMA-KET KELMAGAN O'QUVCHI" OGOHLANTIRISHI ISHLAYDI.
 *
 * ── NEGA BU TEST BOR ──
 *
 * `attendance.service.ts` da erta qaytish turardi:
 *     const EXPRESS_NOTIFICATION_IS_DEAD = true;
 *     if (EXPRESS_NOTIFICATION_IS_DEAD) return;
 * Ya'ni ogohlantirish HECH QACHON yuborilmasdi. U ATAYLAB o'chirilgan
 * edi: kesishuv davrida Express ham tirik bo'lsa, egalarga IKKI MARTA
 * xabar ketardi.
 *
 * Express endi o'lik. Ega (2026-08-22) yoqishni SO'RADI va blok olib
 * tashlandi.
 *
 * ⚠ `test/attendance-parity.test.mjs` (tarixiy, endi yurgizilmaydi)
 * TESKARI holatni qulflagan edi — "`bulkRecord` dan keyin
 * `notifications` O'SMASIN". Bu to'plam uning O'RNINI bosadi va YANGI
 * invariantni yozadi: OSTONA kesilganda xabar YARATILISHI SHART.
 *
 * ── NIMA O'LCHANADI ──
 *   1. Ostona kesilmaguncha xabar YO'Q (1- va 2- qoldirishdan keyin);
 *   2. AYNAN ostonada xabar PAYDO BO'LADI;
 *   3. Xabar shu o'quvchi haqida.
 *
 * (1) MUSBAT NAZORAT: xabar ostonagacha ham chiqsa, (2) ning "paydo
 * bo'ldi" natijasi hech narsani isbotlamasdi.
 *
 * ⚠ `notifyConsecutiveAbsences` `.catch()` bilan FON'da chaqiriladi
 * (javob uni KUTMAYDI), shuning uchun tekshiruv POLLING bilan.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { mintToken } from './_harness.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';
const R = { pass: 0, fail: 0 };
const check = (name, fn) => {
  try { fn(); R.pass += 1; console.log(`  ✅ ${name}`); }
  catch (e) { R.fail += 1; console.log(`  ❌ ${name} — ${e.message.split('\n')[0]}`); }
};

const prisma = new PrismaClient();
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ymd = (d) => d.toISOString().slice(0, 10);

const owner = await prisma.user.findFirst({
  where: { role: 'owner', isActive: true }, select: { id: true, role: true },
});
assert.ok(owner, 'owner topilmadi');
const TOKEN = mintToken(owner);

const post = async (path, body, branchId) => {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` };
  if (branchId) headers['x-branch-id'] = branchId;
  const r = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
};

/** Fon vazifasi tugashini kutadi. */
const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 200));
  }
};

console.log(`\n\x1b[1mB16 — ketma-ket yo'qlik ogohlantirishi\x1b[0m  \x1b[2m${BASE}\x1b[0m\n`);

let groupId = null;
let studentId = null;

try {
  const settings = await prisma.attendanceSettings.findFirst({
    select: { consecutiveAbsencesAlert: true },
  });
  const threshold = settings?.consecutiveAbsencesAlert || 0;
  check(`ostona sozlangan (consecutiveAbsencesAlert = ${threshold})`, () => {
    assert.ok(threshold >= 1, 'ostona 0 — ogohlantirish umuman ishlamaydi');
  });

  const branch = await prisma.branch.findFirst({
    where: { isActive: true }, select: { id: true },
  });

  // ── Fikstura: har kuni darsi bor guruh + bitta o'quvchi ──
  const group = await prisma.group.create({
    data: {
      name: '__probe_b16_group',
      branchId: branch.id,
      isActive: true,
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      schedule: {
        create: DAYS.map((d) => ({ day: d, startTime: '09:00', endTime: '10:00' })),
      },
    },
    select: { id: true },
  });
  groupId = group.id;

  const student = await prisma.user.create({
    data: {
      firstName: '__probe_b16', lastName: 'Student',
      username: '__probe_b16_student', passwordHash: 'x'.repeat(12),
      role: 'student', isActive: true,
    },
    select: { id: true },
  });
  studentId = student.id;

  await prisma.groupMembership.create({
    data: {
      groupId, studentId,
      joinedAt: new Date('2020-01-02T00:00:00.000Z'),
    },
  });

  const notifBase = await prisma.notification.count();

  // ── Ketma-ket qoldirishlar ──
  const dates = [];
  for (let i = threshold; i >= 1; i -= 1) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(ymd(d));
  }

  let notifBeforeThreshold = null;
  for (let i = 0; i < dates.length; i += 1) {
    const res = await post(
      `/api/attendance/groups/${groupId}/bulk`,
      { date: dates[i], items: [{ studentId, status: 'absent' }] },
      branch.id,
    );
    if (i === 0) {
      check(`bulkRecord qabul qilindi (${res.status})`, () => {
        assert.ok(res.status >= 200 && res.status < 300, JSON.stringify(res.body).slice(0, 160));
      });
    }
    // Ostonadan BIR OLDINGI holatni yozib olamiz.
    if (i === dates.length - 2) {
      await new Promise((r) => setTimeout(r, 700));
      notifBeforeThreshold = await prisma.notification.count();
    }
  }

  // ⚠ MUSBAT NAZORAT — ostonagacha xabar bo'lmasligi SHART.
  check(
    `ostonagacha xabar YO'Q (${notifBase} → ${notifBeforeThreshold})`,
    () => assert.equal(notifBeforeThreshold, notifBase),
  );

  const created = await waitFor(async () => {
    const n = await prisma.notification.findFirst({
      where: { category: 'attendance', createdAt: { gte: new Date(Date.now() - 120000) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, body: true, isAuto: true },
    });
    return n && (await prisma.notification.count()) > notifBase ? n : null;
  });

  check('OSTONADA xabar YARATILDI (ilgari HECH QACHON yaratilmasdi)', () => {
    assert.ok(created, `notifications ${notifBase} dan oshmadi — ogohlantirish ishlamadi`);
  });
  check('xabar shu o\'quvchi haqida', () => {
    assert.ok(created, 'xabar yo\'q');
    const hay = `${created.title} ${created.body}`;
    assert.ok(/__probe_b16/.test(hay), `xabar matni: ${hay.slice(0, 120)}`);
  });
} finally {
  // ── TOZALASH — Prisma bilan, sinaladigan API orqali EMAS ──
  if (studentId) {
    // ⚠ `.catch(() => {})` ATAYLAB YO'Q: yutilgan xato bu loyihada
    // bir necha marta yashil test ortida qoldiq to'plagan. Xato bo'lsa
    // u ko'rinsin.
    await prisma.notificationRecipient.deleteMany({ where: { userId: studentId } });
    await prisma.attendance.deleteMany({ where: { studentId } });
    await prisma.groupMembership.deleteMany({ where: { studentId } });
  }
  await prisma.notification.deleteMany({
    where: { category: 'attendance', body: { contains: '__probe_b16' } },
  });
  await prisma.notification.deleteMany({
    where: { category: 'attendance', title: { contains: '__probe_b16' } },
  });
  if (groupId) {
    await prisma.groupScheduleItem.deleteMany({ where: { groupId } });
    await prisma.group.deleteMany({ where: { id: groupId } });
  }
  if (studentId) await prisma.user.deleteMany({ where: { id: studentId } });

  const left =
    (await prisma.user.count({ where: { username: { startsWith: '__probe_b16' } } })) +
    (await prisma.group.count({ where: { name: { startsWith: '__probe_b16' } } })) +
    (studentId
      ? await prisma.notificationRecipient.count({ where: { userId: studentId } })
      : 0) +
    (studentId ? await prisma.attendance.count({ where: { studentId } }) : 0);
  check(`tozalash o'lchandi: qoldiq ${left}`, () => assert.equal(left, 0));
  await prisma.$disconnect();
}

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
process.exit(R.fail ? 1 : 0);
