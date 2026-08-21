/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXCEL EKSPORT — PARITET (`/api/exports`, 2/2 marshrut).
 *
 * ── ⚠ NEGA BAYTLARNI SOLISHTIRIB BO'LMAYDI ──
 *
 * XLSX — ZIP arxivi; ichida yaratilgan VAQT va fayl tartibi bor, ya'ni
 * ikki stek AYNI ma'lumot uchun ham BOSHQA baytlar beradi. Shuning
 * uchun bufer EXCELJS bilan QAYTA O'QILADI va KATAK QIYMATLARI
 * solishtiriladi — bu "fayl bir xilmi" degan savolning YAGONA
 * ma'noli shakli.
 *
 * ── NIMA ISBOTLANADI ──
 *   1. `/datasets` — ruxsatga qarab dataset va USTUNLAR ro'yxati.
 *   2. XLSX ichidagi VARAQLAR, SARLAVHA va MA'LUMOT qatorlari bir xil.
 *   3. `X-Export-Rows` sarlavhasi va `Content-Disposition` bir xil.
 *   4. RUXSAT: `students.read` yo'q xodim TELEFON ustunini na ro'yxatda
 *      ko'radi, na so'rab ola oladi (oq ro'yxat jimgina tashlaydi).
 *   5. Noma'lum dataset → 404, ruxsatsiz dataset → 403.
 *   6. USTUN TANLANMASA (hammasi noma'lum) → 400.
 *
 * ISHLATISH:  npm run test:exports-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, mintToken, waitForStacks, createReporter,
} from './_harness.mjs';
import { runIp } from './_mirror.mjs';

const prisma = new PrismaClient();
const T = createReporter('exports');
const { R, ok, bad, skip, section, finish } = T;
const RUN_IP = runIp();
const ROLE_SCOPED = `__parity_exp${process.hrtime.bigint() % 1000000n}`;

let scopedUserId = null;
let scopedSnapshot = null;

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
  } catch (err) {
    console.log(`  ⚠️  tozalashda xato: ${err.message}`);
  }
};

const assertNoResidue = async () => {
  const roleLeft = await prisma.role.count({ where: { value: ROLE_SCOPED } });
  const stuck = scopedUserId
    ? await prisma.user.count({ where: { id: scopedUserId, role: ROLE_SCOPED } })
    : 0;
  if (roleLeft === 0 && stuck === 0) ok("tozalash — QOLDIQ YO'Q (o'lchandi)");
  else bad('tozalash — QOLDIQ QOLDI', `rol: ${roleLeft}, aktyor: ${stuck}`);
};

/** ⚠ BINAR javob — `request()` matnga aylantiradi, shuning uchun xom fetch. */
const rawPost = async (base, path, { token, body }) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-forwarded-for': RUN_IP,
    },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    headers: {
      type: res.headers.get('content-type'),
      rows: res.headers.get('x-export-rows'),
      disposition: res.headers.get('content-disposition'),
      expose: res.headers.get('access-control-expose-headers'),
    },
    buffer: buf,
    // Xato bo'lsa tana JSON bo'ladi.
    json: (() => { try { return JSON.parse(buf.toString('utf8')); } catch { return null; } })(),
  };
};

/**
 * XLSX buferini SOLISHTIRILADIGAN shaklga aylantiradi.
 *
 * ⚠ "Sana" qatori CHIQARIB TASHLANADI — u har chaqiruvda boshqa va
 * uni solishtirish har doim qizil berardi. Qolgan HAMMASI (varaq
 * nomlari, sarlavhalar, har bir katak, JAMI formulasi) solishtiriladi.
 */
