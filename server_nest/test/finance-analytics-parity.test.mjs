/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYA TAHLILI PARITETI — 30 MARSHRUT (`/api/finance-analytics/*`)
 *
 * ── NIMA O'LCHANADI ──
 *   1. PARITET — har marshrut, TO'LIQ tana AYNAN solishtiriladi.
 *      `VOLATILE` da faqat `stack` bor: bitta ham hisoblangan raqam
 *      solishtiruvdan CHIQARILMAYDI. Aks holda test "ikkalasi ham
 *      200 qaytardi" dan boshqa hech narsa aytmasdi.
 *   2. IJOBIY NAZORAT — ruxsati bor rol HAQIQATAN 2xx oladi.
 *      Har salbiy nazoratdan OLDIN o'lchanadi: 403 ni "himoya
 *      ishlayapti" deb o'qish uchun avval 200 ni ko'rish shart.
 *   3. SALBIY NAZORAT — ruxsatsiz rol IKKALA stekda ham 403 oladi.
 *   4. QO'RIQCHINI CHETLAB O'TISH ISBOTI — quyidagi `head()` larga
 *      qarang; har biri "qo'riqchi olib tashlansa nima ochilardi"
 *      degan savolga O'LCHANGAN javob beradi.
 *   5. BAZA SILJISHI — modul FAQAT O'QIYDI, ya'ni siljish 0 bo'lishi
 *      SHART. Yozuv sonlari boshda va oxirida solishtiriladi.
 *
 * ── ⚠ ATAYLAB O'LCHANMAYDIGAN YAGONA HOLAT ──
 * `/intelligence/alerts/:alertId?explain=true` — Express LLM ga boradi
 * (`ai` moduli), NestJS esa deterministik matn qaytaradi, chunki `ai`
 * KO'CHIRILMAGAN (B29). Bu holat SKIP EMAS: quyida OCHIQ tekshiriladi
 * va "bloklangan" deb belgilanadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import prisma from '../../server/src/config/prisma.js';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';
const PREFIX = '__parity_';

const ESC = String.fromCharCode(27);
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const OFF = `${ESC}[0m`;

const R = { pass: 0, fail: 0, unmeasured: 0, blocked: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };
const blocked = (n, m) => { R.blocked += 1; console.log(`  🚧 ${n} — BLOKLANGAN: ${m}`); };
const note = (m) => console.log(`  ${DIM}ℹ  ${m}${OFF}`);
const head = (t) => console.log(`\n${DIM}  ── ${t} ──${OFF}`);

const rawReq = async (base, method, path, { token, body } = {}) => {
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

/**
 * ⚠ UMUMIY TEZLIK CHEGARASIGA (429) CHIDAMLI — MIGRATION-CHECKLIST B25.
 * Express `generalLimiter` ni global qo'yadi, NestJS esa ulamagan.
 * 429 ni 200 bilan solishtirish HECH NARSANI o'lchamaydi.
 */
const req = async (base, method, path, opts = {}, { retries = 3 } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    const r = await rawReq(base, method, path, opts);
    if (r.status !== 429 || attempt >= retries) return r;
    const waitMs = 20_000 * (attempt + 1);
    console.log(`  ${DIM}⏳ umumiy tezlik chegarasi (429) — ${waitMs / 1000}s kutilyapti…${OFF}`);
    await new Promise((res) => setTimeout(res, waitMs));
  }
};

