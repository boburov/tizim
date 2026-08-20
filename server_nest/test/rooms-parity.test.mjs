/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 3 — XONALAR MODULI PARITETI (Express 5000 ↔ NestJS 5001).
 *
 * ── BAZA GIGIYENASI ──
 *
 * Yaratiladigan narsalar: `__parity_` prefiksli XONALAR (ikkala stekda) va
 * bitta vaqtinchalik ROL. Hammasi `finally` da tozalanadi.
 *
 * ⚠ Xona `softRemove` bilan o'chadi, ya'ni `isDeleted:true` qatori qoladi.
 * U barcha so'rovlardan (`isDeleted:false`) chetda va Express'da ham xuddi
 * shunday — yangi xatti-harakat emas. Qisman unique indeks
 * (`branchId, name` WHERE `isDeleted=false`) ham o'chirilgan qatorni
 * hisobga olmaydi, ya'ni takroriy yurishlar to'qnashmaydi.
 *
 * ⚠⚠ BUZG'UNCHI TEKSHIRUV XAVFSIZLIK TO'RI BILAN ⚠⚠
 * "Faol guruhi bor xonani o'chirib bo'lmaydi" tekshiruvi HAQIQIY xonaga
 * `DELETE` yuboradi. Nishon TAXMIN QILINMAYDI — `groupCount > 0` ochiq
 * o'lchanadi (bu aynan `softRemove` qaraydigan shart). Bundan tashqari
 * `finally` da nishon holati QAYTA O'QILADI va agar to'siq ishlamay xona
 * o'chib qolgan bo'lsa — TIKLANADI va test YIQILADI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import prisma from '../../server/src/config/prisma.js';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';
const PREFIX = '__parity_';

const DIM = '[2m';
const BOLD = '[1m';
const OFF = '[0m';

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

const login = async (base, l, p) => {
  const r = await req(base, 'POST', '/api/auth/login', { body: { login: l, password: p } });
  if (r.status !== 200) throw new Error(`login ${l}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data.accessToken;
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
  let parityRoleValue = null;
  let qaStaff = null;
  let qaOriginalRole = null;
  let destructiveTarget = null;

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
    }

    // ═══════════════════════════════════════════════════════════════
    // ⚠⚠ BUZG'UNCHI TEKSHIRUV — NISHON OLDINDAN O'LCHANADI ⚠⚠
    //
    // "Faol guruhi bor xonani o'chirib bo'lmaydi" — bu HAQIQIY xonaga
    // yuborilgan `DELETE`. Nishon nom bo'yicha TAXMIN QILINMAYDI:
    // `groupCount > 0` ro'yxat javobidan o'qiladi va u aynan
    // `softRemove` qaraydigan shart (`roomId, isActive, isDeleted:false`).
    // Shart bajariladigan xona topilmasa — O'TKAZIB YUBORILADI.
    // ═══════════════════════════════════════════════════════════════
    head("o'chirish to'sig'i (buzg'unchi)");

    destructiveTarget = (anyList.body?.data || []).find(
      (r) => (r.groupCount || 0) > 0 && !String(r.name || '').startsWith(PREFIX),
    );
    if (destructiveTarget) {
      console.log(`      (nishon: "${destructiveTarget.name}" — ${destructiveTarget.groupCount} faol guruh)`);
      await both('DELETE faol guruhli xona → 400', (b) =>
        req(b, 'DELETE', `/api/rooms/${destructiveTarget.id}`, { token: ownerToken }), subs);
    } else {
      skip("faol guruhli xonani o'chirish", 'groupCount>0 xona topilmadi — TAXMIN QILINMADI');
    }

    // ═══════════════ IMTIYOZ / KO'LAM HIMOYASI ═══════════════
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
      qaOriginalRole = qaStaff.role;

      const pw = await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}/password`, {
        token: ownerToken,
      });
      if (pw.status !== 200) throw new Error("qa_staff_a paroli o'qilmadi");

      const assign = await req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/role`, {
        token: ownerToken, body: { role: parityRoleValue },
      });
      if (assign.status !== 200) throw new Error(`rol biriktirilmadi: ${assign.status}`);

      const weakToken = await login(EXPRESS, pw.body.data.username, pw.body.data.password);

      // MUSBAT NAZORAT: aktyor HAQIQATAN xonalarni o'qiy oladi — ya'ni
      // pastdagi 403 lar "umuman kira olmaydi" dan EMAS, aynan yozish
      // ruxsati yo'qligidan kelib chiqadi.
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
      //
      // `qa_staff_a` ning ko'lamidan TASHQARIDAGI filial topilsa
      // sinaladi; topilmasa TAXMIN QILINMAYDI.
      const weakBranches = await req(EXPRESS, 'GET', '/api/branches?limit=50', { token: weakToken });
      const weakIds = new Set((weakBranches.body?.data || []).map((b) => String(b.id)));
      const foreign = branches.find((b) => !weakIds.has(String(b.id)));
      if (foreign) {
        console.log(`      (begona filial: "${foreign.name}")`);
        await both("begona filial so'ralsa → 403", (b) =>
          req(b, 'GET', `/api/rooms?branchId=${foreign.id}`, { token: weakToken }), subs);
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

    if (qaStaff && qaOriginalRole) {
      const r = await req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/role`, {
        token: ownerToken, body: { role: qaOriginalRole },
      });
      if (r.status === 200) cleaned += 1;
    }
    if (parityRoleValue) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${parityRoleValue}`, { token: ownerToken });
      if (r.status === 200) cleaned += 1;
    }
    // Prefiksli xonalar — ikkala stekda, oldingi yurishdan qolganlari bilan.
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
    console.log(`\n  🧹 tozalandi: ${cleaned} ta obyekt`);

    // ── XAVFSIZLIK TO'RI: buzg'unchi nishon TIRIKMI ──
    //
    // To'siq ishlamagan bo'lsa xona jimgina o'chib ketardi. Bu yerda
    // holat QAYTA O'QILADI, TIKLANADI va test YIQILADI.
    if (destructiveTarget) {
      const row = await prisma.room.findUnique({
        where: { id: destructiveTarget.id },
        select: { id: true, name: true, isDeleted: true },
      });
      if (row?.isDeleted) {
        await prisma.room.update({
          where: { id: row.id },
          data: { isDeleted: false, deletedAt: null, deletedBy: null },
        });
        bad("TO'SIQ ISHLAMADI", `"${row.name}" o'chib ketgan edi — TIKLANDI`);
      } else {
        ok(`buzg'unchi nishon tirik: "${destructiveTarget.name}"`);
      }
    }

    // ── YAKUNIY HOLAT ──
    const leftovers = await req(EXPRESS, 'GET', '/api/rooms?includeInactive=true&limit=500', {
      token: ownerToken,
    });
    const remaining = (leftovers.body?.data || []).filter((r) =>
      String(r.name || '').startsWith(PREFIX),
    );
    const staffNow = qaStaff
      ? await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}`, { token: ownerToken })
      : null;
    try {
      assert.equal(remaining.length, 0, `${remaining.length} ta sinov xonasi qoldi`);
      if (staffNow) assert.equal(staffNow.body?.data?.role, qaOriginalRole, 'qa_staff_a roli');
      ok('sinov obyektlari qolmadi, fixture roli tiklandi');
    } catch (err) {
      bad("tozalash to'liq bo'lmadi", err.message);
    }

    await prisma.$disconnect();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
