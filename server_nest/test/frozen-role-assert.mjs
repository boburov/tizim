/**
 * MUZLATILGAN ROL — TASDIQLASH QISMI (jarayon boshqarmaydi).
 *
 * Rolni muzlatish/chiqarish va NestJS'ni qayta ishga tushirish
 * `scripts/frozen-role-check.sh` da bajariladi. Bu fayl faqat
 * TEKSHIRADI — shuning uchun u ishonchli va qayta ishlatiladigan.
 *
 * Chaqirish:  node test/frozen-role-assert.mjs <frozen|thawed> [cookieE] [cookieN]
 */
const EXPRESS = 'http://127.0.0.1:5000';
const NEST = 'http://127.0.0.1:5001';
const [mode, cookieE, cookieN] = process.argv.slice(2);

const R = { pass: 0, fail: 0 };
const ok = (n, x = '') => { R.pass += 1; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x = '') => { R.fail += 1; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); };
const check = (n, c, x = '') => (c ? ok(n, x) : bad(n, x));

const post = async (base, path, body, cookie) => {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const r = await fetch(base + path, { method: 'POST', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  let b; const t = await r.text();
  try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, setCookie: r.headers.get('set-cookie') };
};
const USER = { login: 'qa_staff_a', password: 'qa123456' };

const run = async () => {
  // MUSBAT NAZORAT: ikkala stek tirikmi.
  for (const [label, base] of [['express', EXPRESS], ['nest', NEST]]) {
    const alive = await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false);
    if (!alive) { bad(`${label} javob bermayapti`, "o'lchab bo'lmadi"); process.exit(1); }
  }

  if (mode === 'thawed') {
    const le = await post(EXPRESS, '/api/auth/login', USER);
    const ln = await post(NEST, '/api/auth/login', USER);
    check('muzlatishdan keyin login yana ishlaydi (express)', le.status === 200, `${le.status}`);
    check('muzlatishdan keyin login yana ishlaydi (nest)', ln.status === 200, `${ln.status}`);
    // Keyingi bosqich uchun cookie'larni chiqaramiz.
    console.log('COOKIE_E=' + (String(le.setCookie).match(/refreshToken=[^;]+/) || [''])[0]);
    console.log('COOKIE_N=' + (String(ln.setCookie).match(/refreshToken=[^;]+/) || [''])[0]);
  } else {
    // ── LOGIN → 403 ──
    const le = await post(EXPRESS, '/api/auth/login', USER);
    const ln = await post(NEST, '/api/auth/login', USER);
    check('express: muzlatilgan rol bilan login → 403', le.status === 403, `${le.status}`);
    check('nest: muzlatilgan rol bilan login → 403', ln.status === 403, `${ln.status}`);
    check('login xato matni bir xil', le.body?.message === ln.body?.message, JSON.stringify(ln.body?.message));
    check('muzlatish sababi xabarda', /Parity test/.test(ln.body?.message || ''));

    // ── REFRESH → 401 (muzlatishdan OLDIN olingan cookie bilan) ──
    if (cookieE && cookieN) {
      const re = await post(EXPRESS, '/api/auth/refresh', null, cookieE);
      const rn = await post(NEST, '/api/auth/refresh', null, cookieN);
      check('express: muzlatilgan rolda refresh → 401', re.status === 401, `${re.status}`);
      check('nest: muzlatilgan rolda refresh → 401', rn.status === 401, `${rn.status}`);
      check('refresh xato matni bir xil', re.body?.message === rn.body?.message, JSON.stringify(rn.body?.message));
      // ⚠ ENG MUHIM: login 403, refresh 401 — ATAYLAB BOSHQA.
      check('login 403 ≠ refresh 401 (ataylab farqli)', ln.status === 403 && rn.status === 401);
    } else {
      bad('refresh tekshiruvi', "cookie berilmadi — o'lchanmadi");
    }
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi`);
  process.exit(R.fail ? 1 : 0);
};
run().catch((e) => { console.error('Xato:', e); process.exit(1); });