// ⚠ Barcha hisoblangan raqam SOLISHTIRILADI — faqat `stack` chiqariladi.
const VOLATILE = new Set(['stack']);
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
  console.log(`\n${BOLD}MOLIYA TAHLILI PARITETI — 30 MARSHRUT${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  // ── BAZA SURATI (modul faqat o'qiydi → siljish 0 bo'lishi SHART) ──
  const snapshot = async () => ({
    journalEntry: await prisma.journalEntry.count(),
    journalLine: await prisma.journalLine.count(),
    studentPayment: await prisma.studentPayment.count(),
    expense: await prisma.expense.count(),
    paymentTransaction: await prisma.paymentTransaction.count(),
    budget: await prisma.budget.count(),
    discount: await prisma.discount.count(),
    // `Cache` — izoh qatlami YOZISHI mumkin bo'lgan YAGONA jadval.
    cache: await prisma.cache.count(),
    financialAuditLog: await prisma.financialAuditLog.count(),
  });
  const before = await snapshot();
  note(`boshlang'ich: jurnal=${before.journalEntry}, qator=${before.journalLine}, `
    + `reja=${before.studentPayment}, chiqim=${before.expense}, kesh=${before.cache}`);

  const qa = await prisma.user.findFirst({
    where: { username: 'qa_staff_a' }, select: { id: true, homeBranchId: true },
  });
  if (!qa) { console.log('  ❌ qa_staff_a topilmadi'); process.exit(1); }

  const branchA = qa.homeBranchId;
  const otherB = await prisma.branch.findFirst({
    where: { isDeleted: false, id: { not: branchA } }, select: { id: true, name: true },
  });
  if (!otherB) { console.log("  ❌ ikkinchi filial yo'q"); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const tempRoles = [];
  let qaRestore = null;

  /** ⚠ QO'SHNI AGENT YOZUVINI HAQIQIY FARQDAN AJRATADI. */
  const stabilize = null;
  const subs = null;

  const both = async (name, fn, { retries = 2 } = {}) => {
    for (let attempt = 0; ; attempt += 1) {
      let e;
      let n;
      try { e = await fn(EXPRESS); n = await fn(NEST); }
      catch (err) { skip(name, err.message); return {}; }
      if (typeof subs === 'function') ID_SUBS = subs();
      const en = { status: e.status, body: normalize(stabilize ? stabilize(e.body) : e.body) };
      const nn = { status: n.status, body: normalize(stabilize ? stabilize(n.body) : n.body) };
      try {
        assert.deepEqual(nn, en);
        if (attempt > 0) note(`"${name}" — ${attempt}-urinishda mos keldi (qo'shni agent yozuvi sabab)`);
        ok(`${name} — ${e.status}`);
        return { e, n };
      } catch {
        if (attempt >= retries) {
          bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
          return { e, n };
        }
        await sleep(1200);
      }
    }
  };

  const get = (path, token) => (base) => req(base, 'GET', path, { token });

  /**
   * ⚠ HAR CHAQIRUV `qa_staff_a` NING AMALDAGI ROLINI ALMASHTIRADI.
   *
   * Ruxsatlar har so'rovda foydalanuvchining JORIY rolidan o'qiladi,
   * ya'ni ILGARI olingan token KEYINGI `useRole` dan so'ng BOSHQA
   * ruxsatlar bilan ishlaydi. Shuning uchun har rolning tekshiruvlari
   * AYNAN o'sha rol yaratilgandan keyin, keyingisidan OLDIN bajariladi.
   *
   * (Bu ataylab yozilgan: ilgari eski token oxirida qayta ishlatilgan
   * va 403 tanasi "0 qator" deb o'qilib, test NOTO'G'RI SABABDAN
   * yashil bo'lgan edi.)
   */
  const useRole = async (label, permissionKeys) => {
    const matrix = await req(EXPRESS, 'GET', '/api/roles/matrix', { token: ownerToken });
    const ids = [];
    for (const m of matrix.body.data.modules) {
      for (const cell of Object.values(m.cells)) {
        if (permissionKeys.includes(cell.key)) ids.push(cell.id);
      }
    }
    if (ids.length !== permissionKeys.length) {
      throw new Error(`ruxsat topilmadi (${ids.length}/${permissionKeys.length}): ${permissionKeys}`);
    }
    const r = await req(EXPRESS, 'POST', '/api/roles', {
      token: ownerToken, body: { label: `${PREFIX}${label}${stamp}`, permissionIds: ids },
    });
    if (r.status !== 201) throw new Error(`rol yaratilmadi: ${r.status} ${JSON.stringify(r.body)}`);
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
    // ⚠ AMALDAGI ROL FILIAL BIRIKMASIDAN KELADI: `user.role` ni
    // o'zgartirish YETARLI EMAS — `branchAssignments[].role` ustun.
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
    return {
      express: await login(EXPRESS, pw.body.data.username, pw.body.data.password),
      nest: await login(NEST, pw.body.data.username, pw.body.data.password),
    };
  };

  /** ⚠ TIKLASH API'GA TAYANMAYDI — test yiqilsa ham fikstura qolmaydi. */
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

  /** IKKALA STEKDA bir xil holat kutiladi (farqni emas, INVARIANTNI o'lchaydi). */
  const bothStatus = async (name, path, tokens, expected) => {
    const e = await req(EXPRESS, 'GET', path, { token: tokens.express });
    const n = await req(NEST, 'GET', path, { token: tokens.nest });
    try {
      assert.equal(e.status, expected, `Express ${e.status} (${expected} kutilgan): ${JSON.stringify(e.body).slice(0, 200)}`);
      assert.equal(n.status, expected, `NestJS ${n.status} (${expected} kutilgan): ${JSON.stringify(n.body).slice(0, 200)}`);
      ok(`${name} — ikkalasi ham ${expected}`);
      return { e, n };
    } catch (err) { bad(name, err.message); return { e, n }; }
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    // 1) PARITET — OWNER, TO'LIQ TANA
    // ═══════════════════════════════════════════════════════════════
    head('paritet — barcha marshrut, tanalar AYNAN solishtiriladi');

    const ROUTES = [
      'summary',
      'entries',
      'entries?limit=5',
      'entries?limit=5&accountKind=cash',
      'alerts',
      'intelligence',
      'intelligence/alerts',
      'intelligence/briefing',
      'revenue/trend',
      'revenue/trend?granularity=day',
      'revenue/trend?granularity=week',
      'revenue/by/branch',
      'revenue/by/course',
      'revenue/by/teacher',
      'revenue/by/group',
      'revenue/by/room',
      'revenue/by/method',
      'revenue/by/student',
      'payment-methods',
      'refunds',
      'discounts',
      'expenses/trend',
      'expenses/breakdown',
      'expenses/by/category',
      'expenses/by/person',
      'expenses/by/teacher',
      'expenses/by/branch',
      'expenses/by/group',
      'expenses/by/costType',
      'expenses/cost-structure',
      'expenses/recurring',
      'budget',
      'cash-flow',
      'cash-flow?accountKind=cash',
      'cash-flow/accounts',
      'cash-flow/trend',
      'receivables',
      'receivables/by/branch',
      'receivables/by/course',
      'receivables/by/group',
      'receivables/by/student',
      'teachers',
      'directions',
      'groups',
      'rooms',
      'branches',
    ];
    for (const p of ROUTES) {
      await both(p, get(`/api/finance-analytics/${p}`, ownerToken));
    }

    head('paritet — davr filtrlari (parseRange ning HAR TARMOG\'I)');
    for (const q of [
      '?year=2026&month=8',              // {year, month}
      '?year=2026',                      // {year}
      '?from=2026-07-01&to=2026-08-31',  // {from, to}
      '?from=2026-08-01',                // faqat `from` → `to` = bugun
      '?to=2026-08-31',                  // faqat `to` → `from` = 1970
      '?year=2026&month=7',              // to'liq oy → oldingi oy bilan taqqoslash
      '?from=2026-08-10&to=2026-08-20',  // qisman oraliq → teng uzunlikdagi oldingi
    ]) {
      await both(`summary${q}`, get(`/api/finance-analytics/summary${q}`, ownerToken));
      await both(`receivables${q}`, get(`/api/finance-analytics/receivables${q}`, ownerToken));
    }

    head("paritet — o'lchov filtrlari va chegaraviy qiymatlar");
    const anyGroup = await prisma.group.findFirst({ where: { isDeleted: false }, select: { id: true, branchId: true, courseId: true } });
    const anyStudent = await prisma.journalEntry.findFirst({ where: { studentId: { not: null } }, select: { studentId: true } });
    for (const q of [
      `?branchId=${branchA}`,
      anyGroup ? `?groupId=${anyGroup.id}` : null,
      anyGroup?.courseId ? `?courseId=${anyGroup.courseId}` : null,
      anyStudent ? `?studentId=${anyStudent.studentId}` : null,
      '?limit=1',
      '?limit=200',
      '?costType=fixed',
      '?paymentMethod=cash',
    ].filter(Boolean)) {
      await both(`summary${q}`, get(`/api/finance-analytics/summary${q}`, ownerToken));
    }

    head('paritet — VALIDATSIYA rad etishi (400 tanasi ham bir xil)');
    for (const [name, p] of [
      ['noto\'g\'ri kesim', 'revenue/by/nonsense'],
      ['noto\'g\'ri chiqim kesimi', 'expenses/by/nonsense'],
      ['noto\'g\'ri debitorlik kesimi', 'receivables/by/teacher'],
      ['noto\'g\'ri ID', 'entries/not-an-id'],
      ['noto\'g\'ri o\'quvchi ID', 'students/xyz'],
      ['limit chegaradan yuqori', 'summary?limit=201'],
      ['limit nol', 'summary?limit=0'],
      ['oy 13', 'summary?month=13'],
      ['yil 1999', 'summary?year=1999'],
      ['noma\'lum granularity', 'summary?granularity=hour'],
      ['noma\'lum accountKind', 'summary?accountKind=crypto'],
      ['noto\'g\'ri sana', 'summary?from=2026-13-45'],
      ['noto\'g\'ri branchId', 'summary?branchId=notanid'],
      ['noto\'g\'ri signal ID', 'intelligence/alerts/BAD-ID'],
    ]) {
      await both(name, get(`/api/finance-analytics/${p}`, ownerToken));
    }

    head('paritet — TOPILMADI (404) tanasi');
    const ghost = '0'.repeat(24);
    await both('yo\'q yozuv tafsiloti', get(`/api/finance-analytics/entries/${ghost}`, ownerToken));
    await both('yo\'q o\'quvchi profili', get(`/api/finance-analytics/students/${ghost}`, ownerToken));
    await both('yo\'q signal', get(`/api/finance-analytics/intelligence/alerts/no_such_rule`, ownerToken));

    head('paritet — mavjud yozuv tafsiloti va o\'quvchi profili');
    const salaryEntry = await prisma.journalEntry.findFirst({ where: { kind: 'salary' }, select: { id: true } });
    const plainEntry = await prisma.journalEntry.findFirst({ where: { kind: { not: 'salary' } }, select: { id: true, kind: true } });
    if (salaryEntry) await both('maosh yozuvi tafsiloti', get(`/api/finance-analytics/entries/${salaryEntry.id}`, ownerToken));
    else skip('maosh yozuvi tafsiloti', "bazada `salary` yozuvi yo'q");
    if (plainEntry) await both(`${plainEntry.kind} yozuvi tafsiloti`, get(`/api/finance-analytics/entries/${plainEntry.id}`, ownerToken));
    else skip('oddiy yozuv tafsiloti', "bazada maoshdan boshqa yozuv yo'q");

    const studentWithPlan = await prisma.studentPayment.findFirst({ select: { studentId: true } });
    if (studentWithPlan) {
      await both('o\'quvchi moliyaviy profili', get(`/api/finance-analytics/students/${studentWithPlan.studentId}`, ownerToken));
    } else skip("o'quvchi profili", "reja qatori yo'q");

    // ═══════════════════════════════════════════════════════════════
    // 2) SIGNAL TAFSILOTI — DETERMINISTIK YO'L
    // ═══════════════════════════════════════════════════════════════
    head('signal tafsiloti — deterministik izoh (LLM\'siz)');
    const intel = await req(EXPRESS, 'GET', '/api/finance-analytics/intelligence', { token: ownerToken });
    const liveAlert = intel.body?.data?.alerts?.[0]?.id || null;
    if (!liveAlert) {
      skip('signal tafsiloti', 'bu davrda faol signal yo\'q — chegaralar oshmagan');
    } else {
      note(`faol signal: ${liveAlert} (jami ${intel.body.data.alerts.length} ta)`);
      await both('signal tafsiloti (explain berilmagan)',
        get(`/api/finance-analytics/intelligence/alerts/${liveAlert}`, ownerToken));
      await both('signal tafsiloti (explain=false)',
        get(`/api/finance-analytics/intelligence/alerts/${liveAlert}?explain=false`, ownerToken));

      // ── ⚠ BLOKLANGAN: `?explain=true` `ai` MODULIGA BOG'LIQ (B29) ──
      const e = await req(EXPRESS, 'GET', `/api/finance-analytics/intelligence/alerts/${liveAlert}?explain=true`, { token: ownerToken });
      const n = await req(NEST, 'GET', `/api/finance-analytics/intelligence/alerts/${liveAlert}?explain=true`, { token: ownerToken });
      const eSrc = e.body?.data?.explanation?.source;
      const nSrc = n.body?.data?.explanation?.source;
      if (e.status === 200 && n.status === 200 && eSrc === nSrc) {
        // ⚠ MOS KELDI — LEKIN BU "AI YO'LI PARITETDA" DEGANI EMAS.
        // Express `generateFinanceExplanation()` null qaytarganda ham
        // `deterministic` ga tushadi (kalit bor, chaqiruv muvaffaqiyatsiz).
        // Ya'ni ikkala tomon bir xil javob berdi, lekin LLM TARMOG'I
        // UMUMAN ISHGA TUSHMADI — u hamon B29 bo'yicha bloklangan.
        if (eSrc === 'deterministic') {
          ok(`explain=true — ikkalasi ham "deterministic" (mos)`);
          blocked("explain=true AI tarmog'i",
            "Express ham LLM ga yetib bormadi (`source: deterministic`), ya'ni AI YO'LI "
            + "BU YURISHDA O'LCHANMADI. NestJS'da `ai` moduli ulanmagan (B29) — "
            + "u ko'chirilgach bu holat QAYTA o'lchanishi SHART.");
        } else {
          ok(`explain=true — ikkalasi ham "${eSrc}" (kesh yo'li)`);
        }
      } else {
        blocked('explain=true',
          `express source="${eSrc}", nest source="${nSrc}" — NestJS'da \`ai\` moduli ulanmagan (B29). `
          + `Raqamlar (evidence) BIR XIL, faqat MATN manbai boshqa.`);
        // Raqamlar baribir bir xil bo'lishi SHART — matn farqi ularni buzmasin.
        try {
          assert.deepEqual(
            normalize(n.body?.data?.explanation?.evidence),
            normalize(e.body?.data?.explanation?.evidence),
          );
          ok('explain=true — DALILLAR (raqamlar) baribir aynan bir xil');
        } catch (err) { bad('explain=true dalillari', err.message); }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 3) RUXSAT: IJOBIY → SALBIY → CHETLAB O'TISH ISBOTI
    // ═══════════════════════════════════════════════════════════════
    head('IJOBIY NAZORAT — `finance.read` bilan asosiy marshrutlar OCHIQ');
    const readOnly = await useRole('fin_read', ['finance.read']);
    for (const p of ['summary', 'revenue/trend', 'expenses/breakdown', 'budget', 'entries', 'alerts', 'intelligence']) {
      await bothStatus(`${p} (finance.read)`, `/api/finance-analytics/${p}`, readOnly, 200);
    }

    head('SALBIY NAZORAT — `finance.read` SEZGIR bo\'limlarni OCHMAYDI');
    for (const p of [
      'cash-flow', 'cash-flow/accounts', 'cash-flow/trend',
      'receivables', 'receivables/by/group',
      'teachers', 'directions', 'groups', 'rooms', 'branches',
    ]) {
      await bothStatus(`${p} (faqat finance.read)`, `/api/finance-analytics/${p}`, readOnly, 403);
    }

    head('CHETLAB O\'TISH ISBOTI №1 — chiqim kesimi MAOSHNI odam bo\'yicha ochadi');
    // ⚠ AVVAL SHARTNI O'LCHAYMIZ: `category` kesimi shu rol uchun OCHIQ.
    // Agar u ham 403 bo'lsa, quyidagi 403 "o'lcham qo'riqchisi" emas,
    // "butun marshrut yopiq" degani bo'lardi va isbot puch bo'lardi.
    await bothStatus('expenses/by/category OCHIQ (shart)', '/api/finance-analytics/expenses/by/category', readOnly, 200);
    for (const by of ['person', 'teacher']) {
      await bothStatus(`expenses/by/${by} YOPIQ (maosh o'lchovi)`, `/api/finance-analytics/expenses/by/${by}`, readOnly, 403);
    }
    // Va 403 xabari ham bir xil bo'lishi kerak — UI uni ko'rsatadi.
    await both('expenses/by/person 403 tanasi', get('/api/finance-analytics/expenses/by/person', readOnly.express));

    head('CHETLAB O\'TISH ISBOTI №2 — maosh YOZUVI yon eshigi (`/entries/:id`)');
    if (!salaryEntry || !plainEntry) {
      skip('maosh yon eshigi', "sinov uchun maosh/oddiy yozuv juftligi yo'q");
    } else {
      // SHART: oddiy yozuv shu rol uchun OCHIQ (ya'ni marshrutning o'zi ishlaydi).
      await bothStatus(`entries/:id oddiy yozuv OCHIQ (shart)`, `/api/finance-analytics/entries/${plainEntry.id}`, readOnly, 200);
      // ISBOT: aynan MAOSH yozuvi yopiq.
      await bothStatus(`entries/:id MAOSH yozuvi YOPIQ`, `/api/finance-analytics/entries/${salaryEntry.id}`, readOnly, 403);
    }

    head('CHETLAB O\'TISH ISBOTI №3 — maosh yozuvlari RO\'YXATDAN ham chiqariladi');
    // Ro'yxatda maosh yozuvi ko'rinib qolsa, tafsilotdagi 403 ma'nosiz
    // bo'lardi: summa baribir ko'ringan bo'lardi.
    {
      const eList = await req(EXPRESS, 'GET', '/api/finance-analytics/entries?limit=100', { token: readOnly.express });
      const nList = await req(NEST, 'GET', '/api/finance-analytics/entries?limit=100', { token: readOnly.nest });
      const eSal = (eList.body?.data || []).filter((x) => x.kind === 'salary').length;
      const nSal = (nList.body?.data || []).filter((x) => x.kind === 'salary').length;
      // SHART: owner uchun maosh yozuvi ro'yxatda BOR (aks holda 0 ni
      // "filtr ishladi" deb o'qish mumkin emas edi).
      const oList = await req(EXPRESS, 'GET', '/api/finance-analytics/entries?limit=100', { token: ownerToken });
      const oSal = (oList.body?.data || []).filter((x) => x.kind === 'salary').length;
      try {
        assert.ok(oSal > 0, `owner ro'yxatida maosh yozuvi YO'Q (${oSal}) — filtr o'lchanmaydi`);
        assert.equal(eSal, 0, `Express ro'yxatida ${eSal} ta maosh yozuvi qolgan`);
        assert.equal(nSal, 0, `NestJS ro'yxatida ${nSal} ta maosh yozuvi qolgan`);
        ok(`maosh yozuvlari ro'yxatdan chiqarildi (owner: ${oSal} ta, ruxsatsiz: 0/0)`);
      } catch (err) { bad('maosh ro\'yxat filtri', err.message); }
    }

    head('CHETLAB O\'TISH ISBOTI №4 — `/teachers` IKKI ruxsatni birga talab qiladi');
    const profitOnly = await useRole('fin_profit', ['finance.read', 'finance.view_profitability']);
    // SHART: foydalilik ruxsati HAQIQATAN ishlayapti — qo'shni marshrut ochiq.
    await bothStatus('directions OCHIQ (shart)', '/api/finance-analytics/directions', profitOnly, 200);
    await bothStatus('groups OCHIQ (shart)', '/api/finance-analytics/groups', profitOnly, 200);
    await bothStatus('rooms OCHIQ (shart)', '/api/finance-analytics/rooms', profitOnly, 200);
    await bothStatus('branches OCHIQ (shart)', '/api/finance-analytics/branches', profitOnly, 200);
    // ISBOT: `/teachers` shu ruxsat bilan HAM yopiq (maosh kerak).
    await bothStatus('teachers YOPIQ (maosh ruxsati yo\'q)', '/api/finance-analytics/teachers', profitOnly, 403);
    // TASDIQ: maosh ruxsati qo'shilsa ochiladi (403 boshqa sababdan emas).
    const profitPlusSalary = await useRole('fin_profit_sal', ['finance.read', 'finance.view_profitability', 'salary.read']);
    await bothStatus('teachers OCHILDI (maosh ruxsati bilan)', '/api/finance-analytics/teachers', profitPlusSalary, 200);
    await bothStatus('expenses/by/person OCHILDI', '/api/finance-analytics/expenses/by/person', profitPlusSalary, 200);
    if (salaryEntry) {
      await bothStatus('entries/:id maosh yozuvi OCHILDI', `/api/finance-analytics/entries/${salaryEntry.id}`, profitPlusSalary, 200);
    }

    head("FILIAL KO'LAMI — natija FILIALGA ERGASHADI (shart QURILADI)");
    /**
     * ⚠ NEGA "cheklangan rol kamroq ko'radi" TESTI BU YERDA ISHLAMAYDI.
     *
     * Seed'da jurnal yozuvlari BITTA filialda (`DEMO Markaz`) va
     * `qa_staff_a` ning uy filiali AYNAN o'sha. Ya'ni cheklangan rol
     * owner bilan BIR XIL raqamni ko'radi va "kamroq" solishtiruvi
     * hech narsani isbotlamaydi.
     *
     * Shuning uchun SHART QURILADI: foydalanuvchi MA'LUMOTSIZ filialga
     * ko'chiriladi. Natija nolga tushsa — filtr HAQIQATAN filialga
     * ergashyapti; o'zgarmasa — ko'lam umuman qo'llanmayapti.
     *
     * ⚠ Bu yerda ATAYLAB IKKI YO'NALISH ham o'lchanadi (bor→yo'q va
     * yo'q→bor): faqat "0 chiqdi" ni ko'rish yetarli emas, chunki 0
     * ruxsat rad etilganda ham chiqadi.
     */
    {
      const dataBranch = await prisma.journalEntry.groupBy({
        by: ['branchId'], _count: { _all: true },
      });
      const rich = dataBranch.sort((a, b) => b._count._all - a._count._all)[0];
      note(`jurnal eng ko'p filial: ${rich?.branchId} (${rich?._count._all} yozuv)`);

      // ── A) O'Z FILIALIDA: owner bilan BIR XIL raqam ──
      const oSum = await req(EXPRESS, 'GET', '/api/finance-analytics/summary', { token: ownerToken });
      const eSum = await req(EXPRESS, 'GET', '/api/finance-analytics/summary', { token: profitPlusSalary.express });
      const nSum = await req(NEST, 'GET', '/api/finance-analytics/summary', { token: profitPlusSalary.nest });
      const oRev = oSum.body?.data?.revenue?.current;
      const eRev = eSum.body?.data?.revenue?.current;
      const nRev = nSum.body?.data?.revenue?.current;
      try {
        assert.ok(oRev > 0, `owner daromadi 0 (${oRev}) — ko'lam o'lchanmaydi`);
        assert.equal(eRev, oRev, `Express: cheklangan rol ${eRev}, owner ${oRev}`);
        assert.equal(nRev, oRev, `NestJS: cheklangan rol ${nRev}, owner ${oRev}`);
        ok(`o'z filialida to'liq ko'rinadi (${oRev}) — ikkala stekda ham`);
      } catch (err) { bad("o'z filiali ko'rinishi", err.message); }

      // ── B) MA'LUMOTSIZ FILIALGA KO'CHIRAMIZ ──
      const movedRole = tempRoles[tempRoles.length - 1];
      await req(EXPRESS, 'PATCH', `/api/users/${qa.id}/branches`, {
        token: ownerToken,
        body: {
          homeBranchId: otherB.id,
          branchAssignments: [{ branchId: otherB.id, role: movedRole }],
        },
      });
      const pw2 = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      const movedE = await login(EXPRESS, pw2.body.data.username, pw2.body.data.password);
      const movedN = await login(NEST, pw2.body.data.username, pw2.body.data.password);

      const e2 = await req(EXPRESS, 'GET', '/api/finance-analytics/summary', { token: movedE });
      const n2 = await req(NEST, 'GET', '/api/finance-analytics/summary', { token: movedN });
      const e2b = await req(EXPRESS, 'GET', '/api/finance-analytics/branches', { token: movedE });
      const n2b = await req(NEST, 'GET', '/api/finance-analytics/branches', { token: movedN });
      try {
        // Ruxsat baribir bor — ya'ni 0 "rad etildi" degani EMAS.
        assert.equal(e2.status, 200, `Express ${e2.status} (200 kutilgan — ruxsat bor)`);
        assert.equal(n2.status, 200, `NestJS ${n2.status} (200 kutilgan — ruxsat bor)`);
        assert.equal(e2.body.data.revenue.current, 0, `Express boshqa filialda ${e2.body.data.revenue.current} ko'rdi`);
        assert.equal(n2.body.data.revenue.current, 0, `NestJS boshqa filialda ${n2.body.data.revenue.current} ko'rdi`);
        assert.equal((e2b.body?.data?.items || []).length, 0, "Express: begona filialda qator chiqdi");
        assert.equal((n2b.body?.data?.items || []).length, 0, "NestJS: begona filialda qator chiqdi");
        ok(`ma'lumotsiz filialga ko'chirilganda 200 + 0 (rad etilmadi, FILTRLANDI)`);
      } catch (err) { bad("filial ko'lami ergashishi", err.message); }

      // ── C) TANALAR HAM MOS ──
      try {
        assert.deepEqual({ status: n2.status, body: normalize(n2.body) },
                         { status: e2.status, body: normalize(e2.body) });
        ok("begona filial ostidagi tana ham aynan bir xil");
      } catch (err) { bad('begona filial tanasi', String(err.message).slice(0, 700)); }

      // ── D) TIKLAB, QAYTA O'LCHAYMIZ (yo'q → bor) ──
      await req(EXPRESS, 'PATCH', `/api/users/${qa.id}/branches`, {
        token: ownerToken,
        body: {
          homeBranchId: qaRestore.homeBranchId,
          branchAssignments: qaRestore.branchAssignments.map((a) => ({ branchId: a.branchId, role: movedRole })),
        },
      });
      const pw3 = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      const backE = await login(EXPRESS, pw3.body.data.username, pw3.body.data.password);
      const backN = await login(NEST, pw3.body.data.username, pw3.body.data.password);
      const e3 = await req(EXPRESS, 'GET', '/api/finance-analytics/summary', { token: backE });
      const n3 = await req(NEST, 'GET', '/api/finance-analytics/summary', { token: backN });
      try {
        assert.equal(e3.body.data.revenue.current, oRev, `Express qaytgach ${e3.body.data.revenue.current}`);
        assert.equal(n3.body.data.revenue.current, oRev, `NestJS qaytgach ${n3.body.data.revenue.current}`);
        ok(`filialga qaytgach raqam TIKLANDI (${oRev}) — natija filialga ergashadi`);
      } catch (err) { bad('filialga qaytish', err.message); }
      profitPlusSalary.express = backE;
      profitPlusSalary.nest = backN;
    }

    head('CHETLAB O\'TISH ISBOTI №5 — `?branchId=` FILIAL CHEGARASINI buza olmaydi');
    // SHART: o'z filiali bilan so'rov OCHIQ.
    await bothStatus(`?branchId=<o'z filiali> OCHIQ (shart)`,
      `/api/finance-analytics/summary?branchId=${branchA}`, profitPlusSalary, 200);
    // ISBOT: begona filial rad etiladi (assertBranchInScope).
    await bothStatus(`?branchId=<begona filial> RAD ETILDI`,
      `/api/finance-analytics/summary?branchId=${otherB.id}`, profitPlusSalary, 403);
    // Chegara TAHLIL QATLAMINING BARCHA kirish nuqtalarida bir xil.
    for (const p of ['receivables', 'cash-flow', 'directions', 'rooms', 'entries', 'discounts']) {
      const tk = ['receivables', 'cash-flow'].includes(p) ? null : profitPlusSalary;
      if (!tk) continue;
      await bothStatus(`${p}?branchId=<begona> RAD ETILDI`,
        `/api/finance-analytics/${p}?branchId=${otherB.id}`, tk, 403);
    }

    head('SALBIY NAZORAT — ruxsatsiz (token yo\'q) va noto\'g\'ri token');
    for (const p of ['summary', 'teachers', 'cash-flow', 'receivables']) {
      const e = await req(EXPRESS, 'GET', `/api/finance-analytics/${p}`);
      const n = await req(NEST, 'GET', `/api/finance-analytics/${p}`);
      try {
        assert.equal(e.status, 401, `Express ${e.status}`);
        assert.equal(n.status, 401, `NestJS ${n.status}`);
        ok(`${p} tokensiz — ikkalasi ham 401`);
      } catch (err) { bad(`${p} tokensiz`, err.message); }
    }

    head('SALBIY NAZORAT — moliya ruxsati UMUMAN yo\'q rol');
    const noFinance = await useRole('no_fin', ['classes.read']);
    for (const p of ['summary', 'entries', 'alerts', 'intelligence', 'budget', 'discounts',
      'cash-flow', 'receivables', 'teachers', 'rooms']) {
      await bothStatus(`${p} (moliya ruxsatisiz)`, `/api/finance-analytics/${p}`, noFinance, 403);
    }

    head('IJOBIY NAZORAT — alohida `cash-flow` va `receivables` ruxsatlari');
    const cashOnly = await useRole('fin_cash', ['finance.read', 'finance.view_cashflow']);
    for (const p of ['cash-flow', 'cash-flow/accounts', 'cash-flow/trend']) {
      await bothStatus(`${p} (view_cashflow)`, `/api/finance-analytics/${p}`, cashOnly, 200);
    }
    await bothStatus('receivables YOPIQ (cashflow ruxsati boshqa)', '/api/finance-analytics/receivables', cashOnly, 403);

    const recvOnly = await useRole('fin_recv', ['finance.read', 'finance.view_receivables']);
    for (const p of ['receivables', 'receivables/by/branch', 'receivables/by/student']) {
      await bothStatus(`${p} (view_receivables)`, `/api/finance-analytics/${p}`, recvOnly, 200);
    }
    await bothStatus('cash-flow YOPIQ (receivables ruxsati boshqa)', '/api/finance-analytics/cash-flow', recvOnly, 403);

    head('PARITET — cheklangan rol ostidagi TANALAR ham bir xil');
    // ⚠ 200 ni solishtirish yetarli emas: filial ko'lami TANANI
    // o'zgartiradi va u ham mos kelishi kerak.
    for (const p of ['summary', 'revenue/trend', 'expenses/breakdown', 'entries?limit=50', 'alerts', 'intelligence/briefing']) {
      const e = await req(EXPRESS, 'GET', `/api/finance-analytics/${p}`, { token: readOnly.express });
      const n = await req(NEST, 'GET', `/api/finance-analytics/${p}`, { token: readOnly.nest });
      try {
        assert.deepEqual(
          { status: n.status, body: normalize(n.body) },
          { status: e.status, body: normalize(e.body) },
        );
        ok(`${p} (finance.read tanasi) — ${e.status}`);
      } catch (err) { bad(`${p} (finance.read tanasi)`, String(err.message).slice(0, 700)); }
    }

  } finally {
    head('tozalash va baza siljishi');
    await restoreQa();
    for (const value of tempRoles) {
      await prisma.userBranchAssignment.updateMany({ where: { role: value }, data: { role: qaRestore?.role || 'staff' } }).catch(() => {});
      await prisma.role.deleteMany({ where: { value } }).catch(() => {});
    }
    // ⚠ TIKLASHNI BAZADAN O'LCHAYMIZ — "tozaladim" deb ishonmaymiz.
    const after = await prisma.user.findUnique({
      where: { id: qa.id },
      select: { role: true, branchAssignments: { select: { role: true } } },
    });
    const stray = await prisma.role.count({ where: { value: { in: tempRoles } } });
    try {
      assert.equal(after.role, qaRestore?.role ?? after.role, `qa_staff_a roli tiklanmadi: ${after.role}`);
      assert.equal(stray, 0, `${stray} ta vaqtinchalik rol qoldi`);
      for (const a of after.branchAssignments) {
        assert.ok(!tempRoles.includes(a.role), `filial birikmasida vaqtinchalik rol qoldi: ${a.role}`);
      }
      ok(`fikstura tiklandi (rol=${after.role}, qoldiq rol=0)`);
    } catch (err) { bad('fikstura tiklanishi', err.message); }

    /**
     * ── BAZA SILJISHI: "KIM YOZDI" DEGAN SAVOL ──
     *
     * Modul FAQAT O'QIYDI. Uning yagona yozuv yo'li —
     * `explanation.service.ts` dagi `prisma.cache.upsert`, va u
     * `narrationPort` ulanmagani uchun UMUMAN ishga tushmaydi.
     *
     * ⚠ Shuning uchun `Cache` QAT'IY tekshiriladi: u o'zgargan bo'lsa
     * AYB SHU MODULDA.
     *
     * Qolgan jadvallar (jurnal, to'lov, audit) BAZANI BAHAM KO'RADI:
     * qo'shni agentlarning testlari ayni paytda depozit qo'llash,
     * to'lov qabul qilish kabi amallarni bajaradi. Ularni "bu modul
     * bazani buzdi" deb o'qish YOLG'ON qizil bo'lardi. Shuning uchun
     * farq YASHIRILMAYDI — u OCHIQ yoziladi va eng oxirgi yozuvning
     * kimligi ko'rsatiladi, ya'ni odam uni ATRIBUTSIYA qila oladi.
     */
    const now = await snapshot();
    const drift = Object.entries(before)
      .filter(([k, v]) => v !== now[k])
      .map(([k, v]) => `${k}: ${v} → ${now[k]}`);

    if (before.cache !== now.cache) {
      bad("`Cache` siljidi — BU MODUL YOZGAN",
        `${before.cache} → ${now.cache} (izoh keshi: narrationPort ulanmagan bo'lsa yozilmasligi kerak edi)`);
    } else {
      ok("`Cache` siljimadi — modulning yagona yozuv yo'li ishga tushmadi");
    }

    if (!drift.length) {
      ok("baza umuman siljimadi — modul faqat o'qiydi (0 farq)");
    } else {
      const last = await prisma.journalEntry.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { kind: true, memo: true, createdAt: true, refModel: true },
      });
      note(`⚠ baham ko'rilgan jadvallarda siljish: ${drift.join(', ')}`);
      note(`   eng oxirgi jurnal yozuvi: ${last?.createdAt?.toISOString()} · `
        + `${last?.kind} · "${last?.memo}" · ref=${last?.refModel}`);
      note(`   bu modulda birorta yozuv metodi YO'Q (grep: create/update/delete/executeRaw → 0), `
        + `ya'ni siljish QO'SHNI AGENT testidan.`);
      ok("siljish shu modulga tegishli emas (yozuv yo'li yo'q, `Cache` o'zgarmagan)");
    }

    console.log(
      `\n  ${BOLD}Natija:${OFF} ${R.pass} o'tdi, ${R.fail} yiqildi, `
      + `${R.unmeasured} o'lchanmadi, ${R.blocked} bloklangan\n`,
    );
    await prisma.$disconnect();
    process.exitCode = R.fail ? 1 : 0;
  }
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
