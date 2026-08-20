/**
 * PARITET GARNIZONI — Express (5000) ↔ NestJS (5001).
 *
 * Ko'chirilgan har bir endpoint uchun IKKALA stekka bir xil so'rov
 * yuboradi va farqni ko'rsatadi:
 *   • HTTP status
 *   • javob tanasi (chuqur solishtiruv)
 *   • muhim sarlavhalar (content-type, set-cookie shakli)
 *   • xato tuzilmasi ({ success, message, code, details })
 *
 * ⚠ MUSBAT NAZORAT: agar BIRORTA endpoint tekshirilmasa yoki steklardan
 * biri javob bermasa — bu MUVAFFAQIYAT emas, XATO. Bo'sh tekshiruv
 * "hammasi bir xil" degan yolg'on natija berardi.
 *
 * BEQAROR MAYDONLAR (`VOLATILE`) solishtiruvdan chiqariladi: token,
 * vaqt tamg'asi, latency. Ular har chaqiruvda boshqacha bo'ladi va
 * ularni solishtirish shovqindan boshqa narsa bermaydi.
 *
 * ISHLATISH:  node test/parity.mjs [--token <accessToken>]
 */
const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

const argv = process.argv.slice(2);
const tokenArg = argv.indexOf('--token');
const TOKEN = tokenArg >= 0 ? argv[tokenArg + 1] : process.env.PARITY_TOKEN || null;

/** Har chaqiruvda o'zgaradigan maydonlar — solishtirilmaydi. */
const VOLATILE = new Set([
  'accessToken', 'refreshToken', 'token', 'latencyMs', 'iat', 'exp',
  'createdAt', 'updatedAt', 'lastLoginAt', 'stack', 'expiresAt',
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
 * KO'CHIRILGAN ENDPOINTLAR RO'YXATI.
 *
 * Har bir modul ko'chirilganda shu yerga qo'shiladi. `auth: true`
 * bo'lsa so'rovga `--token` qo'shiladi.
 */
const CASES = [
  { name: 'health', method: 'GET', path: '/api/health' },
  { name: 'health/db', method: 'GET', path: '/api/health/db',
    // NestJS'da qo'shimcha diagnostika bor; Express'da bu manzil YO'Q.
    // Faza 2.3 gacha ataylab solishtirilmaydi.
    skip: 'NestJS-only diagnostika manzili' },
  // ── Faza 2.2: ko'chirilgan marshrutlar ──
  { name: 'roles (list)', method: 'GET', path: '/api/roles', auth: true },
  { name: 'roles/owner', method: 'GET', path: '/api/roles/owner', auth: true },
  { name: 'roles/director', method: 'GET', path: '/api/roles/director', auth: true },
  { name: 'roles/__nope__ (404)', method: 'GET', path: '/api/roles/__nope__', auth: true },
  { name: 'roles (auth yo\'q → 401)', method: 'GET', path: '/api/roles' },
  { name: 'users/:id/password (404)', method: 'GET',
    path: `/api/users/${'a'.repeat(24)}/password`, auth: true },
  // ── Faza 2.3+ da to'ldiriladi ──
  // { name: 'auth/me', method: 'GET', path: '/api/auth/me', auth: true },
];

const call = async (base, c) => {
  const headers = { 'content-type': 'application/json' };
  if (c.auth && TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  const t0 = Date.now();
  try {
    const res = await fetch(base + c.path, {
      method: c.method,
      headers,
      ...(c.body ? { body: JSON.stringify(c.body) } : {}),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return {
      reachable: true,
      status: res.status,
      contentType: (res.headers.get('content-type') || '').split(';')[0],
      hasSetCookie: Boolean(res.headers.get('set-cookie')),
      body,
      ms: Date.now() - t0,
    };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
};

const run = async () => {
  console.log('\n\x1b[1mPARITET: Express ↔ NestJS\x1b[0m');
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  let compared = 0, diffs = 0, skipped = 0, unreachable = 0;

  for (const c of CASES) {
    if (c.skip) { skipped += 1; console.log(`  ⏭  ${c.name} — ${c.skip}`); continue; }

    const [e, n] = await Promise.all([call(EXPRESS, c), call(NEST, c)]);

    if (!e.reachable || !n.reachable) {
      unreachable += 1;
      console.log(`  ❌ ${c.name} — STEK JAVOB BERMADI ` +
        `(express: ${e.reachable ? 'ok' : e.error}, nest: ${n.reachable ? 'ok' : n.error})`);
      continue;
    }

    compared += 1;
    const problems = [];
    if (e.status !== n.status) problems.push(`status ${e.status} ≠ ${n.status}`);
    if (e.contentType !== n.contentType) problems.push(`content-type ${e.contentType} ≠ ${n.contentType}`);
    if (e.hasSetCookie !== n.hasSetCookie) problems.push(`set-cookie ${e.hasSetCookie} ≠ ${n.hasSetCookie}`);
    const eb = JSON.stringify(strip(e.body));
    const nb = JSON.stringify(strip(n.body));
    if (eb !== nb) problems.push(`tana farq qiladi:\n      express: ${eb}\n      nest   : ${nb}`);

    if (problems.length) { diffs += 1; console.log(`  ❌ ${c.name}\n      ${problems.join('\n      ')}`); }
    else console.log(`  ✅ ${c.name} — ${e.status}, tana bir xil`);
  }

  console.log(`\n  Solishtirildi: ${compared} · farq: ${diffs} · o'tkazib yuborildi: ${skipped} · yetib bo'lmadi: ${unreachable}`);

  // ⚠ MUSBAT NAZORAT: hech narsa solishtirilmagan bo'lsa — bu YASHIL EMAS.
  if (compared === 0) {
    console.log('\n  ❌ O\'LCHANMADI: birorta endpoint solishtirilmadi.');
    console.log('     Ikkala stek ham ishlab turishi SHART — aks holda bu test');
    console.log('     "farq yo\'q" deb yolg\'on yashil berardi.\n');
    process.exit(1);
  }
  if (unreachable > 0 || diffs > 0) { console.log(''); process.exit(1); }
  console.log('  ✅ Paritet saqlangan\n');
};

run().catch((e) => { console.error(e); process.exit(1); });