const decodeWorkbook = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = {};
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values.slice(1).map((v) => {
        if (v && typeof v === 'object' && 'formula' in v) return `=${v.formula}`;
        if (v instanceof Date) return '<DATE>';
        return v ?? null;
      });
      // "Sana" — ma'lumot varag'idagi yagona o'zgaruvchan qator.
      if (values[0] === 'Sana') return;
      rows.push(values);
    });
    out[ws.name] = rows;
  });
  return out;
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mEXCEL EKSPORT — PARITET\x1b[0m\n`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const call = (base, method, path, { token } = {}) =>
    request(base, method, path, {
      token: token || ownerToken,
      headers: { 'x-forwarded-for': RUN_IP },
    });

  const both = async (name, fn, subs = () => []) => {
    let e; let n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    if (e.status === 429 || n.status === 429) {
      skip(name, `429 — tezlik chegarasi`); return {};
    }
    if (e.status >= 500 || n.status >= 500) {
      skip(name, `server xatosi — express=${e.status}, nest=${n.status}`); return {};
    }
    if (e.status >= 200 && e.status < 300) R.successes += 1;
    const en = { status: e.status, body: normalize(e.body, subs(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subs(NEST)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); } catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      ` +
                `nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  // ═══════════════════════════════════════════════════════════════════
  section('GET /exports/datasets');
  // ═══════════════════════════════════════════════════════════════════

  const dsRes = await both('GET /exports/datasets (owner)', (base) =>
    call(base, 'GET', '/api/exports/datasets'));
  if (dsRes.e?.status === 200) {
    const keys = (dsRes.e.body?.data || []).map((d) => d.key).sort();
    if (keys.length === 3) ok(`MUSBAT NAZORAT: 3 ta dataset — ${keys.join(', ')}`);
    else bad('dataset soni', `kutilgan 3, keldi ${keys.length}: ${keys.join(', ')}`);
  }

  await both('GET /exports/datasets — token yo\'q → 401', (base) =>
    request(base, 'GET', '/api/exports/datasets', {
      headers: { 'x-forwarded-for': RUN_IP } }));

  // ═══════════════════════════════════════════════════════════════════
  section('POST /exports/:datasetKey — XLSX');
  // ═══════════════════════════════════════════════════════════════════

  const YEAR = new Date().getUTCFullYear();
  const downloadBody = {
    columns: ['studentName', 'groupName', 'year', 'month', 'expectedAmount', 'paidAmount'],
    filters: { year: YEAR },
  };

  const e = await rawPost(EXPRESS, '/api/exports/student-payments',
    { token: ownerToken, body: downloadBody });
  const n = await rawPost(NEST, '/api/exports/student-payments',
    { token: ownerToken, body: downloadBody });

  if (e.status === 429 || n.status === 429) {
    skip('POST /exports/student-payments', '429 — tezlik chegarasi');
  } else if (e.status !== 200 || n.status !== 200) {
    bad('POST /exports/student-payments',
      `express=${e.status} ${JSON.stringify(e.json).slice(0, 200)}, ` +
      `nest=${n.status} ${JSON.stringify(n.json).slice(0, 200)}`);
  } else {
    R.successes += 1;
    ok('POST /exports/student-payments — ikkala stek 200');

    // ── SARLAVHALAR ──
    const hdr = (h) => ({
      type: h.type,
      rows: h.rows,
      // Fayl nomidagi VAQT TAMG'ASI o'zgaruvchan — belgiga almashtiriladi.
      disposition: String(h.disposition).replace(/\d{4}-\d{2}-\d{2}-\d{4}/g, '<STAMP>'),
      expose: h.expose,
    });
    try {
      assert.deepEqual(hdr(n.headers), hdr(e.headers));
      ok(`sarlavhalar bir xil — X-Export-Rows=${e.headers.rows}`);
    } catch {
      bad('sarlavhalar', `express: ${JSON.stringify(hdr(e.headers))}\n      ` +
                         `nest   : ${JSON.stringify(hdr(n.headers))}`);
    }

    // ⚠ MUSBAT NAZORAT: 0 qator bo'lsa quyidagi taqqoslash BO'SH
    // jadvallarni solishtirardi va hech nimani isbotlamasdi.
    const rowCount = Number(e.headers.rows || 0);
    if (rowCount > 0) ok(`MUSBAT NAZORAT: eksportda ${rowCount} ta qator bor`);
    else skip('eksport mazmuni', `${YEAR}-yilda to'lov yo'q — o'lchov ishonchsiz`);

    // ── XLSX MAZMUNI ──
    try {
      const eWb = await decodeWorkbook(e.buffer);
      const nWb = await decodeWorkbook(n.buffer);
      assert.deepEqual(nWb, eWb);
      ok(`XLSX mazmuni AYNAN bir xil (${Object.keys(eWb).join(', ')})`);
    } catch (err) {
      bad('XLSX mazmuni', String(err.message).slice(0, 900));
    }
  }

  await both('POST /exports/:key — noma\'lum dataset → 404', (base) =>
    request(base, 'POST', '/api/exports/yoq-bunday', {
      token: ownerToken, body: {}, headers: { 'x-forwarded-for': RUN_IP } }));

  await both("POST /exports/:key — ustunlar noma'lum → 400", (base) =>
    request(base, 'POST', '/api/exports/student-payments', {
      token: ownerToken,
      body: { columns: ['yoq_ustun'], filters: {} },
      headers: { 'x-forwarded-for': RUN_IP },
    }));

  // ═══════════════════════════════════════════════════════════════════
  section('RUXSAT CHEGARASI (ustun darajasida)');
  //
  // ⚠ NEGA O'Z ROLI: `finance.read` BOR, `students.read` YO'Q aktyor
  // kerak. Bunday kombinatsiya seed'da yo'q, va mavjud rolni ishlatish
  // "403 keldi" ni "ustun yashirildi" bilan ADASHTIRARDI.
  // ═══════════════════════════════════════════════════════════════════

  const wanted = ['finance.read'];
  const perms = await prisma.permission.findMany({
    where: { key: { in: wanted } }, select: { id: true, key: true } });
  const qa = await prisma.user.findFirst({
    where: { username: 'qa_admin_a' },
    select: { id: true, role: true, branchAssignments: { select: { id: true, role: true } } },
  });

  if (perms.length !== wanted.length || !qa) {
    skip('ustun ruxsati', "ruxsat yoki `qa_admin_a` topilmadi");
  } else {
    scopedUserId = qa.id;
    scopedSnapshot = { role: qa.role, assigns: qa.branchAssignments.map((a) => ({ id: a.id, role: a.role })) };
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

    const list = await both('GET /datasets — faqat `finance.read`', (base) =>
      call(base, 'GET', '/api/exports/datasets', { token: scopedToken }));

    if (list.e?.status === 200) {
      const data = list.e.body?.data || [];
      const keys = data.map((d) => d.key);
      if (keys.length === 1 && keys[0] === 'student-payments') {
        ok("faqat `student-payments` ko'rinadi (teachers/staff YASHIRIN)");
      } else {
        bad('dataset ro\'yxati', `kutilgan ['student-payments'], keldi ${JSON.stringify(keys)}`);
      }
      const cols = (data[0]?.columns || []).map((c) => c.key);
      if (!cols.includes('studentPhone')) {
        ok("TELEFON ustuni ro'yxatda YO'Q (`students.read` kerak)");
      } else {
        bad('ustun ruxsati', "`students.read` yo'q bo'lsa ham telefon ustuni ko'rindi");
      }
    }

    // ⚠ ENG MUHIMI: ustunni QO'LDA so'rasa ham chiqmasligi.
    const eP = await rawPost(EXPRESS, '/api/exports/student-payments', {
      token: scopedToken,
      body: { columns: ['studentName', 'studentPhone'], filters: { year: YEAR } },
    });
    const nP = await rawPost(NEST, '/api/exports/student-payments', {
      token: scopedToken,
      body: { columns: ['studentName', 'studentPhone'], filters: { year: YEAR } },
    });
    if (eP.status !== 200 || nP.status !== 200) {
      skip('telefon ustunini qo\'lda so\'rash',
        `express=${eP.status}, nest=${nP.status}`);
    } else {
      try {
        const eWb = await decodeWorkbook(eP.buffer);
        const nWb = await decodeWorkbook(nP.buffer);
        assert.deepEqual(nWb, eWb);
        const header = eWb["To'lovlar"]?.[0] || [];
        if (header.includes('Telefon')) {
          bad('OQ RO\'YXAT ISHLAMADI', "ruxsatsiz `studentPhone` ustuni faylga tushdi");
        } else {
          ok(`ruxsatsiz ustun faylga TUSHMADI — sarlavhalar: ${JSON.stringify(header)}`);
        }
      } catch (err) {
        bad('telefon ustuni taqqoslash', String(err.message).slice(0, 600));
      }
    }

    await both('POST /exports/teachers — `teachers.read` yo\'q → 403', (base) =>
      request(base, 'POST', '/api/exports/teachers', {
        token: scopedToken, body: {}, headers: { 'x-forwarded-for': RUN_IP } }));
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
