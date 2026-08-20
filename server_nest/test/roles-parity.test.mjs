/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 2.4 — ROLLAR MODULI PARITETI (Express 5000 ↔ NestJS 5001).
 *
 * `GET` yo'llari `test/parity.mjs` da ham bor; BU YERDA esa MUTATSIYALAR
 * tekshiriladi — ular parity garnizoniga qo'shib bo'lmaydi, chunki har
 * chaqiruv holatni o'zgartiradi va ikkala stek BIR XIL yozuvni yarata
 * olmaydi.
 *
 * ── QANDAY ISHLAYDI ──
 * Har bir qadam IKKALA stekda ALOHIDA, LEKIN AYNAN BIR XIL ssenariy
 * bo'yicha bajariladi (har biri o'z sinov rolini yaratadi). Javoblar
 * normalizatsiya qilinadi — stekka xos qiymatlar (rol `value`, `label`,
 * `id`, vaqt tamg'alari) belgi bilan almashtiriladi — va shundan keyin
 * chuqur solishtiriladi.
 *
 * ── BAZA GIGIYENASI ──
 * Yaratiladigan yagona narsa — `__parity_` prefiksli CUSTOM ROL.
 * Moliyaviy yoki shaxsiy ma'lumot YARATILMAYDI. Yakunda (`finally`)
 * prefiks bo'yicha hammasi o'chiriladi, test yiqilsa ham.
 *
 * ⚠ MAVJUD ROLLAR FAQAT O'QILADI. Ular ustidagi mutatsiya sinovlari
 * ATAYLAB FAQAT XATO BERADIGAN holatlar (tizim roli, foydalanuvchisi bor
 * rol) — ya'ni muvaffaqiyatli yozuv sodir BO'LMAYDI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';
const PREFIX = '__parity_';

const OWNER = { login: 'owner', password: 'owner123' };

const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };

const req = async (base, method, path, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
};

/** Har chaqiruvda o'zgaradigan maydonlar. */
const VOLATILE = new Set(['createdAt', 'updatedAt', 'frozenAt', 'stack', 'id', '_id']);

/**
 * Stekka xos qiymatlarni belgiga almashtiradi.
 * `subs` — [haqiqiy qiymat, o'rniga qo'yiladigan belgi] juftliklari.
 */
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

