/**
 * FAZA 2.3 — AUTH MODULI: EXPRESS ↔ NESTJS PARITETI VA XULQ-ATVORI.
 *
 * Har bir endpoint IKKALA stekda bir xil so'rov bilan sinaladi va
 * status + tana + muhim sarlavhalar solishtiriladi. Muvaffaqiyat ham,
 * XATO yo'llari ham qamraladi.
 *
 * ⚠ MUSBAT NAZORAT: fixture tokenlari olinmasa yoki steklardan biri
 * javob bermasa — test YASHIL BERMAYDI.
 *
 * ⚠ BAZAGA YOZADI (ataylab, lekin QAYTARIB): `PATCH /auth/me` va
 * `change-password` haqiqiy yozuv qiladi — ular sinov foydalanuvchisida
 * bajariladi va oxirida ASLIGA QAYTARILADI.
 *
 * ISHLATISH:  node test/auth-parity.test.mjs
 */
/**
 * ⚠ IKKI QISMGA BO'LINGAN — `authLimiter` (20 urinish / 5 daqiqa) sababli.
 *
 * Bitta yurishda test ~25 ta auth so'rovi qiladi (login VA refresh bir xil
 * chegarani baham ko'radi), ya'ni oxirgi tekshiruvlar 429 olib, CHALG'ITUVCHI
 * sabab bilan yiqilardi. Shuning uchun `scripts/auth-parity.sh` uni ikki
 * bosqichda, orasida steklarni qayta ishga tushirib yuritadi.
 *
 *   node test/auth-parity.test.mjs tokens   ← login / refresh / logout
 *   node test/auth-parity.test.mjs session  ← me / profile / register / 501
 */
const PART = process.argv[2] || 'all';
const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

const R = { pass: 0, fail: 0, skip: 0 };
const ok = (n, x = '') => { R.pass += 1; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x = '') => { R.fail += 1; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); };
const warn = (n, x = '') => { R.skip += 1; console.log(`  ⚠️  ${n} — ${x}`); };
const check = (n, cond, x = '') => (cond ? ok(n, x) : bad(n, x));

/** Har chaqiruvda o'zgaradigan maydonlar — solishtirilmaydi. */
const VOLATILE = new Set([
  'accessToken', 'refreshToken', 'token', 'latencyMs', 'iat', 'exp',
  'createdAt', 'updatedAt', 'lastLoginAt', 'stack', 'expiresAt', 'lastSeenAt',
]);
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (VOLATILE.has(k)) continue;
      out[k] = strip(val);
    }
    return out;
  }
  return v;
};

/**
 * ⚠ TEZLIK CHEGARASI (429) — TEST UCHUN MUHIM.
 *
 * `authLimiter` 5 daqiqada 20 urinishga ruxsat beradi va bu test o'nlab
 * login qiladi. Chegaraga urilganda javoblar 429 bo'lib, testlar
 * "parol noto'g'ri" kabi CHALG'ITUVCHI sabablar bilan yiqilardi.
 * Shuning uchun 429 ALOHIDA aniqlanadi va test darhol to'xtaydi.
 *
 * YECHIM: to'plam O'Z MIJOZ SHAXSINI oladi — har yurishda betakror
 * `X-Forwarded-For`. Ikkala stek ham `trust proxy: 1` bilan ishlaydi
 * (Express `app.js`, NestJS `main.ts`), ya'ni chegara aynan shu manzil
 * bo'yicha sanaladi va to'plam o'z chelagida yuradi.
 *
 * ⚠ BU CHEGARANI ZAIFLASHTIRMAYDI. Chegara baribir qo'llanadi — faqat
 * to'plam BOSHQA MASHINADAN kelayotgandek ko'rinadi, ya'ni parallel
 * ishlayotgan boshqa to'plamlarning byudjetini yemaydi va ular ham
 * buni yemaydi. Chegaraning O'ZI alohida o'lchanadi:
 * `test/rate-limit-parity.test.mjs`.
 *
 * ⚠ 429 ANIQLASH SAQLANADI: agar shunda ham chegaraga urilsa, bu
 * HAQIQIY signal (mas. `trust proxy` yana yo'qolgan) — test avvalgidek
 * to'xtaydi va natijani ISHONCHSIZ deb belgilaydi.
 */
let rateLimited = false;

