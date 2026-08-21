/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 4 — LIDLAR MODULI PARITETI (14/16 marshrut + yo'naltirish dvigateli).
 *
 * ── ⚠ IKKI MARSHRUT ATAYLAB YO'Q ──
 *
 *   POST /leads/:id/convert
 *   POST /leads/convert-bulk
 *
 * Ular `GroupsService.addStudent` ga tayanadi va `groups` NestJS'da
 * HOZIRCHA FAQAT O'QISH (yozish metodlari yo'q — tekshirildi). Mantiq
 * NUSXALANMADI. Test ularning NestJS'da UMUMAN E'LON QILINMAGANINI
 * (404) tasdiqlaydi — ya'ni "scaffold qilingan, lekin ishlamaydi"
 * holatidan farqlanadi.
 *
 * ── ⚠ YO'NALTIRISH DVIGATELI HTTP ORQALI YETIB BO'LMAYDI ──
 *
 * `route()` FAQAT `!currentUser && !body.branchId` bo'lganda chaqiriladi
 * — ya'ni bot/webhook yo'lida. HTTP marshruti auth talab qiladi, demak
 * u yerdan hech qachon o'tmaydi. Shuning uchun PRETSEDENT (manba →
 * zaxira → asosiy filial) IKKI IMPLEMENTATSIYANI TO'G'RIDAN-TO'G'RI
 * chaqirib solishtiriladi — aks holda bu qoida umuman o'lchanmasdi.
 *
 * ── BAZA GIGIYENASI ──
 * Barcha fixture (`__parity_` prefiksli lid, qoida, katalog) yakunda
 * QATTIQ o'chiriladi; lid va qoida modellarida yumshoq o'chirish yo'q.
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

