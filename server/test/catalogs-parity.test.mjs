/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 3/4 — KICHIK KATALOGLAR PARITETI (17 marshrut).
 *
 *   `/api/lead-options`        (4)  — lid manbasi / yo'nalish / rad sababi
 *   `/api/feedback-types`      (5)
 *   `/api/archive-reasons`     (6)  — + sabab bo'yicha hisobot
 *   `/api/attendance-settings` (2)  — yagona qatorli sozlama
 *
 * ── NEGA BITTA FAYLDA ──
 * To'rttasi ham bir xil shaklda: o'qish OCHIQ (yoki bitta ruxsat),
 * yozish esa OWNER roli **VA** modul ruxsatini BIRGA talab qiladi.
 * Bitta vaqtinchalik rol to'plami hammasini qamraydi va login
 * chegarasini (5 daqiqada 20) tejaydi.
 *
 * ── «ROL VA RUXSAT» (AND) — UCH ROL BILAN AJRATILADI ──
 *
 *   A) faqat RUXSATLAR (roleType=staff) → 403 (rol yarmi yiqiladi)
 *   B) faqat ROL (roleType=owner)       → 403 (ruxsat yarmi yiqiladi)
 *   C) IKKALASI                         → 2xx (MUSBAT NAZORAT)
 *
 * ⚠ (C) BO'LMASA (A) va (B) HECH NARSA ISBOTLAMASDI.
 *
 * ── ⚠ MARSHRUT TARTIBI ──
 * `GET /archive-reasons/report` `GET /:id` DAN OLDIN turishi SHART.
 * Aks holda "report" sabab ID'si deb o'qilardi: hisobot 404 berardi VA
 * `/report` dagi OWNER to'sig'i jimgina yo'qolardi (`/:id` ochiq).
 * Bu ALOHIDA tekshiriladi.
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

const VOLATILE = new Set(['createdAt', 'updatedAt', 'stack']);

/**
 * Sinov nomlari naqshi — `main()` da `stamp` ma'lum bo'lgach to'ldiriladi.
 * Modul darajasida turadi, chunki `normalize` undan foydalanadi.
 */
let NAME_RX = null;

