/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 9 — XONA BANDLIGI PARITETI (`GET /branch-analytics/rooms`).
 *
 * ── ⚠ SHART O'ZIMIZ QURILADI ──
 *
 * Bandlik hisobining eng muhim uchta qoidasi MAVJUD ma'lumot bilan
 * o'lchanmaydi (seed'da ustma-ust dars ham, ish vaqtidan tashqari dars
 * ham yo'q). Shuning uchun fixture QURILADI:
 *
 *   1. USTMA-UST IKKI DARS  → bandlik IKKI BAROBAR sanalmasligi kerak
 *      (oraliqlar birlashadi) va `conflicts` da BITTA yozuv chiqishi
 *      kerak. Aynan shu xato ishlab chiqarishda 103.35% bergan.
 *   2. ISH VAQTIDAN TASHQARI DARS → faqat KESISHGAN qismi sanaladi.
 *   3. XONASIZ GURUH → `unassignedGroups` da AYTILADI (bandlik
 *      raqamining ostida yashirilmaydi).
 *
 * ── ⚠ BOSHQA `branch-analytics` MARSHRUTLARI KO'CHIRILMAGAN ──
 * `/pnl`, `/utilization`, `/churn`, `/sales`… — ular moliya tahlili
 * ko'lamiga kiradi. Test ularning NestJS'da 404 ekanini tasdiqlaydi
 * (scaffold emas, umuman yo'q).
 *
 * ── BAZA GIGIYENASI ──
 * Fixture xona/guruh/jadval QATTIQ o'chiriladi; modul faqat o'qiydi.
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

// ⚠ Hisob natijalari ATAYLAB solishtiriladi — faqat `stack` chiqariladi.
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
  console.log(`\n${BOLD}FAZA 9 — XONA BANDLIGI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  const before = {
    rooms: await prisma.room.count(),
    groups: await prisma.group.count(),
    schedule: await prisma.groupScheduleItem.count(),
  };
  note(`boshlang'ich: xona=${before.rooms}, guruh=${before.groups}, jadval=${before.schedule}`);

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
  const madeRoomIds = [];
  const madeGroupIds = [];
  const tempRoles = [];
  let qaRestore = null;

  const both = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: normalize(e.body) };
    const nn = { status: n.status, body: normalize(n.body) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

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

  const makeRoom = async (branchId, tag) => {
    const r = await prisma.room.create({
      data: { branchId, name: `${PREFIX}${tag}${stamp}`, capacity: 10, isActive: true },
      select: { id: true },
    });
    madeRoomIds.push(r.id);
    return r.id;
  };

  const makeGroup = async (branchId, tag, roomId, slots) => {
    const g = await prisma.group.create({
      data: {
        branchId,
        name: `${PREFIX}${tag}${stamp}`,
        roomId: roomId || null,
        isActive: true,
        ...(slots.length
          ? { schedule: { create: slots.map((s) => ({ day: s.d, startTime: s.f, endTime: s.t })) } }
          : {}),
      },
      select: { id: true },
    });
    madeGroupIds.push(g.id);
    return g.id;
  };

  try {
    // ═══════════════ KO'CHIRILMAGAN MARSHRUTLAR ═══════════════
    head("ko'chirilmagan `branch-analytics` marshrutlari (404)");

    for (const p of ['pnl', 'utilization', 'churn', 'normalized', 'teachers', 'sales']) {
      const e = await req(EXPRESS, 'GET', `/api/branch-analytics/${p}`, { token: ownerToken });
      const n = await req(NEST, 'GET', `/api/branch-analytics/${p}`, { token: ownerToken });
      try {
        assert.equal(n.status, 404, `NestJS ${n.status} berdi (404 kutilgan)`);
        assert.notEqual(e.status, 404, 'Express ham 404 — marshrut yo\'qmi?');
        ok(`/${p} — NestJS'da E'LON QILINMAGAN (404), Express ${e.status}`);
      } catch (err) { bad(`/${p}`, err.message); }
    }

    // ═══════════════ FIXTURE: SHARTNI QURAMIZ ═══════════════
    head('fixture — ustma-ust, ish vaqtidan tashqari, xonasiz');

    const roomId = await makeRoom(branchA, 'room');
    ID_SUBS = [[roomId, '<ROOM>']];

    // (1) USTMA-UST IKKI DARS — dushanba 10:00–12:00 va 11:00–13:00.
    //     Birlashgan band vaqt = 3 soat (4 EMAS), to'qnashuv = 1.
    const gA = await makeGroup(branchA, 'gA', roomId, [{ d: 'mon', f: '10:00', t: '12:00' }]);
    const gB = await makeGroup(branchA, 'gB', roomId, [{ d: 'mon', f: '11:00', t: '13:00' }]);

    // (2) ISH VAQTIDAN TASHQARI — seshanba 08:00–10:00. `dayStart=9`
    //     bo'lsa faqat 1 soat sanalishi kerak.
    const gC = await makeGroup(branchA, 'gC', roomId, [{ d: 'tue', f: '08:00', t: '10:00' }]);

    // (3) XONASIZ GURUH — jadvali bor, xonasi yo'q.
    const gD = await makeGroup(branchA, 'gD', null, [{ d: 'wed', f: '14:00', t: '16:00' }]);

    ID_SUBS = [
      [roomId, '<ROOM>'], [gA, '<GA>'], [gB, '<GB>'], [gC, '<GC>'], [gD, '<GD>'],
      [branchA, '<BRANCH_A>'], [otherB.id, '<BRANCH_B>'],
    ];

    // ═══════════════ ASOSIY HISOB ═══════════════
    head('bandlik hisobi — tanalar AYNAN solishtiriladi');

    for (const q of [
      '', '?dayStart=9&dayEnd=21', '?dayStart=8&dayEnd=22',
      '?dayStart=0&dayEnd=24', '?dayStart=10&dayEnd=12',
      `?branchId=${branchA}`, `?branchId=${branchA}&dayStart=9&dayEnd=18`,
    ]) {
      await both(`GET /branch-analytics/rooms${q}`, (b) =>
        req(b, 'GET', `/api/branch-analytics/rooms${q}`, { token: ownerToken }));
    }

    // ══════════════════════════════════════════════════════════════
    // ── INVARIANTLAR — HAR IKKALA STEKDA ALOHIDA O'LCHANADI ──
    //
    // ⚠ Faqat Express tekshirilsa, NestJS'dagi hisob xatosi faqat
    // "tana farq qiladi" bo'lib ko'rinardi — ya'ni 103% bandlik kabi
    // QAROR CHIQARADIGAN xato oddiy nomuvofiqlik bo'lib o'qilardi.
    // ══════════════════════════════════════════════════════════════
    const resE = await req(EXPRESS, 'GET',
      `/api/branch-analytics/rooms?branchId=${branchA}&dayStart=9&dayEnd=21`,
      { token: ownerToken });
    const resN = await req(NEST, 'GET',
      `/api/branch-analytics/rooms?branchId=${branchA}&dayStart=9&dayEnd=21`,
      { token: ownerToken });

    for (const [label, r] of [['express', resE], ['nest', resN]]) {
      const rm = (r.body?.data?.rooms || []).find((x) => x.roomId === roomId);
      try {
        assert.ok(rm, 'fixture xona javobda topilmadi');
        // mon: 10:00–12:00 ∪ 11:00–13:00 = 3 soat (4 EMAS)
        // tue: 08:00–10:00 ∩ [09:00,21:00] = 1 soat
        assert.equal(rm.busyHours, 4,
          `band soat ${rm.busyHours} (kutilgan 4: birlashgan 3 + qirqilgan 1)`);
        assert.ok(rm.utilizationPercent !== null && rm.utilizationPercent <= 100,
          `bandlik ${rm.utilizationPercent}% — 100 dan oshdi!`);
        assert.equal(rm.conflicts.length, 1, `to'qnashuv ${rm.conflicts.length} ta`);
        ok(`${label}: USTMA-UST birlashdi (3+1=4 soat), bandlik ${rm.utilizationPercent}% ≤ 100, to'qnashuv 1`);
      } catch (err) { bad(`${label} bandlik invarianti`, err.message); }
    }

    const res = resE;
    const room = (res.body?.data?.rooms || []).find((r) => r.roomId === roomId);

    if (!room) {
      skip('bandlik invariantlari', 'fixture xona javobda topilmadi');
    } else {
      // ⚠ 1. USTMA-UST YOZUV IKKI BAROBAR SANALMAYDI.
      // mon: 10:00–12:00 ∪ 11:00–13:00 = 10:00–13:00 = 3 soat
      // tue: 08:00–10:00 ∩ [09:00,21:00] = 1 soat
      // Jami = 4 soat.
      // ⚠ TO'QNASHUV KUNI ham tekshiriladi (yuqorida faqat SONI).
      try {
        assert.equal(room.conflicts[0].day, 'mon');
        ok("to'qnashuv to'g'ri kunda (dushanba) qayd etildi");
      } catch (err) { bad("to'qnashuv kuni", err.message); }

      // ⚠ 4. MAXRAJ — FAOL KUNLAR (7 kun EMAS).
      const w = res.body.data.window;
      try {
        assert.ok(w.activeDays.length > 0, 'faol kunlar aniqlanmadi');
        assert.equal(w.denominatorDays, w.activeDays.length);
        assert.ok(w.denominatorDays < 7, `maxraj ${w.denominatorDays} kun — 7 kunga tushib qolgan`);
        assert.equal(room.capacityHours, 12 * w.denominatorDays);
        ok(`maxraj FAOL KUNLAR: ${w.denominatorDays} kun (${w.activeDays.join(',')}), sig'im ${room.capacityHours} soat`);
      } catch (err) { bad('faol kunlar maxraji', err.message); }

      // ⚠ 5. XONASIZ GURUH AYTILADI.
      const un = (res.body.data.unassignedGroups || []).find((g) => g.groupId === gD);
      try {
        assert.ok(un, "xonasiz guruh `unassignedGroups` da YO'Q");
        assert.equal(un.lessonsPerWeek, 1);
        ok('xonasiz guruh AYTILDI (bandlik ostida yashirilmadi)');
      } catch (err) { bad('xonasiz guruh', err.message); }

      // ⚠ 6. TAVSIYA ID'lari NOYOB (React kalit to'qnashuvi).
      const ids = (res.body.data.recommendations || []).map((r) => r.id);
      try {
        assert.equal(new Set(ids).size, ids.length, `takroriy ID: ${ids.length - new Set(ids).size}`);
        assert.ok(ids.length > 0, 'tavsiya umuman yo\'q');
        ok(`tavsiya ID'lari NOYOB (${ids.length} ta)`);
      } catch (err) { bad("tavsiya ID'lari", err.message); }

      // ⚠ 7. `window.note` — ekran "nimaga nisbatan" ekanini aytadi.
      try {
        assert.match(String(w.note), /09:00–21:00/);
        assert.match(String(w.note), new RegExp(`${w.denominatorDays} faol kun`));
        ok('`window.note` maxrajni OCHIQ aytadi');
      } catch (err) { bad('window.note', err.message); }
    }

    // ── DAR OYNASI O'ZGARSA BANDLIK HAM O'ZGARADI (musbat nazorat) ──
    const narrow = await req(EXPRESS, 'GET',
      `/api/branch-analytics/rooms?branchId=${branchA}&dayStart=10&dayEnd=12`,
      { token: ownerToken });
    const narrowRoom = (narrow.body?.data?.rooms || []).find((r) => r.roomId === roomId);
    try {
      // 10:00–12:00 oynasida: mon 10–12 = 2 soat, tue 08–10 → kesishmaydi = 0.
      assert.equal(narrowRoom.busyHours, 2, `tor oynada ${narrowRoom.busyHours} soat`);
      assert.equal(narrowRoom.capacityHours, 2 * narrow.body.data.window.denominatorDays);
      ok('MUSBAT NAZORAT: ish oynasi torayganda band soat ham O\'ZGARDI (4 → 2)');
    } catch (err) { bad('ish oynasi parametri', err.message); }

    // ── VALIDATSIYA ──
    await both('dayEnd <= dayStart → 400', (b) =>
      req(b, 'GET', '/api/branch-analytics/rooms?dayStart=12&dayEnd=12', { token: ownerToken }));
    await both('dayStart=24 → 400', (b) =>
      req(b, 'GET', '/api/branch-analytics/rooms?dayStart=24', { token: ownerToken }));
    await both('dayEnd=25 → 400', (b) =>
      req(b, 'GET', '/api/branch-analytics/rooms?dayEnd=25', { token: ownerToken }));
    await both("branchId bo'sh → 400", (b) =>
      req(b, 'GET', '/api/branch-analytics/rooms?branchId=', { token: ownerToken }));
    await both("token yo'q → 401", (b) => req(b, 'GET', '/api/branch-analytics/rooms'));

    // ═══════════════ RUXSAT VA FILIAL KO'LAMI ═══════════════
    head("ruxsat (`classes.read`) va filial ko'lami");

    try {
      // Ruxsatsiz aktyor.
      const pw = await req(EXPRESS, 'GET', `/api/users/${qa.id}/password`, { token: ownerToken });
      const plain = await login(EXPRESS, pw.body.data.username, pw.body.data.password);
      const alive = await req(EXPRESS, 'GET', '/api/notifications/inbox', { token: plain });
      if (alive.status !== 200) throw new Error(`aktyor tirik emas: ${alive.status}`);
      await both('MUSBAT NAZORAT: aktyor boshqa manzilga KIRADI → 200', (b) =>
        req(b, 'GET', '/api/notifications/inbox', { token: plain }));
      await both("`classes.read` yo'q → 403", (b) =>
        req(b, 'GET', '/api/branch-analytics/rooms', { token: plain }));

      // Ko'lamli aktyor.
      const scoped = await useRole('roomsread', ['classes.read']);

      await both("MUSBAT NAZORAT: `classes.read` bilan → 200", (b) =>
        req(b, 'GET', '/api/branch-analytics/rooms', { token: scoped }));

      // ⚠ BEGONA FILIAL SO'RALSA 403 — parametr ko'lamdan CHIQISH yo'li
      // BO'LMASLIGI kerak.
      await both("begona filial so'ralsa → 403", (b) =>
        req(b, 'GET', `/api/branch-analytics/rooms?branchId=${otherB.id}`, { token: scoped }));

      // ⚠ MUSBAT NAZORAT: O'Z filialini so'rash ISHLAYDI — ya'ni
      // yuqoridagi 403 `branchId` parametrining o'zidan emas.
      await both("MUSBAT NAZORAT: o'z filiali so'ralsa → 200", (b) =>
        req(b, 'GET', `/api/branch-analytics/rooms?branchId=${branchA}`, { token: scoped }));

      // ⚠ KO'LAM HAR IKKALA STEKDA ALOHIDA: ko'lamli aktyor faqat O'Z
      // filialining xonalarini ko'radi.
      const ownerAll = await req(EXPRESS, 'GET', '/api/branch-analytics/rooms', {
        token: ownerToken,
      });
      for (const [label, base] of [['express', EXPRESS], ['nest', NEST]]) {
        const r = await req(base, 'GET', '/api/branch-analytics/rooms', { token: scoped });
        const branches = new Set((r.body?.data?.rooms || []).map((x) => x.branchId));
        try {
          assert.ok(r.body.data.rooms.length > 0, `${label}: xona umuman ko'rinmadi`);
          assert.deepEqual([...branches], [branchA],
            `${label}: BEGONA filial xonasi ko'rindi — KO'LAM SIZDI!`);
          assert.ok(
            r.body.data.totals.roomCount < ownerAll.body.data.totals.roomCount,
            `${label}: ko'lam kesmadi (${r.body.data.totals.roomCount} vs ${ownerAll.body.data.totals.roomCount})`,
          );
          ok(`${label}: ko'lam KESDI — ${r.body.data.totals.roomCount} xona (owner ${ownerAll.body.data.totals.roomCount})`);
        } catch (err) { bad(`${label} filial ko'lami`, err.message); }
      }

      await restoreQa();
    } catch (err) {
      skip("ruxsat va ko'lam", err.message);
      await restoreQa().catch(() => {});
    }
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;
    await restoreQa();
    for (const v of tempRoles) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${v}`, { token: ownerToken });
      if (r.status === 200) cleaned += 1;
    }
    const forced = await prisma.role.deleteMany({ where: { label: { startsWith: PREFIX } } });
    cleaned += forced.count;

    // Jadval → guruh → xona (FK tartibi).
    const gAll = await prisma.group.findMany({
      where: { name: { startsWith: PREFIX } }, select: { id: true },
    });
    const gIds = [...new Set([...madeGroupIds, ...gAll.map((g) => g.id)])];
    if (gIds.length) {
      const sDel = await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: gIds } } });
      const gDel = await prisma.group.deleteMany({ where: { id: { in: gIds } } });
      cleaned += sDel.count + gDel.count;
    }
    const rDel = await prisma.room.deleteMany({ where: { name: { startsWith: PREFIX } } });
    cleaned += rDel.count;

    console.log(`\n  🧹 tozalandi: ${cleaned} ta yozuv`);

    const after = {
      rooms: await prisma.room.count(),
      groups: await prisma.group.count(),
      schedule: await prisma.groupScheduleItem.count(),
    };
    try {
      assert.deepEqual(after, before, `siljish: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      ok(`baza siljimadi (xona=${after.rooms}, guruh=${after.groups}, jadval=${after.schedule})`);
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
