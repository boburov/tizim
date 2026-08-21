/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAYL YUKLASH XAVFSIZLIGI — IKKALA STEKDA.
 *
 * ── NIMA O'LCHANADI ──
 *   1. IMZO (magic bytes): `.pdf` deb nomlangan PHP fayl RAD ETILADI.
 *      Kengaytma ham, MIME ham foydalanuvchi YOZADIGAN narsa; imzo esa
 *      fayl MAZMUNIDA turadi va uni almashtirib bo'lmaydi.
 *   2. KENGAYTMA OQ RO'YXATI: `.svg` (ichida skript saqlaydi) va `.exe`
 *      rad etiladi.
 *   3. MIME MOSLIGI: `.png` fayl `application/pdf` MIME bilan kelsa rad.
 *   4. MUSBAT NAZORAT: HAQIQIY PNG qabul qilinadi — usiz yuqoridagi
 *      "rad etildi" natijalari "yuklash umuman ishlamaydi" degani
 *      bo'lishi mumkin edi.
 *   5. EGALIK: begona o'qituvchi faylni YUKLAB OLA OLMAYDI (403),
 *      OLUVCHI o'quvchi esa OLADI (200).
 *   6. KVOTA: qabul qilingan fayl `StorageUsage` ni AYNAN o'z hajmiga
 *      oshiradi; RAD ETILGAN fayl esa kvotaga TEGMAYDI.
 *   7. QOLDIQ: rad etilgan yuklash `StoredFile` qatori ham, DISKDA fayl
 *      ham qoldirmaydi.
 *
 * ── ⚠ NEGA `both()` EMAS ──
 * Yuklash MUTATSIYA: bir xil so'rovni ikki stekka yuborish ikkita fayl
 * yaratardi. Har stekka O'Z fikstura o'qituvchisi va guruhi beriladi.
 *
 * ISHLATISH:  npm run test:file-security
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { mintToken, waitForStacks, createReporter, EXPRESS, NEST } from './_harness.mjs';
import { runIp } from './_mirror.mjs';

const prisma = new PrismaClient();
const T = createReporter('fayl xavfsizligi');
const { R, ok, bad, skip, section, finish } = T;
const RUN_IP = runIp();
const TAG = `__parity_fs${process.hrtime.bigint() % 100000n}`;

const made = { branches: [], users: [], groups: [], files: [], assignments: [] };
const fx = {};
/** Boshlang'ich kvota — yakunda AYNAN shu qiymatga qaytishi SHART. */
let startUsedBytes = null;

const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) ok(`${name} — ${JSON.stringify(got)}`);
  else bad(name, `kutilgan ${JSON.stringify(want)}, keldi ${JSON.stringify(got)}`);
};

// ── NAMUNA FAYLLAR ────────────────────────────────────────────────────────
/** HAQIQIY PNG (1×1 shaffof) — musbat nazorat uchun. */
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
/** PHP web-shell — `.pdf` deb nomlanadi. */
const PHP_SHELL = Buffer.from('<?php system($_GET["c"]); ?>\n', 'utf8');
/** Skriptli SVG — kengaytma oq ro'yxatida YO'Q. */
const EVIL_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'utf8',
);

