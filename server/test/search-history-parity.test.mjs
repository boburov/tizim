/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 4/9 — GLOBAL QIDIRUV + FAOLIYAT TARIXI PARITETI (3 marshrut).
 *
 *   `/api/search`                              (1)
 *   `/api/activity-history/students/:id`       (1)
 *   `/api/activity-history/groups/:id`         (1)
 *
 * ── ⚠ SHARTNI O'ZIMIZ QURAMIZ ──
 *
 * Bazadagi BARCHA o'quvchi, o'qituvchi va guruh BITTA filialda
 * (`6a80ce00…`). Ya'ni "begona filial natijasi chiqmasin" tekshiruvi
 * MAVJUD ma'lumot bilan HECH NARSANI AJRATA OLMAYDI: boshqa filialga
 * bog'langan aktyor baribir hech nima topmasdi va buni "ko'lam
 * ishladi" deb o'qish YOLG'ON bo'lardi.
 *
 * Shuning uchun IKKI fixture o'quvchi yaratiladi — biri aktyorning
 * filialida, biri BOSHQA filialda — va ikkalasi ham BIR XIL noyob
 * qidiruv so'zi bilan nomlanadi. Shunda:
 *   • owner IKKALASINI ham topadi        (musbat nazorat: ikkisi ham bor)
 *   • ko'lamli aktyor FAQAT o'zinikini   (ko'lam haqiqatan kesyapti)
 *
 * ── ⚠ TO'LOV BO'LIMI GATE'i ──
 *
 * "Ali" deb qidirgan resepshin Alini TOPADI, lekin uning to'lov
 * summasini KO'RMASLIGI kerak (`finance.read`). Buni o'lchash uchun
 * bazada HAQIQATAN to'lov bo'lishi shart — aks holda ikkala holatda ham
 * `payments: []` qaytib, gate ajratilmas edi. To'lov bo'lmasa tekshiruv
 * "o'lchanmadi" deb belgilanadi: MOLIYAVIY YOZUV YARATILMAYDI, chunki
 * moliya bu agentning ko'lami emas.
 *
 * ── ⚠ MA'LUMOT SURILIB TURADI ──
 *
 * Boshqa agentlar bir vaqtning o'zida yangi seed qo'yadi (filiallar,
 * guruhlar, to'lovlar o'zgaradi). Shuning uchun tekshiruv shartlari
 * MAVJUD ma'lumotga TAYANMAYDI — kerakli holat (boshqa filialdagi
 * o'quvchi va guruh) shu yerda QURILADI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { createExtendedPrismaClient } from '../dist/prisma/prisma.service.js';
const prisma = createExtendedPrismaClient();

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';
const PREFIX = '__parity_';

const ESC = String.fromCharCode(27);
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const OFF = `${ESC}[0m`;

const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };
const note = (m) => console.log(`  ${DIM}ℹ  ${m}${OFF}`);
const head = (t) => console.log(`${DIM}  ── ${t} ──${OFF}`);

const req = async (base, method, path, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method, headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
};

const VOLATILE = new Set(['createdAt', 'updatedAt', 'stack', 'date', 'paidAt']);
let ID_SUBS = [];

const normalize = (v) => {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (VOLATILE.has(k)) continue;
      out[k] = normalize(val);
    }
    return out;
  }
  if (typeof v === 'string') {
    let s = v;
    for (const [from, to] of ID_SUBS) if (from) s = s.split(from).join(to);
    return s;
  }
  return v;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ⚠ LOGIN CHEGARASIGA (429) CHIDAMLI. */
const login = async (base, l, p, { retries = 4 } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    const r = await req(base, 'POST', '/api/auth/login', { body: { login: l, password: p } });
    if (r.status === 200) return r.body.data.accessToken;
    if (r.status !== 429 || attempt >= retries) {
      throw new Error(`login ${l}: ${r.status} ${JSON.stringify(r.body)}`);
    }
    const waitMs = 30_000 * (attempt + 1);
    console.log(`  ${DIM}⏳ login chegarasi (429) — ${waitMs / 1000}s kutilyapti…${OFF}`);
    await sleep(waitMs);
  }
};

