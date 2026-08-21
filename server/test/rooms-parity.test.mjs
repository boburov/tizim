/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 3 — XONALAR MODULI PARITETI (Express 5000 ↔ NestJS 5001).
 *
 * ── BAZA GIGIYENASI ──
 *
 * Yaratiladigan narsalar, hammasi `__parity_` prefiksi bilan:
 *   • XONA — har bir stekda bittadan (API orqali)
 *   • GURUH — o'chirish to'sig'i uchun fixture (Prisma orqali, QATTIQ o'chadi)
 *   • ROL  — zaif aktyor uchun vaqtinchalik rol
 * Hammasi `finally` da tozalanadi va yakunda QAYTA TEKSHIRILADI.
 *
 * ⚠ Xona `softRemove` bilan o'chadi, ya'ni `isDeleted:true` qatori qoladi.
 * U barcha so'rovlardan (`isDeleted:false`) chetda va Express'da ham xuddi
 * shunday — yangi xatti-harakat emas. Qisman unique indeks
 * (`branchId, name` WHERE `isDeleted=false`) ham o'chirilgan qatorni
 * hisobga olmaydi, ya'ni takroriy yurishlar to'qnashmaydi.
 *
 * ── IKKI TEST SIFATI QOIDASI ──
 *
 * ⚠ 1. BUZG'UNCHI TEKSHIRUV NISHONI TAXMIN QILINMAYDI.
 * "Faol guruhi bor xonani o'chirib bo'lmaydi" tekshiruvi HAQIQIY `DELETE`
 * yuboradi. Ilgari bu yerda bazadagi tayyor xona qidirilardi va topilmasa
 * tekshiruv O'TKAZIB YUBORILARDI — ya'ni to'siq HECH QACHON o'lchanmasdi.
 * Endi shart O'ZIMIZ QURAMIZ: sinov xonasiga sinov guruhi biriktiriladi.
 * Nishon ham, guruh ham BIZNIKI — ishlab chiqarish ma'lumotiga tegilmaydi.
 * Bundan tashqari `finally` da xona holati qayta o'qiladi: to'siq
 * ishlamagan bo'lsa xona TIKLANADI va test YIQILADI.
 *
 * ⚠ 2. MUSBAT NAZORAT HAQIQATAN MUSBAT BO'LISHI SHART.
 * Zaif aktyorning `classes.read` bilan 200 olishi — pastdagi 403 larning
 * MA'NOSI. Aktyor umuman kira olmasa, hamma javob 403 bo'lardi va ikkala
 * stek "bir xil" chiqib, tekshiruv YASHIL bo'lardi — aslida hech narsa
 * o'lchanmasdan.
 *
 * ⚠ ROL FAQAT `user.role` ORQALI BERILMAYDI. Amaldagi rol
 * `resolveRoleForBranch` bilan aniqlanadi va u FILIAL BIRIKMASIDAGI
 * (`branchAssignments[].role`) rolni USTUN qo'yadi. Faqat `user.role` ni
 * o'zgartirish JIMGINA e'tiborsiz qolardi — aynan shu sabab birinchi
 * yurishda musbat nazorat 403 bergan edi.
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

const VOLATILE = new Set(['createdAt', 'updatedAt', 'deletedAt', 'stack']);

