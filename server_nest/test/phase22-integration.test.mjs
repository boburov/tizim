/**
 * FAZA 2.2 — INTEGRATSIYA TESTI (HAQIQIY HTTP).
 *
 * Auth middleware, qo'riqchilar va ALS ni to'liq NestJS hayot sikli
 * ustida tekshiradi: middleware → guard → pipe → handler → servis → DB.
 *
 * Tokenlar EXPRESS'dan olinadi — ya'ni ikkala stek bir xil JWT
 * shartnomasida ekani ham shu yerda isbotlanadi.
 *
 * ⚠ FAQAT O'QIYDI. Bazaga hech narsa yozmaydi.
 * ISHLATISH:  node test/phase22-integration.test.mjs
 */
const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

const R = { pass: 0, fail: 0, skip: 0 };
const ok = (n, x = '') => { R.pass += 1; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x = '') => { R.fail += 1; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); };
const warn = (n, x = '') => { R.skip += 1; console.log(`  ⚠️  ${n} — ${x}`); };
const check = (n, cond, x = '') => (cond ? ok(n, x) : bad(n, x));

const login = async (login, password) => {
  const r = await fetch(`${EXPRESS}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const j = await r.json();
  return j?.data?.accessToken || null;
};

const get = async (base, path, token, extraHeaders = {}) => {
  const r = await fetch(base + path, {
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
  });
  let body;
  const text = await r.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
};

const run = async () => {
  console.log('\n\x1b[1mFaza 2.2 — integratsiya (haqiqiy HTTP)\x1b[0m\n');

  const owner = await login('owner', 'owner123');
  const adminA = await login('qa_admin_a', 'qa123456');
  const adminB = await login('qa_admin_b', 'qa123456');
  const staffA = await login('qa_staff_a', 'qa123456');

  // ⚠ MUSBAT NAZORAT: token olinmasa test MA'NOSIZ — yashil bermaydi.
  if (!owner || !adminA || !adminB || !staffA) {
    bad('fixture tokenlari olinmadi', 'node tests/fixtures/qaUsers.mjs ishga tushiring');
    console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
    process.exit(1);
  }
  ok('fixture tokenlari olindi (Express bergan JWT)', 'owner, adminA, adminB, staffA');

  // ─── 5. AUTENTIFIKATSIYASIZ SO'ROV HANDLER'GA YETMAYDI ──────────
  console.log('\n\x1b[1m  Autentifikatsiyasiz so\'rov\x1b[0m');
  for (const p of ['/api/roles', '/api/roles/owner', '/api/users/x/password', '/api/auth/me']) {
    const r = await get(NEST, p, null);
    check(`${p} → 401`, r.status === 401 && r.body?.success === false);
  }
  const garbage = await get(NEST, '/api/roles', 'not-a-real-token');
  check('buzuq token → 401', garbage.status === 401);

  // ─── 9. RUXSAT VA OWNER XATTI-HARAKATI ──────────────────────────
  console.log('\n\x1b[1m  Ruxsat va owner\x1b[0m');
  const rolesOwner = await get(NEST, '/api/roles', owner);
  check('owner: GET /roles → 200', rolesOwner.status === 200 && Array.isArray(rolesOwner.body?.data));
  const rolesStaff = await get(NEST, '/api/roles', staffA);
  check('roles.read yo\'q xodim → 403', rolesStaff.status === 403,
    `status ${rolesStaff.status}`);
  const oneRole = await get(NEST, '/api/roles/owner', owner);
  check('owner: GET /roles/owner → 200', oneRole.status === 200 && oneRole.body?.data?.value === 'owner');
  const missing = await get(NEST, '/api/roles/__nope__', owner);
  check('mavjud bo\'lmagan rol → 404', missing.status === 404 && missing.body?.message === 'Rol topilmadi');

  // ─── 3 + 4 + 6. FILIAL KO'LAMI VA IZOLYATSIYA ───────────────────
  //
  // ⚠ `_diag/scope` OLIB TASHLANDI (Faza 2.3 talabi) — u vaqtincha
  // skafold edi. ALS ning servis qatlamigacha yetishi Faza 2.2 da
  // bevosita isbotlangan; bu yerda o'sha xulq HAQIQIY endpoint
  // (`/auth/me`) orqali, ya'ni klient ko'radigan yo'l bilan tekshiriladi.
  console.log('\n\x1b[1m  Filial ko\'lami — /auth/me orqali\x1b[0m');
  const meA = await get(NEST, '/api/auth/me', adminA);
  const meB = await get(NEST, '/api/auth/me', adminB);
  const meOwner = await get(NEST, '/api/auth/me', owner);
  check('adminA: /auth/me → 200', meA.status === 200);
  check('adminB: /auth/me → 200', meB.status === 200);
  check('owner: canSeeAllBranches = true', meOwner.body?.data?.canSeeAllBranches === true);
  check('adminA: canSeeAllBranches = false', meA.body?.data?.canSeeAllBranches === false);

  const branchesOf = (r) => (r.body?.data?.branches || []).map((b) => b._id).sort();
  const aBranches = branchesOf(meA);
  const bBranches = branchesOf(meB);
  check('adminA faqat O\'Z filial(lar)ini ko\'radi', aBranches.length > 0, aBranches.join(','));
  check('adminA va adminB ro\'yxatlari BIR XIL EMAS',
    JSON.stringify(aBranches) !== JSON.stringify(bBranches),
    `A=${aBranches.join(',')} B=${bBranches.join(',')}`);

  // KONTEKST PARALLEL SO'ROVLAR ORASIDA SIZMAYDI.
  const N = 12;
  const mixed = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      get(NEST, '/api/auth/me', i % 2 === 0 ? adminA : adminB),
    ),
  );
  const aSeen = [...new Set(mixed.filter((_, i) => i % 2 === 0).map((r) => branchesOf(r).join(',')))];
  const bSeen = [...new Set(mixed.filter((_, i) => i % 2 === 1).map((r) => branchesOf(r).join(',')))];
  check('A barcha parallel so\'rovda BIR XIL ko\'lam oldi', aSeen.length === 1, aSeen.join(' | '));
  check('B barcha parallel so\'rovda BIR XIL ko\'lam oldi', bSeen.length === 1, bSeen.join(' | '));
  check('A va B ko\'lamlari aralashmadi (sizish yo\'q)', aSeen[0] !== bSeen[0]);

  // ─── 8. KO'LAMDAN TASHQARI x-branch-id XATTI-HARAKATI ───────────
  console.log('\n\x1b[1m  x-branch-id: mavjud xatti-harakat saqlanadi\x1b[0m');
  const foreign = bBranches[0];
  const aWithB = await get(NEST, '/api/auth/me', adminA, { 'x-branch-id': String(foreign) });
  check('ko\'lamdan tashqari x-branch-id → 403 EMAS (e\'tiborsiz)',
    aWithB.status === 200, `status ${aWithB.status}`);
  check('e\'tiborsiz qoldirilgach A O\'Z ko\'lamida qoladi',
    JSON.stringify(branchesOf(aWithB)) === JSON.stringify(aBranches));
  const aGarbage = await get(NEST, '/api/auth/me', adminA, { 'x-branch-id': 'f'.repeat(24) });
  check('mavjud bo\'lmagan x-branch-id → 403 EMAS', aGarbage.status === 200);

  // ─── 7. credentialScope — PAROL AMALLARI ────────────────────────
  console.log('\n\x1b[1m  credentialScope (parol)\x1b[0m');
  // ⚠ ROL BO'YICHA qidiramiz, `limit` bilan EMAS: bazada 800+ foydalanuvchi
  // bor va fixture'lar birinchi sahifaga tushmaydi. Avvalgi versiya aynan
  // shu sababdan "topilmadi" deb O'LCHAMAY qolgan edi.
  const byRole = async (role) => {
    const r = await fetch(`${EXPRESS}/api/users?limit=50&role=${role}`, {
      headers: { authorization: `Bearer ${owner}` },
    }).then((x) => x.json()).catch(() => null);
    const data = r?.data;
    return (Array.isArray(data) ? data : data?.items) || [];
  };
  const admins = await byRole('qa_admin');
  const staff = await byRole('qa_staff');
  const owners = await byRole('owner');
  const aUser = staff.find((u) => u.username === 'qa_staff_a');
  const bUser = admins.find((u) => u.username === 'qa_admin_b');
  const ownerUser = owners.find((u) => u.username === 'owner');

  if (!aUser || !bUser || !ownerUser) {
    warn('parol ko\'lami', 'qa fixture foydalanuvchilari topilmadi — O\'LCHANMADI');
  } else {
    const aId = aUser._id || aUser.id;

    // OWNER yo'li — `users.password` ruxsati bor va cheklovsiz.
    const ownerRead = await get(NEST, `/api/users/${aId}/password`, owner);
    check('owner: xodim paroli → 200',
      ownerRead.status === 200 && typeof ownerRead.body?.data?.password === 'string',
      `status ${ownerRead.status}`);

    // OWNER PAROLI hech kimga ko'rinmaydi (rol tekshiruvi servisda).
    const ownerPw = await get(NEST, `/api/users/${ownerUser._id || ownerUser.id}/password`, owner);
    check('owner parolini KO\'RIB BO\'LMAYDI → 403',
      ownerPw.status === 403 && /Owner parolini/.test(ownerPw.body?.message || ''));

    // RUXSATSIZ rol — qo'riqchi to'sadi (ko'lamgacha yetmaydi).
    const noPerm = await get(NEST, `/api/users/${aId}/password`, staffA);
    check('users.password ruxsati yo\'q xodim → 403', noPerm.status === 403);
    const adminNoPerm = await get(NEST, `/api/users/${aId}/password`, adminA);
    check('qa_admin (faqat users.read) → 403', adminNoPerm.status === 403);

    const ghost = await get(NEST, `/api/users/${'a'.repeat(24)}/password`, owner);
    check('mavjud bo\'lmagan foydalanuvchi → 404', ghost.status === 404);

    // ⚠ O'LCHANMADI — VA BU YASHIL EMAS.
    //
    // credentialScope ning ASOSIY holati — "`users.password` ruxsati BOR,
    // lekin BOSHQA filialdagi odam" — hozirgi fixture bilan tekshirib
    // bo'lmaydi: bu ruxsat faqat `owner` va `director` rollarida bor va
    // ikkala direktor ham HAQIQIY hisob (parolini o'qish to'g'ri emas).
    //
    // Yuqoridagi "begona filial → 403" testi O'TARDI, lekin NOTO'G'RI
    // SABABDAN: uni ko'lam emas, RUXSAT qo'riqchisi to'sardi. Ya'ni
    // ko'lam butunlay buzuq bo'lsa ham o'sha test yashil bo'lardi —
    // shuning uchun u OLIB TASHLANDI.
    //
    // Faza 2.3 dan OLDIN: izolyatsiyalangan fixture kerak — filialga
    // biriktirilgan, `users.password` ruxsatiga ega sinov roli.
    warn('credentialScope: filiallararo parol (HTTP)',
      'fixture yo\'q — `users.password` ruxsatli, filialga bog\'langan sinov roli kerak (Faza 2.3 oldidan)');
  }

  // ─── 7b. credentialScope — SERVIS QATLAMIDA (haqiqiy baza) ──────
  //
  // HTTP yo'li o'lchanmagani uchun mantiqning O'ZI shu yerda, haqiqiy
  // ma'lumot ustida tekshiriladi: aktyorning filiallari BAZADAN o'qiladi
  // va nishon boshqa filialda bo'lsa 403 chiqishi shart.
  console.log('\n\x1b[1m  credentialScope — servis qatlami\x1b[0m');
  {
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../dist/app.module.js');
    const { CredentialScopeService } = await import('../dist/common/rbac/credential-scope.js');
    const { assertTargetInScope } = await import('../dist/common/rbac/branch-access.service.js');
    const { PrismaService } = await import('../dist/prisma/prisma.service.js');

    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    try {
      const creds = app.get(CredentialScopeService);
      const prisma = app.get(PrismaService);

      const actor = await prisma.user.findFirst({
        where: { username: 'qa_admin_a' },
        select: { id: true, homeBranchId: true },
      });
      const target = await prisma.user.findFirst({
        where: { username: 'qa_admin_b' },
        select: { id: true, homeBranchId: true, branchAssignments: { select: { branchId: true } } },
      });

      if (!actor || !target) {
        warn('servis darajasidagi ko\'lam', 'qa foydalanuvchilari topilmadi');
      } else {
        const ids = await creds.actorBranchIds(actor.id);
        check('actorBranchIds bazadan o\'qildi', ids.length > 0, ids.join(','));
        check('aktyor va nishon HAQIQATAN boshqa filialda',
          !ids.includes(String(target.homeBranchId)),
          `aktyor=${ids.join(',')} nishon=${target.homeBranchId}`);

        let threw = null;
        try { assertTargetInScope(ids, false, target); } catch (e) { threw = e; }
        check('filiallararo nishon → 403 (view_all BAYROG\'ISIZ)', threw?.statusCode === 403);

        // ⚠ ENG MUHIM: `view_all` bayrog'i parol yo'lida O'TKAZGICH
        // BO'LMASLIGI kerak — u faqat HAQIQIY owner uchun.
        let ownerPass = null;
        try { assertTargetInScope(ids, true, target); } catch (e) { ownerPass = e; }
        check('haqiqiy owner (isOwner=true) → o\'tadi', ownerPass === null);

        // O'z filialidagi nishon o'tadi.
        const same = await prisma.user.findFirst({
          where: { username: 'qa_staff_a' },
          select: { id: true, homeBranchId: true, branchAssignments: { select: { branchId: true } } },
        });
        if (same) {
          let e2 = null;
          try { assertTargetInScope(ids, false, same); } catch (e) { e2 = e; }
          check('o\'z filialidagi nishon → o\'tadi', e2 === null);
        }
      }
    } finally {
      await app.close();
    }
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.skip} o'lchanmadi\n`);
  process.exit(R.fail ? 1 : 0);
};

run().catch((e) => { console.error('Test xatosi:', e); process.exit(1); });
