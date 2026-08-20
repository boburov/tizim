/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 2.5a — FOYDALANUVCHILAR MODULI PARITETI (Express 5000 ↔ NestJS 5001).
 *
 * ── MUTATSIYALARNI HAQIQIY BAZADA QANDAY SINAYMIZ ──
 *
 * Nishon — `qa_*` FIXTURE foydalanuvchilari (`tests/fixtures/qaUsers.mjs`
 * yaratadi). Ular aynan shu maqsad uchun bor.
 *
 * Har bir mutatsiya qadami:
 *     boshlang'ich holat o'qiladi
 *   → Express bajaradi        → javob yozib olinadi
 *   → holat TIKLANADI
 *   → NestJS bajaradi         → javob yozib olinadi
 *   → holat TIKLANADI
 *   → ikki javob solishtiriladi
 *
 * Tiklash ikki stek ORASIDA bo'lishi SHART: aks holda NestJS Express
 * o'zgartirgan holatdan boshlardi va "bir xilmi" degan savolga umuman
 * javob bermas edi.
 *
 * ⚠ MOLIYAVIY YOKI SHAXSIY MA'LUMOT YARATILMAYDI. Yagona o'zgaradigan
 * narsa — fixture xodimining ismi/paroli/roli/filiali, va ular darhol
 * tiklanadi.
 *
 * ── KUTILGAN FARQ (yashirilmaydi, O'LCHANADI) ──
 *
 * `GET /users/:id` O'QUVCHI nishonida NestJS'da 501
 * (`PROFILE_NOT_MIGRATED`) qaytaradi — o'quvchi profili
 * `attendance.getStudentSummary` ga tayanadi va u hali ko'chirilmagan.
 * Bu holat ATAYLAB `expectDivergence` bilan tekshiriladi: farq YO'QOLSA
 * ham test yiqiladi, ya'ni cheklov bartaraf etilgani darhol ko'rinadi.
 *
 * ⚠ O'QITUVCHI ENDI FARQ QILMAYDI: `groups` moduli ko'chgach uning
 * profili to'liq ochildi va u oddiy `both()` bilan solishtiriladi
 * (musbat nazorat bilan — pastga qarang).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';

const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

const OWNER = { login: 'owner', password: 'owner123' };
const QA_PASSWORD = 'qa123456';

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
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
};

/**
 * Har chaqiruvda o'zgaradigan maydonlar.
 *
 * `activeSessions` HAM shu ro'yxatda: parol/rol o'zgarishi refresh
 * tokenlarni bekor qiladi, ya'ni ikkinchi stek yurganda son boshqacha
 * bo'ladi. Bu haqiqiy farq EMAS — bir xil kodning ikkinchi marta
 * bajarilishi natijasi.
 */