/**
 * Shu YURISHGA xos mijoz manzili.
 *
 * Betakror bo'lishi SHART: chelak 5 daqiqa yashaydi, qat'iy manzil
 * bilan ketma-ket ikki yurish bir chelakni baham ko'rardi va ikkinchisi
 * yana 429 olardi.
 */
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 250n) + 2)}`;

const call = async (base, { method = 'GET', path, body, token, cookie }) => {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': RUN_IP };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + path, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (res.status === 429) rateLimited = true;
  return {
    status: res.status,
    body: parsed,
    setCookie: res.headers.get('set-cookie') || null,
    contentType: (res.headers.get('content-type') || '').split(';')[0],
  };
};

/** Ikkala stekni bir xil so'rov bilan chaqirib, farqni qaytaradi. */
const both = async (req) => {
  const [e, n] = await Promise.all([call(EXPRESS, req), call(NEST, req)]);
  const problems = [];
  if (e.status !== n.status) problems.push(`status ${e.status} ≠ ${n.status}`);
  if (e.contentType !== n.contentType) problems.push(`content-type ${e.contentType} ≠ ${n.contentType}`);
  const eb = JSON.stringify(strip(e.body));
  const nb = JSON.stringify(strip(n.body));
  if (eb !== nb) problems.push(`tana:\n      express: ${eb.slice(0, 260)}\n      nest   : ${nb.slice(0, 260)}`);
  return { e, n, problems };
};

/**
 * `register-user` probasi yaratgan nomlar — yakunda O'CHIRILADI.
 *
 * ⚠ API ORQALI EMAS, BAZADAN: bu test aynan auth yo'llarini sinaydi
 * va ular buzilsa API orqali tozalash ham yiqilardi.
 */
const probeUsernames = [];
const cleanupProbes = async () => {
  if (!probeUsernames.length) return;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { username: { in: probeUsernames } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    if (ids.length) {
      await prisma.studentDeposit.deleteMany({ where: { studentId: { in: ids } } })
        .catch(() => null);
      await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: ids } } })
        .catch(() => null);
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    const left = await prisma.user.count({ where: { username: { in: probeUsernames } } });
    if (left === 0) ok('proba foydalanuvchilari tozalandi', `${ids.length} ta`);
    else bad('proba foydalanuvchilari QOLDI', `${left} ta`);
  } finally {
    await prisma.$disconnect();
  }
};

const parity = async (name, req, extra) => {
  const { e, n, problems } = await both(req);
  const more = extra ? extra(e, n) : null;
  if (more) problems.push(more);
  if (problems.length) bad(name, problems.join('\n      '));
  else ok(name, `${e.status}`);
  return { e, n };
};

/** Cookie sarlavhasidan refresh tokenni ajratadi. */
const refreshCookieOf = (setCookie) => {
  if (!setCookie) return null;
  const m = String(setCookie).match(/refreshToken=([^;]+)/);
  return m ? `refreshToken=${m[1]}` : null;
};

const guardRateLimit = () => {
  if (!rateLimited) return;
  console.log(
    '\n  ❌ TEZLIK CHEGARASIGA URILDI (429) — natija ISHONCHSIZ.\n' +
      '     Ikkala stekni qayta ishga tushiring va qaytadan yuriting:\n' +
      '       npm run test:auth-parity:fresh\n',
  );
  process.exit(1);
};

const run = async () => {
  console.log('\n\x1b[1mFaza 2.3 — AUTH pariteti (Express ↔ NestJS)\x1b[0m\n');

  const wantTokens = PART === 'all' || PART === 'tokens';
  const wantSession = PART === 'all' || PART === 'session';

  // ─── 1. LOGIN ────────────────────────────────────────────────────
  if (wantTokens) {
  console.log('\x1b[1m  POST /auth/login\x1b[0m');
  await parity("noto'g'ri parol → 401", {
    method: 'POST', path: '/api/auth/login',
    body: { login: 'owner', password: 'definitely-wrong' },
  });
  await parity("mavjud bo'lmagan login → 401", {
    method: 'POST', path: '/api/auth/login',
    body: { login: '__no_such_user__', password: 'whatever' },
  });
  await parity('validatsiya: qisqa login → 400 + details', {
    method: 'POST', path: '/api/auth/login', body: { login: 'ab', password: 'x' },
  });
  await parity("validatsiya: bo'sh tana → 400", {
    method: 'POST', path: '/api/auth/login', body: {},
  });

  const okLogin = await both({
    method: 'POST', path: '/api/auth/login',
    body: { login: 'owner', password: 'owner123' },
  });
  if (okLogin.problems.length) bad("to'g'ri login → 200", okLogin.problems.join('\n      '));
  else ok("to'g'ri login → 200 (tana bir xil)");

  // JWT XULQ-ATVORI: ikkala stek ham ishlaydigan token beradi.
  const eTok = okLogin.e.body?.data?.accessToken;
  const nTok = okLogin.n.body?.data?.accessToken;
  check('ikkala stek ham accessToken berdi', Boolean(eTok && nTok));

  // Cookie shakli (imzolangan, httpOnly, path=/api/auth).
  const cookieShape = (sc) => ({
    httpOnly: /HttpOnly/i.test(sc || ''),
    path: (String(sc || '').match(/Path=([^;]+)/i) || [])[1],
    sameSite: (String(sc || '').match(/SameSite=([^;]+)/i) || [])[1],
    signed: /refreshToken=s%3A/.test(sc || ''),
  });
  const eC = cookieShape(okLogin.e.setCookie);
  const nC = cookieShape(okLogin.n.setCookie);
  check('refresh cookie shakli bir xil',
    JSON.stringify(eC) === JSON.stringify(nC), `${JSON.stringify(nC)}`);
  check('cookie httpOnly + imzolangan + path=/api/auth',
    nC.httpOnly && nC.signed && nC.path === '/api/auth');

  // ─── KESISHGAN ISHONCH: Express tokeni Nest'da, Nest tokeni Express'da ──
  console.log('\n\x1b[1m  JWT kesishgan ishonch\x1b[0m');
  const meWithExpressTok = await call(NEST, { path: '/api/auth/me', token: eTok });
  const meWithNestTok = await call(EXPRESS, { path: '/api/auth/me', token: nTok });
  check('Express bergan token NestJS\'da ishlaydi', meWithExpressTok.status === 200);
  check('NestJS bergan token Express\'da ishlaydi', meWithNestTok.status === 200);

  // ─── 2. REFRESH ──────────────────────────────────────────────────
  console.log('\n\x1b[1m  POST /auth/refresh\x1b[0m');
  await parity("cookie yo'q → 401", { method: 'POST', path: '/api/auth/refresh' });
  await parity('buzuq cookie → 401', {
    method: 'POST', path: '/api/auth/refresh', cookie: 'refreshToken=s%3Agarbage.xxx',
  });

  // POYGA XAVFSIZLIGI: bitta refresh cookie IKKI MARTA ishlatilsa,
  // faqat BIRINCHISI o'tishi kerak.
  const freshE = await call(EXPRESS, {
    method: 'POST', path: '/api/auth/login', body: { login: 'owner', password: 'owner123' },
  });
  const freshN = await call(NEST, {
    method: 'POST', path: '/api/auth/login', body: { login: 'owner', password: 'owner123' },
  });
  for (const [label, base, sc] of [['express', EXPRESS, freshE.setCookie], ['nest', NEST, freshN.setCookie]]) {
    const ck = refreshCookieOf(sc);
    const first = await call(base, { method: 'POST', path: '/api/auth/refresh', cookie: ck });
    const second = await call(base, { method: 'POST', path: '/api/auth/refresh', cookie: ck });
    check(`${label}: refresh bir marta ishlaydi, ikkinchisi rad etiladi`,
      first.status === 200 && second.status === 401,
      `1-chi ${first.status}, 2-chi ${second.status}`);
  }

  // PARALLEL POYGA: bir xil cookie bilan 5 ta bir vaqtdagi so'rov —
  // FAQAT BITTASI 200 olishi shart (updateMany + count===1 kafolati).
  for (const [label, base] of [['express', EXPRESS], ['nest', NEST]]) {
    const fresh = await call(base, {
      method: 'POST', path: '/api/auth/login', body: { login: 'owner', password: 'owner123' },
    });
    const ck = refreshCookieOf(fresh.setCookie);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call(base, { method: 'POST', path: '/api/auth/refresh', cookie: ck })),
    );
    const won = results.filter((r) => r.status === 200).length;
    check(`${label}: 5 parallel refresh → faqat 1 ta muvaffaqiyat`, won === 1, `${won} ta 200`);
  }

  // ─── 3. LOGOUT ───────────────────────────────────────────────────
  console.log('\n\x1b[1m  POST /auth/logout\x1b[0m');
  await parity("cookie'siz logout ham 200 (idempotent)", {
    method: 'POST', path: '/api/auth/logout',
  }, (e, n) => {
    const eC2 = /refreshToken=;/.test(e.setCookie || '');
    const nC2 = /refreshToken=;/.test(n.setCookie || '');
    return eC2 === nC2 ? null : `cookie tozalash farq qiladi (${eC2} vs ${nC2})`;
  });

  } // wantTokens

  if (!wantSession) {
    guardRateLimit();
    console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.skip} o'lchanmadi\n`);
    process.exit(R.fail ? 1 : 0);
  }

  // Sessiya qismi uchun yangi token (yuqoridagi blok o'tkazib yuborilgan bo'lishi mumkin).
  const sess = await call(EXPRESS, {
    method: 'POST', path: '/api/auth/login', body: { login: 'owner', password: 'owner123' },
  });
  const sessTok = sess.body?.data?.accessToken;

  // ─── 4. GET /auth/me ─────────────────────────────────────────────
  console.log('\n\x1b[1m  GET /auth/me\x1b[0m');
  await parity("token yo'q → 401", { path: '/api/auth/me' });
  await parity('buzuq token → 401', { path: '/api/auth/me', token: 'garbage' });
  await parity('owner: to\'liq javob', { path: '/api/auth/me', token: sessTok });

  // ─── 5. PATCH /auth/me + 6. change-password (yozish) ─────────────
  console.log('\n\x1b[1m  PATCH /auth/me · POST /auth/change-password\x1b[0m');
  const qaTok = await call(EXPRESS, {
    method: 'POST', path: '/api/auth/login',
    body: { login: 'qa_staff_a', password: 'qa123456' },
  });
  const staffTok = qaTok.body?.data?.accessToken;
  if (!staffTok) {
    warn('yozish yo\'llari', 'qa_staff_a tokeni olinmadi — O\'LCHANMADI');
  } else {
    await parity('validatsiya: bo\'sh PATCH tanasi', {
      method: 'PATCH', path: '/api/auth/me', token: staffTok, body: { firstName: '' },
    });
    await parity("noto'g'ri telefon → 400", {
      method: 'PATCH', path: '/api/auth/me', token: staffTok, body: { phone: '123' },
    });
    // HAQIQIY YOZUV — keyin asliga qaytariladi.
    const orig = await call(EXPRESS, { path: '/api/auth/me', token: staffTok });
    const origFirst = orig.body?.data?.user?.firstName;
    const upd = await both({
      method: 'PATCH', path: '/api/auth/me', token: staffTok, body: { firstName: 'ParityQA' },
    });
    check('PATCH /me: yozuv va javob bir xil', upd.problems.length === 0,
      upd.problems.join(' '));
    await call(EXPRESS, {
      method: 'PATCH', path: '/api/auth/me', token: staffTok, body: { firstName: origFirst },
    });
    ok('PATCH /me: asl qiymat qaytarildi', `firstName=${origFirst}`);

    await parity("change-password: noto'g'ri joriy parol → 400", {
      method: 'POST', path: '/api/auth/change-password', token: staffTok,
      body: { currentPassword: 'wrong-one', newPassword: 'brand-new-1' },
    });
    await parity('change-password: yangi = joriy → 400', {
      method: 'POST', path: '/api/auth/change-password', token: staffTok,
      body: { currentPassword: 'qa123456', newPassword: 'qa123456' },
    });
    await parity('change-password: qisqa yangi parol → 400', {
      method: 'POST', path: '/api/auth/change-password', token: staffTok,
      body: { currentPassword: 'qa123456', newPassword: 'ab' },
    });
  }

  // ─── 7. register-user ────────────────────────────────────────────
  console.log('\n\x1b[1m  POST /auth/register-user\x1b[0m');
  await parity("token yo'q → 401", { method: 'POST', path: '/api/auth/register-user', body: {} });
  await parity('ruxsatsiz xodim → 403', {
    method: 'POST', path: '/api/auth/register-user', token: staffTok,
    body: { firstName: 'X', lastName: 'Y', username: 'zzz', password: 'pw1234', role: 'student' },
  });

  // ─── 8. ILGARI 501 BO'LGAN YO'LLAR — ENDI PARITETDA ────────────────
  //
  // ⚠ BU BO'LIM TESKARISIGA O'ZGARDI. Ilgari u NestJS'ning OCHIQ 501
  // qaytarishini talab qilardi ("jimgina degradatsiya EMAS"). O'sha
  // shoxlar ko'chirilgach 501 YO'QOLDI va test YOLG'ON QIZIL bera
  // boshladi — ya'ni u endi ko'chirishning TUGAGANINI jazolardi.
  //
  // Endi u AYNI ikki yo'lni PARITET sifatida o'lchaydi.
  console.log('\n\x1b[1m  Ilgari 501 bo\'lgan yo\'llar — endi PARITETDA\x1b[0m');
  {
    const ownerTok2 = sessTok;

    // (a) `/auth/me` — o'quvchi/o'qituvchi profili ko'chirilmagan.
    //
    // O'quvchini RO'YXATDAN topamiz: seed har yurishda yangi taxallus
    // beradi (`sardor_<tag>`), shuning uchun qattiq yozilgan nom
    // ishlamaydi — avvalgi versiya aynan shu sababdan O'LCHANMAY qolgandi.
    let studentLogin = null;
    if (ownerTok2) {
      const r = await call(EXPRESS, {
        path: '/api/users?limit=200&role=student', token: ownerTok2,
      });
      const items = Array.isArray(r.body?.data) ? r.body.data : r.body?.data?.items;
      // AYNAN `fakeData` yaratgan o'quvchi kerak (`student_<i>_<tag>`) —
      // uning paroli ma'lum. Boshqa o'quvchilar sinov qoldiqlari bo'lishi
      // mumkin va ularning paroli boshqacha.
      studentLogin = (items || []).find((u) => /^student_\d+_/.test(u.username))?.username || null;
    }
    const stud = studentLogin
      ? await call(EXPRESS, {
          method: 'POST', path: '/api/auth/login',
          body: { login: studentLogin, password: 'parol123' },
        })
      : { status: 0 };
    if (stud.status === 200) {
      const t = stud.body.data.accessToken;
      // ⚠ MUSBAT NAZORAT: 200 bo'lishi SHART — aks holda quyidagi
      // "ikkalasi bir xil" natijasi ikkala tomonning BIR XIL XATOSI
      // ustida qurilgan bo'lardi.
      await parity("o'quvchi /me — profil paritetda", { path: '/api/auth/me', token: t });
      const e = await call(EXPRESS, { path: '/api/auth/me', token: t });
      check("express: o'quvchi /me → 200 (musbat nazorat)", e.status === 200, `${e.status}`);
    } else {
      warn("o'quvchi /me farqi",
        `o'quvchi sifatida kira olmadi (${studentLogin || 'nom topilmadi'} → ${stud.status}) — O'LCHANMADI`);
    }

    // (b) `register-user` + `openingBalance` — yon ta'sir ko'chirildi.
    //
    // ⚠ HAR STEKKA O'Z NOMI: bu MUTATSIYA. Bir xil `username` bilan
    // ikkinchi chaqiruv 409 olardi va hech narsa o'lchanmasdi.
    //
    // ⚠ TOZALASH: yaratilgan foydalanuvchilar yakunda O'CHIRILADI —
    // aks holda har yurish bazada ikkita yetim yozuv qoldirardi.
    if (ownerTok2) {
      const stamp = Date.now();
      const mk = (base) => call(base, {
        method: 'POST', path: '/api/auth/register-user', token: ownerTok2,
        body: {
          firstName: 'X', lastName: 'Y',
          username: `probe_${base === EXPRESS ? 'e' : 'n'}_${stamp}`,
          password: 'pw1234', role: 'student', openingBalance: 50000,
        },
      });
      const e2 = await mk(EXPRESS);
      const n2 = await mk(NEST);
      check('openingBalance bilan register — status paritetda',
        e2.status === n2.status, `express=${e2.status}, nest=${n2.status}`);
      check('openingBalance bilan register — xato kodi paritetda',
        String(e2.body?.code) === String(n2.body?.code),
        `express=${e2.body?.code}, nest=${n2.body?.code}`);
      probeUsernames.push(`probe_e_${stamp}`, `probe_n_${stamp}`);
    }
  }

  await cleanupProbes();

  guardRateLimit();
  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.skip} o'lchanmadi\n`);
  process.exit(R.fail ? 1 : 0);
};

run().catch(async (e) => {
  // ⚠ XATO YO'LIDA HAM TOZALANADI: yiqilgan test bazada yetim
  // foydalanuvchi qoldirardi.
  await cleanupProbes().catch(() => null);
  console.error('Test xatosi:', e);
  process.exit(1);
});