/** Stekka xos qiymatlarni belgiga almashtiradi. */
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
  console.log(`\n${BOLD}FAZA 3 — XONALAR MODULI PARITETI${OFF}\n`);

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  const branchRes = await req(EXPRESS, 'GET', '/api/branches?limit=50', { token: ownerToken });
  const branches = branchRes.body?.data || [];
  if (!branches.length) { console.log("  ❌ bazada filial yo'q"); process.exit(1); }
  const branchA = branches[0];
  const branchB = branches[1] || null;

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const created = { [EXPRESS]: null, [NEST]: null };
  const fixtureGroupIds = [];
  let parityRoleValue = null;
  let qaStaff = null;
  let qaRestore = null;

  const nameOf = (b) => `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`;
  const subs = (b) => [
    [nameOf(b), '<NAME>'],
    [created[b] || ' ', '<ID>'],
  ];

  const both = async (name, fn, subsOf = () => []) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: normalize(e.body, subsOf(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subsOf(NEST)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  try {
    // ═══════════════ O'QISH ═══════════════
    head("o'qish (ro'yxat, filtr, saralash, sahifalash)");

    for (const q of [
      '',
      '?limit=5',
      '?includeInactive=true&limit=5',
      '?includeInactive=false&limit=5',
      '?search=101',
      '?search=__yoq__',
      '?page=2&limit=2',
      '?page=1&limit=1',
      `?branchId=${branchA.id}`,
      `?branchId=${branchA.id}&includeInactive=true`,
    ]) {
      await both(`GET /rooms${q}`, (b) => req(b, 'GET', `/api/rooms${q}`, { token: ownerToken }));
    }

    // ── VALIDATSIYA CHEGARALARI (400) ──
    await both('GET /rooms?limit=9999 → 400', (b) =>
      req(b, 'GET', '/api/rooms?limit=9999', { token: ownerToken }));
    await both('GET /rooms?limit=0 → 400', (b) =>
      req(b, 'GET', '/api/rooms?limit=0', { token: ownerToken }));
    await both('GET /rooms?page=0 → 400', (b) =>
      req(b, 'GET', '/api/rooms?page=0', { token: ownerToken }));
    await both("GET /rooms?branchId= (bo'sh) → 400", (b) =>
      req(b, 'GET', '/api/rooms?branchId=', { token: ownerToken }));

    await both("GET /rooms (token yo'q → 401)", (b) => req(b, 'GET', '/api/rooms'));
    await both("GET /rooms/:id (token yo'q → 401)", (b) =>
      req(b, 'GET', `/api/rooms/${'a'.repeat(24)}`));
    await both('GET /rooms/:id (404)', (b) =>
      req(b, 'GET', `/api/rooms/${'a'.repeat(24)}`, { token: ownerToken }));

    // Mavjud xona — bittalab o'qish.
    const anyList = await req(EXPRESS, 'GET', '/api/rooms?includeInactive=true&limit=200', {
      token: ownerToken,
    });
    const existingRoom = (anyList.body?.data || []).find(
      (r) => !String(r.name || '').startsWith(PREFIX),
    );
    if (existingRoom) {
      await both('GET /rooms/:id (mavjud)', (b) =>
        req(b, 'GET', `/api/rooms/${existingRoom.id}`, { token: ownerToken }));
    } else {
      skip('GET /rooms/:id (mavjud)', "bazada xona yo'q");
    }

    // ═══════════════ YARATISH ═══════════════
    head('yaratish');

    await both('POST /rooms', async (b) => {
      const r = await req(b, 'POST', '/api/rooms', {
        token: ownerToken,
        body: {
          name: nameOf(b),
          branchId: branchA.id,
          capacity: 14,
          areaM2: 18.5,
          equipment: ['doska', 'proyektor'],
          note: 'paritet',
        },
      });
      if (r.status === 201) created[b] = r.body.data.id;
      return r;
    }, subs);

    if (!created[EXPRESS] || !created[NEST]) {
      skip("yaratishga bog'liq tekshiruvlar", 'xona yaratilmadi');
    } else {
      // TAKRORIY NOM — 409 (qisman unique indeks + ochiq tekshiruv).
      await both('POST /rooms (takroriy nom → 409)', (b) =>
        req(b, 'POST', '/api/rooms', {
          token: ownerToken,
          body: { name: nameOf(b), branchId: branchA.id },
        }), subs);

      await both("POST /rooms (nom yo'q → 400)", (b) =>
        req(b, 'POST', '/api/rooms', { token: ownerToken, body: { branchId: branchA.id } }), subs);
      await both('POST /rooms (capacity manfiy → 400)', (b) =>
        req(b, 'POST', '/api/rooms', {
          token: ownerToken,
          body: { name: `${nameOf(b)}x`, branchId: branchA.id, capacity: -1 },
        }), subs);
      await both('POST /rooms (equipment 31 ta → 400)', (b) =>
        req(b, 'POST', '/api/rooms', {
          token: ownerToken,
          body: {
            name: `${nameOf(b)}y`,
            branchId: branchA.id,
            equipment: Array.from({ length: 31 }, (_, i) => `e${i}`),
          },
        }), subs);

      await both('GET /rooms/:id (yangi xona)', (b) =>
        req(b, 'GET', `/api/rooms/${created[b]}`, { token: ownerToken }), subs);

      // ═══════════════ YANGILASH ═══════════════
      head('yangilash');

      await both("PATCH /rooms/:id (sig'im + izoh)", (b) =>
        req(b, 'PATCH', `/api/rooms/${created[b]}`, {
          token: ownerToken,
          body: { capacity: 20, note: 'yangilandi' },
        }), subs);
      await both('PATCH /rooms/:id (isActive=false)', (b) =>
        req(b, 'PATCH', `/api/rooms/${created[b]}`, {
          token: ownerToken,
          body: { isActive: false },
        }), subs);

      // NOFAOL XONA STANDART RO'YXATDA KO'RINMASLIGI SHART.
      const inactiveHidden = await Promise.all([EXPRESS, NEST].map(async (b) => {
        const r = await req(b, 'GET', `/api/rooms?search=${nameOf(b)}`, { token: ownerToken });
        return (r.body?.data || []).length;
      }));
      try {
        assert.deepEqual(inactiveHidden, [0, 0]);
        ok("nofaol xona standart ro'yxatda YO'Q (ikkala stekda)");
      } catch {
        bad("nofaol xona standart ro'yxatda", `express=${inactiveHidden[0]} nest=${inactiveHidden[1]}`);
      }
      const inactiveShown = await Promise.all([EXPRESS, NEST].map(async (b) => {
        const r = await req(b, 'GET', `/api/rooms?includeInactive=true&search=${nameOf(b)}`, {
          token: ownerToken,
        });
        return (r.body?.data || []).length;
      }));
      try {
        assert.deepEqual(inactiveShown, [1, 1]);
        ok("MUSBAT NAZORAT: includeInactive=true bilan KO'RINADI");
      } catch {
        bad('includeInactive musbat nazorati', `express=${inactiveShown[0]} nest=${inactiveShown[1]}`);
      }

      await both('PATCH /rooms/:id (isActive=true qaytarish)', (b) =>
        req(b, 'PATCH', `/api/rooms/${created[b]}`, {
          token: ownerToken,
          body: { isActive: true },
        }), subs);

      // ⚠ FILIALNI ALMASHTIRISH TAQIQLANADI — 400.
      if (branchB) {
        await both('PATCH /rooms/:id (filialni almashtirish → 400)', (b) =>
          req(b, 'PATCH', `/api/rooms/${created[b]}`, {
            token: ownerToken,
            body: { branchId: branchB.id },
          }), subs);
      } else {
        skip('filialni almashtirish taqiqi', "ikkinchi filial yo'q");
      }
      // O'SHA filialni yuborish — o'zgarish emas, o'tishi SHART.
      await both("PATCH /rooms/:id (o'sha filial → 200)", (b) =>
        req(b, 'PATCH', `/api/rooms/${created[b]}`, {
          token: ownerToken,
          body: { branchId: branchA.id },
        }), subs);

      await both('PATCH /rooms/:id (404)', (b) =>
        req(b, 'PATCH', `/api/rooms/${'a'.repeat(24)}`, {
          token: ownerToken,
          body: { note: 'x' },
        }), subs);

      // ═══════════════════════════════════════════════════════════════
      // ⚠⚠ BUZG'UNCHI TEKSHIRUV — SHARTNI O'ZIMIZ QURAMIZ ⚠⚠
      //
      // `softRemove` shu shartga qaraydi:
      //     group.count({ roomId, isActive: true, isDeleted: false }) > 0
      //
      // Shuning uchun har bir stekning O'Z sinov xonasiga sinov guruhi
      // biriktiriladi. Ilgari bazadan tayyor nishon qidirilardi va
      // topilmasa tekshiruv o'tkazib yuborilardi — to'siq hech qachon
      // o'lchanmasdi. Endi shart DOIM bajariladi va nishon BIZNIKI.
      // ═══════════════════════════════════════════════════════════════
      head("o'chirish to'sig'i (buzg'unchi, o'z fixture'imiz bilan)");

      try {
        for (const b of [EXPRESS, NEST]) {
          const g = await prisma.group.create({
            data: {
              branchId: branchA.id,
              name: `${PREFIX}grp${b === EXPRESS ? 'e' : 'n'}${stamp}`,
              roomId: created[b],
              isActive: true,
            },
            select: { id: true },
          });
          fixtureGroupIds.push(g.id);
        }

        // MUSBAT NAZORAT: guruh HAQIQATAN sanaldimi. `groupCount` — aynan
        // to'siq qaraydigan shartning o'lchovi. 0 bo'lsa pastdagi 400
        // boshqa sababdan kelib chiqqan bo'lardi.
        const counts = await Promise.all([EXPRESS, NEST].map(async (b) => {
          const r = await req(b, 'GET', `/api/rooms?includeInactive=true&search=${nameOf(b)}`, {
            token: ownerToken,
          });
          return (r.body?.data || [])[0]?.groupCount ?? 0;
        }));
        try {
          assert.deepEqual(counts, [1, 1]);
          ok('MUSBAT NAZORAT: fixture guruh sanaldi (groupCount=1, ikkala stekda)');
        } catch {
          bad('fixture guruh sanalmadi', `express=${counts[0]} nest=${counts[1]}`);
        }

        await both('DELETE faol guruhli xona → 400', (b) =>
          req(b, 'DELETE', `/api/rooms/${created[b]}`, { token: ownerToken }), subs);

        // ⚠ TO'SIQ HAQIQATAN USHLAB QOLDIMI — bazadan o'qib tekshiramiz.
        const stillAlive = await prisma.room.findMany({
          where: { id: { in: [created[EXPRESS], created[NEST]] } },
          select: { id: true, isDeleted: true },
        });
        if (stillAlive.length === 2 && stillAlive.every((r) => !r.isDeleted)) {
          ok("to'siq ushlab qoldi: ikkala xona ham o'chmagan");
        } else {
          bad("TO'SIQ ISHLAMADI", `xonalar holati: ${JSON.stringify(stillAlive)}`);
        }

        // Guruhlarni QATTIQ o'chiramiz — endi xona bo'shaydi.
        await prisma.group.deleteMany({ where: { id: { in: fixtureGroupIds } } });
        fixtureGroupIds.length = 0;

        // MUSBAT NAZORAT: guruh olingach O'CHIRISH ISHLAYDI. Aks holda
        // yuqoridagi 400 "har doim 400" bo'lib chiqardi va to'siq
        // ma'nosini yo'qotardi.
        const afterCounts = await Promise.all([EXPRESS, NEST].map(async (b) => {
          const r = await req(b, 'GET', `/api/rooms?includeInactive=true&search=${nameOf(b)}`, {
            token: ownerToken,
          });
          return (r.body?.data || [])[0]?.groupCount ?? -1;
        }));
        try {
          assert.deepEqual(afterCounts, [0, 0]);
          ok('MUSBAT NAZORAT: guruh olingach groupCount=0');
        } catch {
          bad('guruh olinmadi', `express=${afterCounts[0]} nest=${afterCounts[1]}`);
        }
      } catch (err) {
        skip("o'chirish to'sig'i", err.message);
        if (fixtureGroupIds.length) {
          await prisma.group.deleteMany({ where: { id: { in: fixtureGroupIds } } });
          fixtureGroupIds.length = 0;
        }
      }
    }

    // ═══════════════ RUXSAT VA FILIAL KO'LAMI ═══════════════
    head("ruxsat va filial ko'lami himoyasi");

    try {
      const matrix = await req(EXPRESS, 'GET', '/api/roles/matrix', { token: ownerToken });
      let classesReadId = null;
      for (const m of matrix.body.data.modules) {
        for (const cell of Object.values(m.cells)) {
          if (cell.key === 'classes.read') classesReadId = cell.id;
        }
      }
      if (!classesReadId) throw new Error('classes.read ruxsati matritsada topilmadi');

      const roleRes = await req(EXPRESS, 'POST', '/api/roles', {
        token: ownerToken,
        body: { label: `${PREFIX}roomsread${stamp}`, permissionIds: [classesReadId] },
      });
      if (roleRes.status !== 201) throw new Error(`rol yaratilmadi: ${roleRes.status}`);
      parityRoleValue = roleRes.body.data.value;

      const users = await req(EXPRESS, 'GET', '/api/users?staff=1&limit=200&status=all', {
        token: ownerToken,
      });
      qaStaff = (users.body?.data || []).find((u) => u.username === 'qa_staff_a');
      if (!qaStaff) throw new Error('qa_staff_a topilmadi');

      // TIKLASH NUQTASI — rol VA filial birikmalari birga saqlanadi.
      const full = await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}`, { token: ownerToken });
      qaRestore = {
        role: full.body.data.role,
        homeBranchId: full.body.data.homeBranchId,
        branchAssignments: (full.body.data.branchAssignments || []).map((a) => ({
          branchId: a.branchId,
          role: a.role,
        })),
      };

      const pw = await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}/password`, {
        token: ownerToken,
      });
      if (pw.status !== 200) throw new Error("qa_staff_a paroli o'qilmadi");

      // ⚠ IKKALA JOYDA HAM: `user.role` VA `branchAssignments[].role`.
      // Amaldagi rolni `resolveRoleForBranch` beradi va u BIRIKMANI
      // ustun qo'yadi — faqat `user.role` ni o'zgartirish e'tiborsiz
      // qolardi va musbat nazorat 403 bo'lib yolg'on "paritet" berardi.
      const assign = await req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/role`, {
        token: ownerToken, body: { role: parityRoleValue },
      });
      if (assign.status !== 200) throw new Error(`rol biriktirilmadi: ${assign.status}`);
      const rebind = await req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/branches`, {
        token: ownerToken,
        body: {
          homeBranchId: qaRestore.homeBranchId,
          branchAssignments: qaRestore.branchAssignments.map((a) => ({
            branchId: a.branchId,
            role: parityRoleValue,
          })),
        },
      });
      if (rebind.status !== 200) throw new Error(`filial birikmasi yangilanmadi: ${rebind.status}`);

      const weakToken = await login(EXPRESS, pw.body.data.username, pw.body.data.password);

      // ⚠ MUSBAT NAZORAT O'LCHANADI, TAXMIN QILINMAYDI: aktyor
      // HAQIQATAN 200 olishi kerak. 200 bo'lmasa pastdagi 403 lar
      // "umuman kira olmaydi" dan kelib chiqadi va HECH NARSA isbotlamaydi.
      const posE = await req(EXPRESS, 'GET', '/api/rooms?limit=3', { token: weakToken });
      const posN = await req(NEST, 'GET', '/api/rooms?limit=3', { token: weakToken });
      if (posE.status !== 200 || posN.status !== 200) {
        throw new Error(
          `musbat nazorat 200 BERMADI (express=${posE.status}, nest=${posN.status}) — ` +
            "salbiy tekshiruvlar ma'nosiz bo'lardi",
        );
      }
      await both("MUSBAT NAZORAT: `classes.read` xonalarni O'QIYDI → 200", (b) =>
        req(b, 'GET', '/api/rooms?limit=3', { token: weakToken }), subs);

      await both("`classes.create` yo'q → POST 403", (b) =>
        req(b, 'POST', '/api/rooms', {
          token: weakToken, body: { name: `${PREFIX}yetmaydi${stamp}`, branchId: branchA.id },
        }), subs);
      await both("`classes.update` yo'q → PATCH 403", (b) =>
        req(b, 'PATCH', `/api/rooms/${created[b] || 'a'.repeat(24)}`, {
          token: weakToken, body: { note: 'x' },
        }), subs);
      await both("`classes.delete` yo'q → DELETE 403", (b) =>
        req(b, 'DELETE', `/api/rooms/${created[b] || 'a'.repeat(24)}`, { token: weakToken }), subs);

      // ── FILIAL KO'LAMI: ruxsatsiz filial so'ralsa 403 ──
      const weakBranches = await req(EXPRESS, 'GET', '/api/branches?limit=50', { token: weakToken });
      const weakIds = new Set((weakBranches.body?.data || []).map((b) => String(b.id)));
      const foreign = branches.find((b) => !weakIds.has(String(b.id)));
      if (foreign) {
        console.log(`      (begona filial: "${foreign.name}")`);
        await both("begona filial so'ralsa → 403", (b) =>
          req(b, 'GET', `/api/rooms?branchId=${foreign.id}`, { token: weakToken }), subs);
        // MUSBAT NAZORAT: O'Z filialini so'rash ISHLAYDI — ya'ni
        // yuqoridagi 403 `branchId` parametrining o'zidan emas.
        const own = [...weakIds][0];
        if (own) {
          await both("MUSBAT NAZORAT: o'z filiali so'ralsa → 200", (b) =>
            req(b, 'GET', `/api/rooms?branchId=${own}`, { token: weakToken }), subs);
        }
      } else {
        skip("begona filial ko'lami", "qa_staff_a ko'lamidan tashqari filial yo'q — TAXMIN QILINMADI");
      }
    } catch (err) {
      skip("ruxsat va ko'lam himoyasi", err.message);
    }

    // ═══════════════ O'CHIRISH ═══════════════
    head("o'chirish");

    if (created[EXPRESS] && created[NEST]) {
      await both("DELETE /rooms/:id (bo'sh xona)", async (b) => {
        const r = await req(b, 'DELETE', `/api/rooms/${created[b]}`, { token: ownerToken });
        if (r.status === 200) created[b] = null;
        return r;
      }, subs);
    }
    await both('DELETE /rooms/:id (404)', (b) =>
      req(b, 'DELETE', `/api/rooms/${'a'.repeat(24)}`, { token: ownerToken }));
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;

    // 1) Fixture guruhlar (agar oraliqda yiqilgan bo'lsa qolib ketardi).
    const strayGroups = await prisma.group.findMany({
      where: { name: { startsWith: PREFIX } }, select: { id: true },
    });
    if (strayGroups.length) {
      await prisma.group.deleteMany({ where: { id: { in: strayGroups.map((g) => g.id) } } });
      cleaned += strayGroups.length;
    }

    // 2) qa_staff_a — rol VA filial birikmalari tiklanadi.
    // ⚠ TIKLASH API'GA TAYANMAYDI — TO'G'RIDAN-TO'G'RI BAZAGA YOZADI.
    // Tozalash yo'li test yiqilgan sabab bilan (login chegarasi 429,
    // token muddati) BIR XIL sababdan yiqilmasligi kerak — aks holda
    // fixture ELEVATSIYADA qolib ketadi.
    if (qaStaff && qaRestore) {
      await prisma.user.update({
        where: { id: qaStaff.id },
        data: { role: qaRestore.role, homeBranchId: qaRestore.homeBranchId },
      });
      for (const a of qaRestore.branchAssignments) {
        await prisma.userBranchAssignment.updateMany({
          where: { userId: qaStaff.id, branchId: a.branchId },
          data: { role: a.role },
        });
      }
      cleaned += 2;
    }

    // 3) Vaqtinchalik rol.
    if (parityRoleValue) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${parityRoleValue}`, { token: ownerToken });
      if (r.status === 200) cleaned += 1;
    }
    // ⚠ ZAXIRA YO'L: API rad etsa (429/401) rol bazada qolib ketardi.
    const forcedRoles = await prisma.role.deleteMany({
      where: { label: { startsWith: PREFIX } },
    });
    cleaned += forcedRoles.count;

    // 4) Prefiksli xonalar — ikkala stekda, oldingi yurishdan qolganlari bilan.
    for (const base of [EXPRESS, NEST]) {
      const all = await req(base, 'GET', '/api/rooms?includeInactive=true&limit=500', {
        token: ownerToken,
      });
      for (const r of all.body?.data || []) {
        if (String(r.name || '').startsWith(PREFIX)) {
          const d = await req(base, 'DELETE', `/api/rooms/${r.id}`, { token: ownerToken });
          if (d.status === 200) cleaned += 1;
        }
      }
    }
    // 5) ⚠ QATTIQ O'CHIRISH — "BAZA SILJIMASIN" TALABI.
    //
    // API `softRemove` ishlatadi, ya'ni `isDeleted:true` qatorlari qolardi.
    // Ular so'rovlardan chetda bo'lsa-da, HAR YURISHDA 2 tadan to'planib
    // borardi — bu jimgina siljish. Qatorlar BIZNIKI (`__parity_` prefiksi,
    // shu yurishda yaratilgan) va fixture guruhlari allaqachon olib
    // tashlangan, ya'ni ularga hech qanday havola qolmagan.
    const hard = await prisma.room.deleteMany({ where: { name: { startsWith: PREFIX } } });
    cleaned += hard.count;

    console.log(`\n  🧹 tozalandi: ${cleaned} ta obyekt`);

    // ── YAKUNIY HOLAT ──
    const leftovers = await req(EXPRESS, 'GET', '/api/rooms?includeInactive=true&limit=500', {
      token: ownerToken,
    });
    const remaining = (leftovers.body?.data || []).filter((r) =>
      String(r.name || '').startsWith(PREFIX),
    );
    const groupsLeft = await prisma.group.count({ where: { name: { startsWith: PREFIX } } });
    const staffNow = qaStaff
      ? await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}`, { token: ownerToken })
      : null;
    try {
      assert.equal(remaining.length, 0, `${remaining.length} ta sinov xonasi qoldi`);
      assert.equal(groupsLeft, 0, `${groupsLeft} ta sinov guruhi qoldi`);
      if (staffNow && qaRestore) {
        assert.equal(staffNow.body?.data?.role, qaRestore.role, 'qa_staff_a roli');
        assert.deepEqual(
          (staffNow.body?.data?.branchAssignments || []).map((a) => ({
            branchId: a.branchId, role: a.role,
          })),
          qaRestore.branchAssignments,
          'qa_staff_a filial birikmalari',
        );
      }
      ok('sinov obyektlari qolmadi, fixture roli va birikmalari tiklandi');
    } catch (err) {
      bad("tozalash to'liq bo'lmadi", err.message);
    }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