const normalize = (v, subs) => {
  if (Array.isArray(v)) return v.map((x) => normalize(x, subs));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (VOLATILE.has(k)) continue;
      out[k] = normalize(val, subs);
    }
    return out;
  }
  if (typeof v === 'string') {
    let s = v;
    for (const [from, to] of subs) if (from) s = s.split(from).join(to);
    // Stekka xos sinov NOMLARI naqsh bo'yicha bir xil belgiga tushadi.
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

const MANAGE_KEYS = [
  'leads.manage',
  'feedback_types.manage',
  'archive_reasons.manage',
  'attendance.manage',
  'attendance.read',
];

const main = async () => {
  console.log(`\n${BOLD}FAZA 3/4 — KICHIK KATALOGLAR PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  // ── BOSHLANG'ICH SURAT ──
  const before = {
    leadOptions: await prisma.leadOption.count(),
    feedbackTypes: await prisma.feedbackType.count(),
    archiveReasons: await prisma.archiveReason.count(),
  };
  const attendanceBefore = await prisma.attendanceSettings.findUnique({ where: { id: 'default' } });
  note(`boshlang'ich: leadOption=${before.leadOptions}, feedbackType=${before.feedbackTypes}, archiveReason=${before.archiveReasons}`);

  const qa = await prisma.user.findFirst({ where: { username: 'qa_staff_a' }, select: { id: true } });
  if (!qa) { console.log('  ❌ qa_staff_a topilmadi'); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const made = { leadOption: [], feedbackType: [], archiveReason: [] };
  const tempRoleValues = [];
  let qaRestore = null;

  const created = {};   // { modul: { base: id } }
  const nameOf = (b, tag) => `${PREFIX}${tag}${b === EXPRESS ? 'e' : 'n'}${stamp}`;

  /**
   * ⚠ IKKALA STEKNING YOZUVI HAR IKKALA JAVOBDA KO'RINADI (baza UMUMIY),
   * va ular FAQAT stek harfi bilan farq qiladi (`...e<stamp>` /
   * `...n<stamp>`). Ikkalasi ham BIR XIL belgiga tushiriladi.
   *
   * ⚠ RO'YXAT EMAS, NAQSH ISHLATILADI. Ilgari bu yerda qo'lda sanab
   * chiqilgan teglar (`lo`/`ft`/`ar`) bor edi va (C) bosqichida
   * yaratilgan `__parity_c…` nomlari RO'YXATGA TUSHMAY QOLDI — natijada
   * uchta tekshiruv "farq bor" deb yiqildi, aslida ikkala stek ham
   * to'g'ri 201 qaytargan edi. Naqsh bunday kamchilikni butunlay
   * yo'q qiladi.
   */
  NAME_RX = new RegExp(`${PREFIX}[a-z]*[en]?${stamp}`, 'g');

  const subs = () => {
    // ID'lar — shu yurishda yaratilgan HAMMASI (ikkala stekniki ham).
    const allIds = [
      ...made.leadOption, ...made.feedbackType, ...made.archiveReason,
    ];
    return allIds.filter(Boolean).map((id) => [id, '<PID>']);
  };

  /**
   * ⚠ RO'YXAT TARTIBI BARQARORLASHTIRILADI: bu kataloglar
   * `createdAt desc` bo'yicha saralanadi va IKKILAMCHI TARTIB YO'Q —
   * teng vaqtli qatorlar orasida tartib kafolatlanmagan (B9 bilan bir
   * xil kamchilik). Mazmun to'liq solishtiriladi, faqat tartib emas.
   */
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
    const en = { status: e.status, body: normalize(stabilize(e.body), subs()) };
    const nn = { status: n.status, body: normalize(stabilize(n.body), subs()) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 600)}\n      nest   : ${JSON.stringify(nn).slice(0, 600)}`);
    }
    return { e, n };
  };

  /** Vaqtinchalik rol yaratib `qa_staff_a` ga BERADI (rol + filial birikmasi). */
  const useRole = async (label, { permissionKeys = [], roleType }) => {
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
    const body = { label: `${PREFIX}${label}${stamp}`, permissionIds: ids };
    if (roleType) body.roleType = roleType;
    const r = await req(EXPRESS, 'POST', '/api/roles', { token: ownerToken, body });
    if (r.status !== 201) throw new Error(`rol yaratilmadi (${label}): ${r.status}`);
    const value = r.body.data.value;
    tempRoleValues.push(value);

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

    // ⚠ ROL IKKALA JOYDA — amaldagi rolni filial birikmasi beradi.
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

  /** ⚠ TIKLASH API'GA TAYANMAYDI — bazaga to'g'ridan-to'g'ri yozadi. */
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

  try {
    // ═══════════════════ LEAD OPTIONS ═══════════════════
    head('lead-options (4 marshrut)');

    for (const q of ['', '?kind=source', '?kind=direction', '?kind=rejection',
                     '?includeInactive=true', '?search=__yoq__']) {
      await both(`GET /lead-options${q}`, (b) =>
        req(b, 'GET', `/api/lead-options${q}`, { token: ownerToken }));
    }
    await both('GET /lead-options?kind=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/lead-options?kind=__yoq__', { token: ownerToken }));
    await both("GET /lead-options (token yo'q → 401)", (b) => req(b, 'GET', '/api/lead-options'));

    created.leadOption = {};
    await both('POST /lead-options', async (b) => {
      const r = await req(b, 'POST', '/api/lead-options', {
        token: ownerToken, body: { kind: 'source', name: nameOf(b, 'lo') },
      });
      if (r.status === 201) { created.leadOption[b] = r.body.data.id; made.leadOption.push(r.body.data.id); }
      return r;
    });
    await both("POST /lead-options (noto'g'ri kind → 400)", (b) =>
      req(b, 'POST', '/api/lead-options', {
        token: ownerToken, body: { kind: '__yoq__', name: 'x' },
      }));
    if (created.leadOption[EXPRESS] && created.leadOption[NEST]) {
      await both('PATCH /lead-options/:id', (b) =>
        req(b, 'PATCH', `/api/lead-options/${created.leadOption[b]}`, {
          token: ownerToken, body: { name: `${nameOf(b, 'lo')}` },
        }));
      await both("PATCH /lead-options/:id (bo'sh tana → 400)", (b) =>
        req(b, 'PATCH', `/api/lead-options/${created.leadOption[b]}`, {
          token: ownerToken, body: {},
        }));
      await both('DELETE /lead-options/:id', (b) =>
        req(b, 'DELETE', `/api/lead-options/${created.leadOption[b]}`, { token: ownerToken }));
    }
    await both('PATCH /lead-options/:id (404)', (b) =>
      req(b, 'PATCH', `/api/lead-options/${'a'.repeat(24)}`, {
        token: ownerToken, body: { name: 'x' },
      }));

    // ═══════════════════ FEEDBACK TYPES ═══════════════════
    head('feedback-types (5 marshrut)');

    for (const q of ['', '?limit=5', '?includeInactive=true&limit=5', '?search=__yoq__', '?page=2&limit=2']) {
      await both(`GET /feedback-types${q}`, (b) =>
        req(b, 'GET', `/api/feedback-types${q}`, { token: ownerToken }));
    }
    await both('GET /feedback-types/:id (404)', (b) =>
      req(b, 'GET', `/api/feedback-types/${'a'.repeat(24)}`, { token: ownerToken }));

    created.feedbackType = {};
    await both('POST /feedback-types', async (b) => {
      const r = await req(b, 'POST', '/api/feedback-types', {
        token: ownerToken, body: { name: nameOf(b, 'ft') },
      });
      if (r.status === 201) { created.feedbackType[b] = r.body.data.id; made.feedbackType.push(r.body.data.id); }
      return r;
    });
    if (created.feedbackType[EXPRESS] && created.feedbackType[NEST]) {
      // ⚠ NOYOBLIK FAQAT FAOL turlar orasida (qisman unique indeks).
      await both('POST /feedback-types (takroriy nom → 409)', (b) =>
        req(b, 'POST', '/api/feedback-types', {
          token: ownerToken, body: { name: nameOf(b, 'ft') },
        }));
      await both('GET /feedback-types/:id', (b) =>
        req(b, 'GET', `/api/feedback-types/${created.feedbackType[b]}`, { token: ownerToken }));
      await both('PATCH /feedback-types/:id', (b) =>
        req(b, 'PATCH', `/api/feedback-types/${created.feedbackType[b]}`, {
          token: ownerToken, body: { name: nameOf(b, 'ft') },
        }));
      await both('DELETE /feedback-types/:id', (b) =>
        req(b, 'DELETE', `/api/feedback-types/${created.feedbackType[b]}`, { token: ownerToken }));

      // ⚠ YUMSHOQ O'CHIRISHDAN KEYIN O'SHA NOM QAYTA ISHLATILADI —
      // noyoblik faqat `isActive` qatorlar orasida.
      const reuse = await req(EXPRESS, 'POST', '/api/feedback-types', {
        token: ownerToken, body: { name: nameOf(EXPRESS, 'ft') },
      });
      if (reuse.status === 201) made.feedbackType.push(reuse.body.data.id);
      try {
        assert.equal(reuse.status, 201, `o'chirilgan nom qayta ishlatilmadi (${reuse.status})`);
        ok("yumshoq o'chirishdan keyin o'sha nom QAYTA ishlatiladi (409 EMAS)");
      } catch (err) { bad('nom qayta ishlatilmadi', err.message); }
    }

    // ═══════════════════ ARCHIVE REASONS ═══════════════════
    head('archive-reasons (6 marshrut)');

    for (const q of ['', '?limit=5', '?includeInactive=true&limit=5', '?search=__yoq__']) {
      await both(`GET /archive-reasons${q}`, (b) =>
        req(b, 'GET', `/api/archive-reasons${q}`, { token: ownerToken }));
    }
    await both('GET /archive-reasons/:id (404)', (b) =>
      req(b, 'GET', `/api/archive-reasons/${'a'.repeat(24)}`, { token: ownerToken }));

    // ⚠⚠ MARSHRUT TARTIBI: `/report` sabab ID'si DEB O'QILMASLIGI SHART.
    const repE = await req(EXPRESS, 'GET', '/api/archive-reasons/report', { token: ownerToken });
    const repN = await req(NEST, 'GET', '/api/archive-reasons/report', { token: ownerToken });
    try {
      assert.equal(repE.status, 200, `express /report ${repE.status}`);
      assert.equal(repN.status, 200, `nest /report ${repN.status}`);
      assert.ok(Array.isArray(repE.body.data), 'express /report massiv qaytarmadi');
      assert.ok(Array.isArray(repN.body.data), 'nest /report massiv qaytarmadi');
      ok('MARSHRUT TARTIBI: `/report` hisobot qaytardi (sabab ID deb O\'QILMADI)');
    } catch (err) { bad('/report marshrut tartibi', err.message); }

    for (const q of ['', '?action=archive', '?action=restore', '?from=2020-01-01&to=2030-01-01']) {
      await both(`GET /archive-reasons/report${q}`, (b) =>
        req(b, 'GET', `/api/archive-reasons/report${q}`, { token: ownerToken }));
    }
    await both('GET /archive-reasons/report?action=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/archive-reasons/report?action=__yoq__', { token: ownerToken }));

    created.archiveReason = {};
    await both('POST /archive-reasons', async (b) => {
      const r = await req(b, 'POST', '/api/archive-reasons', {
        token: ownerToken, body: { title: nameOf(b, 'ar') },
      });
      if (r.status === 201) { created.archiveReason[b] = r.body.data.id; made.archiveReason.push(r.body.data.id); }
      return r;
    });
    if (created.archiveReason[EXPRESS] && created.archiveReason[NEST]) {
      await both('GET /archive-reasons/:id', (b) =>
        req(b, 'GET', `/api/archive-reasons/${created.archiveReason[b]}`, { token: ownerToken }));
      await both('PATCH /archive-reasons/:id', (b) =>
        req(b, 'PATCH', `/api/archive-reasons/${created.archiveReason[b]}`, {
          token: ownerToken, body: { title: nameOf(b, 'ar') },
        }));
      await both('DELETE /archive-reasons/:id', (b) =>
        req(b, 'DELETE', `/api/archive-reasons/${created.archiveReason[b]}`, { token: ownerToken }));
    }

    // ═══════════════════ ATTENDANCE SETTINGS ═══════════════════
    head('attendance-settings (2 marshrut)');

    await both('GET /attendance-settings', (b) =>
      req(b, 'GET', '/api/attendance-settings', { token: ownerToken }));
    await both('PATCH /attendance-settings', (b) =>
      req(b, 'PATCH', '/api/attendance-settings', {
        token: ownerToken, body: { lowAttendanceThreshold: 55, consecutiveAbsencesAlert: 4 },
      }));
    await both("PATCH (bo'sh tana → 400)", (b) =>
      req(b, 'PATCH', '/api/attendance-settings', { token: ownerToken, body: {} }));
    await both('PATCH (threshold 101 → 400)', (b) =>
      req(b, 'PATCH', '/api/attendance-settings', {
        token: ownerToken, body: { lowAttendanceThreshold: 101 },
      }));
    await both('PATCH (consecutive 0 → 400)', (b) =>
      req(b, 'PATCH', '/api/attendance-settings', {
        token: ownerToken, body: { consecutiveAbsencesAlert: 0 },
      }));

    // ⚠ `_id` KLIENT UCHUN SHART (useEffect bog'liqligi).
    const asE = await req(EXPRESS, 'GET', '/api/attendance-settings', { token: ownerToken });
    const asN = await req(NEST, 'GET', '/api/attendance-settings', { token: ownerToken });
    try {
      assert.equal(asE.body.data._id, 'default');
      assert.equal(asN.body.data._id, 'default');
      ok("`_id` javobda BOR (klient useEffect bog'liqligi uchun shart)");
    } catch (err) { bad('`_id` yo\'q', err.message); }

    // ═══════════════════ «ROL VA RUXSAT» (AND) ═══════════════════
    head('«rol VA ruxsat» (AND) — uch rol bilan ajratilgan');

    try {
      // ── (A) FAQAT RUXSATLAR ──
      const tokenA = await useRole('permonly', { permissionKeys: MANAGE_KEYS });

      // MUSBAT NAZORAT: aktyor kataloglarni O'QIY oladi.
      const readA = await req(EXPRESS, 'GET', '/api/lead-options', { token: tokenA });
      if (readA.status !== 200) throw new Error(`(A) o'qiy olmadi: ${readA.status}`);
      await both("MUSBAT NAZORAT: (A) kataloglarni O'QIYDI → 200", (b) =>
        req(b, 'GET', '/api/lead-options', { token: tokenA }));
      await both('MUSBAT NAZORAT: (A) attendance-settings O\'QIYDI → 200', (b) =>
        req(b, 'GET', '/api/attendance-settings', { token: tokenA }));

      for (const [label, call] of [
        ['POST /lead-options', (b) => req(b, 'POST', '/api/lead-options', {
          token: tokenA, body: { kind: 'source', name: `${PREFIX}a${stamp}` } })],
        ['POST /feedback-types', (b) => req(b, 'POST', '/api/feedback-types', {
          token: tokenA, body: { name: `${PREFIX}a${stamp}` } })],
        ['POST /archive-reasons', (b) => req(b, 'POST', '/api/archive-reasons', {
          token: tokenA, body: { title: `${PREFIX}a${stamp}` } })],
        ['PATCH /attendance-settings', (b) => req(b, 'PATCH', '/api/attendance-settings', {
          token: tokenA, body: { consecutiveAbsencesAlert: 9 } })],
        ['GET /archive-reasons/report', (b) => req(b, 'GET', '/api/archive-reasons/report', {
          token: tokenA })],
      ]) {
        await both(`(A) faqat RUXSAT → ${label} 403`, call);
      }

      // ── (B) FAQAT ROL (roleType=owner) ──
      const tokenB = await useRole('ownertype', { permissionKeys: [], roleType: 'owner' });
      for (const [label, call] of [
        ['POST /lead-options', (b) => req(b, 'POST', '/api/lead-options', {
          token: tokenB, body: { kind: 'source', name: `${PREFIX}b${stamp}` } })],
        ['POST /feedback-types', (b) => req(b, 'POST', '/api/feedback-types', {
          token: tokenB, body: { name: `${PREFIX}b${stamp}` } })],
        ['POST /archive-reasons', (b) => req(b, 'POST', '/api/archive-reasons', {
          token: tokenB, body: { title: `${PREFIX}b${stamp}` } })],
      ]) {
        await both(`(B) faqat ROL → ${label} 403`, call);
      }
      // MUSBAT NAZORAT: (B) `/report` ni KO'RADI — u faqat ROL talab qiladi.
      await both("MUSBAT NAZORAT: (B) `/report` ni KO'RADI → 200", (b) =>
        req(b, 'GET', '/api/archive-reasons/report', { token: tokenB }));

      // ── (C) IKKALASI — MUSBAT NAZORAT ──
      const tokenC = await useRole('both', { permissionKeys: MANAGE_KEYS, roleType: 'owner' });
      const madeByC = [];
      for (const [label, call, tag] of [
        ['POST /lead-options', (b) => req(b, 'POST', '/api/lead-options', {
          token: tokenC, body: { kind: 'source', name: `${PREFIX}c${b === EXPRESS ? 'e' : 'n'}${stamp}` } }), 'leadOption'],
        ['POST /feedback-types', (b) => req(b, 'POST', '/api/feedback-types', {
          token: tokenC, body: { name: `${PREFIX}c${b === EXPRESS ? 'e' : 'n'}${stamp}` } }), 'feedbackType'],
        ['POST /archive-reasons', (b) => req(b, 'POST', '/api/archive-reasons', {
          token: tokenC, body: { title: `${PREFIX}c${b === EXPRESS ? 'e' : 'n'}${stamp}` } }), 'archiveReason'],
      ]) {
        const res = await both(`MUSBAT NAZORAT: (C) ROL+RUXSAT → ${label} 201`, async (b) => {
          const r = await call(b);
          if (r.status === 201) made[tag].push(r.body.data.id);
          return r;
        });
        madeByC.push(res);
      }
      await both('MUSBAT NAZORAT: (C) attendance-settings YOZADI → 200', (b) =>
        req(b, 'PATCH', '/api/attendance-settings', {
          token: tokenC, body: { consecutiveAbsencesAlert: 7 },
        }));

      await restoreQa();
    } catch (err) {
      skip('AND semantikasi', err.message);
      await restoreQa().catch(() => {});
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;

    await restoreQa();

    for (const v of tempRoleValues) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${v}`, { token: ownerToken });
      if (r.status === 200) cleaned += 1;
    }
    // ⚠ ZAXIRA: API rad etsa rol bazada qolib ketardi.
    const forcedRoles = await prisma.role.deleteMany({ where: { label: { startsWith: PREFIX } } });
    cleaned += forcedRoles.count;

    // ⚠ QATTIQ O'CHIRISH: API yumshoq o'chiradi, ya'ni qatorlar
    // to'planib borardi (baza siljishi).
    const d1 = await prisma.leadOption.deleteMany({ where: { name: { startsWith: PREFIX } } });
    const d2 = await prisma.feedbackType.deleteMany({ where: { name: { startsWith: PREFIX } } });
    const d3 = await prisma.archiveReason.deleteMany({ where: { title: { startsWith: PREFIX } } });
    cleaned += d1.count + d2.count + d3.count;

    // Yagona qatorli sozlama TIKLANADI.
    if (attendanceBefore) {
      await prisma.attendanceSettings.update({
        where: { id: 'default' },
        data: {
          lowAttendanceThreshold: attendanceBefore.lowAttendanceThreshold,
          consecutiveAbsencesAlert: attendanceBefore.consecutiveAbsencesAlert,
        },
      });
      cleaned += 1;
    }

    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    // ── SILJISH TEKSHIRUVI ──
    const after = {
      leadOptions: await prisma.leadOption.count(),
      feedbackTypes: await prisma.feedbackType.count(),
      archiveReasons: await prisma.archiveReason.count(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok('baza siljimadi (uchala katalog ham)');
    } catch (err) { bad('BAZA SILJIDI', err.message); }

    const asNow = await prisma.attendanceSettings.findUnique({ where: { id: 'default' } });
    try {
      assert.equal(asNow.lowAttendanceThreshold, attendanceBefore.lowAttendanceThreshold);
      assert.equal(asNow.consecutiveAbsencesAlert, attendanceBefore.consecutiveAbsencesAlert);
      ok('davomat sozlamalari tiklandi');
    } catch (err) { bad('sozlama tiklanmadi', err.message); }

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