const main = async () => {
  console.log(`\n${BOLD}FAZA 4/9 — QIDIRUV + FAOLIYAT TARIXI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  const before = {
    users: await prisma.user.count(),
    groups: await prisma.group.count(),
    payments: await prisma.paymentTransaction.count(),
  };
  note(`boshlang'ich: foydalanuvchi=${before.users}, to'lov=${before.payments}`);

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const TOKEN_WORD = `Zzparity${stamp}`; // noyob qidiruv so'zi
  const madeUserIds = [];
  const madeGroupIds = [];
  const tempRoles = [];
  let qaRestore = null;

  const qa = await prisma.user.findFirst({
    where: { username: 'qa_staff_a' }, select: { id: true, homeBranchId: true },
  });
  if (!qa) { console.log('  ❌ qa_staff_a topilmadi'); process.exit(1); }

  const otherBranch = await prisma.branch.findFirst({
    where: { isDeleted: false, id: { not: qa.homeBranchId } },
    select: { id: true, name: true },
  });
  if (!otherBranch) { console.log("  ❌ ikkinchi filial yo'q"); process.exit(1); }

  const both = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: normalize(e.body) };
    const nn = { status: n.status, body: normalize(n.body) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 600)}\n      nest   : ${JSON.stringify(nn).slice(0, 600)}`);
    }
    return { e, n };
  };

  /** Vaqtinchalik rol yaratib `qa_staff_a` ga beradi (rol + birikma). */
  const useRole = async (label, permissionKeys) => {
    const matrix = await req(EXPRESS, 'GET', '/api/roles/matrix', { token: ownerToken });
    const ids = [];
    for (const m of matrix.body.data.modules) {
      for (const cell of Object.values(m.cells)) {
        if (permissionKeys.includes(cell.key)) ids.push(cell.id);
      }
    }
    if (ids.length !== permissionKeys.length) {
      throw new Error(`ruxsat topilmadi (${ids.length}/${permissionKeys.length})`);
    }
    const r = await req(EXPRESS, 'POST', '/api/roles', {
      token: ownerToken, body: { label: `${PREFIX}${label}${stamp}`, permissionIds: ids },
    });
    if (r.status !== 201) throw new Error(`rol yaratilmadi: ${r.status}`);
    const value = r.body.data.value;
    tempRoles.push(value);

    if (!qaRestore) {
      const full = await req(EXPRESS, 'GET', `/api/users/${qa.id}`, { token: ownerToken });
      qaRestore = {
        role: full.body.data.role,
        homeBranchId: full.body.data.homeBranchId,
        branchAssignments: (full.body.data.branchAssignments || []).map((a) => ({
          branchId: a.branchId, role: a.role,
        })),
      };
    }
    await req(EXPRESS, 'PATCH', `/api/users/${qa.id}/role`, {
      token: ownerToken, body: { role: value },
    });
    await req(EXPRESS, 'PATCH', `/api/users/${qa.id}/branches`, {
      token: ownerToken,
      body: {
        homeBranchId: qaRestore.homeBranchId,
        branchAssignments: qaRestore.branchAssignments.map((a) => ({
          branchId: a.branchId, role: value,
        })),
      },
    });
    const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
    if (pw.status !== 200) throw new Error("parol o'qilmadi");
    return login(EXPRESS, pw.body.data.username, pw.body.data.password);
  };

  /** ⚠ TIKLASH API'GA TAYANMAYDI. */
  const restoreQa = async () => {
    if (!qaRestore) return;
    await prisma.user.update({
      where: { id: qa.id },
      data: { role: qaRestore.role, homeBranchId: qaRestore.homeBranchId },
    });
    for (const a of qaRestore.branchAssignments) {
      await prisma.userBranchAssignment.updateMany({
        where: { userId: qa.id, branchId: a.branchId },
        data: { role: a.role },
      });
    }
  };

  /** Fixture o'quvchi — berilgan filialda, noyob qidiruv so'zi bilan. */
  const makeStudent = async (branchId, tag) => {
    const u = await prisma.user.create({
      data: {
        firstName: TOKEN_WORD,
        lastName: `${tag}${stamp}`,
        username: `${PREFIX}${tag}${stamp}`,
        passwordHash: 'x'.repeat(20),
        role: 'student',
        homeBranchId: branchId,
        isActive: true,
      },
      select: { id: true },
    });
    madeUserIds.push(u.id);
    return u.id;
  };

  try {
    // ═══════════════ QIDIRUV — ASOSIY XULQ ═══════════════
    head('qidiruv (asosiy xulq)');

    await both('GET /search?q=al', (b) => req(b, 'GET', '/api/search?q=al', { token: ownerToken }));
    await both('GET /search?q=al&limit=3', (b) =>
      req(b, 'GET', '/api/search?q=al&limit=3', { token: ownerToken }));

    // ⚠ IKKI BELGIDAN QISQA SO'ROV UMUMAN BAJARILMAYDI.
    for (const q of ['', '?q=', '?q=a']) {
      await both(`GET /search${q} (qisqa → bo'sh)`, (b) =>
        req(b, 'GET', `/api/search${q}`, { token: ownerToken }));
    }
    const shortE = await req(EXPRESS, 'GET', '/api/search?q=a', { token: ownerToken });
    try {
      assert.deepEqual(shortE.body.data, { students: [], teachers: [], groups: [], payments: [] });
      ok("bitta harfli so'rov BO'SH natija qaytardi (baza skanerlanmadi)");
    } catch (err) { bad('qisqa so\'rov', err.message); }

    await both('GET /search?limit=21 → 400', (b) =>
      req(b, 'GET', '/api/search?q=ali&limit=21', { token: ownerToken }));
    await both("GET /search (token yo'q → 401)", (b) => req(b, 'GET', '/api/search?q=ali'));

    // ⚠ `escapeRegex` OLIB TASHLANGANI: maxsus belgili so'rov YIQILMASLIGI
    // va matnni buzmasligi kerak.
    for (const q of ['C%2B%2B', '(test)', '50%25']) {
      await both(`GET /search?q=${q} (maxsus belgi)`, (b) =>
        req(b, 'GET', `/api/search?q=${q}`, { token: ownerToken }));
    }

    // ═══════════════ QIDIRUV — FILIAL KO'LAMI ═══════════════
    //
    // ⚠ SHARTNI O'ZIMIZ QURAMIZ (fayl boshidagi izohga qarang).
    head("qidiruv — filial ko'lami (shart qurilgan)");

    let scopedToken = null;
    try {
      const ownId = await makeStudent(qa.homeBranchId, 'own');
      const foreignId = await makeStudent(otherBranch.id, 'foreign');
      ID_SUBS = [[ownId, '<OWN>'], [foreignId, '<FOREIGN>']];

      // ⚠ MUSBAT NAZORAT: owner IKKALASINI ham topadi — ya'ni ikkala
      // fixture ham HAQIQATAN qidiruvga tushadi va pastdagi "topilmadi"
      // natijasi "umuman yo'q" degani EMAS.
      const asOwner = await req(EXPRESS, 'GET', `/api/search?q=${TOKEN_WORD}&limit=20`, {
        token: ownerToken,
      });
      const ownerIds = (asOwner.body?.data?.students || []).map((s) => s.id);
      try {
        assert.equal(ownerIds.length, 2, `owner ${ownerIds.length} ta topdi (2 kutilgan)`);
        ok('MUSBAT NAZORAT: owner IKKALA fixture o\'quvchini ham topdi');
      } catch (err) { bad('fixture qidiruvga tushmadi', err.message); }

      await both(`GET /search?q=${TOKEN_WORD} (owner)`, (b) =>
        req(b, 'GET', `/api/search?q=${TOKEN_WORD}&limit=20`, { token: ownerToken }));

      // Ko'lamli aktyor: `users.read` bor, `finance.read` YO'Q.
      scopedToken = await useRole('searchread', ['users.read']);

      const asScoped = await req(EXPRESS, 'GET', `/api/search?q=${TOKEN_WORD}&limit=20`, {
        token: scopedToken,
      });
      const asScopedN = await req(NEST, `GET`, `/api/search?q=${TOKEN_WORD}&limit=20`, {
        token: scopedToken,
      });

      // ⚠ KO'LAM HAR IKKALA STEKDA ALOHIDA TEKSHIRILADI, faqat
      // paritet farqiga tayanilmaydi: agar bu yerda faqat Express
      // tekshirilsa, NestJS'dagi sizish faqat "tana farq qiladi" deb
      // ko'rinardi — ya'ni xavfsizlik xatosi oddiy nomuvofiqlik bo'lib
      // o'qilardi.
      for (const [label, res] of [['express', asScoped], ['nest', asScopedN]]) {
        const ids = (res.body?.data?.students || []).map((s) => s.id);
        try {
          assert.ok(ids.includes(ownId), `${label}: o'z filialidagi o'quvchi TOPILMADI`);
          assert.ok(!ids.includes(foreignId), `${label}: BEGONA filial o'quvchisi TOPILDI — KO'LAM SIZDI!`);
          assert.equal(ids.length, 1, `${label}: ${ids.length} ta topildi (1 kutilgan)`);
          ok(`${label}: ko'lam KESDI — o'z filiali TOPILDI, begona filial TOPILMADI`);
        } catch (err) { bad(`${label} qidiruvda filial ko'lami`, err.message); }
      }

      await both(`GET /search?q=${TOKEN_WORD} (ko'lamli aktyor)`, (b) =>
        req(b, 'GET', `/api/search?q=${TOKEN_WORD}&limit=20`, { token: scopedToken }));

      // ═══════════ TO'LOV BO'LIMI GATE'i (`finance.read`) ═══════════
      //
      // ⚠ Resepshin "Ali" deb qidirsa Alini TOPADI, lekin uning to'lov
      // summasini KO'RMASLIGI kerak. Buni o'lchash uchun bazada
      // HAQIQATAN to'lov bo'lishi shart — aks holda ikkala holatda ham
      // `payments: []` qaytib, gate AJRATILMAS edi.
      //
      // ⚠ MOLIYAVIY YOZUV YARATILMAYDI: agar to'lov bo'lmasa, tekshiruv
      // "o'lchanmadi" deb belgilanadi — bu agentning ko'lami moliya
      // emas va sinov uchun bazaga pul yozuvi qo'yish noto'g'ri.
      const payCount = await prisma.paymentTransaction.count({ where: { isDeleted: false } });
      if (payCount === 0) {
        skip("to'lov gate'i", "bazada to'lov YO'Q — gate'ni ajratib bo'lmaydi (yozuv YARATILMADI)");
      } else {
        // (a) `finance.read` YO'Q → to'lovlar KO'RINMAYDI.
        try {
          assert.ok(Array.isArray(asScoped.body.data.payments), '`payments` massiv emas');
          assert.equal(asScoped.body.data.payments.length, 0,
            `finance.read YO'Q, lekin ${asScoped.body.data.payments.length} ta to'lov ko'rindi!`);
          ok("`finance.read` YO'Q → to'lovlar KO'RINMADI (bo'sh massiv)");
        } catch (err) { bad("to'lov gate'i sizdi", err.message); }

        // (b) MUSBAT NAZORAT: `finance.read` BOR → to'lovlar KO'RINADI.
        // Bu bo'lmasa (a) "qidiruv umuman to'lov qaytarmaydi" degani
        // bo'lardi va gate hech nimani isbotlamasdi.
        try {
          const financeToken = await useRole('searchfin', ['users.read', 'finance.read']);
          const withFinE = await req(EXPRESS, 'GET', '/api/search?q=a&limit=20', { token: financeToken });
          const withFinN = await req(NEST, 'GET', '/api/search?q=a&limit=20', { token: financeToken });
          // ⚠ Umumiy so'rov (`q=a` emas — u qisqa) o'rniga haqiqiy
          // o'quvchi ismi bilan qidiramiz.
          const anyStudent = await prisma.paymentTransaction.findFirst({
            where: { isDeleted: false },
            select: { student: { select: { firstName: true } } },
          });
          const term = anyStudent?.student?.firstName || 'al';
          const fE = await req(EXPRESS, 'GET', `/api/search?q=${encodeURIComponent(term)}&limit=20`, { token: financeToken });
          const fN = await req(NEST, 'GET', `/api/search?q=${encodeURIComponent(term)}&limit=20`, { token: financeToken });
          assert.ok(
            (fE.body?.data?.payments || []).length > 0,
            `finance.read BOR, lekin to'lov ko'rinmadi ("${term}" bo'yicha)`,
          );
          assert.deepEqual(normalize(fN.body), normalize(fE.body));
          ok(`MUSBAT NAZORAT: \`finance.read\` BOR → ${fE.body.data.payments.length} ta to'lov KO'RINDI (ikkala stekda bir xil)`);
          void withFinE; void withFinN;
        } catch (err) { bad("to'lov musbat nazorati", err.message); }
      }
    } catch (err) {
      skip("qidiruvda filial ko'lami", err.message);
    }

    // ═══════════════ FAOLIYAT TARIXI ═══════════════
    head('faoliyat tarixi (timeline)');

    const realStudent = await prisma.user.findFirst({
      where: { role: 'student', isActive: true, isDeleted: false, id: { notIn: madeUserIds } },
      select: { id: true, homeBranchId: true },
    });
    const realGroup = await prisma.group.findFirst({
      where: { isDeleted: false }, select: { id: true, branchId: true },
    });

    if (realStudent && realGroup) {
      await both('GET /activity-history/students/:id', (b) =>
        req(b, 'GET', `/api/activity-history/students/${realStudent.id}`, { token: ownerToken }));
      await both('GET /activity-history/students/:id?limit=5', (b) =>
        req(b, 'GET', `/api/activity-history/students/${realStudent.id}?limit=5`, { token: ownerToken }));
      await both('GET /activity-history/students/:id?page=2&limit=5', (b) =>
        req(b, 'GET', `/api/activity-history/students/${realStudent.id}?page=2&limit=5`, { token: ownerToken }));
      await both('GET /activity-history/groups/:id', (b) =>
        req(b, 'GET', `/api/activity-history/groups/${realGroup.id}`, { token: ownerToken }));
      await both('GET /activity-history/groups/:id?limit=5', (b) =>
        req(b, 'GET', `/api/activity-history/groups/${realGroup.id}?limit=5`, { token: ownerToken }));
      await both('GET /activity-history/students/:id?limit=201 → 400', (b) =>
        req(b, 'GET', `/api/activity-history/students/${realStudent.id}?limit=201`, { token: ownerToken }));

      // ⚠ MUSBAT NAZORAT: timeline BO'SH EMAS — aks holda pastdagi
      // solishtiruvlar "ikkalasi ham hech nima qaytardi" bo'lardi.
      const tl = await req(EXPRESS, 'GET', `/api/activity-history/students/${realStudent.id}`, {
        token: ownerToken,
      });
      try {
        assert.ok((tl.body?.meta?.total || 0) > 0, "timeline BO'SH — solishtiruv ma'nosiz edi");
        ok(`MUSBAT NAZORAT: timeline'da ${tl.body.meta.total} ta hodisa bor`);
      } catch (err) { bad("bo'sh timeline", err.message); }
    } else {
      skip('faoliyat tarixi', "o'quvchi yoki guruh topilmadi");
    }

    await both('GET /activity-history/students/:id (404)', (b) =>
      req(b, 'GET', `/api/activity-history/students/${'a'.repeat(24)}`, { token: ownerToken }));
    await both('GET /activity-history/groups/:id (404)', (b) =>
      req(b, 'GET', `/api/activity-history/groups/${'a'.repeat(24)}`, { token: ownerToken }));
    await both("GET /activity-history/students/:id (token yo'q → 401)", (b) =>
      req(b, 'GET', `/api/activity-history/students/${'a'.repeat(24)}`));

    // ═══════════════ TARIX — FILIAL KO'LAMI ═══════════════
    head("faoliyat tarixi — filial ko'lami (403)");

    try {
      const histToken = await useRole('histread', ['activity_logs.read']);
      const foreignStudentId = madeUserIds[1]; // boshqa filialdagi fixture
      const ownStudentId = madeUserIds[0];

      // ⚠ MUSBAT NAZORAT: aktyor O'Z filialidagi o'quvchi tarixini
      // KO'RADI — pastdagi 403 "umuman kira olmaydi" degani emas.
      const posE = await req(EXPRESS, 'GET', `/api/activity-history/students/${ownStudentId}`, {
        token: histToken,
      });
      const posN = await req(NEST, 'GET', `/api/activity-history/students/${ownStudentId}`, {
        token: histToken,
      });
      if (posE.status !== 200 || posN.status !== 200) {
        throw new Error(`musbat nazorat 200 BERMADI (${posE.status}/${posN.status})`);
      }
      await both("MUSBAT NAZORAT: o'z filiali o'quvchisi tarixi → 200", (b) =>
        req(b, 'GET', `/api/activity-history/students/${ownStudentId}`, { token: histToken }));

      await both('begona filial o\'quvchisi tarixi → 403', (b) =>
        req(b, 'GET', `/api/activity-history/students/${foreignStudentId}`, { token: histToken }));

      // ⚠ GURUH KO'LAMI — SHARTNI O'ZIMIZ QURAMIZ.
      //
      // Ilgari bu yerda bazadagi tayyor guruh ishlatilardi va uning
      // filiali aktyornikiga TENG chiqib qolsa tekshiruv o'tkazib
      // yuborilardi (aynan shunday bo'ldi: boshqa agent yangi seed
      // qo'ygach guruhlar aktyor filialiga ko'chdi). Endi begona
      // filialda O'Z fixture guruhimiz yaratiladi — shart DOIM
      // bajariladi va u bizga tegishli.
      const fixtureGroup = await prisma.group.create({
        data: { branchId: otherBranch.id, name: `${PREFIX}grp${stamp}`, isActive: true },
        select: { id: true },
      });
      madeGroupIds.push(fixtureGroup.id);

      // MUSBAT NAZORAT: aktyor O'Z filialidagi guruh tarixini KO'RADI.
      const ownGroup = await prisma.group.findFirst({
        where: { isDeleted: false, branchId: qaRestore.homeBranchId },
        select: { id: true },
      });
      if (ownGroup) {
        const gE = await req(EXPRESS, 'GET', `/api/activity-history/groups/${ownGroup.id}`, { token: histToken });
        if (gE.status === 200) {
          await both("MUSBAT NAZORAT: o'z filiali guruhi tarixi → 200", (b) =>
            req(b, 'GET', `/api/activity-history/groups/${ownGroup.id}`, { token: histToken }));
        } else {
          skip("guruh musbat nazorati", `o'z filiali guruhi ${gE.status} berdi`);
        }
      } else {
        skip("guruh musbat nazorati", "aktyor filialida guruh yo'q");
      }

      await both('begona filial guruhi tarixi → 403', (b) =>
        req(b, 'GET', `/api/activity-history/groups/${fixtureGroup.id}`, { token: histToken }));

      // Ruxsatsiz aktyor.
      await restoreQa();
      const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      const plain = await login(EXPRESS, pw.body.data.username, pw.body.data.password);
      await both("`activity_logs.read` yo'q → 403", (b) =>
        req(b, 'GET', `/api/activity-history/students/${ownStudentId}`, { token: plain }));
      await both("`users.read` yo'q → qidiruv 403", (b) =>
        req(b, 'GET', '/api/search?q=ali', { token: plain }));
    } catch (err) {
      skip("tarixda filial ko'lami", err.message);
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;

    await restoreQa();

    for (const v of tempRoles) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${v}`, { token: ownerToken });
      if (r.status === 200) cleaned += 1;
    }
    const forcedRoles = await prisma.role.deleteMany({ where: { label: { startsWith: PREFIX } } });
    cleaned += forcedRoles.count;

    // ⚠ QATTIQ O'CHIRISH: fixture o'quvchilar yangi yaratilgan, ularga
    // hech qanday havola yo'q.
    if (madeUserIds.length) {
      const r = await prisma.user.deleteMany({ where: { id: { in: madeUserIds } } });
      cleaned += r.count;
    }
    // Oldingi yurishdan qolgani ham.
    const strays = await prisma.user.deleteMany({
      where: { username: { startsWith: PREFIX } },
    });
    cleaned += strays.count;

    const gDel = await prisma.group.deleteMany({ where: { name: { startsWith: PREFIX } } });
    cleaned += gDel.count;
    void madeGroupIds;

    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    const after = {
      users: await prisma.user.count(),
      groups: await prisma.group.count(),
      payments: await prisma.paymentTransaction.count(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (foydalanuvchi=${after.users})`);
    } catch (err) { bad('BAZA SILJIDI', err.message); }

    if (qaRestore) {
      const now = await prisma.user.findUnique({
        where: { id: qa.id },
        select: { role: true, branchAssignments: { select: { role: true } } },
      });
      try {
        assert.equal(now.role, qaRestore.role);
        assert.ok(now.branchAssignments.every((a) => !String(a.role || '').startsWith('parity-')));
        ok('fixture roli va birikmalari tiklandi (bazadan tasdiqlandi)');
      } catch (err) { bad('fixture tiklanmadi', err.message); }
    }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
