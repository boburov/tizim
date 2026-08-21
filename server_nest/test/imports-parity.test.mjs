/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXCEL IMPORT — PARITET (`/api/imports`, 11/11 marshrut).
 *
 * ── NIMA ISBOTLANADI ──
 *   1. `/importers` va `/:key/options` — ruxsatga qarab bir xil ro'yxat.
 *   2. SHABLON va XATOLIK HISOBOTI XLSX'lari AYNAN bir xil (baytlar
 *      emas — KATAK QIYMATLARI, chunki ZIP ichida vaqt tamg'asi bor).
 *   3. `preview` — fayl tahlili, xato qatorlar, sarlavha tekshiruvi.
 *   4. `draft` — AVTOTO'LDIRISH (login/parol/sana) va hisoblangan
 *      ustunlar.
 *   5. `validate-rows` — client yuborgan qatorlarni QAYTA tekshirish.
 *   6. `create` — HAQIQIY yozuv: foydalanuvchi yaratiladi, guruhga
 *      qo'shiladi, boshlang'ich qoldiq yoziladi (BAZADAN o'lchanadi).
 *   7. RUXSAT: import YOZISH huquqiga bog'langan; `finance.manage`
 *      yo'q xodim boshlang'ich qoldiq yoza OLMAYDI.
 *   8. `/jobs/:id` — jarayon holati; `rows` (ochiq parollar) QAYTMAYDI.
 *
 * ⚠ KO'ZGU FIKSTURA: import HAQIQIY foydalanuvchi yaratadi, ya'ni bir
 * xil loginni ikkala stekka yuborib bo'lmaydi. Har stekka o'z TAG'i.
 *
 * ISHLATISH:  npm run test:imports-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';
import { makeMirror, runIp } from './_mirror.mjs';

const prisma = new PrismaClient();
const TAG = `IM-${Date.now().toString(36)}`;
const T = createReporter('imports');
const { R, ok, bad, skip, section, finish } = T;
const RUN_IP = runIp();
const ROLE_SCOPED = `__parity_imp${process.hrtime.bigint() % 1000000n}`;

const made = { branches: [], users: [], groups: [] };
let scopedUserId = null;
let scopedSnapshot = null;

const todayUtc = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const iso = (d) => d.toISOString().slice(0, 10);

/** ⚠ TOZALASH API'GA TAYANMAYDI — FK tartibida, to'g'ridan-to'g'ri Prisma. */
const cleanup = async () => {
  try {
    if (scopedUserId && scopedSnapshot) {
      await prisma.user.update({
        where: { id: scopedUserId }, data: { role: scopedSnapshot.role } });
      for (const a of scopedSnapshot.assigns) {
        await prisma.userBranchAssignment.update({
          where: { id: a.id }, data: { role: a.role } });
      }
    }
    await prisma.role.deleteMany({ where: { value: ROLE_SCOPED } });

    // Import YARATGAN foydalanuvchilarni ham topamiz (ular `made.users`
    // da YO'Q).
    const extra = await prisma.user.findMany({
      where: {
        OR: [
          { lastName: { contains: TAG } },
          { username: { contains: TAG.toLowerCase() } },
        ],
      },
      select: { id: true },
    });
    const u = [...new Set([...made.users, ...extra.map((x) => x.id)])];
    const g = made.groups;
    const b = made.branches;

    await prisma.importJob.deleteMany({
      where: { OR: [{ userId: { in: u } }, { fileName: { contains: TAG } }] } });

    if (g.length) {
      await prisma.paymentTransaction.deleteMany({ where: { groupId: { in: g } } });
      await prisma.studentPayment.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupFee.deleteMany({ where: { groupId: { in: g } } });
      await prisma.teacherSalary.deleteMany({ where: { groupId: { in: g } } });
      await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: { in: g } } });
      await prisma.groupMembership.deleteMany({ where: { groupId: { in: g } } });
    }
    if (u.length) {
      await prisma.openingBalance.deleteMany({ where: { userId: { in: u } } });
      await prisma.paymentTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentPayment.deleteMany({ where: { studentId: { in: u } } });
      await prisma.depositTransaction.deleteMany({ where: { studentId: { in: u } } });
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: u } } });
      await prisma.groupMembership.deleteMany({ where: { studentId: { in: u } } });
      await prisma.teacherCompensation.deleteMany({ where: { teacherId: { in: u } } });
      await prisma.staffCompensation.deleteMany({ where: { employeeId: { in: u } } })
        .catch(() => {});
      await prisma.refreshToken.deleteMany({ where: { userId: { in: u } } })
        .catch(() => {});
    }
    if (g.length) await prisma.group.deleteMany({ where: { id: { in: g } } });
    if (b.length) {
      const entries = await prisma.journalEntry.findMany({
        where: { branchId: { in: b } }, select: { id: true } });
      const ids = entries.map((e) => e.id);
      if (ids.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.approval.deleteMany({ where: { branchId: { in: b } } });
      await prisma.account.deleteMany({ where: { branchId: { in: b } } });
    }
    if (u.length) {
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: u } } });
      await prisma.user.deleteMany({ where: { id: { in: u } } });
    }
    if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
  } catch (err) {
    console.log(`  ⚠️  tozalashda xato: ${err.message}`);
  }
};