const login = async (base, creds) => {
  const r = await req(base, 'POST', '/api/auth/login', { body: creds });
  if (r.status !== 200) throw new Error(`${base} login ${creds.login}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data.accessToken;
};

const main = async () => {
  console.log('\n\x1b[1mFAZA 2.4 — ROLLAR MODULI PARITETI\x1b[0m\n');

  // ── Tokenlar. Ikkala stek bir xil JWT sirini o'qiydi, shuning uchun
  // Express bergan token NestJS'da ham amal qiladi. Login SO'ROVLARI
  // rate-limiter'ga tushadi (20/oyna), shuning uchun BITTA marta.
  const ownerToken = await login(EXPRESS, OWNER);

  // Direktor — `roles.update` bor, lekin ruxsatlari CHEKLANGAN. Uning
  // paroli owner endpointidan o'qiladi (parollar ochiq matnda saqlanadi).
  let directorToken = null;
  let missingPermId = null;
  try {
    const roleList = await req(EXPRESS, 'GET', '/api/roles', { token: ownerToken });
    const director = roleList.body.data.find((r) => r.value === 'director');
    const users = await req(EXPRESS, 'GET', '/api/users?role=director&limit=1', { token: ownerToken });
    const arr = Array.isArray(users.body.data) ? users.body.data : users.body.data?.items;
    const uid = arr?.[0]?.id;
    if (director && uid) {
      const pw = await req(EXPRESS, 'GET', `/api/users/${uid}/password`, { token: ownerToken });
      directorToken = await login(EXPRESS, {
        login: pw.body.data.username,
        password: pw.body.data.password,
      });
      // Direktorda YO'Q bo'lgan ruxsatni matritsadan topamiz.
      const matrix = await req(EXPRESS, 'GET', '/api/roles/matrix', { token: ownerToken });
      const have = new Set(director.permissionKeys);
      for (const m of matrix.body.data.modules) {
        for (const cell of Object.values(m.cells)) {
          if (!have.has(cell.key) && !missingPermId) missingPermId = { id: cell.id, key: cell.key };
        }
      }
    }
  } catch (e) {
    console.log(`  (direktor tokeni olinmadi: ${e.message})`);
  }

  const created = { [EXPRESS]: [], [NEST]: [] };

  /**
   * Bir qadamni IKKALA stekda bajaradi va normalizatsiyadan keyin
   * solishtiradi. `fn(base, token)` → { status, body }.
   * `subsOf(base)` — o'sha stekdagi almashtirish juftliklari.
   */
  const both = async (name, fn, subsOf = () => []) => {
    let e, n;
    try {
      e = await fn(EXPRESS);
      n = await fn(NEST);
    } catch (err) {
      skip(name, err.message);
      return { e, n };
    }
    const en = { status: e.status, body: normalize(e.body, subsOf(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subsOf(NEST)) };
    try {
      assert.deepEqual(nn, en);
      ok(`${name} — ${e.status}`);
    } catch {
      bad(name, `express: ${JSON.stringify(en)}\n      nest   : ${JSON.stringify(nn)}`);
    }
    return { e, n };
  };

  try {
    // ═══════════ O'QISH ═══════════
    console.log('\x1b[2m  ── o\'qish ──\x1b[0m');

    await both('GET /roles/matrix', (b) =>
      req(b, 'GET', '/api/roles/matrix', { token: ownerToken }));
    await both('GET /roles', (b) =>
      req(b, 'GET', '/api/roles', { token: ownerToken }));
    await both('GET /roles/owner', (b) =>
      req(b, 'GET', '/api/roles/owner', { token: ownerToken }));
    await both('GET /roles/__nope__ (404)', (b) =>
      req(b, 'GET', '/api/roles/__nope__', { token: ownerToken }));
    await both("GET /roles (token yo'q → 401)", (b) =>
      req(b, 'GET', '/api/roles'));

    // ═══════════ YARATISH ═══════════
    console.log('\x1b[2m  ── yaratish ──\x1b[0m');

    // Har stek O'Z rolini yaratadi; `label`/`value` normalizatsiyada
    // belgiga almashadi, shuning uchun qolgan HAMMA maydon solishtiriladi.
    const stamp = String(process.hrtime.bigint()).slice(-9);
    const labelOf = (b) => `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`;
    // `value` (slug) SERVER tomonda generatsiya qilinadi — uni oldindan
    // taxmin qilib bo'lmaydi (`slugifyRole` boshidagi `_` larni olib
    // tashlaydi). Shuning uchun javobdan O'QIB olinadi va shundan keyin
    // belgiga almashtiriladi. `both()` almashtirish juftliklarini ikkala
    // so'rov TUGAGACH so'raydi, ya'ni bu yerda qiymat allaqachon bor.
    const roleValue = {};
    const subs = (b) => [
      [labelOf(b), '<LABEL>'],
      ...(roleValue[b] ? [[roleValue[b], '<VALUE>']] : []),
    ];

    const createRes = await both(
      'POST /roles (yaratish)',
      async (b) => {
        const r = await req(b, 'POST', '/api/roles', {
          token: ownerToken,
          body: { label: labelOf(b), description: 'paritet sinovi', permissionIds: [] },
        });
        if (r.status === 201) {
          roleValue[b] = r.body.data.value;
          created[b].push(r.body.data.value);
        }
        return r;
      },
      subs,
    );

    if (createRes.e?.status !== 201 || createRes.n?.status !== 201) {
      skip('keyingi mutatsiya qadamlari', 'rol yaratilmadi');
    } else {
      const rsubs = subs;

      await both('POST /roles (takroriy nom → 409)', (b) =>
        req(b, 'POST', '/api/roles', {
          token: ownerToken,
          body: { label: labelOf(b), permissionIds: [] },
        }), rsubs);

      await both("POST /roles (qisqa nom → 400 VALIDATION_ERROR)", (b) =>
        req(b, 'POST', '/api/roles', { token: ownerToken, body: { label: 'x' } }), rsubs);

      await both("POST /roles (mavjud bo'lmagan ruxsat id → 400)", (b) =>
        req(b, 'POST', '/api/roles', {
          token: ownerToken,
          body: { label: `${labelOf(b)}_x`, permissionIds: ['a'.repeat(24)] },
        }), rsubs);

      await both('POST /roles (buzuq ruxsat id shakli → 400)', (b) =>
        req(b, 'POST', '/api/roles', {
          token: ownerToken,
          body: { label: `${labelOf(b)}_y`, permissionIds: ['not-an-id'] },
        }), rsubs);

      // ═══════════ TAHRIRLASH ═══════════
      console.log('\x1b[2m  ── tahrirlash ──\x1b[0m');

      await both('PATCH /roles/:value (tavsif)', (b) =>
        req(b, 'PATCH', `/api/roles/${roleValue[b]}`, {
          token: ownerToken,
          body: { description: 'yangilandi' },
        }), rsubs);

      await both("PATCH /roles/:value (bo'sh tana → 400)", (b) =>
        req(b, 'PATCH', `/api/roles/${roleValue[b]}`, { token: ownerToken, body: {} }), rsubs);

      await both('PATCH /roles/:value (ruxsat biriktirish)', (b) =>
        req(b, 'PATCH', `/api/roles/${roleValue[b]}`, {
          token: ownerToken,
          body: { permissionIds: [] },
        }), rsubs);

      await both('PATCH /roles/owner (tizim roli nomi → 400)', (b) =>
        req(b, 'PATCH', '/api/roles/owner', {
          token: ownerToken,
          body: { label: 'Boshqa nom' },
        }), rsubs);

      await both('PATCH /roles/__nope__ (404)', (b) =>
        req(b, 'PATCH', '/api/roles/__nope__', {
          token: ownerToken,
          body: { description: 'x' },
        }), rsubs);

      // ═══════════ MUZLATISH ═══════════
      console.log('\x1b[2m  ── muzlatish ──\x1b[0m');

      await both('PATCH /roles/:value/freeze (muzlatish)', (b) =>
        req(b, 'PATCH', `/api/roles/${roleValue[b]}/freeze`, {
          token: ownerToken,
          body: { isFrozen: true, reason: 'paritet sinovi' },
        }), rsubs);

      // ── `migrateTo` QO'RIQCHILARI ──
      // Rol MUZLATILGAN holatda turganda tekshiriladi. Ikkala holat ham
      // ATAYLAB RAD ETILADI, ya'ni birorta foydalanuvchining roli
      // O'ZGARMAYDI — bu real bazada sinash uchun yagona xavfsiz yo'l.
      await both("DELETE ?migrateTo=<mavjud emas> → 400", (b) =>
        req(b, 'DELETE', '/api/roles/reception?migrateTo=__nope__', {
          token: ownerToken,
        }), rsubs);

      await both("DELETE ?migrateTo=<muzlatilgan rol> → 400", (b) =>
        req(b, 'DELETE', `/api/roles/reception?migrateTo=${roleValue[b]}`, {
          token: ownerToken,
        }), rsubs);

      await both('PATCH /roles/:value/freeze (muzdan chiqarish)', (b) =>
        req(b, 'PATCH', `/api/roles/${roleValue[b]}/freeze`, {
          token: ownerToken,
          body: { isFrozen: false },
        }), rsubs);

      await both('PATCH /roles/owner/freeze (tizim roli → 400)', (b) =>
        req(b, 'PATCH', '/api/roles/owner/freeze', {
          token: ownerToken,
          body: { isFrozen: true },
        }), rsubs);

      await both('PATCH /roles/:value/freeze (isFrozen yo\'q → 400)', (b) =>
        req(b, 'PATCH', `/api/roles/${roleValue[b]}/freeze`, {
          token: ownerToken,
          body: { reason: 'x' },
        }), rsubs);

      // ═══════════ PRIVILEGE ESCALATION ═══════════
      console.log('\x1b[2m  ── imtiyoz oshirish himoyasi ──\x1b[0m');

      if (directorToken && missingPermId) {
        await both(
          `direktor o'zida yo'q ruxsatni bera olmaydi (${missingPermId.key} → 403)`,
          (b) =>
            req(b, 'PATCH', `/api/roles/${roleValue[b]}`, {
              token: directorToken,
              body: { permissionIds: [missingPermId.id] },
            }),
          rsubs,
        );
        await both("direktor rol YARATA olmaydi (roles.create yo'q → 403)", (b) =>
          req(b, 'POST', '/api/roles', {
            token: directorToken,
            body: { label: `${PREFIX}dir${stamp}`, permissionIds: [] },
          }), rsubs);
      } else {
        skip('imtiyoz oshirish himoyasi', 'direktor tokeni yoki yetishmaydigan ruxsat topilmadi');
      }

      // ═══════════ O'CHIRISH ═══════════
      console.log('\x1b[2m  ── o\'chirish ──\x1b[0m');

      await both("DELETE /roles/owner (tizim roli → 400)", (b) =>
        req(b, 'DELETE', '/api/roles/owner', { token: ownerToken }), rsubs);

      // FOYDALANUVCHISI BOR ROL — ATAYLAB `migrateTo` SIZ, ya'ni amal
      // RAD ETILADI va hech narsa o'zgarmaydi.
      await both("DELETE foydalanuvchisi bor rol (migrateTo yo'q → 400)", (b) =>
        req(b, 'DELETE', '/api/roles/reception', { token: ownerToken }), rsubs);

      await both('DELETE /roles/__nope__ (404)', (b) =>
        req(b, 'DELETE', '/api/roles/__nope__', { token: ownerToken }), rsubs);

      const del = await both('DELETE /roles/:value (o\'chirish)', async (b) => {
        const r = await req(b, 'DELETE', `/api/roles/${roleValue[b]}`, { token: ownerToken });
        if (r.status === 200) created[b] = created[b].filter((v) => v !== roleValue[b]);
        return r;
      }, rsubs);

      if (del.e?.status === 200) {
        await both("o'chirilgandan keyin GET → 404", (b) =>
          req(b, 'GET', `/api/roles/${roleValue[b]}`, { token: ownerToken }), rsubs);
      }
    }
  } finally {
    // ═══════════ TOZALASH ═══════════
    // Har ikki stekda `__parity_` prefiksli HAR QANDAY rol o'chiriladi —
    // test yiqilgan bo'lsa ham. Prefiks bo'yicha ketadi, ya'ni oldingi
    // yurishdan qolgan qoldiq ham tozalanadi.
    let removed = 0;
    for (const base of [EXPRESS, NEST]) {
      try {
        const all = await req(base, 'GET', '/api/roles', { token: ownerToken });
        for (const r of all.body?.data || []) {
          // FAQAT `label` bo'yicha — u AYNAN yuborilgan satr. `value`
          // slugifikatsiyadan o'tadi (`__parity_x` → `parity-x`) va shu
          // shakl haqiqiy rol nomiga tasodifan mos kelib qolishi mumkin.
          if (r.label?.startsWith(PREFIX)) {
            const d = await req(base, 'DELETE', `/api/roles/${r.value}`, { token: ownerToken });
            if (d.status === 200) removed += 1;
          }
        }
      } catch { /* tozalash xatosi natijani o'zgartirmaydi */ }
    }
    console.log(`\n  🧹 tozalandi: ${removed} ta sinov roli`);
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  // ⚠ O'LCHANMAGAN QADAM HAM YIQILISH: "sinalmadi" ni "o'tdi" deb
  // ko'rsatish butun paritet g'oyasini yo'qqa chiqarardi.
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