const VOLATILE = new Set([
  'createdAt', 'updatedAt', 'stack', 'closedAt', 'at',
  'followUpNotifiedAt', 'from', 'to',
]);
let ID_SUBS = [];
let NAME_RX = null;

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
    if (NAME_RX) s = s.replace(NAME_RX, '<PNAME>');
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
  console.log(`\n${BOLD}FAZA 4 — LIDLAR MODULI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  const before = {
    leads: await prisma.lead.count(),
    rules: await prisma.leadRoutingRule.count(),
    options: await prisma.leadOption.count(),
  };
  note(`boshlang'ich: lid=${before.leads}, qoida=${before.rules}, katalog=${before.options}`);

  const qa = await prisma.user.findFirst({
    where: { username: 'qa_staff_a' }, select: { id: true, homeBranchId: true },
  });
  if (!qa) { console.log('  ❌ qa_staff_a topilmadi'); process.exit(1); }

  const branchA = qa.homeBranchId;                       // aktyor filiali
  const otherB = await prisma.branch.findFirst({
    where: { isDeleted: false, id: { not: branchA } }, select: { id: true, name: true },
  });
  if (!otherB) { console.log("  ❌ ikkinchi filial yo'q"); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  NAME_RX = new RegExp(`${PREFIX}[a-z]*[en]?${stamp}`, 'g');

  const madeLeadIds = [];
  const madeRuleIds = [];
  const madeOptionIds = [];
  const tempRoles = [];
  let qaRestore = null;

  const subs = () => [
    ...madeLeadIds.map((id) => [id, '<LID>']),
    ...madeRuleIds.map((id) => [id, '<RID>']),
    ...madeOptionIds.map((id) => [id, '<OID>']),
    [branchA, '<BRANCH_A>'],
    [otherB.id, '<BRANCH_B>'],
    [qa.id, '<QA>'],
  ].filter(([f]) => Boolean(f));

  const stabilize = (body) => {
    if (!body || typeof body !== 'object' || !Array.isArray(body.data)) return body;
    const sorted = [...body.data].sort((x, y) =>
      String(x?.id ?? JSON.stringify(x)).localeCompare(String(y?.id ?? JSON.stringify(y))));
    return { ...body, data: sorted };
  };

  const both = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    ID_SUBS = subs();
    const en = { status: e.status, body: normalize(stabilize(e.body)) };
    const nn = { status: n.status, body: normalize(stabilize(n.body)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 650)}\n      nest   : ${JSON.stringify(nn).slice(0, 650)}`);
    }
    return { e, n };
  };

  /** Vaqtinchalik rol → `qa_staff_a` (rol VA filial birikmasi). */
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

  /** ⚠ TIKLASH API'GA TAYANMAYDI — bazaga to'g'ridan-to'g'ri. */
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

  /** Lid fixture (Prisma orqali — filialni aniq boshqarish uchun). */
  const makeLead = async (branchId, tag, extra = {}) => {
    const l = await prisma.lead.create({
      data: {
        branchId,
        firstName: `${PREFIX}${tag}${stamp}`,
        lastName: 'Test',
        phone: `9989${String(Date.now()).slice(-8)}`,
        status: 'new',
        statusHistory: [{ status: 'new', at: new Date().toISOString(), by: null }],
        ...extra,
      },
      select: { id: true },
    });
    madeLeadIds.push(l.id);
    return l.id;
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    //  A. BLOKLANGAN MARSHRUTLAR — SCAFFOLD EMAS, UMUMAN YO'Q
    // ═══════════════════════════════════════════════════════════════
    head("bloklangan marshrutlar (`groups.addStudent` yo'q)");

    for (const [label, path, body] of [
      ['POST /leads/convert-bulk', '/api/leads/convert-bulk', { leads: [] }],
      ['POST /leads/:id/convert', `/api/leads/${'a'.repeat(24)}/convert`, {}],
    ]) {
      const e = await req(EXPRESS, 'POST', path, { token: ownerToken, body });
      const n = await req(NEST, 'POST', path, { token: ownerToken, body });
      try {
        assert.equal(n.status, 404, `NestJS ${n.status} berdi (404 kutilgan)`);
        assert.notEqual(e.status, 404, `Express ham 404 berdi — marshrut yo'qmi?`);
        ok(`${label} — NestJS'da E'LON QILINMAGAN (404), Express ${e.status}`);
      } catch (err) { bad(label, err.message); }
    }
    note("bu ikkisi `GroupsService.addStudent` ko'chgach ochiladi — mantiq nusxalanmadi");

    // ═══════════════════════════════════════════════════════════════
    //  A2. ⚠ EXPRESS'DAGI O'LIK KOD — AYNAN TAKRORLANGAN (B13)
    //
    // `leadRouting.create` da shunday yozilgan:
    //     const sourceKey = isFallback ? null : ...;
    //     if (isFallback && sourceKey) throw 400;
    //
    // Ternar `sourceKey` ni ALLAQACHON `null` qilib qo'ygani uchun
    // ikkinchi shart HECH QACHON bajarilmaydi — ya'ni "zaxira qoidada
    // manba bo'lmaydi" degan 400 O'LIK KOD. Haqiqiy xulq: `sourceKey`
    // JIMGINA e'tiborsiz qoldiriladi va zaxira qoida YARATILADI.
    //
    // ⚠ Bu Express xulqi va u TUZATILMADI (paritet ishi emas). Test
    // uni "400 kutiladi" deb YOZMAYDI — aks holda yorliq yolg'on
    // bo'lardi. HAQIQIY natija qulflanadi.
    //
    // ⚠ Bu tekshiruv zaxira qoida YARATILISHIDAN OLDIN turadi: keyin
    // qo'yilsa noyoblik cheklovi (409) o'lik kodni YASHIRIB qo'yardi.
    // ═══════════════════════════════════════════════════════════════
    head("Express o'lik kodi: zaxira + manba (B13)");

    {
      const rulesNow = await prisma.leadRoutingRule.count();
      if (rulesNow !== 0) {
        skip('B13 o\'lik kod', `bazada ${rulesNow} ta qoida bor — TAXMIN QILINMADI`);
      } else {
        const madeHere = [];
        const e = await req(EXPRESS, 'POST', '/api/leads/routing', {
          token: ownerToken,
          body: { branchId: branchA, isFallback: true, sourceKey: 'IGNORED', note: `${PREFIX}dc1${stamp}` },
        });
        if (e.status === 201) { madeHere.push(e.body.data.id); madeRuleIds.push(e.body.data.id); }
        // Express yaratgan zaxirani olib tashlaymiz — aks holda NestJS
        // noyoblik chekloviga urilib, taqqoslash buzilardi.
        if (madeHere.length) {
          await prisma.leadRoutingRule.deleteMany({ where: { id: { in: madeHere } } });
          madeRuleIds.length = Math.max(0, madeRuleIds.length - madeHere.length);
        }
        const n = await req(NEST, 'POST', '/api/leads/routing', {
          token: ownerToken,
          body: { branchId: branchA, isFallback: true, sourceKey: 'IGNORED', note: `${PREFIX}dc2${stamp}` },
        });
        if (n.status === 201) madeRuleIds.push(n.body.data.id);

        try {
          assert.equal(n.status, e.status, `status ${e.status} ≠ ${n.status}`);
          assert.equal(e.status, 201, `kutilgan 201 (o'lik kod), olindi ${e.status}`);
          assert.equal(e.body.data.sourceKey, null, "express: sourceKey null EMAS");
          assert.equal(n.body.data.sourceKey, null, "nest: sourceKey null EMAS");
          assert.equal(e.body.data.isFallback, true);
          assert.equal(n.body.data.isFallback, true);
          ok('B13: `sourceKey` JIMGINA e\'tiborsiz qoldirildi, zaxira YARATILDI (ikkala stekda 201)');
        } catch (err) { bad('B13 o\'lik kod pariteti', err.message); }

        // Tozalash: keyingi bo'lim toza holatdan boshlashi kerak.
        await prisma.leadRoutingRule.deleteMany({ where: { note: { startsWith: PREFIX } } });
        madeRuleIds.length = 0;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  B. YO'NALTIRISH PRETSEDENTI — TO'G'RIDAN-TO'G'RI SOLISHTIRUV
    // ═══════════════════════════════════════════════════════════════
    head("yo'naltirish pretsedenti (manba → zaxira → asosiy filial)");

    let expressRouting = null;
    let nestRouting = null;
    try {
      expressRouting = await import(
        '../../server/src/modules/leads/services/leadRouting.service.js'
      );
      const { LeadRoutingService } = await import('../dist/modules/leads/lead-routing.service.js');
      const { BranchAccessService } = await import(
        '../dist/common/rbac/branch-access.service.js'
      );
      nestRouting = new LeadRoutingService(prisma, new BranchAccessService(prisma));

      const compareRoute = async (label, source) => {
        const e = await expressRouting.route({ source });
        const n = await nestRouting.route({ source });
        try {
          assert.deepEqual(
            { branchId: n.branchId, assigneeId: n.assigneeId, matchedBy: n.matchedBy },
            { branchId: e.branchId, assigneeId: e.assigneeId, matchedBy: e.matchedBy },
          );
          ok(`${label} → ${e.matchedBy} (ikkala stekda bir xil)`);
          return e;
        } catch (err) {
          bad(label, `express: ${JSON.stringify(e)}\n      nest   : ${JSON.stringify(n)}`);
          return e;
        }
      };

      // ── 3-QADAM: qoida YO'Q → ASOSIY FILIAL ──
      // ⚠ MUSBAT NAZORAT: bazada qoida yo'qligi OLDINDAN o'lchanadi,
      // aks holda "main_branch" natijasi tasodifiy bo'lardi.
      const ruleCount = await prisma.leadRoutingRule.count();
      if (ruleCount !== 0) {
        skip("asosiy filial zaxirasi", `bazada ${ruleCount} ta qoida bor — TAXMIN QILINMADI`);
      } else {
        const r = await compareRoute("qoida YO'Q → asosiy filial", 'instagram');
        try {
          assert.equal(r.matchedBy, 'main_branch');
          assert.ok(r.branchId, "branchId BO'SH — lid yo'qolardi!");
          ok(`lid yo'qolmadi: asosiy filialga tushdi (${r.branchId})`);
        } catch (err) { bad('asosiy filial zaxirasi', err.message); }
      }

      // ── 2-QADAM: ZAXIRA QOIDA ──
      const fb = await prisma.leadRoutingRule.create({
        data: { branchId: otherB.id, isFallback: true, note: `${PREFIX}fb${stamp}` },
        select: { id: true },
      });
      madeRuleIds.push(fb.id);
      const r2 = await compareRoute('zaxira qoida bor → fallback', 'instagram');
      try {
        assert.equal(r2.matchedBy, 'fallback');
        assert.equal(String(r2.branchId), String(otherB.id));
        ok('zaxira qoida asosiy filialdan USTUN');
      } catch (err) { bad('zaxira pretsedenti', err.message); }

      // ── 1-QADAM: MANBA QOIDASI ZAXIRADAN USTUN ──
      const srcRule = await prisma.leadRoutingRule.create({
        data: {
          branchId: branchA, sourceKey: 'instagram', priority: 100,
          note: `${PREFIX}src${stamp}`,
        },
        select: { id: true },
      });
      madeRuleIds.push(srcRule.id);
      const r3 = await compareRoute('manba qoidasi → source', 'instagram');
      try {
        assert.equal(r3.matchedBy, 'source');
        assert.equal(String(r3.branchId), String(branchA));
        ok('manba qoidasi ZAXIRADAN ustun');
      } catch (err) { bad('manba pretsedenti', err.message); }

      // ── PRIORITET: KICHIK RAQAM USTUN ──
      const srcRule2 = await prisma.leadRoutingRule.create({
        data: {
          branchId: otherB.id, sourceKey: 'instagram', priority: 5,
          note: `${PREFIX}src2${stamp}`,
        },
        select: { id: true },
      });
      madeRuleIds.push(srcRule2.id);
      const r4 = await compareRoute('ikki manba qoidasi → kichik priority', 'instagram');
      try {
        assert.equal(String(r4.branchId), String(otherB.id),
          'KICHIK priority (5) yutmadi — pretsedent buzilgan');
        ok('priority: KICHIK raqam USTUN (5 < 100)');
      } catch (err) { bad('priority pretsedenti', err.message); }

      // ── MOS KELMAGAN MANBA → ZAXIRAGA TUSHADI ──
      const r5 = await compareRoute("boshqa manba → zaxiraga tushdi", 'facebook');
      try {
        assert.equal(r5.matchedBy, 'fallback');
        ok("mos kelmagan manba ZAXIRAGA tushdi (manba qoidasi o'tkazib yuborildi)");
      } catch (err) { bad('mos kelmagan manba', err.message); }

      // ── NOFAOL QOIDA E'TIBORGA OLINMAYDI ──
      await prisma.leadRoutingRule.update({
        where: { id: srcRule2.id }, data: { isActive: false },
      });
      const r6 = await compareRoute("nofaol qoida o'tkazib yuborildi", 'instagram');
      try {
        assert.equal(String(r6.branchId), String(branchA),
          'nofaol qoida hali ham qo\'llanyapti');
        ok("nofaol qoida E'TIBORGA OLINMADI (keyingi priority yutdi)");
      } catch (err) { bad('nofaol qoida', err.message); }

      // ── MANBA KALITI: LeadOption ID → NOM ga aylanadi ──
      const opt = await prisma.leadOption.create({
        data: { kind: 'source', name: `${PREFIX}Instagram${stamp}` },
        select: { id: true, name: true },
      });
      madeOptionIds.push(opt.id);
      const keyRule = await prisma.leadRoutingRule.create({
        data: {
          branchId: branchA, sourceKey: opt.name.trim().toLowerCase(), priority: 1,
          note: `${PREFIX}key${stamp}`,
        },
        select: { id: true },
      });
      madeRuleIds.push(keyRule.id);
      const eKey = await expressRouting.resolveSourceKey(opt.id);
      const nKey = await nestRouting.resolveSourceKey(opt.id);
      try {
        assert.equal(nKey, eKey);
        assert.equal(eKey, opt.name.trim().toLowerCase());
        ok(`manba kaliti: LeadOption ID → nom ("${eKey}") — ikkala stekda bir xil`);
      } catch (err) { bad('manba kaliti', err.message); }
      await compareRoute('LeadOption ID bilan yo\'naltirish', opt.id);
    } catch (err) {
      skip("yo'naltirish pretsedenti", err.message);
    }

    // ═══════════════════════════════════════════════════════════════
    //  C. YO'NALTIRISH QOIDALARI — HTTP
    // ═══════════════════════════════════════════════════════════════
    head("yo'naltirish qoidalari (HTTP CRUD)");

    await both('GET /leads/routing', (b) =>
      req(b, 'GET', '/api/leads/routing', { token: ownerToken }));

    // ⚠ ODDIY QOIDADA MANBA MAJBURIY.
    await both("POST /routing (manba yo'q, zaxira emas → 400)", (b) =>
      req(b, 'POST', '/api/leads/routing', {
        token: ownerToken, body: { branchId: branchA },
      }));
    await both('POST /routing (filial topilmadi → 400)', (b) =>
      req(b, 'POST', '/api/leads/routing', {
        token: ownerToken, body: { branchId: 'a'.repeat(24), sourceKey: 'x' },
      }));

    // ⚠ ZAXIRA QOIDA FAQAT BITTA (qisman unique indeks → 409).
    const dupFb = await req(EXPRESS, 'POST', '/api/leads/routing', {
      token: ownerToken, body: { branchId: branchA, isFallback: true },
    });
    if (dupFb.status === 201) madeRuleIds.push(dupFb.body.data.id);
    try {
      assert.equal(dupFb.status, 409, `kutilgan 409, olindi ${dupFb.status}`);
      ok('ikkinchi zaxira qoida RAD ETILDI (409)');
    } catch (err) { bad('zaxira noyobligi', err.message); }

    const httpRule = { [EXPRESS]: null, [NEST]: null };
    await both('POST /routing (manba qoidasi)', async (b) => {
      const r = await req(b, 'POST', '/api/leads/routing', {
        token: ownerToken,
        body: {
          branchId: branchA,
          sourceKey: `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`,
          priority: 50, note: `${PREFIX}http${stamp}`,
        },
      });
      if (r.status === 201) { httpRule[b] = r.body.data.id; madeRuleIds.push(r.body.data.id); }
      return r;
    });

    if (httpRule[EXPRESS] && httpRule[NEST]) {
      await both('PATCH /routing/:id', (b) =>
        req(b, 'PATCH', `/api/leads/routing/${httpRule[b]}`, {
          token: ownerToken, body: { priority: 7, isActive: false },
        }));
      await both('DELETE /routing/:id', async (b) => {
        const r = await req(b, 'DELETE', `/api/leads/routing/${httpRule[b]}`, { token: ownerToken });
        if (r.status === 200) {
          const i = madeRuleIds.indexOf(httpRule[b]);
          if (i >= 0) madeRuleIds.splice(i, 1);
        }
        return r;
      });
    }
    await both('PATCH /routing/:id (404)', (b) =>
      req(b, 'PATCH', `/api/leads/routing/${'a'.repeat(24)}`, {
        token: ownerToken, body: { priority: 1 },
      }));
    await both('DELETE /routing/:id (404)', (b) =>
      req(b, 'DELETE', `/api/leads/routing/${'a'.repeat(24)}`, { token: ownerToken }));

    // ═══════════════════════════════════════════════════════════════
    //  D. LID CRUD — TELEFON VA YOPISH QOIDALARI
    // ═══════════════════════════════════════════════════════════════
    head('lid yaratish: telefon va yopish qoidalari');

    const phone1 = `99890${String(stamp).slice(0, 7)}`;
    const created = { [EXPRESS]: null, [NEST]: null };

    await both('POST /leads', async (b) => {
      const r = await req(b, 'POST', '/api/leads', {
        token: ownerToken,
        body: {
          firstName: `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`,
          lastName: 'Test', phone: phone1, branchId: branchA,
        },
      });
      if (r.status === 201) { created[b] = r.body.data.id; madeLeadIds.push(r.body.data.id); }
      return r;
    });

    // ⚠ TELEFON TAKRORLANISHI RUXSAT ETILADI (ATAYLAB). Bir odam
    // kuzda ingliz tili, bahorda matematika uchun murojaat qiladi.
    await both('POST /leads (AYNI telefon → 201, 409 EMAS)', async (b) => {
      const r = await req(b, 'POST', '/api/leads', {
        token: ownerToken,
        body: {
          firstName: `${PREFIX}dup${b === EXPRESS ? 'e' : 'n'}${stamp}`,
          phone: phone1, branchId: branchA,
        },
      });
      if (r.status === 201) madeLeadIds.push(r.body.data.id);
      return r;
    });

    // ⚠ ASOSIY VA QO'SHIMCHA RAQAM BIR XIL BO'LMAYDI — tekshiruv
    // NORMALIZATSIYADAN KEYIN ("+998 90..." va "99890..." bir xil).
    await both('POST /leads (asosiy == qo\'shimcha → 400)', (b) =>
      req(b, 'POST', '/api/leads', {
        token: ownerToken,
        body: {
          firstName: `${PREFIX}x${stamp}`, phone: phone1,
          parentPhone: phone1, branchId: branchA,
        },
      }));
    await both('POST /leads (formatlangan == xom → 400)', (b) =>
      req(b, 'POST', '/api/leads', {
        token: ownerToken,
        body: {
          firstName: `${PREFIX}y${stamp}`,
          phone: phone1,
          parentPhone: `+${phone1.slice(0, 3)} ${phone1.slice(3, 5)} ${phone1.slice(5)}`,
          branchId: branchA,
        },
      }));

    // ⚠ YOPISHDA IZOH MAJBURIY (kamida 10 belgi) VA SABAB TANLANGAN.
    await both("POST /leads (rejected, izoh yo'q → 400)", (b) =>
      req(b, 'POST', '/api/leads', {
        token: ownerToken,
        body: {
          firstName: `${PREFIX}r1${stamp}`, phone: `99891${String(stamp).slice(0, 7)}`,
          branchId: branchA, status: 'rejected',
        },
      }));
    await both('POST /leads (rejected, izoh QISQA → 400)', (b) =>
      req(b, 'POST', '/api/leads', {
        token: ownerToken,
        body: {
          firstName: `${PREFIX}r2${stamp}`, phone: `99892${String(stamp).slice(0, 7)}`,
          branchId: branchA, status: 'rejected', rejectionNote: 'yoq',
        },
      }));
    await both("POST /leads (rejected, sabab yo'q → 400)", (b) =>
      req(b, 'POST', '/api/leads', {
        token: ownerToken,
        body: {
          firstName: `${PREFIX}r3${stamp}`, phone: `99893${String(stamp).slice(0, 7)}`,
          branchId: branchA, status: 'rejected',
          rejectionNote: 'Narxi qimmat keldi, boshqa markazga ketdi',
        },
      }));

    await both("POST /leads (telefon yo'q → 400)", (b) =>
      req(b, 'POST', '/api/leads', {
        token: ownerToken, body: { firstName: `${PREFIX}z${stamp}`, branchId: branchA },
      }));

    // ═══════════════════════════════════════════════════════════════
    //  E. LID O'QISH VA FILTRLAR
    // ═══════════════════════════════════════════════════════════════
    head("lid o'qish: filtrlar, sahifalash, statistika");

    for (const q of [
      '', '?limit=5', '?status=new&limit=5', '?status=rejected&limit=5',
      '?assignedTo=none&limit=5', '?engagement=no_contact&limit=5',
      '?engagement=stale&limit=5', `?search=${PREFIX}`, '?page=2&limit=2',
      '?from=2020-01-01&to=2030-01-01&limit=5',
    ]) {
      await both(`GET /leads${q}`, (b) => req(b, 'GET', `/api/leads${q}`, { token: ownerToken }));
    }
    await both('GET /leads?status=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/leads?status=__yoq__', { token: ownerToken }));
    await both('GET /leads?engagement=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/leads?engagement=__yoq__', { token: ownerToken }));
    await both('GET /leads?limit=9999 → 400', (b) =>
      req(b, 'GET', '/api/leads?limit=9999', { token: ownerToken }));
    await both('GET /leads/:id (404)', (b) =>
      req(b, 'GET', `/api/leads/${'a'.repeat(24)}`, { token: ownerToken }));
    await both("GET /leads (token yo'q → 401)", (b) => req(b, 'GET', '/api/leads'));

    if (created[EXPRESS] && created[NEST]) {
      await both('GET /leads/:id', (b) =>
        req(b, 'GET', `/api/leads/${created[b]}`, { token: ownerToken }));
    }

    for (const q of ['', '?from=2020-01-01&to=2030-01-01']) {
      await both(`GET /leads/stats${q}`, (b) =>
        req(b, 'GET', `/api/leads/stats${q}`, { token: ownerToken }));
      await both(`GET /leads/conversion${q}`, (b) =>
        req(b, 'GET', `/api/leads/conversion${q}`, { token: ownerToken }));
    }
    await both('GET /leads/assignees', (b) =>
      req(b, 'GET', '/api/leads/assignees', { token: ownerToken }));

    // ⚠ MUSBAT NAZORAT: statistika BO'SH EMAS — aks holda yuqoridagi
    // solishtiruvlar "ikkalasi ham nol qaytardi" bo'lardi.
    const st = await req(EXPRESS, 'GET', '/api/leads/stats', { token: ownerToken });
    try {
      assert.ok((st.body?.data?.total || 0) > 0, "statistika BO'SH — solishtiruv ma'nosiz");
      ok(`MUSBAT NAZORAT: statistikada ${st.body.data.total} ta lid bor`);
    } catch (err) { bad("bo'sh statistika", err.message); }

    // ═══════════════════════════════════════════════════════════════
    //  F. YANGILASH — QAYTA OCHISH IZLARNI TOZALAYDI
    // ═══════════════════════════════════════════════════════════════
    head("yangilash: qayta ochish yopilish izlarini tozalaydi");

    if (created[EXPRESS] && created[NEST]) {
      await both('PATCH /leads/:id (ism)', (b) =>
        req(b, 'PATCH', `/api/leads/${created[b]}`, {
          token: ownerToken, body: { firstName: `${PREFIX}upd${stamp}` },
        }));
      await both("PATCH (bo'sh tana → 400)", (b) =>
        req(b, 'PATCH', `/api/leads/${created[b]}`, { token: ownerToken, body: {} }));

      // Yopamiz (izoh + sabab bilan).
      const reason = await prisma.leadOption.create({
        data: { kind: 'rejection', name: `${PREFIX}reason${stamp}` },
        select: { id: true },
      });
      madeOptionIds.push(reason.id);

      await both('PATCH → rejected (izoh + sabab)', (b) =>
        req(b, 'PATCH', `/api/leads/${created[b]}`, {
          token: ownerToken,
          body: {
            status: 'rejected', rejectionReasonId: reason.id,
            rejectionNote: 'Narxi qimmat keldi, boshqa markazni tanladi',
          },
        }));
      const closed = await prisma.lead.findUnique({
        where: { id: created[EXPRESS] },
        select: { closedAt: true, rejectionNote: true, rejectionReasonId: true },
      });
      try {
        assert.ok(closed.closedAt, "closedAt qo'yilmadi");
        assert.ok(closed.rejectionNote);
        assert.equal(closed.rejectionReasonId, reason.id);
        ok("yopilganda: closedAt, izoh va sabab SAQLANDI");
      } catch (err) { bad('yopilish izlari', err.message); }

      // ⚠ QAYTA OCHISH: yopilish izlari TOZALANADI — aks holda
      // "yopilgan lidlar" hisoboti SHISHIB ketardi (lid ikki marta
      // sanalardi).
      await both('PATCH → qayta ochish (new)', (b) =>
        req(b, 'PATCH', `/api/leads/${created[b]}`, {
          token: ownerToken, body: { status: 'new' },
        }));
      const reopened = await prisma.lead.findUnique({
        where: { id: created[EXPRESS] },
        select: { closedAt: true, rejectionNote: true, rejectionReasonId: true, statusHistory: true },
      });
      try {
        assert.equal(reopened.closedAt, null, 'closedAt TOZALANMADI');
        assert.equal(reopened.rejectionNote, '', 'rejectionNote TOZALANMADI');
        assert.equal(reopened.rejectionReasonId, null, 'rejectionReasonId TOZALANMADI');
        assert.ok(reopened.statusHistory.length >= 3, 'statusHistory yozilmadi');
        ok('qayta ochishda yopilish izlari TOZALANDI, tarix esa SAQLANDI');
      } catch (err) { bad('qayta ochish', err.message); }

      // ⚠ TELEFON TEGILMAGANDA "bir xil raqam" tekshiruvi
      // ISHLAMASLIGI kerak — eski lidlarda ikkala raqam bir xil
      // bo'lishi mumkin va faqat ISMNI tahrirlash bloklanmasin.
      const legacyId = await makeLead(branchA, 'legacy', {
        phone: '998900000001', parentPhone: '998900000001',
      });
      const legE = await req(EXPRESS, 'PATCH', `/api/leads/${legacyId}`, {
        token: ownerToken, body: { firstName: `${PREFIX}legacy2${stamp}` },
      });
      const legN = await req(NEST, 'PATCH', `/api/leads/${legacyId}`, {
        token: ownerToken, body: { lastName: 'Yangi' },
      });
      try {
        assert.equal(legE.status, 200, `express ${legE.status}`);
        assert.equal(legN.status, 200, `nest ${legN.status}`);
        ok("eski lid (ikkala raqam bir xil) ISMINI tahrirlash BLOKLANMADI");
      } catch (err) { bad('eski lid tahriri', err.message); }
    }

    // ═══════════════════════════════════════════════════════════════
    //  G. ESLATMALAR
    // ═══════════════════════════════════════════════════════════════
    head('eslatmalar (bitta va ommaviy)');

    if (created[EXPRESS] && created[NEST]) {
      await both("POST /:id/reminder (o'rnatish)", (b) =>
        req(b, 'POST', `/api/leads/${created[b]}/reminder`, {
          token: ownerToken,
          body: { followUpAt: '2030-01-01T10:00:00.000Z', followUpNote: 'Qayta qo\'ng\'iroq' },
        }));
      // ⚠ XABAR NATIJAGA QARAB O'ZGARADI: o'chirilganda "o'rnatildi"
      // deyish foydalanuvchini chalg'itardi.
      await both("POST /:id/reminder (o'chirish → boshqa xabar)", (b) =>
        req(b, 'POST', `/api/leads/${created[b]}/reminder`, {
          token: ownerToken, body: { followUpAt: null },
        }));
      await both('POST /:id/reminder (404)', (b) =>
        req(b, 'POST', `/api/leads/${'a'.repeat(24)}/reminder`, {
          token: ownerToken, body: { followUpAt: null },
        }));
    }

    // ⚠ OMMAVIY: takrorlangan ID → 400 (butun so'rov rad etiladi).
    await both('POST /reminder-bulk (takroriy ID → 400)', (b) =>
      req(b, 'POST', '/api/leads/reminder-bulk', {
        token: ownerToken,
        body: { ids: [created[EXPRESS] || 'a'.repeat(24), created[EXPRESS] || 'a'.repeat(24)] },
      }));
    await both("POST /reminder-bulk (bo'sh ro'yxat → 400)", (b) =>
      req(b, 'POST', '/api/leads/reminder-bulk', { token: ownerToken, body: { ids: [] } }));
    await both('POST /reminder-bulk (201 dan ko\'p → 400)', (b) =>
      req(b, 'POST', '/api/leads/reminder-bulk', {
        token: ownerToken,
        body: { ids: Array.from({ length: 201 }, (_, i) => `${'a'.repeat(23)}${i % 10}`) },
      }));

    // ⚠ QISMAN MUVAFFAQIYAT: bittasi topilmasa QOLGANLARI baribir
    // o'rnatiladi va nima yiqilgani qaytariladi (tranzaksiya YO'Q).
    if (created[EXPRESS]) {
      const mixed = await req(EXPRESS, 'POST', '/api/leads/reminder-bulk', {
        token: ownerToken,
        body: {
          ids: [created[EXPRESS], 'b'.repeat(24)],
          followUpAt: '2030-02-01T10:00:00.000Z',
        },
      });
      try {
        assert.equal(mixed.status, 200);
        assert.equal(mixed.body.data.updated.length, 1, 'bittasi o\'rnatilishi kerak edi');
        assert.equal(mixed.body.data.failed.length, 1, 'bittasi yiqilishi kerak edi');
        ok('ommaviy eslatma QISMAN bajarildi (1 o\'rnatildi, 1 yiqildi)');
      } catch (err) { bad('qisman ommaviy', err.message); }
    }

    // ═══════════════════════════════════════════════════════════════
    //  H. RUXSAT VA FILIAL IZOLYATSIYASI
    // ═══════════════════════════════════════════════════════════════
    head("ruxsat va filial izolyatsiyasi");

    try {
      const readToken = await useRole('leadsread', ['leads.read']);

      // ⚠ MUSBAT NAZORAT: `leads.read` bilan RO'YXAT ochiladi — pastdagi
      // 403 lar "umuman kira olmaydi" degani EMAS.
      const posE = await req(EXPRESS, 'GET', '/api/leads?limit=3', { token: readToken });
      const posN = await req(NEST, 'GET', '/api/leads?limit=3', { token: readToken });
      if (posE.status !== 200 || posN.status !== 200) {
        throw new Error(`musbat nazorat 200 BERMADI (${posE.status}/${posN.status})`);
      }
      await both("MUSBAT NAZORAT: `leads.read` ro'yxatni ochadi → 200", (b) =>
        req(b, 'GET', '/api/leads?limit=3', { token: readToken }));
      await both('MUSBAT NAZORAT: `leads.read` assignees → 200', (b) =>
        req(b, 'GET', '/api/leads/assignees', { token: readToken }));
      await both('MUSBAT NAZORAT: `leads.read` conversion → 200', (b) =>
        req(b, 'GET', '/api/leads/conversion', { token: readToken }));

      for (const [label, call] of [
        ['POST /leads', (b) => req(b, 'POST', '/api/leads', {
          token: readToken,
          body: { firstName: 'x', phone: '998900000009', branchId: branchA } })],
        ['PATCH /leads/:id', (b) => req(b, 'PATCH', `/api/leads/${created[b] || 'a'.repeat(24)}`, {
          token: readToken, body: { notes: 'x' } })],
        ['DELETE /leads/:id', (b) => req(b, 'DELETE', `/api/leads/${created[b] || 'a'.repeat(24)}`, {
          token: readToken })],
        ['POST /:id/reminder', (b) => req(b, 'POST', `/api/leads/${created[b] || 'a'.repeat(24)}/reminder`, {
          token: readToken, body: { followUpAt: null } })],
        ['GET /leads/routing', (b) => req(b, 'GET', '/api/leads/routing', { token: readToken })],
        ['POST /leads/routing', (b) => req(b, 'POST', '/api/leads/routing', {
          token: readToken, body: { branchId: branchA, sourceKey: 'x' } })],
      ]) {
        await both(`\`leads.read\` yetarli emas → ${label} 403`, call);
      }

      // ── FILIAL IZOLYATSIYASI ──
      //
      // ⚠ SHART O'ZIMIZ QURILADI: aktyor filialida BIR lid, begona
      // filialda BOSHQA lid — ikkalasi ham bir xil qidiruv so'zi bilan.
      const ownLeadId = await makeLead(branchA, 'own');
      const foreignLeadId = await makeLead(otherB.id, 'foreign');
      ID_SUBS = subs();

      // MUSBAT NAZORAT: owner IKKALASINI ham ko'radi.
      const asOwner = await req(EXPRESS, 'GET', `/api/leads?search=${PREFIX}&limit=200`, {
        token: ownerToken,
      });
      const ownerIds = (asOwner.body?.data || []).map((l) => l.id);
      try {
        assert.ok(ownerIds.includes(ownLeadId) && ownerIds.includes(foreignLeadId),
          'owner ikkala lidni ham ko\'rmadi');
        ok('MUSBAT NAZORAT: owner IKKALA filial lidini ham ko\'radi');
      } catch (err) { bad('owner ko\'rinishi', err.message); }

      // ⚠ KO'LAM HAR IKKALA STEKDA ALOHIDA tekshiriladi.
      for (const [label, base] of [['express', EXPRESS], ['nest', NEST]]) {
        const r = await req(base, 'GET', `/api/leads?search=${PREFIX}&limit=200`, {
          token: readToken,
        });
        const ids = (r.body?.data || []).map((l) => l.id);
        try {
          assert.ok(ids.includes(ownLeadId), `${label}: o'z filiali lidi TOPILMADI`);
          assert.ok(!ids.includes(foreignLeadId),
            `${label}: BEGONA filial lidi TOPILDI — KO'LAM SIZDI!`);
          ok(`${label}: filial ko'lami KESDI (o'ziniki bor, begonasi yo'q)`);
        } catch (err) { bad(`${label} filial ko'lami`, err.message); }
      }

      // ⚠ OMMAVIY ESLATMA HAM KO'LAMGA BO'YSUNADI: begona filial lidi
      // `failed` ga tushadi, `updated` ga EMAS.
      const bulkToken = await useRole('leadsupd', ['leads.read', 'leads.update']);
      const bulkE = await req(EXPRESS, 'POST', '/api/leads/reminder-bulk', {
        token: bulkToken,
        body: { ids: [ownLeadId, foreignLeadId], followUpAt: '2030-03-01T10:00:00.000Z' },
      });
      const bulkN = await req(NEST, 'POST', '/api/leads/reminder-bulk', {
        token: bulkToken,
        body: { ids: [ownLeadId, foreignLeadId], followUpAt: '2030-03-01T10:00:00.000Z' },
      });
      for (const [label, r] of [['express', bulkE], ['nest', bulkN]]) {
        try {
          assert.equal(r.status, 200, `${label} ${r.status}`);
          assert.deepEqual(r.body.data.updated, [ownLeadId], `${label}: updated noto'g'ri`);
          assert.equal(r.body.data.failed.length, 1, `${label}: failed noto'g'ri`);
          assert.equal(r.body.data.failed[0].leadId, foreignLeadId,
            `${label}: BEGONA lidga eslatma qo'yildi — KO'LAM SIZDI!`);
          ok(`${label}: ommaviy eslatmada begona filial lidi RAD ETILDI`);
        } catch (err) { bad(`${label} ommaviy ko'lam`, err.message); }
      }

      await restoreQa();
    } catch (err) {
      skip('ruxsat va filial izolyatsiyasi', err.message);
      await restoreQa().catch(() => {});
    }

    // ═══════════════════════════════════════════════════════════════
    //  I. O'CHIRISH (QATTIQ)
    // ═══════════════════════════════════════════════════════════════
    head("o'chirish (QATTIQ — yumshoq o'chirish YO'Q)");

    if (created[EXPRESS] && created[NEST]) {
      await both('DELETE /leads/:id', async (b) => {
        const r = await req(b, 'DELETE', `/api/leads/${created[b]}`, { token: ownerToken });
        if (r.status === 200) {
          const i = madeLeadIds.indexOf(created[b]);
          if (i >= 0) madeLeadIds.splice(i, 1);
        }
        return r;
      });
      const gone = await prisma.lead.count({
        where: { id: { in: [created[EXPRESS], created[NEST]] } },
      });
      try {
        assert.equal(gone, 0, "lid bazada QOLDI — qattiq o'chirish ishlamadi");
        ok("qattiq o'chirish: qator BAZADAN yo'qoldi (ikkala stekda)");
      } catch (err) { bad("qattiq o'chirish", err.message); }
    }
    await both('DELETE /leads/:id (404)', (b) =>
      req(b, 'DELETE', `/api/leads/${'a'.repeat(24)}`, { token: ownerToken }));
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

    // Lidlar → qoidalar → kataloglar (FK tartibi).
    const lDel = await prisma.lead.deleteMany({ where: { firstName: { startsWith: PREFIX } } });
    cleaned += lDel.count;
    const rDel = await prisma.leadRoutingRule.deleteMany({
      where: { note: { startsWith: PREFIX } },
    });
    cleaned += rDel.count;
    if (madeRuleIds.length) {
      const r2 = await prisma.leadRoutingRule.deleteMany({ where: { id: { in: madeRuleIds } } });
      cleaned += r2.count;
    }
    const oDel = await prisma.leadOption.deleteMany({ where: { name: { startsWith: PREFIX } } });
    cleaned += oDel.count;

    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    const after = {
      leads: await prisma.lead.count(),
      rules: await prisma.leadRoutingRule.count(),
      options: await prisma.leadOption.count(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (lid=${after.leads}, qoida=${after.rules}, katalog=${after.options})`);
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
