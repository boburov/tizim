/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 10 — SHABLONLAR + TIZIM BILDIRISHNOMALARI PARITETI.
 *
 *   `/api/notification-templates`  (5 marshrut)
 *   `/api/system-notifications`    (5 marshrut)
 *
 * ── NEGA BITTA FAYLDA ──
 * Ikkalasi ham bildirishnoma oilasiga tegishli, kichik va bir xil
 * fixture'lardan (vaqtinchalik rol) foydalanadi. Login urinishlari
 * CHEKLANGAN (5 daqiqada 20 ta), shuning uchun ularni bitta yurishda
 * birlashtirish tokenlarni tejaydi.
 *
 * ── "ROL VA RUXSAT" (AND) SEMANTIKASI ──
 *
 * Shablon YOZISH marshrutlari Express'da IKKI to'siqni KETMA-KET
 * qo'yadi: `requireRole(OWNER)` VA
 * `requirePermission(NOTIFICATION_TEMPLATES_MANAGE)`. Buni sinash uchun
 * uchta vaqtinchalik rol yaratiladi va har biri BITTA yarmini ajratadi:
 *
 *   A) faqat RUXSAT (roleType=staff)  → 403 kutiladi (rol yarmi yiqiladi)
 *   B) faqat ROL (roleType=owner)     → 403 kutiladi (ruxsat yarmi yiqiladi)
 *   C) IKKALASI ham                   → 201 kutiladi (MUSBAT NAZORAT)
 *
 * ⚠ (C) BO'LMASA (A) va (B) HECH NARSA ISBOTLAMASDI: aktyor umuman
 * yoza olmasa ham ikkala javob 403 bo'lardi va test yashil chiqardi.
 *
 * ── ⚠ 100 TALIK CHEKLOV BUZG'UNCHI TARZDA SINALMAYDI ──
 *
 * `system_notifications` da eng eski yozuvlar 100 dan oshganda QATTIQ
 * o'chiriladi. Jadvalda hozir HAQIQIY yozuvlar bor, ya'ni cheklovni
 * ataylab oshirish REAL ma'lumotni o'chirardi. Shuning uchun test
 * cheklovdan OSHMAYDI (stek boshiga 1 tadan, jami 2 ta) va yakunda
 * eng eski yozuv JOYIDA ekani tekshiriladi. Eviction shoxi
 * O'LCHANMAGANI MIGRATION-CHECKLIST.md da ochiq qayd etilgan.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import prisma from '../../server_legacy/src/config/prisma.js';

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