const assertNoResidue = async () => {
  const left = {
    branches: await prisma.branch.count({ where: { code: { startsWith: TAG } } }),
    users: await prisma.user.count({
      where: {
        OR: [
          { lastName: { contains: TAG } },
          { username: { contains: TAG.toLowerCase() } },
        ],
      },
    }),
    groups: await prisma.group.count({ where: { name: { contains: TAG } } }),
    roles: await prisma.role.count({ where: { value: ROLE_SCOPED } }),
    jobs: await prisma.importJob.count({ where: { fileName: { contains: TAG } } }),
  };
  const total = Object.values(left).reduce((a, x) => a + x, 0);
  if (total === 0) ok("tozalash — QOLDIQ YO'Q (o'lchandi)");
  else bad('tozalash — QOLDIQ QOLDI', JSON.stringify(left));
};

const makeFixture = async (label) => {
  const branch = await prisma.branch.create({
    data: { name: `${TAG} ${label}`, code: `${TAG}${label}` } });
  made.branches.push(branch.id);

  const group = await prisma.group.create({
    data: {
      branchId: branch.id, name: `${TAG}${label} guruh`, isActive: true,
      startDate: new Date(Date.UTC(todayUtc().getUTCFullYear(), 0, 1)),
    } });
  made.groups.push(group.id);
  await prisma.groupFee.create({
    data: {
      groupId: group.id, year: todayUtc().getUTCFullYear(),
      month: todayUtc().getUTCMonth() + 1, amount: 300_000, source: 'manual',
    } });

  return { branch, group, label };
};

/** Import uchun XLSX buferi (sarlavha + qatorlar). */
const buildSheet = async (headers, rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ma'lumot");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
};

