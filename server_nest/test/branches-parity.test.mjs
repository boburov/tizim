/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 3 — FILIALLAR MODULI PARITETI (Express 5000 ↔ NestJS 5001).
 *
 * ── BAZA GIGIYENASI ──
 *
 * Yaratiladigan yagona narsa — `__parity_` prefiksli FILIAL (direktorSIZ)
 * va bitta vaqtinchalik ROL. Ikkalasi ham yakunda (`finally`) tozalanadi.
 *
 * ⚠ DIREKTOR BILAN yaratish ATAYLAB SINALMAYDI: u doimiy `User` yozuvini
 * qoldirardi va uni faqat arxivlash mumkin (hard delete yo'q). Uning
 * o'rniga o'sha yo'lning VALIDATSIYA shoxlari sinaladi — ular
 * `createWithDirector` da filial yaratilishidan OLDIN turadi, ya'ni
 * muvaffaqiyatsiz so'rov HECH NARSA qoldirmaydi.
 *
 * ⚠ Filial `softRemove` bilan o'chadi, ya'ni `isDeleted:true` qatori
 * qoladi. Bu barcha so'rovlardan (`isDeleted:false`) chetda va Express'da
 * ham xuddi shunday — yangi xatti-harakat emas.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';
const PREFIX = '__parity_';

const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };


/**
 * ⚠ SHU YURISHGA XOS MIJOZ MANZILI — TEZLIK CHEGARASI UCHUN.
 *
 * `authLimiter` (20/5daq) va `generalLimiter` (200/daq) IP bo'yicha
 * sanaydi. Repoda parallel ishlaydigan to'plamlar bitta haqiqiy IP'ni
 * (127.0.0.1) baham ko'radi va byudjet doimiy to'la bo'ladi — natijada
 * to'plam 429 sababli UMUMAN O'LCHANMAYDI (yiqilmaydi ham, o'tmaydi
 * ham; eng yomon natija).
 *
 * Ikkala stek ham `trust proxy: 1` bilan ishlaydi (Express `app.js`,
 * NestJS `main.ts`), ya'ni chegara shu manzil bo'yicha sanaladi va
 * to'plam o'z chelagida yuradi.
 *
 * ⚠ CHEGARA ZAIFLASHMAYDI: u baribir qo'llanadi — to'plam faqat BOSHQA
 * MASHINADAN kelayotgandek ko'rinadi. Chegaraning O'ZI alohida
 * o'lchanadi: `test/rate-limit-parity.test.mjs`.
 *
 * ⚠ BETAKROR bo'lishi SHART: chelak 5 daqiqa yashaydi, qat'iy manzil
 * bilan ketma-ket ikki yurish bir chelakni baham ko'rardi.
 */
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 250n) + 2)}`;

const req = async (base, method, path, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': RUN_IP };
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

const VOLATILE = new Set(['createdAt', 'updatedAt', 'deletedAt', 'archivedAt', 'stack']);

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
  console.log('\n\x1b[1mFAZA 3 — FILIALLAR MODULI PARITETI\x1b[0m\n');

  const ownerToken = await login(EXPRESS, 'owner', 'owner123');

  // Mavjud filial — o'qish tekshiruvlari uchun.
  const branchList = await req(EXPRESS, 'GET', '/api/branches?limit=50', { token: ownerToken });
  const mainBranch = (branchList.body?.data || []).find((b) => b.isMain);
  const anyBranch = (branchList.body?.data || [])[0];
  if (!anyBranch) { console.log('  ❌ bazada filial yo\'q'); process.exit(1); }

  const created = { [EXPRESS]: null, [NEST]: null };
  let parityRoleValue = null;
  let qaStaff = null;
  let qaOriginalRole = null;

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
    console.log('\x1b[2m  ── o\'qish ──\x1b[0m');

    for (const q of [
      '',
      '?limit=5',
      '?includeInactive=true&limit=5',
      '?search=Asosiy',
      '?search=__yoq__',
      '?withManagers=true&limit=5',
      '?page=2&limit=2',
    ]) {
      await both(`GET /branches${q}`, (b) =>
        req(b, 'GET', `/api/branches${q}`, { token: ownerToken }));
    }
    await both('GET /branches?limit=9999 (400)', (b) =>
      req(b, 'GET', '/api/branches?limit=9999', { token: ownerToken }));
    await both("GET /branches (token yo'q → 401)", (b) => req(b, 'GET', '/api/branches'));

    await both('GET /branches/compare', (b) =>
      req(b, 'GET', '/api/branches/compare', { token: ownerToken }));
    await both('GET /branches/delegation-options', (b) =>
      req(b, 'GET', '/api/branches/delegation-options', { token: ownerToken }));
    await both('GET /branches/:id', (b) =>
      req(b, 'GET', `/api/branches/${anyBranch.id}`, { token: ownerToken }));
    await both('GET /branches/:id (404)', (b) =>
      req(b, 'GET', `/api/branches/${'a'.repeat(24)}`, { token: ownerToken }));
    await both('GET /branches/:id/stats', (b) =>
      req(b, 'GET', `/api/branches/${anyBranch.id}/stats`, { token: ownerToken }));
    await both('GET /branches/:id/stats (404)', (b) =>
      req(b, 'GET', `/api/branches/${'a'.repeat(24)}/stats`, { token: ownerToken }));

    // ═══════════════ YARATISH ═══════════════
    console.log('\x1b[2m  ── yaratish ──\x1b[0m');

    const stamp = String(process.hrtime.bigint()).slice(-9);
    const nameOf = (b) => `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`;
    const subs = (b) => [
      [nameOf(b), '<NAME>'],
      ...(created[b] ? [[created[b], '<ID>']] : []),
    ];

    const createRes = await both(
      'POST /branches (direktorsiz)',
      async (b) => {
        const r = await req(b, 'POST', '/api/branches', {
          token: ownerToken,
          body: { name: nameOf(b), code: 'PAR', address: 'Sinov', phone: '+998900000000' },
        });
        if (r.status === 201) created[b] = r.body.data.id;
        return r;
      },
      subs,
    );

    await both('POST /branches (nomsiz → 400)', (b) =>
      req(b, 'POST', '/api/branches', { token: ownerToken, body: {} }), subs);
    await both('POST /branches (takroriy nom → 409)', (b) =>
      req(b, 'POST', '/api/branches', { token: ownerToken, body: { name: nameOf(b) } }), subs);

    // DIREKTOR YO'LI — faqat VALIDATSIYA shoxlari (hech narsa yaratilmaydi).
    await both('POST /branches (direktor logini band → 409)', (b) =>
      req(b, 'POST', '/api/branches', {
        token: ownerToken,
        body: {
          name: `${nameOf(b)}_dir`,
          director: { username: 'owner', password: 'parol123' },
        },
      }), subs);
    await both("POST /branches (direktor telefoni noto'g'ri → 400)", (b) =>
      req(b, 'POST', '/api/branches', {
        token: ownerToken,
        body: {
          name: `${nameOf(b)}_dir2`,
          director: {
            username: `${PREFIX}dir${stamp}`,
            password: 'parol123',
            phone: '12',
          },
        },
      }), subs);
    await both("POST /branches (direktor roli mavjud emas → 400)", (b) =>
      req(b, 'POST', '/api/branches', {
        token: ownerToken,
        body: {
          name: `${nameOf(b)}_dir3`,
          director: {
            username: `${PREFIX}dir2${stamp}`,
            password: 'parol123',
            role: '__nope__',
          },
        },
      }), subs);
    await both('POST /branches (qisqa direktor paroli → 400 validatsiya)', (b) =>
      req(b, 'POST', '/api/branches', {
        token: ownerToken,
        body: { name: `${nameOf(b)}_dir4`, director: { username: 'abc', password: '1' } },
      }), subs);

    if (createRes.e?.status !== 201 || createRes.n?.status !== 201) {
      skip('tahrirlash/o\'chirish qadamlari', 'filial yaratilmadi');
    } else {
      // ═══════════════ TAHRIRLASH ═══════════════
      console.log('\x1b[2m  ── tahrirlash ──\x1b[0m');

      await both('PATCH /branches/:id (manzil)', (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { address: 'Yangi manzil', code: 'par2' },
        }), subs);

      await both("PATCH /branches/:id (bo'sh nom → 400)", (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { name: '   ' },
        }), subs);

      await both('PATCH /branches/:id (404)', (b) =>
        req(b, 'PATCH', `/api/branches/${'a'.repeat(24)}`, {
          token: ownerToken,
          body: { address: 'x' },
        }), subs);

      await both('PATCH /branches/:id (chiqim limiti)', (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { expenseApprovalThreshold: 500000 },
        }), subs);
      await both('PATCH /branches/:id (limit 0 → cheksiz)', (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { expenseApprovalThreshold: 0 },
        }), subs);

      // ── DELEGATSIYA MATRITSASI ──
      console.log('\x1b[2m  ── delegatsiya matritsasi ──\x1b[0m');

      await both('PATCH delegation (to\'g\'ri qoida)', (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { delegation: { staff_hire: { mode: 'approval' } } },
        }), subs);

      // ⚠ ENG MUHIM QOIDA: maosh turlarida `auto` TAQIQLANGAN emas —
      // u ruxsat etilgan; TAQIQLANGANI `staff_hire` da `threshold`
      // (o'lchanadigan summasi yo'q).
      await both('PATCH delegation (staff_hire + threshold → 400)', (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { delegation: { staff_hire: { mode: 'threshold', maxAmount: 100 } } },
        }), subs);

      await both("PATCH delegation (noma'lum tur → 400)", (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { delegation: { __nope__: { mode: 'auto' } } },
        }), subs);

      await both("PATCH delegation (noma'lum rejim → 400 validatsiya)", (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { delegation: { staff_hire: { mode: '__nope__' } } },
        }), subs);

      await both('PATCH delegation (threshold, chegarasiz → 400)', (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: { delegation: { discount_set: { mode: 'threshold' } } },
        }), subs);

      await both("PATCH delegation (turga tegishsiz chegara → 400)", (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: {
            delegation: { discount_set: { mode: 'threshold', minAmount: 100 } },
          },
        }), subs);

      await both('PATCH delegation (maxPercent > 100 → 400 validatsiya)', (b) =>
        req(b, 'PATCH', `/api/branches/${created[b]}`, {
          token: ownerToken,
          body: {
            delegation: { discount_set: { mode: 'threshold', maxPercent: 150 } },
          },
        }), subs);

      // ── YANGI FILIAL STATISTIKASI VA TAQQOSLASHDA KO'RINISHI ──
      await both('GET /branches/:id/stats (yangi filial)', (b) =>
        req(b, 'GET', `/api/branches/${created[b]}/stats`, { token: ownerToken }), subs);
    }

    // ═══════════════ ASOSIY FILIAL HIMOYASI ═══════════════
    console.log('\x1b[2m  ── asosiy filial himoyasi ──\x1b[0m');
    if (mainBranch) {
      await both("PATCH asosiy filial isActive:false → 400", (b) =>
        req(b, 'PATCH', `/api/branches/${mainBranch.id}`, {
          token: ownerToken,
          body: { isActive: false },
        }), subs);
      await both("DELETE asosiy filial → 400", (b) =>
        req(b, 'DELETE', `/api/branches/${mainBranch.id}`, { token: ownerToken }), subs);
    } else {
      skip('asosiy filial himoyasi', 'asosiy filial topilmadi');
    }

    // ═══════════════════════════════════════════════════════════════
    // ⚠⚠ BUZG'UNCHI TEKSHIRUV — NISHON OLDINDAN ISBOTLANADI ⚠⚠
    //
    // Bu qadam HAQIQIY `DELETE` yuboradi va u RAD ETILISHINI kutadi.
    // Agar nishon aslida himoyalanmagan bo'lsa, so'rov MUVAFFAQIYATLI
    // bo'lardi va filial haqiqatan o'chib ketardi.
    //
    // AYNAN SHU SODIR BO'LDI: nishon nom bo'yicha tanlangan edi
    // ("DEMO Markaz") va u himoyalangan deb TAXMIN qilingandi. Aslida
    // unda guruh ham, o'quvchi ham yo'q edi — faqat xodimlar, ular esa
    // ATAYLAB to'smaydi. Filial o'chdi va 6 ta fixture xodimi arxivlandi.
    //
    // QOIDA: rad etilishini kutadigan buzg'unchi so'rovdan OLDIN
    // to'siqning SHARTI o'lchanishi shart. Bu yerda shart —
    // `groupCount > 0` yoki `studentCount > 0` (`softRemove` aynan
    // shularga qaraydi). Shartni qanoatlantiradigan filial topilmasa
    // tekshiruv O'TKAZIB YUBORILADI, TAXMIN QILINMAYDI.
    // ═══════════════════════════════════════════════════════════════
    let protectedBranch = null;
    for (const b of branchList.body?.data || []) {
      if (b.isMain) continue;
      const st = await req(EXPRESS, 'GET', `/api/branches/${b.id}/stats`, {
        token: ownerToken,
      });
      const d = st.body?.data;
      if (st.status === 200 && ((d?.groupCount || 0) > 0 || (d?.studentCount || 0) > 0)) {
        protectedBranch = { ...b, stats: d };
        break;
      }
    }
    if (protectedBranch) {
      console.log(
        `      (nishon: "${protectedBranch.name}" — ` +
          `${protectedBranch.stats.groupCount} guruh, ` +
          `${protectedBranch.stats.studentCount} o'quvchi)`,
      );
      await both("DELETE ma'lumotli filial → 400", (b) =>
        req(b, 'DELETE', `/api/branches/${protectedBranch.id}`, { token: ownerToken }), subs);
    } else {
      skip(
        "ma'lumotli filialni o'chirish",
        "guruh yoki o'quvchisi bor filial topilmadi — TAXMIN QILINMADI",
      );
    }

    // ═══════════════ IMTIYOZ OSHIRISH HIMOYASI ═══════════════
    console.log('\x1b[2m  ── imtiyoz oshirish himoyasi (AND semantikasi) ──\x1b[0m');

    // ⚠ ENG MUHIM TEKSHIRUV: `branches.create` BOR, lekin
    // `system.admin_access` YO'Q aktyor filial OCHA OLMASLIGI kerak.
    // Aks holda filial direktori o'ziga yangi filial ochib, keyin o'zini
    // unga biriktirib, ko'lamini kengaytira olardi.
    //
    // Bunday rol seed'da YO'Q, shuning uchun VAQTINCHA yaratiladi va
    // yakunda o'chiriladi.
    try {
      const matrix = await req(EXPRESS, 'GET', '/api/roles/matrix', { token: ownerToken });
      let createPermId = null;
      let usersReadId = null;
      for (const m of matrix.body.data.modules) {
        for (const cell of Object.values(m.cells)) {
          if (cell.key === 'branches.create') createPermId = cell.id;
          if (cell.key === 'users.read') usersReadId = cell.id;
        }
      }

      const roleRes = await req(EXPRESS, 'POST', '/api/roles', {
        token: ownerToken,
        body: {
          label: `${PREFIX}branchcreate${stamp}`,
          permissionIds: [createPermId, usersReadId].filter(Boolean),
        },
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
      if (pw.status !== 200) throw new Error('qa_staff_a paroli o\'qilmadi');

      const assign = await req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/role`, {
        token: ownerToken,
        body: { role: parityRoleValue },
      });
      if (assign.status !== 200) throw new Error(`rol biriktirilmadi: ${assign.status}`);

      const weakToken = await login(EXPRESS, pw.body.data.username, pw.body.data.password);

      // MUSBAT NAZORAT: aktyor HAQIQATAN filiallarni o'qiy oladi, ya'ni
      // pastdagi 403 "umuman kira olmaydi" dan emas, AYNAN
      // `system.admin_access` yo'qligidan kelib chiqadi.
      await both('MUSBAT NAZORAT: zaif rol filiallarni O\'QIYDI → 200', (b) =>
        req(b, 'GET', '/api/branches?limit=3', { token: weakToken }), subs);

      await both("`branches.create` bor, `system.admin_access` yo'q → 403", (b) =>
        req(b, 'POST', '/api/branches', {
          token: weakToken,
          body: { name: `${PREFIX}yetmaydi${stamp}` },
        }), subs);
      await both("zaif rol filialni TAHRIRLAY olmaydi → 403", (b) =>
        req(b, 'PATCH', `/api/branches/${anyBranch.id}`, {
          token: weakToken,
          body: { address: 'x' },
        }), subs);
      await both("zaif rol filialni O'CHIRA olmaydi → 403", (b) =>
        req(b, 'DELETE', `/api/branches/${anyBranch.id}`, { token: weakToken }), subs);
      await both("zaif rol boshqaruvchi loginini KO'RA olmaydi (parol yo'q)", (b) =>
        req(b, 'GET', '/api/branches?withManagers=true&limit=3', { token: weakToken }), subs);
    } catch (err) {
      skip('imtiyoz oshirish himoyasi', err.message);
    }

    // ═══════════════ O'CHIRISH ═══════════════
    console.log('\x1b[2m  ── o\'chirish ──\x1b[0m');

    if (created[EXPRESS] && created[NEST]) {
      await both("DELETE /branches/:id (bo'sh filial)", async (b) => {
        const r = await req(b, 'DELETE', `/api/branches/${created[b]}`, { token: ownerToken });
        if (r.status === 200) created[b] = null;
        return r;
      }, subs);
    }
    await both('DELETE /branches/:id (404)', (b) =>
      req(b, 'DELETE', `/api/branches/${'a'.repeat(24)}`, { token: ownerToken }), subs);
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    let cleaned = 0;
    // 1) qa_staff_a rolini tiklaymiz (aks holda u sinov rolida qolardi).
    if (qaStaff && qaOriginalRole) {
      const r = await req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/role`, {
        token: ownerToken,
        body: { role: qaOriginalRole },
      });
      if (r.status === 200) cleaned += 1;
    }
    // 2) Vaqtinchalik rol.
    if (parityRoleValue) {
      const r = await req(EXPRESS, 'DELETE', `/api/roles/${parityRoleValue}`, {
        token: ownerToken,
      });
      if (r.status === 200) cleaned += 1;
    }
    // 3) Prefiksli filiallar — ikkala stekda ham, oldingi yurishdan
    //    qolganlari bilan birga.
    for (const base of [EXPRESS, NEST]) {
      const all = await req(base, 'GET', '/api/branches?includeInactive=true&limit=500', {
        token: ownerToken,
      });
      for (const b of all.body?.data || []) {
        if (String(b.name || '').startsWith(PREFIX)) {
          const d = await req(base, 'DELETE', `/api/branches/${b.id}`, { token: ownerToken });
          if (d.status === 200) cleaned += 1;
        }
      }
    }
    console.log(`\n  🧹 tozalandi: ${cleaned} ta obyekt`);

    // ── YAKUNIY HOLAT TEKSHIRUVI ──
    const leftovers = await req(EXPRESS, 'GET', '/api/branches?includeInactive=true&limit=500', {
      token: ownerToken,
    });
    const remaining = (leftovers.body?.data || []).filter((b) =>
      String(b.name || '').startsWith(PREFIX),
    );
    const staffNow = qaStaff
      ? await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}`, { token: ownerToken })
      : null;
    try {
      assert.equal(remaining.length, 0, `${remaining.length} ta sinov filiali qoldi`);
      if (staffNow) {
        assert.equal(staffNow.body?.data?.role, qaOriginalRole, 'qa_staff_a roli');
      }
      ok('sinov obyektlari qolmadi, fixture roli tiklandi');
    } catch (err) {
      bad('tozalash to\'liq bo\'lmadi', err.message);
    }
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