const VOLATILE = new Set([
  'createdAt', 'updatedAt', 'lastLoginAt', 'stack', 'activeSessions',
  'frozenAt', 'lastSeenAt',
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

const login = async (base, creds) => {
  const r = await req(base, 'POST', '/api/auth/login', { body: creds });
  if (r.status !== 200) {
    throw new Error(`login ${creds.login}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.data.accessToken;
};

const main = async () => {
  console.log('\n\x1b[1mFAZA 2.5a — FOYDALANUVCHILAR MODULI PARITETI\x1b[0m\n');

  const ownerToken = await login(EXPRESS, OWNER);

  // ── Nishonlar ──
  const byUsername = new Map();
  for (const q of ['?staff=1&limit=200&status=all', '?role=student&limit=1']) {
    const r = await req(EXPRESS, 'GET', `/api/users${q}`, { token: ownerToken });
    for (const u of r.body?.data || []) byUsername.set(u.username, u);
  }
  const qaStaff = byUsername.get('qa_staff_a');
  const qaAdminA = byUsername.get('qa_admin_a');
  const ownerUser = [...byUsername.values()].find((u) => u.role === 'owner');
  const student = [...byUsername.values()].find((u) => u.role === 'student');

  if (!qaStaff || !qaAdminA) {
    console.log('\n  ❌ QA fixture foydalanuvchilari yo\'q. Avval fixture\'ni yurgazing:');
    console.log('     node server/tests/fixtures/qaUsers.mjs\n');
    process.exit(1);
  }

  // Direktor — BOSHQA filialdagi, `users.password` ruxsati BOR aktyor.
  // Aynan shu kombinatsiya `credentialScope` ni haqiqiy sharoitda sinaydi.
  let directorToken = null;
  let directorBranchName = null;
  try {
    const dirs = await req(EXPRESS, 'GET', '/api/users?role=director&limit=5', {
      token: ownerToken,
    });
    for (const d of dirs.body?.data || []) {
      const pw = await req(EXPRESS, 'GET', `/api/users/${d.id}/password`, {
        token: ownerToken,
      });
      if (pw.status !== 200) continue;
      // Nishon (qa_staff_a / qa_admin_a) BOSHQA filialda bo'lishi shart.
      const dirBranch = String(d.homeBranchId?.id || d.homeBranchId || '');
      const targetBranch = String(qaAdminA.homeBranchId?.id || qaAdminA.homeBranchId || '');
      if (dirBranch && targetBranch && dirBranch !== targetBranch) {
        directorToken = await login(EXPRESS, {
          login: pw.body.data.username,
          password: pw.body.data.password,
        });
        directorBranchName = d.homeBranchId?.name || dirBranch;
        break;
      }
    }
  } catch (e) {
    console.log(`  (direktor tokeni olinmadi: ${e.message})`);
  }

  // `users.read` BOR, `roles.update` YO'Q aktyor — AND semantikasi uchun.
  let qaAdminToken = null;
  try {
    qaAdminToken = await login(EXPRESS, { login: 'qa_admin_a', password: QA_PASSWORD });
  } catch { /* fixture paroli boshqacha bo'lsa — pastda o'lchanmadi deb belgilanadi */ }

  const subs = () => [];

  /** Bir so'rovni ikkala stekda bajaradi va solishtiradi. */
  const both = async (name, fn, subsOf = subs) => {
    let e, n;
    try {
      e = await fn(EXPRESS);
      n = await fn(NEST);
    } catch (err) { skip(name, err.message); return {}; }
    const en = { status: e.status, body: strip(e.body) };
    const nn = { status: n.status, body: strip(n.body) };
    try {
      assert.deepEqual(nn, en);
      ok(`${name} — ${e.status}`);
    } catch {
      const es = JSON.stringify(en), ns = JSON.stringify(nn);
      bad(name, `express: ${es.slice(0, 600)}\n      nest   : ${ns.slice(0, 600)}`);
    }
    return { e, n };
  };

  /**
   * MUTATSIYA: har stek BIR XIL boshlang'ich holatdan boshlaydi.
   * `restore()` ikki yurish ORASIDA va oxirida chaqiriladi.
   */
  const bothMutating = async (name, fn, restore) => {
    let e, n;
    try {
      e = await fn(EXPRESS);
      await restore();
      n = await fn(NEST);
      await restore();
    } catch (err) {
      try { await restore(); } catch { /* tiklash ham yiqildi */ }
      skip(name, err.message);
      return {};
    }
    const en = { status: e.status, body: strip(e.body) };
    const nn = { status: n.status, body: strip(n.body) };
    try {
      assert.deepEqual(nn, en);
      ok(`${name} — ${e.status}`);
    } catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 600)}\n      nest   : ${JSON.stringify(nn).slice(0, 600)}`);
    }
    return { e, n };
  };

  /** ATAYLAB kutilayotgan farq. Farq YO'QOLSA ham yiqiladi. */
  const expectDivergence = async (name, fn, expect) => {
    let e, n;
    try { e = await fn(EXPRESS); n = await fn(NEST); }
    catch (err) { skip(name, err.message); return; }
    try {
      assert.equal(e.status, expect.expressStatus, `express status`);
      assert.equal(n.status, expect.nestStatus, `nest status`);
      if (expect.nestCode) assert.equal(n.body?.code, expect.nestCode, 'nest code');
      ok(`${name} — express ${e.status}, nest ${n.status} (kutilgan farq)`);
    } catch (err) {
      bad(name, `${err.message}\n      express: ${e.status} · nest: ${n.status} ${JSON.stringify(n.body).slice(0, 200)}`);
    }
  };

  // ═══════════════════ O'QISH ═══════════════════
  console.log('\x1b[2m  ── ro\'yxat ──\x1b[0m');

  for (const q of [
    '?limit=5',
    '?staff=1&limit=5',
    '?staff=1&status=archived&limit=5',
    '?staff=1&status=frozen&limit=5',
    '?status=frozen&limit=5',
    '?status=all&limit=5',
    '?archived=1&limit=5',
    '?search=qa&limit=5',
    '?role=qa_staff&limit=10',
    '?sort=firstName&order=asc&limit=5',
    '?sort=lastName&order=desc&limit=5',
    '?page=2&limit=3',
  ]) {
    await both(`GET /users${q}`, (b) => req(b, 'GET', `/api/users${q}`, { token: ownerToken }));
  }
  await both('GET /users?limit=9999 (400 validatsiya)', (b) =>
    req(b, 'GET', '/api/users?limit=9999', { token: ownerToken }));
  await both("GET /users (token yo'q → 401)", (b) => req(b, 'GET', '/api/users'));

  console.log('\x1b[2m  ── statistika va bandlik ──\x1b[0m');
  await both('GET /users/staff-stats', (b) =>
    req(b, 'GET', '/api/users/staff-stats', { token: ownerToken }));
  await both('GET /users/check-availability?username=owner', (b) =>
    req(b, 'GET', '/api/users/check-availability?username=owner', { token: ownerToken }));
  await both('GET /users/check-availability?username=__nope__', (b) =>
    req(b, 'GET', '/api/users/check-availability?username=__nope__', { token: ownerToken }));
  await both('GET /users/check-availability (parametrsiz)', (b) =>
    req(b, 'GET', '/api/users/check-availability', { token: ownerToken }));
  await both('GET /users/check-availability (excludeId bilan)', (b) =>
    req(b, 'GET', `/api/users/check-availability?username=qa_staff_a&excludeId=${qaStaff.id}`,
      { token: ownerToken }));

  console.log('\x1b[2m  ── bitta foydalanuvchi ──\x1b[0m');
  await both('GET /users/:id (xodim profili)', (b) =>
    req(b, 'GET', `/api/users/${qaStaff.id}`, { token: ownerToken }));
  await both('GET /users/:id (404)', (b) =>
    req(b, 'GET', `/api/users/${'a'.repeat(24)}`, { token: ownerToken }));

  // ── O'QITUVCHI PROFILI — ENDI TO'LIQ (`groups` ko'chgach ochildi) ──
  //
  // ⚠ MUSBAT NAZORAT SHART: bo'sh `groups: []` ikkala stekda ham
  // "bir xil" bo'ladi va TEKSHIRUVNI YOLG'ON YASHIL qilardi. Shuning
  // uchun kamida BITTA guruhi bor o'qituvchi bo'lishi TALAB qilinadi —
  // aynan u `groups.list` yo'lini haqiqatan bosib o'tadi.
  {
    const tr = await req(EXPRESS, 'GET', '/api/users?role=teacher&limit=10', {
      token: ownerToken,
    });
    const teachers = tr.body?.data || [];
    if (!teachers.length) {
      skip("o'qituvchi profili", "bazada o'qituvchi topilmadi");
    } else {
      let withGroups = 0;
      for (const t of teachers) {
        const { e } = await both(`GET /users/:id (O'QITUVCHI ${t.username})`, (b) =>
          req(b, 'GET', `/api/users/${t.id}`, { token: ownerToken }));
        if ((e?.body?.data?.groups?.length || 0) > 0) withGroups += 1;
      }
      if (withGroups > 0) {
        ok(`MUSBAT NAZORAT: ${withGroups} ta o'qituvchida guruh bor — ` +
          '`groups.list` yo\'li haqiqatan bosib o\'tildi');
      } else {
        bad("o'qituvchi profili musbat nazorati",
          "hech bir o'qituvchida guruh yo'q — `groups` yo'li O'LCHANMADI, " +
          "bo'sh massivning tengligi hech nimani isbotlamaydi");
      }
    }
  }

  if (student) {
    // ⚠ KUTILGAN FARQ TORAYDI: ilgari o'quvchi HAM, o'qituvchi HAM 501
    // edi. `groups` ko'chgach o'qituvchi ochildi (yuqorida o'lchandi),
    // o'quvchi esa HAMON yopiq — `attendance.getStudentSummary` yo'q.
    // Farq yo'qolgan kuni bu test yiqiladi va cheklov yopilgani ko'rinadi.
    await expectDivergence(
      "GET /users/:id (O'QUVCHI — `attendance` hali ko'chirilmagan)",
      (b) => req(b, 'GET', `/api/users/${student.id}`, { token: ownerToken }),
      { expressStatus: 200, nestStatus: 501, nestCode: 'PROFILE_NOT_MIGRATED' },
    );
    await both("GET /users/:id/group-history (o'quvchi)", (b) =>
      req(b, 'GET', `/api/users/${student.id}/group-history?limit=5`, { token: ownerToken }));
  } else {
    skip("o'quvchi tekshiruvlari", "bazada o'quvchi topilmadi");
  }

  await both("GET /users/:id/group-history (xodim → 400)", (b) =>
    req(b, 'GET', `/api/users/${qaStaff.id}/group-history`, { token: ownerToken }));

  // ═══════════════════ PAROL ═══════════════════
  console.log('\x1b[2m  ── parol (credentialScope) ──\x1b[0m');

  await both('GET /users/:id/password (xodim)', (b) =>
    req(b, 'GET', `/api/users/${qaStaff.id}/password`, { token: ownerToken }));
  await both('GET /users/:id/password (404)', (b) =>
    req(b, 'GET', `/api/users/${'a'.repeat(24)}/password`, { token: ownerToken }));
  if (ownerUser) {
    await both('GET /users/:ownerId/password (403)', (b) =>
      req(b, 'GET', `/api/users/${ownerUser.id}/password`, { token: ownerToken }));
  } else {
    skip('owner paroli 403', 'owner foydalanuvchi topilmadi');
  }

  // ⚠ FILIALLARARO PAROL — `credentialScope` ning HAQIQIY sinovi.
  // `phase22-integration` da bu "o'lchanmadi" bo'lib turgan edi:
  // `users.password` ruxsatli, filialga bog'langan aktyor kerak edi.
  if (directorToken) {
    await both(
      `filiallararo parol O'QISH rad etiladi (direktor@${directorBranchName} → qa_admin_a)`,
      (b) => req(b, 'GET', `/api/users/${qaAdminA.id}/password`, { token: directorToken }),
    );
    await both(
      'filiallararo parol ALMASHTIRISH rad etiladi',
      (b) =>
        req(b, 'PATCH', `/api/users/${qaAdminA.id}/password`, {
          token: directorToken,
          body: { password: 'buyerga_yetmasligi_kerak' },
        }),
    );
  } else {
    skip('filiallararo parol', "boshqa filialdagi direktor topilmadi");
  }

  // ── PAROL ALMASHTIRISH (haqiqiy yozuv, tiklash bilan) ──
  const originalPw = await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}/password`, {
    token: ownerToken,
  });
  if (originalPw.status === 200) {
    const restorePw = () =>
      req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/password`, {
        token: ownerToken,
        body: { password: originalPw.body.data.password },
      });
    await bothMutating(
      'PATCH /users/:id/password',
      (b) =>
        req(b, 'PATCH', `/api/users/${qaStaff.id}/password`, {
          token: ownerToken,
          body: { password: 'parity_temp_1' },
        }),
      restorePw,
    );
  } else {
    skip('PATCH /users/:id/password', 'boshlang\'ich parol o\'qilmadi');
  }

  await both('PATCH /users/:id/password (qisqa → 400)', (b) =>
    req(b, 'PATCH', `/api/users/${qaStaff.id}/password`, {
      token: ownerToken,
      body: { password: 'qisqa' },
    }));
  if (ownerUser) {
    await both('PATCH /users/:ownerId/password (403)', (b) =>
      req(b, 'PATCH', `/api/users/${ownerUser.id}/password`, {
        token: ownerToken,
        body: { password: 'yetmaydi123' },
      }));
  }

  // ═══════════════════ TAHRIRLASH ═══════════════════
  console.log('\x1b[2m  ── tahrirlash ──\x1b[0m');

  const restoreName = () =>
    req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}`, {
      token: ownerToken,
      body: { firstName: qaStaff.firstName, lastName: qaStaff.lastName },
    });

  await bothMutating(
    'PATCH /users/:id (ism)',
    (b) =>
      req(b, 'PATCH', `/api/users/${qaStaff.id}`, {
        token: ownerToken,
        body: { firstName: 'ParityQA', lastName: 'ParityTest' },
      }),
    restoreName,
  );

  await both("PATCH /users/:id (bo'sh tana → 400)", (b) =>
    req(b, 'PATCH', `/api/users/${qaStaff.id}`, { token: ownerToken, body: {} }));
  await both("PATCH /users/:id (xodimga enrolledAt → 400)", (b) =>
    req(b, 'PATCH', `/api/users/${qaStaff.id}`, {
      token: ownerToken,
      body: { enrolledAt: '2024-01-01' },
    }));
  await both("PATCH /users/:id (xodimga hiredAt → 400)", (b) =>
    req(b, 'PATCH', `/api/users/${qaStaff.id}`, {
      token: ownerToken,
      body: { hiredAt: '2024-01-01' },
    }));
  await both('PATCH /users/:id (404)', (b) =>
    req(b, 'PATCH', `/api/users/${'a'.repeat(24)}`, {
      token: ownerToken,
      body: { firstName: 'X' },
    }));
  if (ownerUser) {
    await both('PATCH /users/:ownerId (403)', (b) =>
      req(b, 'PATCH', `/api/users/${ownerUser.id}`, {
        token: ownerToken,
        body: { firstName: 'X' },
      }));
  }
  await both("PATCH /users/:id (telefon noto'g'ri → 400)", (b) =>
    req(b, 'PATCH', `/api/users/${qaStaff.id}`, {
      token: ownerToken,
      body: { phone: '123' },
    }));

  // ═══════════════════ ROL ═══════════════════
  console.log('\x1b[2m  ── rol biriktirish ──\x1b[0m');

  const restoreRole = () =>
    req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/role`, {
      token: ownerToken,
      body: { role: qaStaff.role },
    });

  await bothMutating(
    'PATCH /users/:id/role',
    (b) =>
      req(b, 'PATCH', `/api/users/${qaStaff.id}/role`, {
        token: ownerToken,
        body: { role: 'qa_read' },
      }),
    restoreRole,
  );

  await both("PATCH /users/:id/role (mavjud bo'lmagan rol → 400)", (b) =>
    req(b, 'PATCH', `/api/users/${qaStaff.id}/role`, {
      token: ownerToken,
      body: { role: '__nope__' },
    }));
  if (ownerUser) {
    await both("PATCH /users/:ownerId/role (o'z roli → 400)", (b) =>
      req(b, 'PATCH', `/api/users/${ownerUser.id}/role`, {
        token: ownerToken,
        body: { role: 'qa_read' },
      }));
  }
  if (directorToken) {
    await both('direktor OWNER rolini bera olmaydi (403)', (b) =>
      req(b, 'PATCH', `/api/users/${qaStaff.id}/role`, {
        token: directorToken,
        body: { role: 'owner' },
      }));
  }

  // ═══════════════════ FILIAL BIRIKTIRUVI ═══════════════════
  console.log('\x1b[2m  ── filial biriktiruvi ──\x1b[0m');

  const originalHome = String(qaStaff.homeBranchId?.id || qaStaff.homeBranchId || '');
  const originalAssigns = (qaStaff.branchAssignments || []).map((a) => ({
    branchId: String(a.branchId),
    role: a.role ?? null,
  }));
  const restoreBranches = () =>
    req(EXPRESS, 'PATCH', `/api/users/${qaStaff.id}/branches`, {
      token: ownerToken,
      body: { homeBranchId: originalHome, branchAssignments: originalAssigns },
    });

  await bothMutating(
    'PATCH /users/:id/branches (o\'sha filial qayta yoziladi)',
    (b) =>
      req(b, 'PATCH', `/api/users/${qaStaff.id}/branches`, {
        token: ownerToken,
        body: { homeBranchId: originalHome, branchAssignments: originalAssigns },
      }),
    restoreBranches,
  );

  await both("PATCH /users/:id/branches (bo'sh homeBranchId → 400)", (b) =>
    req(b, 'PATCH', `/api/users/${qaStaff.id}/branches`, {
      token: ownerToken,
      body: { homeBranchId: '' },
    }));
  await both('PATCH /users/:id/branches (mavjud emas filial → 400)', (b) =>
    req(b, 'PATCH', `/api/users/${qaStaff.id}/branches`, {
      token: ownerToken,
      body: { homeBranchId: 'f'.repeat(24) },
    }));

  // ⚠ IKKI RUXSAT AND SEMANTIKASI — `users.read` bor, `roles.update` YO'Q.
  // NestJS'da bu ikkita ketma-ket qo'riqchi bilan ifodalangan; bitta
  // `@Permissions(a, b)` OR bo'lardi va bu xodim o'tib ketardi.
  if (qaAdminToken) {
    await both(
      "`roles.update` yo'q xodim filial biriktiruvini o'zgartira olmaydi (403)",
      (b) =>
        req(b, 'PATCH', `/api/users/${qaStaff.id}/branches`, {
          token: qaAdminToken,
          body: { homeBranchId: originalHome },
        }),
    );
    await both('`users.password` yo\'q xodim parolni ko\'ra olmaydi (403)', (b) =>
      req(b, 'GET', `/api/users/${qaStaff.id}/password`, { token: qaAdminToken }));
  } else {
    skip('AND semantikasi (roles.update)', 'qa_admin_a bilan kirib bo\'lmadi');
  }

  // ── YAKUNIY HOLAT TEKSHIRUVI ──
  // Test o'zidan keyin hech narsa qoldirmaganini ISBOTLAYDI.
  const after = await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}`, { token: ownerToken });
  const pwAfter = await req(EXPRESS, 'GET', `/api/users/${qaStaff.id}/password`, {
    token: ownerToken,
  });
  try {
    assert.equal(after.body?.data?.firstName, qaStaff.firstName, 'firstName');
    assert.equal(after.body?.data?.lastName, qaStaff.lastName, 'lastName');
    assert.equal(after.body?.data?.role, qaStaff.role, 'role');
    assert.equal(
      String(after.body?.data?.homeBranchId?.id || after.body?.data?.homeBranchId || ''),
      originalHome,
      'homeBranchId',
    );
    if (originalPw.status === 200) {
      assert.equal(pwAfter.body?.data?.password, originalPw.body.data.password, 'parol');
    }
    ok('nishon foydalanuvchi holati TO\'LIQ tiklandi');
  } catch (err) {
    bad('nishon foydalanuvchi holati tiklanmadi', err.message);
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
  process.exit(R.fail || R.unmeasured ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