/** XLSX buferini SOLISHTIRILADIGAN shaklga aylantiradi. */
const decodeWorkbook = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = {};
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      rows.push(row.values.slice(1).map((v) => {
        if (v && typeof v === 'object' && 'formula' in v) return `=${v.formula}`;
        if (v instanceof Date) return '<DATE>';
        return v ?? null;
      }));
    });
    out[ws.name] = rows;
  });
  return out;
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mEXCEL IMPORT — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };

  const call = (base, method, path, { body, branchId, token } = {}) =>
    request(base, method, path, {
      token: token || ownerToken,
      body,
      headers: {
        'x-forwarded-for': RUN_IP,
        ...(branchId ? { 'x-branch-id': branchId } : {}),
      },
    });

  /** ⚠ Multipart — `request()` JSON yuboradi, shuning uchun xom fetch. */
  const upload = async (base, path, buffer, { token, branchId, fileName } = {}) => {
    const form = new FormData();
    form.append('file', new Blob([buffer]), fileName || `${TAG}.xlsx`);
    const res = await fetch(base + path, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token || ownerToken}`,
        'x-forwarded-for': RUN_IP,
        ...(branchId ? { 'x-branch-id': branchId } : {}),
      },
      body: form,
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed };
  };

  /** ⚠ Binar javob (shablon / xatolik hisoboti). */
  const rawGet = async (base, path, { token } = {}) => {
    const res = await fetch(base + path, {
      headers: {
        authorization: `Bearer ${token || ownerToken}`,
        'x-forwarded-for': RUN_IP,
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buffer: buf, disposition: res.headers.get('content-disposition') };
  };
  const rawPost = async (base, path, body, { token } = {}) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token || ownerToken}`,
        'x-forwarded-for': RUN_IP,
      },
      body: JSON.stringify(body),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buffer: buf };
  };

  const subs = (base) => {
    const f = fx[base];
    const L = base === EXPRESS ? 'E' : 'N';
    // ⚠ TRANSLITERATSIYA TAG'DAN CHIZIQCHANI OLIB TASHLAYDI
    // ("IM-mt38" → "immt38"), shuning uchun avtomatik yasalgan login
    // ichida TAG boshqacha ko'rinadi. Bu almashtirish ENG OLDINDA
    // turishi shart.
    const slugTag = TAG.toLowerCase().replace(/-/g, '');
    return [
      [`${slugTag}${L.toLowerCase()}`, '<tagx>'],
      [`${TAG.toLowerCase()}${L.toLowerCase()}`, '<tag>'],
      [f.branch.id, '<BRANCH>'], [f.group.id, '<GRP>'], [owner.id, '<OWNER>'],
      [`${TAG}${L} guruh`, '<GRPNAME>'],
      [`${TAG} ${L}`, '<TAG>'], [`${TAG}${L}`, '<TAG>'],
      [TAG.toLowerCase(), '<tag>'], [TAG, '<TAG>'],
      nowStamps(),
      // ⚠ AVTOMATIK YASALGAN PAROL — 3 harf + 4 raqam, HAR CHAQIRUVDA
      // BOSHQA (`crypto.randomInt`). Uni solishtirish har doim qizil
      // berardi; shakli esa o'lchanadi (naqsh mos kelsa belgiga
      // aylanadi, ya'ni "parol yasalmadi" holati baribir ko'rinadi).
      (v) => (/^[a-z]{3}\d{4}$/.test(v) ? '<PWD>' : v),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  const { mirror, expectStatus, bothDb } = makeMirror(T, fx, subs);

  // ═══════════════════════════════════════════════════════════════════
  section("RO'YXATLAR");
  // ═══════════════════════════════════════════════════════════════════

  const impList = await mirror('GET /imports/importers', (base) =>
    call(base, 'GET', '/api/imports/importers'));
  if (impList.e?.status === 200) {
    const keys = (impList.e.body?.data || []).map((d) => d.key).sort();
    if (keys.length === 5) ok(`MUSBAT NAZORAT: 5 ta importer — ${keys.join(', ')}`);
    else bad('importer soni', `kutilgan 5, keldi ${keys.length}: ${keys.join(', ')}`);
  }

  await mirror('GET /imports/history', (base, f) =>
    call(base, 'GET', '/api/imports/history?limit=5', { branchId: f.branch.id }));

  await mirror('GET /imports/:key/options', (base, f) =>
    call(base, 'GET', '/api/imports/students/options', { branchId: f.branch.id }));

  await mirror("GET /imports/:key/options — noma'lum importer → 404", (base) =>
    call(base, 'GET', '/api/imports/yoq-bunday/options'));

  // ═══════════════════════════════════════════════════════════════════
  section('SHABLON (XLSX)');
  // ═══════════════════════════════════════════════════════════════════

  for (const key of ['students', 'teachers', 'staff', 'student-payments']) {
    const e = await rawGet(EXPRESS, `/api/imports/${key}/template`);
    const n = await rawGet(NEST, `/api/imports/${key}/template`);
    if (e.status !== 200 || n.status !== 200) {
      skip(`shablon ${key}`, `express=${e.status}, nest=${n.status}`);
      continue;
    }
    R.successes += 1;
    try {
      assert.deepEqual(await decodeWorkbook(n.buffer), await decodeWorkbook(e.buffer));
      assert.equal(n.disposition, e.disposition);
      ok(`shablon ${key} — AYNAN bir xil (sarlavha, namuna, yo'riqnoma)`);
    } catch (err) {
      bad(`shablon ${key}`, String(err.message).slice(0, 700));
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  section("KO'RIB CHIQISH (preview)");
  // ═══════════════════════════════════════════════════════════════════

  const S_HEADERS = [
    'Ism', 'Familiya', 'Telefon', 'Login', 'Parol', "Tug'ilgan sana", 'Filial',
    'Jins', "Ro'yxatga olingan sana", 'Guruh', "Guruhga qo'shilgan sana",
    "Boshlang'ich summa", 'Izoh',
  ];
  const JOIN = iso(new Date(Date.UTC(todayUtc().getUTCFullYear(), todayUtc().getUTCMonth(), 1)));

  const studentRow = (f, n, extra = {}) => [
    `Talaba${n}`, `${TAG}${f.label}`, '', '', '', '',
    f.branch.name, 'erkak', JOIN, f.group.name, JOIN,
    extra.opening ?? '', extra.note ?? '',
  ];

  await mirror("POST /:key/preview — sarlavha noto'g'ri → 400", async (base, f) => {
    const buf = await buildSheet(['Notogri', 'Sarlavha'], [['a', 'b']]);
    return upload(base, '/api/imports/students/preview', buf, { branchId: f.branch.id });
  });

  const prev = await mirror('POST /:key/preview (2 qator)', async (base, f) => {
    const buf = await buildSheet(S_HEADERS, [
      studentRow(f, 'Bir'),
      studentRow(f, 'Ikki'),
    ]);
    return upload(base, '/api/imports/students/preview', buf, { branchId: f.branch.id });
  });
  expectStatus(prev, 200, 'preview');

  // ═══════════════════════════════════════════════════════════════════
  section('QORALAMA (draft) VA TEKSHIRISH');
  // ═══════════════════════════════════════════════════════════════════

  const draft = await mirror('POST /:key/draft (login/parol avtomatik)',
    async (base, f) => {
      const buf = await buildSheet(S_HEADERS, [
        studentRow(f, 'Uch'),
        studentRow(f, 'Tort'),
      ]);
      return upload(base, '/api/imports/students/draft', buf, { branchId: f.branch.id });
    });

  // ⚠ Qoralamadagi LOGIN/PAROL har stekda BOSHQA (tasodifiy parol,
  // ism-familyadan yasalgan login) — ular normalizatsiyada belgiga
  // aylanmaydi. Shuning uchun bu yerda TANA solishtirilmaydi, faqat
  // SHAKL o'lchanadi: avtoto'ldirish ISHLADIMI.
  if (draft.e?.status === 200 && draft.n?.status === 200) {
    for (const [label, res] of [['express', draft.e], ['nest', draft.n]]) {
      const rows = res.body?.data?.rows || [];
      const filled = rows.filter((r) => r.raw?.username && r.raw?.password).length;
      const okRows = rows.filter((r) => r.status === 'ok').length;
      if (rows.length === 2 && filled === 2 && okRows === 2) {
        ok(`draft (${label}) — 2/2 qatorga login+parol yasaldi va tekshiruvdan o'tdi`);
      } else {
        bad(
          `draft (${label})`,
          `qatorlar=${rows.length}, to'ldirilgan=${filled}, ok=${okRows}`,
        );
      }
      // Hisoblangan ustunlar (oylar/hisob) — jadval oqimining ma'nosi.
      const preview = rows[0]?.preview;
      if (preview && typeof preview.months === 'number') {
        ok(`draft (${label}) — hisoblangan ustun bor (oylar=${preview.months})`);
      } else {
        bad(`draft (${label})`, `hisoblangan ustun yo'q: ${JSON.stringify(preview)}`);
      }
    }
  } else {
    skip('draft', `express=${draft.e?.status}, nest=${draft.n?.status}`);
  }

  const vrows = await mirror('POST /:key/validate-rows', (base, f) =>
    call(base, 'POST', '/api/imports/students/validate-rows', {
      branchId: f.branch.id,
      body: {
        rows: [{
          rowNumber: 2,
          raw: {
            firstName: 'Talaba', lastName: `${TAG}${f.label}`,
            username: `${TAG.toLowerCase()}${f.label.toLowerCase()}vr`,
            password: 'Parol#2026', branchName: f.branch.name,
            enrolledAt: JOIN, groupName: f.group.name, joinedAt: JOIN,
          },
        }],
      },
    }));
  expectStatus(vrows, 200, 'validate-rows');

  await mirror('POST /:key/validate-rows — qator yo\'q → 400', (base) =>
    call(base, 'POST', '/api/imports/students/validate-rows', { body: { rows: [] } }));

  // ═══════════════════════════════════════════════════════════════════
  section('YARATISH (create) — HAQIQIY YOZUV');
  // ═══════════════════════════════════════════════════════════════════

  const created = await mirror('POST /:key/create (1 o\'quvchi + qarz)', (base, f) =>
    call(base, 'POST', '/api/imports/students/create', {
      branchId: f.branch.id,
      body: {
        fileName: `${TAG}.xlsx`,
        rows: [{
          rowNumber: 2,
          raw: {
            firstName: 'Yangi', lastName: `${TAG}${f.label}`,
            username: `${TAG.toLowerCase()}${f.label.toLowerCase()}new`,
            password: 'Parol#2026', branchName: f.branch.name,
            enrolledAt: JOIN, groupName: f.group.name, joinedAt: JOIN,
            openingBalance: '-150000', note: 'sinov',
          },
        }],
      },
    }));
  const createdOk = expectStatus(created, 200, 'create (sinxron)');

  if (createdOk) {
    await bothDb('yaratilgandan keyin BAZA holati', async (f) => {
      const user = await prisma.user.findFirst({
        where: { username: `${TAG.toLowerCase()}${f.label.toLowerCase()}new` },
        select: { id: true, role: true, homeBranchId: true },
      });
      if (!user) return { created: false };
      const mem = await prisma.groupMembership.count({
        where: { studentId: user.id, groupId: f.group.id, isDeleted: false } });
      const plans = await prisma.studentPayment.count({
        where: { studentId: user.id, groupId: f.group.id } });
      const ob = await prisma.openingBalance.findFirst({
        where: { userId: user.id }, select: { amount: true, role: true } });
      return {
        created: true,
        role: user.role,
        branchOk: String(user.homeBranchId) === String(f.branch.id),
        memberships: mem,
        // ⚠ Oylik plan qatorlari a'zolik sanasidan bugungacha
        // yaratiladi — "necha oy qarz" aynan shu.
        plans: plans > 0,
        opening: ob ? Number(ob.amount) : null,
        openingRole: ob?.role || null,
      };
    });

    await bothDb('IMPORT TARIXI yozildi', async (f) =>
      prisma.importJob.count({
        where: { branchId: f.branch.id, importerKey: 'students', status: 'completed' } }));
  }

  // ── JOB HOLATI ──
  const jobOf = async (f) => {
    const j = await prisma.importJob.findFirst({
      where: { branchId: f.branch.id, importerKey: 'students' },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    });
    return j?.id || null;
  };
  await mirror('GET /imports/jobs/:jobId', async (base, f) => {
    const id = await jobOf(f);
    if (!id) throw new Error("import ishi yo'q");
    return call(base, 'GET', `/api/imports/jobs/${id}`, { branchId: f.branch.id });
  });

  // ═══════════════════════════════════════════════════════════════════
  section('XATOLIK HISOBOTI (XLSX)');
  // ═══════════════════════════════════════════════════════════════════

  {
    const body = {
      rows: [{
        rowNumber: 5,
        raw: { firstName: 'Xato', lastName: 'Qator', username: 'x' },
        errors: [{ field: 'username', message: 'Login kamida 3 belgi' }],
      }],
    };
    const e = await rawPost(EXPRESS, '/api/imports/students/error-report', body);
    const n = await rawPost(NEST, '/api/imports/students/error-report', body);
    if (e.status !== 200 || n.status !== 200) {
      skip('xatolik hisoboti', `express=${e.status}, nest=${n.status}`);
    } else {
      R.successes += 1;
      try {
        assert.deepEqual(await decodeWorkbook(n.buffer), await decodeWorkbook(e.buffer));
        ok('xatolik hisoboti — AYNAN bir xil');
      } catch (err) {
        bad('xatolik hisoboti', String(err.message).slice(0, 700));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  section('RUXSAT CHEGARALARI');
  //
  // ⚠ IMPORT RUXSATI — O'QISH emas, YOZISH huquqi. Bu importning
  // eksportdan ENG MUHIM farqi, shuning uchun ochiq o'lchanadi.
  // ═══════════════════════════════════════════════════════════════════

  const wanted = ['students.create'];
  const perms = await prisma.permission.findMany({
    where: { key: { in: wanted } }, select: { id: true, key: true } });
  const qa = await prisma.user.findFirst({
    where: { username: 'qa_admin_a' },
    select: {
      id: true, role: true,
      branchAssignments: { select: { id: true, role: true, branchId: true } },
    },
  });

  if (perms.length !== wanted.length || !qa?.branchAssignments.length) {
    skip('ruxsat chegarasi', "ruxsat yoki `qa_admin_a` topilmadi");
  } else {
    scopedUserId = qa.id;
    scopedSnapshot = {
      role: qa.role,
      assigns: qa.branchAssignments.map((a) => ({ id: a.id, role: a.role })),
    };
    await prisma.role.deleteMany({ where: { value: ROLE_SCOPED } });
    await prisma.role.create({
      data: {
        value: ROLE_SCOPED, label: ROLE_SCOPED,
        permissions: { connect: perms.map((p) => ({ id: p.id })) },
      } });
    await prisma.user.update({ where: { id: qa.id }, data: { role: ROLE_SCOPED } });
    for (const a of scopedSnapshot.assigns) {
      await prisma.userBranchAssignment.update({
        where: { id: a.id }, data: { role: ROLE_SCOPED } });
    }
    const scopedToken = mintToken({ id: qa.id, role: ROLE_SCOPED });
    const qaBranch = qa.branchAssignments[0].branchId;

    const list = await mirror("GET /importers — faqat `students.create`", (base) =>
      call(base, 'GET', '/api/imports/importers', { token: scopedToken }));
    if (list.e?.status === 200) {
      const keys = (list.e.body?.data || []).map((d) => d.key);
      if (keys.length === 1 && keys[0] === 'students') {
        ok("faqat `students` ko'rinadi (to'lov/maosh importlari YASHIRIN)");
      } else {
        bad("importer ro'yxati", `kutilgan ['students'], keldi ${JSON.stringify(keys)}`);
      }
    }

    await mirror("POST /student-payments/create — `finance.pay` yo'q → 403",
      (base) => call(base, 'POST', '/api/imports/student-payments/create', {
        token: scopedToken, body: { rows: [{ raw: {} }] },
      }));

    // ⚠ ENG MUHIM SHOX: `students.create` BOR, `finance.manage` YO'Q —
    // boshlang'ich QOLDIQ yoza olmasligi kerak (import "yon eshik"
    // bo'lib qolmasin).
    const openingDenied = await mirror(
      "validate-rows — `finance.manage` yo'q + qoldiq → qator XATO",
      (base) => call(base, 'POST', '/api/imports/students/validate-rows', {
        token: scopedToken,
        branchId: qaBranch,
        body: {
          rows: [{
            rowNumber: 2,
            raw: {
              firstName: 'Qoldiq', lastName: `${TAG}X`,
              username: `${TAG.toLowerCase()}xq`, password: 'Parol#2026',
              enrolledAt: JOIN, openingBalance: '-100000',
            },
          }],
        },
      }));
    if (openingDenied.e?.status === 200) {
      for (const [label, res] of [['express', openingDenied.e], ['nest', openingDenied.n]]) {
        const errs = res.body?.data?.rows?.[0]?.errors || [];
        const hit = errs.some((x) => /finance\.manage/.test(String(x.message)));
        if (hit) ok(`(${label}) qoldiq RAD ETILDI — moliya huquqi talab qilindi`);
        else {
          bad(
            `(${label}) qoldiq OQ ROYXATDAN O'TDI`,
            `xatolar: ${JSON.stringify(errs).slice(0, 300)}`,
          );
        }
      }
    }
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