const VOLATILE = new Set(['createdAt', 'updatedAt', 'readAt', 'stack']);

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
    return s;
  }
  return v;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠ LOGIN CHEGARASIGA (429) CHIDAMLI.
 *
 * Express login limiteri 5 daqiqada 20 urinishga ruxsat beradi. Bu test
 * har yurishda bir nechta aktyor uchun token oladi, ya'ni ketma-ket
 * yurishlarda chegara MUQARRAR ravishda ishga tushadi. Chidamlilik
 * bo'lmasa 429 test YIQILISHI bo'lib ko'rinardi — aslida kod bilan
 * bog'liq emas, va bundan ham yomoni, yurish O'RTASIDA uzilib fixture
 * tozalanmay qolardi.
 *
 * Shuning uchun 429 da KUTAMIZ va qayta urinamiz. Boshqa xatolar
 * (401, 400) DARHOL yiqiladi — ular haqiqiy nosozlik.
 */
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
  console.log(`\n${BOLD}FAZA 10 — SHABLONLAR + TIZIM BILDIRISHNOMALARI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  const before = {
    templates: await prisma.notificationTemplate.count(),
    systemNotifications: await prisma.systemNotification.count(),
    unread: await prisma.systemNotification.count({ where: { isRead: false } }),
  };
  const oldestSystem = await prisma.systemNotification.findFirst({
    orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  note(`boshlang'ich: shablon=${before.templates}, tizim xabari=${before.systemNotifications} (cheklov 100)`);

  const qa = await prisma.user.findFirst({
    where: { username: 'qa_staff_a' },
    select: { id: true },
  });
  if (!qa) { console.log('  ❌ qa_staff_a topilmadi'); process.exit(1); }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const createdTemplates = { [EXPRESS]: null, [NEST]: null };
  const createdSystem = { [EXPRESS]: null, [NEST]: null };
  const tempRoles = [];
  let qaRestore = null;
  let unreadIds = [];

  const nameOf = (b) => `${PREFIX}tpl${b === EXPRESS ? 'e' : 'n'}${stamp}`;
  const msgOf = (b) => `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`;

  /**
   * ⚠ IKKALA STEKNING YOZUVI HAR IKKALA JAVOBDA KO'RINADI — baza UMUMIY.
   * Shuning uchun ikkalasi ham BIR XIL belgiga tushiriladi, aks holda
   * Express o'zinikini belgilab, Nest'nikini xom holda qoldirardi va
   * tanalar hech qachon teng chiqmasdi.
   *
   * ⚠ BO'SH QIYMAT UCHUN ZAXIRA YO'Q. Ilgari `x || ' '` yozilgan edi va
   * u HAR BIR BO'SHLIQNI belgiga almashtirardi ("Yangilangan {ism}" →
   * "Yangilangan<SYS>{ism}") — ya'ni tuzatilgan matnni ham buzardi.
   */
  const subs = () => [
    [nameOf(EXPRESS), '<NAME>'], [nameOf(NEST), '<NAME>'],
    [msgOf(EXPRESS), '<MSG>'], [msgOf(NEST), '<MSG>'],
    [createdTemplates[EXPRESS], '<TPL>'], [createdTemplates[NEST], '<TPL>'],
    [createdSystem[EXPRESS], '<SYS>'], [createdSystem[NEST], '<SYS>'],
  ].filter(([from]) => Boolean(from));

  /**
   * ⚠ RO'YXAT TARTIBI SOLISHTIRISHDAN OLDIN BARQARORLASHTIRILADI.
   *
   * `notification_templates` ro'yxati `orderBy: { createdAt: "desc" }` —
   * IKKILAMCHI TARTIB YO'Q. Bir xil `createdAt` li qatorlar (seed'da
   * shundaylari BOR) orasida Postgres tartibni KAFOLATLAMAYDI, ya'ni
   * bir xil so'rov ikki marta boshqa tartibda qaytishi mumkin. Bu
   * ikkala stekda ham bir xil kamchilik (MIGRATION-CHECKLIST B9), lekin
   * u paritet solishtiruvini BEQAROR qilardi.
   *
   * Shuning uchun `data` massivi `id` bo'yicha saralanadi — MAZMUN
   * baribir to'liq solishtiriladi, faqat qatorlar tartibi emas.
   */
  const stabilize = (body) => {
    if (!body || typeof body !== 'object' || !Array.isArray(body.data)) return body;
    const sorted = [...body.data].sort((x, y) =>
      String(x?.id ?? '').localeCompare(String(y?.id ?? '')));
    return { ...body, data: sorted };
  };

  const both = async (name, fn, subsOf = () => []) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: normalize(stabilize(e.body), subsOf(EXPRESS)) };
    const nn = { status: n.status, body: normalize(stabilize(n.body), subsOf(NEST)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  /** Vaqtinchalik rol yaratadi va uni `qa_staff_a` ga BERADI (ikkala joyda). */
  const useRole = async (label, { permissionKeys = [], roleType }) => {
    const matrix = await req(EXPRESS, 'GET', '/api/roles/matrix', { token: ownerToken });
    const ids = [];
    for (const m of matrix.body.data.modules) {
      for (const cell of Object.values(m.cells)) {
        if (permissionKeys.includes(cell.key)) ids.push(cell.id);
      }
    }
    if (ids.length !== permissionKeys.length) {
      throw new Error(`ruxsat topilmadi: ${permissionKeys.join(',')}`);
    }
    const body = { label: `${PREFIX}${label}${stamp}`, permissionIds: ids };
    if (roleType) body.roleType = roleType;
    const r = await req(EXPRESS, 'POST', '/api/roles', { token: ownerToken, body });
    if (r.status !== 201) throw new Error(`rol yaratilmadi (${label}): ${r.status} ${JSON.stringify(r.body)}`);
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

    // ⚠ ROL IKKALA JOYDA HAM: amaldagi rolni `resolveRoleForBranch`
    // FILIAL BIRIKMASIDAN oladi va u `user.role` ni bosib ketadi.
    const a1 = await req(EXPRESS, 'PATCH', `/api/users/${qa.id}/role`, {
      token: ownerToken, body: { role: value },
    });
    if (a1.status !== 200) throw new Error(`rol biriktirilmadi: ${a1.status}`);
    const a2 = await req(EXPRESS, 'PATCH', `/api/users/${qa.id}/branches`, {
      token: ownerToken,
      body: {
        homeBranchId: qaRestore.homeBranchId,
        branchAssignments: qaRestore.branchAssignments.map((a) => ({
          branchId: a.branchId, role: value,
        })),
      },
    });
    if (a2.status !== 200) throw new Error(`birikma yangilanmadi: ${a2.status}`);

    const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
    if (pw.status !== 200) throw new Error(`parol o'qilmadi: ${pw.status}`);
    return login(EXPRESS, pw.body.data.username, pw.body.data.password);
  };

  /**
   * ⚠ TIKLASH API'GA TAYANMAYDI — TO'G'RIDAN-TO'G'RI BAZAGA YOZADI.
   *
   * Ilgari bu funksiya `PATCH /users/:id/role` chaqirardi va aynan
   * shu tufayli fixture BIR MARTA ELEVATSIYADA QOLIB KETDI: yurish
   * oxirida login chegarasi (429) ishga tushdi, `ownerToken` bilan
   * yuborilgan tiklash so'rovlari 401/429 oldi va JIMGINA muvaffaqiyatsiz
   * tugadi — natijada `qa_staff_a` `roleType: "owner"` li vaqtinchalik
   * rolda qoldi.
   *
   * QOIDA: tozalash yo'li test yiqilgan sabab bilan BIR XIL sababdan
   * yiqilmasligi kerak. Baza yozuvi API'dan mustaqil.
   */
  const restoreQa = async () => {
    if (!qaRestore) return;
    await prisma.user.update({
      where: { id: qa.id },
      data: { role: qaRestore.role, homeBranchId: qaRestore.homeBranchId },
    });
    // Birikmalardagi rol ham tiklanadi — amaldagi rolni AYNAN u beradi
    // (`resolveRoleForBranch`), ya'ni uni tashlab ketish elevatsiyani
    // saqlab qolardi.
    for (const a of qaRestore.branchAssignments) {
      await prisma.userBranchAssignment.updateMany({
        where: { userId: qa.id, branchId: a.branchId },
        data: { role: a.role },
      });
    }
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    //                        SHABLONLAR
    // ═══════════════════════════════════════════════════════════════
    head('shablonlar — o\'qish');

    for (const q of [
      '', '?limit=5', '?includeInactive=true&limit=5',
      '?category=announcement', '?search=__yoq__', '?page=2&limit=2',
    ]) {
      await both(`GET /notification-templates${q}`, (b) =>
        req(b, 'GET', `/api/notification-templates${q}`, { token: ownerToken }));
    }
    await both('GET /notification-templates?category=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/notification-templates?category=__yoq__', { token: ownerToken }));
    await both('GET /notification-templates/:id (404)', (b) =>
      req(b, 'GET', `/api/notification-templates/${'a'.repeat(24)}`, { token: ownerToken }));
    await both("GET /notification-templates (token yo'q → 401)", (b) =>
      req(b, 'GET', '/api/notification-templates'));

    head('shablonlar — yaratish / yangilash / o\'chirish (owner)');

    await both('POST /notification-templates', async (b) => {
      const r = await req(b, 'POST', '/api/notification-templates', {
        token: ownerToken,
        body: { name: nameOf(b), body: 'Salom {ism}!', category: 'announcement' },
      });
      if (r.status === 201) createdTemplates[b] = r.body.data.id;
      return r;
    }, subs);

    if (createdTemplates[EXPRESS] && createdTemplates[NEST]) {
      await both('POST (takroriy nom → 409)', (b) =>
        req(b, 'POST', '/api/notification-templates', {
          token: ownerToken, body: { name: nameOf(b), body: 'x' },
        }), subs);
      await both("POST (matn yo'q → 400)", (b) =>
        req(b, 'POST', '/api/notification-templates', {
          token: ownerToken, body: { name: `${nameOf(b)}z` },
        }), subs);
      await both("POST (noto'g'ri kategoriya → 400)", (b) =>
        req(b, 'POST', '/api/notification-templates', {
          token: ownerToken,
          body: { name: `${nameOf(b)}z`, body: 'x', category: '__yoq__' },
        }), subs);

      await both('GET /notification-templates/:id', (b) =>
        req(b, 'GET', `/api/notification-templates/${createdTemplates[b]}`, { token: ownerToken }), subs);
      await both('PATCH /notification-templates/:id', (b) =>
        req(b, 'PATCH', `/api/notification-templates/${createdTemplates[b]}`, {
          token: ownerToken, body: { body: 'Yangilangan {ism}' },
        }), subs);
      // ⚠ BO'SH TANA 400 — jimgina "saqlandi" demasligi kerak.
      await both("PATCH (bo'sh tana → 400)", (b) =>
        req(b, 'PATCH', `/api/notification-templates/${createdTemplates[b]}`, {
          token: ownerToken, body: {},
        }), subs);
      await both('PATCH (404)', (b) =>
        req(b, 'PATCH', `/api/notification-templates/${'a'.repeat(24)}`, {
          token: ownerToken, body: { body: 'x' },
        }), subs);
    }

    // ═══════════ ROL **VA** RUXSAT (AND) ═══════════
    head('shablonlar — «rol VA ruxsat» (AND) semantikasi');

    try {
      // ── (A) FAQAT RUXSAT, rol emas ──
      const tokenA = await useRole('permonly', {
        permissionKeys: ['notification_templates.manage'],
      });
      // MUSBAT NAZORAT: aktyor shablonlarni O'QIY oladi (o'qish ruxsatsiz).
      const readA = await req(EXPRESS, 'GET', '/api/notification-templates?limit=3', { token: tokenA });
      if (readA.status !== 200) throw new Error(`(A) o'qiy olmadi: ${readA.status}`);
      await both("MUSBAT NAZORAT: (A) shablonlarni O'QIYDI → 200", (b) =>
        req(b, 'GET', '/api/notification-templates?limit=3', { token: tokenA }), subs);
      await both('(A) faqat RUXSAT bor, ROL yo\'q → POST 403', (b) =>
        req(b, 'POST', '/api/notification-templates', {
          token: tokenA, body: { name: `${PREFIX}a${stamp}`, body: 'x' },
        }), subs);
      await both("(A) PATCH 403", (b) =>
        req(b, 'PATCH', `/api/notification-templates/${createdTemplates[b] || 'a'.repeat(24)}`, {
          token: tokenA, body: { body: 'x' },
        }), subs);
      await both("(A) DELETE 403", (b) =>
        req(b, 'DELETE', `/api/notification-templates/${createdTemplates[b] || 'a'.repeat(24)}`, {
          token: tokenA,
        }), subs);

      // ── (B) FAQAT ROL (roleType=owner), ruxsat yo'q ──
      const tokenB = await useRole('ownertype', { permissionKeys: [], roleType: 'owner' });
      await both("(B) faqat ROL bor, RUXSAT yo'q → POST 403", (b) =>
        req(b, 'POST', '/api/notification-templates', {
          token: tokenB, body: { name: `${PREFIX}b${stamp}`, body: 'x' },
        }), subs);

      // ── (C) IKKALASI — MUSBAT NAZORAT ──
      //
      // ⚠ BU BO'LMASA (A) va (B) hech narsa isbotlamasdi: aktyor umuman
      // yoza olmasa ham ikkalasi 403 bo'lardi.
      const tokenC = await useRole('both', {
        permissionKeys: ['notification_templates.manage'], roleType: 'owner',
      });
      const madeByC = { [EXPRESS]: null, [NEST]: null };
      await both('MUSBAT NAZORAT: (C) ROL+RUXSAT birga → POST 201', async (b) => {
        const r = await req(b, 'POST', '/api/notification-templates', {
          token: tokenC,
          body: { name: `${PREFIX}c${b === EXPRESS ? 'e' : 'n'}${stamp}`, body: 'x' },
        });
        if (r.status === 201) madeByC[b] = r.body.data.id;
        return r;
      }, () => [
        [`${PREFIX}c${EXPRESS === EXPRESS ? 'e' : 'n'}${stamp}`, '<NAME>'],
        [`${PREFIX}cn${stamp}`, '<NAME>'],
        [madeByC[EXPRESS], '<TPL>'], [madeByC[NEST], '<TPL>'],
      ].filter(([f]) => Boolean(f)));

      await restoreQa();
    } catch (err) {
      skip('AND semantikasi', err.message);
      await restoreQa().catch(() => {});
    }

    // ═══════════ YUMSHOQ O'CHIRISH ═══════════
    head("shablonlar — yumshoq o'chirish");

    if (createdTemplates[EXPRESS] && createdTemplates[NEST]) {
      await both('DELETE /notification-templates/:id', (b) =>
        req(b, 'DELETE', `/api/notification-templates/${createdTemplates[b]}`, { token: ownerToken }), subs);

      // ⚠ QATOR QOLADI (`isActive:false`), YO'QOLMAYDI — yuborilgan
      // xabarlardagi `templateId` havolasi buzilmasligi uchun.
      const rows = await prisma.notificationTemplate.findMany({
        where: { id: { in: [createdTemplates[EXPRESS], createdTemplates[NEST]] } },
        select: { id: true, isActive: true },
      });
      try {
        assert.equal(rows.length, 2, 'ikkala qator ham qolishi kerak');
        assert.ok(rows.every((r) => r.isActive === false), 'isActive=false');
        ok("yumshoq o'chirish: qator QOLDI, isActive=false (ikkala stekda)");
      } catch (err) { bad("yumshoq o'chirish", err.message); }

      // Standart ro'yxatda YO'Q, `includeInactive` bilan BOR.
      const hidden = await Promise.all([EXPRESS, NEST].map(async (b) => {
        const r = await req(b, 'GET', `/api/notification-templates?search=${nameOf(b)}`, { token: ownerToken });
        return (r.body?.data || []).length;
      }));
      const shown = await Promise.all([EXPRESS, NEST].map(async (b) => {
        const r = await req(b, 'GET',
          `/api/notification-templates?includeInactive=true&search=${nameOf(b)}`, { token: ownerToken });
        return (r.body?.data || []).length;
      }));
      try {
        assert.deepEqual(hidden, [0, 0]);
        assert.deepEqual(shown, [1, 1]);
        ok("o'chirilgan shablon standart ro'yxatda YO'Q, includeInactive bilan BOR");
      } catch (err) { bad("includeInactive", `yashirin=${hidden} ko'ringan=${shown}`); }

      await both('DELETE (404)', (b) =>
        req(b, 'DELETE', `/api/notification-templates/${'a'.repeat(24)}`, { token: ownerToken }), subs);
    }

    // ═══════════════════════════════════════════════════════════════
    //                   TIZIM BILDIRISHNOMALARI
    // ═══════════════════════════════════════════════════════════════
    head('tizim bildirishnomalari — owner');

    for (const q of ['', '?status=all&limit=5', '?status=read&limit=5', '?status=unread&limit=5']) {
      await both(`GET /system-notifications${q}`, (b) =>
        req(b, 'GET', `/api/system-notifications${q}`, { token: ownerToken }));
    }
    await both('GET /system-notifications?status=__yoq__ → 400', (b) =>
      req(b, 'GET', '/api/system-notifications?status=__yoq__', { token: ownerToken }));
    await both('GET /system-notifications/unread-count', (b) =>
      req(b, 'GET', '/api/system-notifications/unread-count', { token: ownerToken }));
    await both("GET /system-notifications (token yo'q → 401)", (b) =>
      req(b, 'GET', '/api/system-notifications'));

    // ⚠ STEK BOSHIGA BITTA — cheklovdan (100) OSHMASLIGI uchun.
    await both('POST /system-notifications', async (b) => {
      const r = await req(b, 'POST', '/api/system-notifications', {
        token: ownerToken,
        body: { message: `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`, link: '/test' },
      });
      if (r.status === 201) createdSystem[b] = r.body.data.id;
      return r;
    }, subs);

    await both("POST (matn bo'sh → 400)", (b) =>
      req(b, 'POST', '/api/system-notifications', { token: ownerToken, body: { message: '   ' } }));

    if (createdSystem[EXPRESS] && createdSystem[NEST]) {
      await both('POST /:id/read', (b) =>
        req(b, 'POST', `/api/system-notifications/${createdSystem[b]}/read`, { token: ownerToken }),
        subs);

      // ⚠ TAKROR O'QISH `readAt` NI QAYTA YOZMASLIGI SHART.
      const firstReadAt = await prisma.systemNotification.findUnique({
        where: { id: createdSystem[EXPRESS] }, select: { readAt: true },
      });
      await both("POST /:id/read (takroriy — readAt saqlanadi)", (b) =>
        req(b, 'POST', `/api/system-notifications/${createdSystem[b]}/read`, { token: ownerToken }),
        subs);
      const secondReadAt = await prisma.systemNotification.findUnique({
        where: { id: createdSystem[EXPRESS] }, select: { readAt: true },
      });
      try {
        assert.deepEqual(secondReadAt.readAt, firstReadAt.readAt, 'readAt qayta yozildi');
        ok("takroriy o'qishda `readAt` O'ZGARMADI (dastlabki vaqt saqlandi)");
      } catch (err) { bad('readAt qayta yozildi', err.message); }
    }

    await both('POST /system-notifications/:id/read (404)', (b) =>
      req(b, 'POST', `/api/system-notifications/${'a'.repeat(24)}/read`, { token: ownerToken }));
    // ═══════════════════════════════════════════════════════════════
    // ⚠⚠ `read-all` — HOLATNI O'ZGARTIRUVCHI VA UMUMIY BAZAGA TEGADIGAN
    //
    // Buni oddiy `both()` bilan chaqirib BO'LMAYDI: Express birinchi
    // yurganda BARCHA o'qilmagan yozuvlarni o'qildi qiladi va Nest'ga
    // 0 ta qoladi — javoblar hech qachon teng chiqmasdi.
    //
    // ⚠ BUNDAN HAM MUHIMI: bu HAQIQIY tizim bildirishnomalarini
    // o'qildi qilib qo'yardi. Birinchi yurishda AYNAN SHU sodir bo'ldi —
    // 98 ta real yozuv o'qilgan holatga o'tdi va uni qo'lda tiklashga
    // to'g'ri keldi.
    //
    // Shuning uchun: o'qilmaganlar RO'YXATI olinadi, har bir stekdan
    // KEYIN holat TIKLANADI, va yakunda ham tiklanadi.
    // ═══════════════════════════════════════════════════════════════
    const unreadBefore = await prisma.systemNotification.findMany({
      where: { isRead: false }, select: { id: true },
    });
    unreadIds = unreadBefore.map((r) => r.id);
    const restoreUnread = async () => {
      if (!unreadIds.length) return;
      await prisma.systemNotification.updateMany({
        where: { id: { in: unreadIds } },
        data: { isRead: false, readAt: null },
      });
    };

    if (unreadIds.length === 0) {
      skip('POST /read-all', "o'qilmagan yozuv yo'q — TAXMIN QILINMADI");
    } else {
      const rE = await req(EXPRESS, 'POST', '/api/system-notifications/read-all', { token: ownerToken });
      await restoreUnread();
      const rN = await req(NEST, 'POST', '/api/system-notifications/read-all', { token: ownerToken });
      await restoreUnread();

      try {
        assert.deepEqual(
          { status: rN.status, body: rN.body },
          { status: rE.status, body: rE.body },
        );
        ok(`POST /read-all — ${rE.status}, ikkalasi ${rE.body?.data?.modified} ta yozuvni o'qildi qildi`);
      } catch {
        bad('POST /read-all',
          `express: ${JSON.stringify(rE.body)}\n      nest   : ${JSON.stringify(rN.body)}`);
      }

      // MUSBAT NAZORAT: `modified` HAQIQATAN o'qilmaganlar soniga teng —
      // ya'ni yuqoridagi tenglik "ikkalasi ham 0 qaytardi" degani EMAS.
      try {
        assert.equal(rE.body?.data?.modified, unreadIds.length,
          `modified (${rE.body?.data?.modified}) ≠ o'qilmaganlar soni (${unreadIds.length})`);
        ok(`MUSBAT NAZORAT: read-all haqiqatan ${unreadIds.length} ta yozuvga tegdi`);
      } catch (err) { bad('read-all hech narsaga tegmadi', err.message); }
    }

    // ═══════════ OWNER-ONLY CHEGARASI ═══════════
    head('tizim bildirishnomalari — owner-only chegarasi');

    try {
      const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      if (pw.status !== 200) throw new Error("parol o'qilmadi");
      const plain = await login(EXPRESS, pw.body.data.username, pw.body.data.password);

      // MUSBAT NAZORAT: aktyor tizimga KIRGAN va boshqa auth'langan
      // manzilga kira oladi — ya'ni pastdagi 403 lar "token yaroqsiz"
      // degani EMAS.
      const alive = await req(EXPRESS, 'GET', '/api/notifications/inbox', { token: plain });
      if (alive.status !== 200) throw new Error(`aktyor tirik emas: ${alive.status}`);
      await both("MUSBAT NAZORAT: aktyor boshqa manzilga KIRADI → 200", (b) =>
        req(b, 'GET', '/api/notifications/inbox', { token: plain }));

      for (const [label, call] of [
        ["GET /", (b) => req(b, 'GET', '/api/system-notifications', { token: plain })],
        ["GET /unread-count", (b) => req(b, 'GET', '/api/system-notifications/unread-count', { token: plain })],
        ["POST /", (b) => req(b, 'POST', '/api/system-notifications', { token: plain, body: { message: 'x' } })],
        ["POST /read-all", (b) => req(b, 'POST', '/api/system-notifications/read-all', { token: plain })],
        ["POST /:id/read", (b) => req(b, 'POST', `/api/system-notifications/${'a'.repeat(24)}/read`, { token: plain })],
      ]) {
        await both(`owner emas → ${label} 403`, call);
      }
    } catch (err) {
      skip('owner-only chegarasi', err.message);
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;

    await restoreQa();
    // ⚠ BARCHA prefiksli rollar — yurish o'rtasida uzilsa ham qolmasin.
    const strayRoles = await prisma.role.findMany({
      where: { label: { startsWith: PREFIX } }, select: { value: true },
    });
    for (const sr of strayRoles) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${sr.value}`, { token: ownerToken });
      if (r.status === 200) cleaned += 1;
    }
    // ⚠ ZAXIRA YO'L: API rad etsa (401/429, yoki "rolda foydalanuvchi bor")
    // rol bazada qolib ketardi va keyingi yurishlarda to'planardi.
    // `restoreQa()` yuqorida allaqachon ishlagani uchun rolda hech kim
    // qolmagan bo'lishi kerak.
    const forced = await prisma.role.deleteMany({ where: { label: { startsWith: PREFIX } } });
    cleaned += forced.count;

    // Shablonlar QATTIQ o'chiriladi — API yumshoq o'chiradi, ya'ni
    // qatorlar to'planib borardi (baza siljishi).
    const tplDel = await prisma.notificationTemplate.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    cleaned += tplDel.count;

    const sysDel = await prisma.systemNotification.deleteMany({
      where: { message: { startsWith: PREFIX } },
    });
    cleaned += sysDel.count;

    // ⚠ O'QILGAN/O'QILMAGAN HOLATI TIKLANADI — `read-all` real
    // yozuvlarga tegadi va bu ham baza siljishi hisoblanadi.
    if (unreadIds.length) {
      await prisma.systemNotification.updateMany({
        where: { id: { in: unreadIds } },
        data: { isRead: false, readAt: null },
      });
    }

    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    // ── SILJISH VA CHEKLOV TEKSHIRUVI ──
    // ⚠ SILJISH FAQAT QATOR SONI EMAS: `read-all` qatorlarni o'chirmaydi,
    // lekin ularning O'QILGAN HOLATINI o'zgartiradi. Birinchi yurishda
    // aynan shu e'tibordan chetda qolgan edi.
    const after = {
      templates: await prisma.notificationTemplate.count(),
      systemNotifications: await prisma.systemNotification.count(),
      unread: await prisma.systemNotification.count({ where: { isRead: false } }),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (shablon=${after.templates}, tizim=${after.systemNotifications})`);
    } catch (err) { bad('BAZA SILJIDI', err.message); }

    // ⚠ ENG ESKI HAQIQIY YOZUV JOYIDAMI — 100 talik cheklov REAL
    // ma'lumotni o'chirib yubormaganini isbotlaydi.
    if (oldestSystem) {
      const still = await prisma.systemNotification.findUnique({
        where: { id: oldestSystem.id }, select: { id: true },
      });
      try {
        assert.ok(still, 'eng eski yozuv o\'chib ketgan — cheklov real ma\'lumotni yedi');
        ok('100 talik cheklov REAL yozuvni o\'chirmadi (eng eskisi joyida)');
      } catch (err) { bad('cheklov real ma\'lumotni o\'chirdi', err.message); }
    }
    note('cheklov EVICTION shoxi ataylab o\'lchanmadi — u real yozuvlarni o\'chirardi (MIGRATION-CHECKLIST B8)');

    // ⚠ YAKUNIY TEKSHIRUV HAM BAZADAN — API 429 bersa tekshiruvning
    // o'zi o'lchamay qolardi va elevatsiya sezilmasdan o'tib ketardi.
    if (qaRestore) {
      const now = await prisma.user.findUnique({
        where: { id: qa.id },
        select: { role: true, branchAssignments: { select: { role: true } } },
      });
      try {
        assert.equal(now.role, qaRestore.role, 'qa_staff_a roli');
        assert.ok(
          now.branchAssignments.every((a) => !String(a.role || '').startsWith('parity-')),
          'filial birikmasida vaqtinchalik rol qoldi',
        );
        ok('fixture roli va birikmalari tiklandi (bazadan tasdiqlandi)');
      } catch (err) { bad('fixture tiklanmadi', err.message); }
    }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