const uploadDir = () => {
  const raw = readFileSync(new URL('../../server/.env', import.meta.url), 'utf8');
  const m = /^\s*UPLOAD_DIR\s*=\s*(.*)\s*$/m.exec(raw);
  const v = (m?.[1] || 'uploads').replace(/^["']|["']$/g, '');
  return path.isAbsolute(v)
    ? v
    : path.resolve(new URL('../../server/', import.meta.url).pathname, v);
};

const post = async (base, token, { fileName, buffer, mime, groupId }) => {
  const form = new FormData();
  form.append('title', `${TAG} sinov`);
  form.append('groupIds', groupId);
  if (buffer) {
    form.append('file', new Blob([buffer], { type: mime }), fileName);
  }
  const res = await fetch(`${base}/api/assignments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': RUN_IP },
    body: form,
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

const download = async (base, token, id) => {
  const res = await fetch(`${base}/api/assignments/${id}/file`, {
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': RUN_IP },
  });
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()).length };
};

const usedBytes = async () => {
  const row = await prisma.storageUsage.findFirst({ select: { usedBytes: true } });
  return Number(row?.usedBytes || 0);
};

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  made.branches.push(branch.id);

  const mk = async (n, role) => {
    const u = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: branch.id, isActive: true,
      } });
    made.users.push(u.id);
    return u;
  };
  const teacher = await mk('Teach', 'teacher');
  const stranger = await mk('Other', 'teacher');
  const student = await mk('Stud', 'student');

  const group = await prisma.group.create({
    data: {
      name: `${TAG}${label} guruh`, branchId: branch.id,
      isActive: true, teachers: { connect: [{ id: teacher.id }] },
    } });
  made.groups.push(group.id);
  await prisma.groupMembership.create({
    data: { groupId: group.id, studentId: student.id, joinedAt: new Date() } });

  return { branch, teacher, stranger, student, group };
};

const cleanup = async () => {
  try {
    if (made.assignments.length) {
      await prisma.assignmentRecipient.deleteMany({
        where: { assignmentId: { in: made.assignments } } });
      await prisma.assignment.deleteMany({ where: { id: { in: made.assignments } } });
    }
    if (made.groups.length) {
      await prisma.groupMembership.deleteMany({ where: { groupId: { in: made.groups } } });
      await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    }
    if (made.files.length) {
      // ⚠ DISK VA KVOTA HAM TOZALANADI: faqat qatorni o'chirish
      // `StorageUsage` ni oshgan holda qoldirardi va diskda yetim fayl
      // to'planardi — ikkalasi ham BAZA DRIFTI.
      const rows = await prisma.storedFile.findMany({
        where: { id: { in: made.files } },
        select: { relPath: true, size: true },
      });
      let freed = 0;
      for (const r of rows) {
        freed += Number(r.size) || 0;
        try { rmSync(path.join(uploadDir(), r.relPath)); } catch { /* yo'q bo'lsa mayli */ }
      }
      await prisma.storedFile.deleteMany({ where: { id: { in: made.files } } });
      if (freed) {
        await prisma.storageUsage.updateMany({
          data: { usedBytes: { decrement: freed } } });
      }
    }
    if (made.users.length) {
      await prisma.notification.deleteMany({
        where: { recipientId: { in: made.users } } }).catch(() => null);
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (made.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: made.branches } } });
    }
  } catch (e) {
    console.log(`  ⚠️  tozalashda xato: ${e.message}`);
  }
};

const assertNoResidue = async () => {
  const left = {
    branch: await prisma.branch.count({ where: { id: { in: made.branches } } }),
    user: made.users.length
      ? await prisma.user.count({ where: { id: { in: made.users } } }) : 0,
    file: made.files.length
      ? await prisma.storedFile.count({ where: { id: { in: made.files } } }) : 0,
  };
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  // ⚠ KVOTA HAM O'LCHANADI: `StorageUsage` boshlang'ich qiymatiga
  // qaytmasa, keyingi yurish "kvota oshdi" deb yolg'on qizil berardi.
  const quotaBack = startUsedBytes === null || (await usedBytes()) === startUsedBytes;
  if (total === 0 && quotaBack) ok("tozalash — QOLDIQ YO'Q (kvota ham tiklandi)");
  else {
    bad('tozalash — QOLDIQ QOLDI',
      `${JSON.stringify(left)}, kvota: ${startUsedBytes} → ${await usedBytes()}`);
  }
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mFAYL YUKLASH XAVFSIZLIGI\x1b[0m  (${TAG})\n`);

  startUsedBytes = await usedBytes();
  fx[EXPRESS] = await makeFixture('E');
  fx[NEST] = await makeFixture('N');
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    tok[base] = {
      teacher: mintToken(fx[base].teacher),
      stranger: mintToken(fx[base].stranger),
      student: mintToken(fx[base].student),
    };
  }

  const DIR = uploadDir();
  const filesOnDisk = () => {
    if (!existsSync(DIR)) return 0;
    const walk = (d) => readdirSync(d, { withFileTypes: true })
      .reduce((n, e) => n + (e.isDirectory() ? walk(path.join(d, e.name)) : 1), 0);
    return walk(DIR);
  };

  // ═══ 1. MUSBAT NAZORAT ════════════════════════════════════════════════
  //
  // ⚠ BIRINCHI O'RINDA ATAYLAB: agar yuklash umuman ishlamasa,
  // pastdagi "rad etildi" natijalari HECH NARSANI isbotlamasdi.
  section('1) MUSBAT NAZORAT — haqiqiy PNG QABUL QILINADI');
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const f = fx[base];
    const before = await usedBytes();
    const res = await post(base, tok[base].teacher, {
      fileName: 'dars.png', buffer: REAL_PNG,
      mime: 'image/png', groupId: f.group.id,
    });
    if (res.status !== 201 && res.status !== 200) {
      bad(`${label}: haqiqiy PNG rad etildi`,
        `status=${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
      return finish();
    }
    R.successes += 1;
    f.assignmentId = res.body?.data?.id;
    made.assignments.push(f.assignmentId);
    const row = await prisma.assignment.findUnique({
      where: { id: f.assignmentId }, select: { fileId: true } });
    f.fileId = row?.fileId;
    if (f.fileId) made.files.push(f.fileId);

    eq(`${label}: PNG qabul qilindi va StoredFile yaratildi`, Boolean(f.fileId), true);
    const after = await usedBytes();
    eq(`${label}: kvota AYNAN fayl hajmiga oshdi`, after - before, REAL_PNG.length);
  }

  // ═══ 2. IMZO (MAGIC BYTES) ════════════════════════════════════════════
  section("2) IMZO — `.pdf` deb nomlangan PHP fayl RAD ETILADI");
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const f = fx[base];
    const before = await usedBytes();
    const diskBefore = filesOnDisk();
    const res = await post(base, tok[base].teacher, {
      fileName: 'dars.pdf', buffer: PHP_SHELL,
      mime: 'application/pdf', groupId: f.group.id,
    });
    eq(`${label}: PHP-shell rad etildi`, res.status, 400);
    eq(`${label}: kvota TEGILMADI`, await usedBytes(), before);
    eq(`${label}: DISKDA fayl qolmadi`, filesOnDisk(), diskBefore);
    eq(`${label}: StoredFile qatori yaratilmadi`,
      await prisma.storedFile.count({
        where: { uploadedById: f.teacher.id, mimeType: 'application/pdf' } }), 0);
  }

  // ═══ 3. KENGAYTMA OQ RO'YXATI ═════════════════════════════════════════
  section('3) OQ RO\'YXAT — `.svg` va `.exe` RAD ETILADI');
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const f = fx[base];
    const svg = await post(base, tok[base].teacher, {
      fileName: 'x.svg', buffer: EVIL_SVG,
      mime: 'image/svg+xml', groupId: f.group.id,
    });
    eq(`${label}: skriptli .svg rad etildi`, svg.status, 400);

    const exe = await post(base, tok[base].teacher, {
      fileName: 'setup.exe', buffer: Buffer.from('MZ\x90\x00', 'binary'),
      mime: 'application/octet-stream', groupId: f.group.id,
    });
    eq(`${label}: .exe rad etildi`, exe.status, 400);
  }

  // ═══ 4. MIME MOSLIGI ══════════════════════════════════════════════════
  section('4) MIME — kengaytmaga MOS KELMAGAN MIME rad etiladi');
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const f = fx[base];
    const res = await post(base, tok[base].teacher, {
      fileName: 'rasm.png', buffer: REAL_PNG,
      mime: 'application/pdf', groupId: f.group.id,
    });
    eq(`${label}: .png + application/pdf rad etildi`, res.status, 400);
  }

  // ═══ 5. EGALIK ════════════════════════════════════════════════════════
  section('5) EGALIK — kim faylni yuklab ola oladi');
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const f = fx[base];
    if (!f.assignmentId) { skip(`${label}: egalik`, 'vazifa yaratilmadi'); continue; }

    const owner = await download(base, tok[base].teacher, f.assignmentId);
    eq(`${label}: YUBORUVCHI o'z faylini oldi`,
      { status: owner.status, bytes: owner.bytes },
      { status: 200, bytes: REAL_PNG.length });

    const mine = await download(base, tok[base].student, f.assignmentId);
    eq(`${label}: OLUVCHI o'quvchi oldi`, mine.status, 200);

    const other = await download(base, tok[base].stranger, f.assignmentId);
    eq(`${label}: BEGONA o'qituvchi RAD ETILDI`, other.status, 403);
  }

  return finish();
};

let code = 1;
try {
  code = await run();
} catch (err) {
  console.error(`\n  ❌ TO'PLAM YIQILDI: ${err.stack || err.message}\n`);
  code = 1;
} finally {
  await cleanup();
  await assertNoResidue();
  await prisma.$disconnect();
}
process.exit(code || (R.fail ? 1 : 0));
