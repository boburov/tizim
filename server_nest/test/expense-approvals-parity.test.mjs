/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASDIQLAR — PARITET (FAZA 7.3)
 *
 * Express `/api/expense-approvals` + `/api/approvals` ↔ NestJS.
 *
 * ── NIMA ISBOTLANADI ──
 *
 *   1. Paritet: o'qish javoblari va qaror natijalari bir xil.
 *   2. IKKI MANZIL: `/expense-approvals` va `/approvals` AYNAN bir xil
 *      javob beradi (Express `routes/index.js` da bitta routerni ikki
 *      joyga ulaydi; NestJS'da `@Controller([...])` massivi).
 *   3. KATEGORIYA CHEGARASI: moliya huquqi bor odam SOZLAMA so'rovini
 *      ko'rmaydi va tasdiqlay olmaydi (va aksincha) — lekin O'Z
 *      so'rovini har kim ko'radi.
 *   4. PAROL SIZMAYDI: `payload.password` (ishga olish so'rovi) o'qish
 *      javoblarida BO'LMAYDI.
 *   5. NULL TARTIBI: `sort=-amount` da summasiz (konfiguratsiya)
 *      so'rovlar OXIRIDA qoladi — Postgres'ning standarti (NULLS FIRST)
 *      buni teskari qilardi.
 *   6. KONKURENTLIK: 20 bir vaqtdagi `reject` — FAQAT BITTASI o'tadi.
 *   7. FILIAL IZOLYATSIYASI: musbat va manfiy nazorat bilan.
 *
 * ── ATAYLAB KUTILGAN FARQ ──
 *
 * `POST /:id/approve` KO'CHIRILMAGAN turlarda NestJS'da 501
 * (`APPROVAL_EXECUTORS_NOT_MIGRATED`): bajaruvchilar o'n modulda va
 * ular hali ko'chirilmagan. Farq `expectDivergence` bilan KUZATILADI —
 * bajaruvchilar ko'chgan kuni test YIQILADI va e'tibor tortadi.
 * (Aynan shu naqsh `users-parity` da `PROFILE_NOT_MIGRATED` uchun
 * ishlatilgan.)
 *
 * ISHLATISH:  node test/expense-approvals-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS,
  NEST,
  request,
  normalize,
  nowStamps,
  mintToken,
  waitForStacks,
  createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `EA-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('expense-approvals');


/**
 * ⚠ SHU YURISHGA XOS MIJOZ MANZILI.
 *
 * Bu to'plam ~150 so'rov yuboradi va `generalLimiter` (IP bo'yicha
 * 200/daq) haqiqiy IP'ni parallel to'plamlar bilan BAHAM ko'radi —
 * ketma-ket ikki yurishda ikkinchisi 429 olib, HECH NARSA
 * O'LCHANMAYDI (test o'zi ham shunday deb yozadi).
 *
 * Ikkala stek ham `trust proxy: 1` bilan ishlaydi, ya'ni chegara shu
 * manzil bo'yicha sanaladi. CHEGARA ZAIFLASHMAYDI — to'plam faqat
 * boshqa mashinadan kelayotgandek ko'rinadi. Chegaraning O'ZI
 * `test/rate-limit-parity.test.mjs` da alohida o'lchanadi.
 */
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 250n) + 2)}`;

const made = { branches: [], users: [], approvals: [] };

const cleanup = async () => {
  try {
    if (made.approvals.length) {
      await prisma.approval.deleteMany({ where: { id: { in: made.approvals } } });
    }
    if (made.branches.length) {
      await prisma.approval.deleteMany({ where: { branchId: { in: made.branches } } });
    }
    if (made.users.length) {
      await prisma.approval.deleteMany({
        where: { requestedById: { in: made.users } },
      });
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (made.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: made.branches } } });
    }
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

/** Har stek uchun alohida fikstura. */
const makeFixture = async (label) => {
  const mk = (suffix) =>
    prisma.branch.create({
      data: { name: `${TAG} ${label} ${suffix}`, code: `${TAG}${label}${suffix}` },
    });
  const [a, c] = [await mk('A'), await mk('C')];
  made.branches.push(a.id, c.id);

  const mkUser = async (n, role, home) => {
    const u = await prisma.user.create({
      data: {
        firstName: n, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: home,
      },
    });
    made.users.push(u.id);
    return u;
  };

  // ═══════════════════════════════════════════════════════════════════
  // ROLLAR — BAZADAN O'LCHANGAN, TAXMIN QILINMAGAN
  //
  // `director`:  finance.read ✓ · finance.pay ✓ · groups.update ✓
  //              approvals.decide_config ✗ · finance.approve ✗
  // `reception`: HECH QANDAY tegishli ruxsat yo'q
  //
  // ⚠ BIRINCHI URINISHDA `asker` `reception` edi va TEKSHIRUVLAR
  // NOTO'G'RI EDI: `reception` marshrut darvozasidan ("finance.read
  // YOKI approvals.decide_config") umuman o'tmaydi, ya'ni "so'rovchi
  // o'z so'rovini ko'radi" tekshiruvi 403 olardi. Bu XATO EMAS —
  // "o'z so'rovini ko'rish" imtiyozi darvozadan O'TGANLARGA tegishli,
  // darvozaning o'rniga emas.
  //
  // Shuning uchun `asker` ham `director`: u ro'yxatni ko'radi
  // (finance.read) va o'z so'rovini bekor qila oladi (finance.pay),
  // LEKIN sozlama so'rovini tasdiqlay olmaydi — ya'ni kategoriya
  // chegarasi aynan unda o'lchanadi.
  // ═══════════════════════════════════════════════════════════════════
  const dirA = await mkUser('DirA', 'director', a.id);
  const dirC = await mkUser('DirC', 'director', c.id);
  const asker = await mkUser('Asker', 'director', a.id);

  return { a, c, dirA, dirC, asker };
};

/**
 * Tasdiq so'rovi yaratadi (to'g'ridan-to'g'ri bazaga — HTTP yuzasi yo'q).
 *
 * ⚠ `createdAt` OCHIQ VA HAR SAFAR BOSHQA QIYMAT BILAN BERILADI.
 *
 * Standart saralash `-createdAt`. Ikki so'rov bir xil millisekundda
 * yaratilsa TENGLIK yuzaga keladi va Postgres qaysi birini oldin
 * qaytarishini KAFOLATLAMAYDI — natijada ikki stek bir xil ma'lumot
 * ustida BOSHQA TARTIB qaytarib, paritet testi tasodifiy yiqilardi
 * (aynan shu sodir bo'ldi: birinchi ishga tushirish yashil, ikkinchisi
 * 6 ta farq).
 *
 * Bu FIKSTURA nuqsoni edi, implementatsiya nuqsoni emas: `-createdAt`
 * bo'yicha teng qatorlarning tartibi haqiqatan aniqlanmagan. Aniq va
 * bir-biridan farqli vaqt tamg'asi tenglikni butunlay yo'q qiladi.
 *
 * Qiymat solishtiruvga TA'SIR QILMAYDI — `createdAt` garnizonda
 * `VOLATILE` ro'yxatida va javobdan olib tashlanadi. Faqat TARTIB
 * muhim.
 */
let approvalSeq = 0;
const SEQ_BASE = Date.now() - 60 * 60 * 1000; // bir soat oldin

const mkApproval = async (branchId, requestedById, over = {}) => {
  approvalSeq += 1;
  const row = await prisma.approval.create({
    data: {
      createdAt: new Date(SEQ_BASE + approvalSeq * 1000),
      branchId,
      kind: 'expense_create',
      category: 'financial',
      amount: 500_000,
      payload: {},
      subjectName: `${TAG} subyekt`,
      contextName: `${TAG} kontekst`,
      requestedById,
      requestNote: `${TAG} izoh`,
      status: 'pending',
      ...over,
    },
  });
  made.approvals.push(row.id);
  return row;
};

/**
 * ⚠ TEZLIK CHEGARASI (429) — YOLG'ON QIZIL BERMASIN.
 *
 * Express'da global chegara bor: `generalLimiter` — daqiqasiga 200 ta
 * so'rov (`middleware/rateLimiter.js`). Bu ISHLAB CHIQARISH HIMOYASI va
 * testda o'chirilmaydi.
 *
 * Bu to'plam bir ishga tushirishda ~150–200 so'rov yuboradi (20 ta bir
 * vaqtdagi konkurentlik tekshiruvi ham shu ichida), ya'ni KETMA-KET
 * ishga tushirishlar bitta oynaga sig'maydi. O'shanda javob 429 bo'ladi
 * va uni "paritet buzildi" deb ko'rsatish YOLG'ON bo'lardi — aslida
 * hech narsa o'lchanmagan.
 *
 * Shuning uchun 429 alohida ajratiladi va O'LCHANMADI deb belgilanadi.
 */
const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p/i.test(String(r?.body?.message || ''));

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mTASDIQLAR — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false },
    select: { id: true, role: true },
  });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = {
    [EXPRESS]: await makeFixture('E'),
    [NEST]: await makeFixture('N'),
  };
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    tok[base] = {
      dirA: mintToken(fx[base].dirA),
      dirC: mintToken(fx[base].dirC),
      asker: mintToken(fx[base].asker),
    };
  }

  const call = (base, method, path, { body, branchId, as } = {}) =>
    request(base, method, path, {
      token: as ? tok[base][as] : ownerToken,
      body,
      headers: {
        'x-forwarded-for': RUN_IP,
        ...(branchId ? { 'x-branch-id': branchId } : {}),
      },
    });

  const subs = (base) => {
    const f = fx[base];
    const L = base === EXPRESS ? 'E' : 'N';
    return [
      [f.a.id, '<A>'], [f.c.id, '<C>'],
      [f.dirA.id, '<DIR_A>'], [f.dirC.id, '<DIR_C>'], [f.asker.id, '<ASKER>'],
      [owner.id, '<OWNER>'],
      [`${TAG} ${L} `, '<TAG> '], [`${TAG}${L}`, '<TAG>'],
      [`${TAG.toLowerCase()}_${L.toLowerCase()}`, '<tag>'],
      [TAG, '<TAG>'],
      nowStamps(),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  const mirror = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS, fx[EXPRESS]); n = await fn(NEST, fx[NEST]); }
    catch (err) { skip(name, err.message); return {}; }
    if (rateLimited(e) || rateLimited(n)) {
      skip(name, "429 — Express tezlik chegarasi (200/daq). Ishga tushirishlarni ORALIQ bilan bajaring.");
      return {};
    }
    if (e.status >= 200 && e.status < 300) R.successes += 1;
    const en = { status: e.status, body: normalize(e.body, subs(EXPRESS)) };
    const nn = { status: n.status, body: normalize(n.body, subs(NEST)) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      ` +
                `nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  /** ATAYLAB kutilayotgan farq. Farq YO'QOLSA ham yiqiladi. */
  const expectDivergence = async (name, fn, expect) => {
    let e, n;
    try { e = await fn(EXPRESS, fx[EXPRESS]); n = await fn(NEST, fx[NEST]); }
    catch (err) { skip(name, err.message); return; }
    if (rateLimited(e) || rateLimited(n)) {
      skip(name, "429 — Express tezlik chegarasi (200/daq)");
      return;
    }
    try {
      assert.equal(e.status, expect.expressStatus, 'express status');
      assert.equal(n.status, expect.nestStatus, 'nest status');
      if (expect.nestCode) assert.equal(n.body?.code, expect.nestCode, 'nest code');
      ok(`${name} — express ${e.status}, nest ${n.status} (kutilgan farq)`);
    } catch (err) {
      bad(name, `${err.message}\n      express: ${e.status} · nest: ${n.status} ` +
                `${JSON.stringify(n.body).slice(0, 200)}`);
    }
  };

  const eq = (n, a, b) => (a === b ? ok(`${n} — ${a}`) : bad(n, `kutilgan ${b}, keldi ${a}`));

  // ─────────────────────────────────────────────────────────────────
  section('1) O\'QISH — ro\'yxat, filtrlar, KPI');
  // ─────────────────────────────────────────────────────────────────

  // Har stekda: 1 moliyaviy (summali) + 1 sozlama (summasiz) so'rov.
  const pending = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    pending[base] = await mkApproval(f.a.id, f.asker.id);
    await mkApproval(f.a.id, f.asker.id, {
      kind: 'discount_set', category: 'configuration', amount: null,
      subjectKey: null, subjectName: `${TAG} chegirma`,
    });
  }

  const l1 = await mirror('GET /expense-approvals', (base, f) =>
    call(base, 'GET', '/api/expense-approvals?limit=50', { branchId: f.a.id }));
  eq('ro\'yxatda ikkala so\'rov ham bor',
    (l1.e?.body?.data || []).length, 2);

  // IKKI MANZIL bir xil javob berishi SHART.
  const l2 = await mirror('GET /approvals (taxallus manzil)', (base, f) =>
    call(base, 'GET', '/api/approvals?limit=50', { branchId: f.a.id }));
  try {
    assert.deepEqual(
      normalize(l2.e?.body, subs(EXPRESS)),
      normalize(l1.e?.body, subs(EXPRESS)),
    );
    ok('/approvals va /expense-approvals AYNAN bir xil (express)');
  } catch { bad('/approvals va /expense-approvals bir xil (express)', 'farq bor'); }
  try {
    assert.deepEqual(
      normalize(l2.n?.body, subs(NEST)),
      normalize(l1.n?.body, subs(NEST)),
    );
    ok('/approvals va /expense-approvals AYNAN bir xil (nest)');
  } catch { bad('/approvals va /expense-approvals bir xil (nest)', 'farq bor'); }

  await mirror('GET ?status=pending', (base, f) =>
    call(base, 'GET', '/api/expense-approvals?status=pending', { branchId: f.a.id }));
  await mirror('GET ?category=financial', (base, f) =>
    call(base, 'GET', '/api/expense-approvals?category=financial', { branchId: f.a.id }));
  await mirror('GET ?kind=expense_create', (base, f) =>
    call(base, 'GET', '/api/expense-approvals?kind=expense_create', { branchId: f.a.id }));
  // ⚠ FILIAL KO'LAMI QO'SHILGAN. Owner sarlavhasiz BARCHA filialni
  // ko'radi, ikkala stekning fiksturasi esa BITTA bazada yashaydi —
  // ya'ni ko'lamsiz qidiruv har stekka IKKALA to'plamni ham qaytarardi
  // va solishtiruv begona ID lar ustida yiqilardi.
  await mirror('GET ?search=<TAG>', (base, f) =>
    call(base, 'GET', `/api/expense-approvals?search=${TAG}`, { branchId: f.a.id }));
  await mirror("GET ?search=( — regexp belgisi so'rovni yiqitmaydi", (base) =>
    call(base, 'GET', '/api/expense-approvals?search=%28', {}));
  await mirror('GET ?status=__nope__ (400)', (base) =>
    call(base, 'GET', '/api/expense-approvals?status=__nope__', {}));
  await mirror('GET ?limit=201 (400)', (base) =>
    call(base, 'GET', '/api/expense-approvals?limit=201', {}));
  await mirror('GET ?requestedBy=<xato> (400)', (base) =>
    call(base, 'GET', '/api/expense-approvals?requestedBy=xato', {}));

  // ── NULL TARTIBI ──
  //
  // Postgres'da DESC ning standarti NULLS FIRST. E'tibor berilmasa
  // "summa bo'yicha, kattadan" saralashda summasiz (konfiguratsiya)
  // so'rovlar BIRINCHI chiqib, eng katta chiqim pastga tushib ketardi —
  // ya'ni saralash maqsadiga TESKARI ishlardi.
  const srt = await mirror('GET ?sort=-amount', (base, f) =>
    call(base, 'GET', '/api/expense-approvals?sort=-amount&limit=50', { branchId: f.a.id }));
  for (const [label, res] of [['express', srt.e], ['nest', srt.n]]) {
    const rows = res?.body?.data || [];
    if (rows.length < 2) { bad(`null tartibi (${label})`, "kamida 2 qator kerak"); continue; }
    rows[0].amount !== null && rows[rows.length - 1].amount === null
      ? ok(`summasiz so'rov OXIRIDA (${label}) — birinchi: ${rows[0].amount}`)
      : bad(`summasiz so'rov OXIRIDA (${label})`,
        `tartib: ${rows.map((r) => r.amount).join(', ')}`);
  }

  await mirror('GET /pending-count', (base, f) =>
    call(base, 'GET', '/api/expense-approvals/pending-count', { branchId: f.a.id }));

  // ⚠ `stats` `/:id` DAN OLDIN e'lon qilinmasa u ID deb o'qilib 404 berardi.
  const st = await mirror('GET /stats', (base, f) =>
    call(base, 'GET', '/api/expense-approvals/stats', { branchId: f.a.id }));
  for (const [label, res] of [['express', st.e], ['nest', st.n]]) {
    const d = res?.body?.data;
    // `pendingAmount` FAQAT moliyaviy: sozlama so'rovida `amount` null va
    // u "kutilayotgan chiqim" summasiga qo'shilsa hisobot yolg'on bo'lardi.
    eq(`stats.pendingAmount faqat moliyaviy (${label})`, d?.pendingAmount, 500_000);
    eq(`stats.pending ikkala so'rovni sanaydi (${label})`, d?.pending, 2);
  }

  await mirror('GET /:id', (base) =>
    call(base, 'GET', `/api/expense-approvals/${pending[base].id}`, {}));
  await mirror('GET /:id (404)', (base) =>
    call(base, 'GET', `/api/expense-approvals/${'a'.repeat(24)}`, {}));

  // ─────────────────────────────────────────────────────────────────
  section("2) PAROL SIZMAYDI — `payload.password`");
  // ─────────────────────────────────────────────────────────────────
  //
  // Ishga olish so'rovi payload'ida yangi xodimning paroli turadi
  // (loyihada parollar OCHIQ MATNDA saqlanadi). `User` modelida u
  // `omit` bilan himoyalangan, `Approval.payload` esa oddiy JSON —
  // tasdiqlarni ko'ra oladigan HAR KIM uni o'qib olardi.
  const hire = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    hire[base] = await mkApproval(f.a.id, f.asker.id, {
      kind: 'staff_hire', category: 'configuration', amount: null,
      payload: { username: `yangi_${TAG}`, password: 'MAXFIY-PAROL-123', role: 'reception' },
      subjectName: `${TAG} ishga olish`,
    });
  }

  const hg = await mirror('GET /:id (ishga olish so\'rovi)', (base) =>
    call(base, 'GET', `/api/expense-approvals/${hire[base].id}`, {}));
  for (const [label, res] of [['express', hg.e], ['nest', hg.n]]) {
    const raw = JSON.stringify(res?.body || {});
    !raw.includes('MAXFIY-PAROL-123')
      ? ok(`parol javobda YO'Q (${label})`)
      : bad(`parol javobda YO'Q (${label})`, 'PAROL SIZIB CHIQDI');
    // MUSBAT NAZORAT: payload'ning qolgan qismi KELADI — aks holda
    // "hech narsa qaytmadi" ham yashil berardi.
    raw.includes(`yangi_${TAG}`)
      ? ok(`payload qolgan maydonlari keladi (${label}) — musbat nazorat`)
      : bad(`payload qolgan maydonlari keladi (${label})`,
        "payload butunlay bo'sh — tekshiruv O'LCHAMAYDI");
  }

  const hl = await mirror("GET ro'yxatda ham parol yo'q", (base, f) =>
    call(base, 'GET', `/api/expense-approvals?search=${TAG}&limit=50`,
      { branchId: f.a.id }));
  for (const [label, res] of [['express', hl.e], ['nest', hl.n]]) {
    JSON.stringify(res?.body || {}).includes('MAXFIY-PAROL-123')
      ? bad(`ro'yxatda parol YO'Q (${label})`, 'PAROL SIZIB CHIQDI')
      : ok(`ro'yxatda parol YO'Q (${label})`);
  }

  // ─────────────────────────────────────────────────────────────────
  section('3) FILIAL VA KATEGORIYA CHEGARASI');
  // ─────────────────────────────────────────────────────────────────

  // MUSBAT: A direktori o'z filialining so'rovlarini ko'radi.
  const seenA = await mirror("A direktori o'z filialini ko'radi (musbat nazorat)",
    (base, f) => call(base, 'GET', '/api/expense-approvals?limit=50',
      { as: 'dirA', branchId: f.a.id }));
  for (const [base, res] of [[EXPRESS, seenA.e], [NEST, seenA.n]]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    (res?.body?.data || []).length > 0
      ? ok(`A direktori so'rov ko'radi (${label}) — ${res.body.data.length} ta`)
      : bad(`A direktori so'rov ko'radi (${label})`,
        "bo'sh — izolyatsiya tekshiruvi O'LCHANMAGAN bo'lardi");
  }

  // MANFIY: C direktori A ning so'rovlarini KO'RMAYDI.
  const seenC = await mirror("C direktori begona filialni ko'rmaydi",
    (base, f) => call(base, 'GET', '/api/expense-approvals?limit=50',
      { as: 'dirC', branchId: f.c.id }));
  for (const [base, res] of [[EXPRESS, seenC.e], [NEST, seenC.n]]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const leaked = (res?.body?.data || []).filter(
      (r) => String(r.branchId?.id || r.branchId) === String(f.a.id));
    eq(`C ko'lamida A ning so'rovi yo'q (${label})`, leaked.length, 0);
  }

  // ═══════════════════════════════════════════════════════════════════
  // KATEGORIYA CHEGARASI — `categoryCondition()`
  //
  // `director` da `finance.read` BOR, `approvals.decide_config` YO'Q.
  // Demak u:
  //   • MOLIYAVIY so'rovlarni ko'radi;
  //   • BEGONA odamning SOZLAMA so'rovini KO'RMAYDI;
  //   • LEKIN O'ZI yuborgan sozlama so'rovini KO'RADI — aks holda
  //     direktor o'zi yuborgan so'rovning holatini kuza ololmasdi.
  //
  // Uchalasi ham bir vaqtda o'lchanadi: ikkita sozlama so'rovi
  // yaratiladi — biri `asker` dan, ikkinchisi `dirC` dan.
  // ═══════════════════════════════════════════════════════════════════
  const cfgOwn = {};
  const cfgForeign = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    cfgOwn[base] = await mkApproval(f.a.id, f.asker.id, {
      kind: 'salary_terms', category: 'configuration', amount: null,
      subjectName: `${TAG} OZ-SOZLAMA`,
    });
    cfgForeign[base] = await mkApproval(f.a.id, f.dirC.id, {
      kind: 'group_fee_set', category: 'configuration', amount: null,
      subjectName: `${TAG} BEGONA-SOZLAMA`,
    });
  }

  const own = await mirror("so'rovchi O'Z sozlama so'rovini ko'radi", (base, f) =>
    call(base, 'GET', '/api/expense-approvals?limit=50', { as: 'asker', branchId: f.a.id }));
  for (const [base, res] of [[EXPRESS, own.e], [NEST, own.n]]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const rows = res?.body?.data || [];
    const ids = new Set(rows.map((r) => String(r.id)));

    // MUSBAT: moliyaviy so'rovlar ko'rinadi.
    rows.some((r) => r.category === 'financial')
      ? ok(`direktor MOLIYAVIY so'rovni ko'radi (${label})`)
      : bad(`direktor MOLIYAVIY so'rovni ko'radi (${label})`,
        "bo'sh — kategoriya tekshiruvi O'LCHANMAGAN bo'lardi");

    // MUSBAT: O'Z sozlama so'rovi ko'rinadi.
    ids.has(String(cfgOwn[base].id))
      ? ok(`direktor O'Z sozlama so'rovini ko'radi (${label})`)
      : bad(`direktor O'Z sozlama so'rovini ko'radi (${label})`, 'topilmadi');

    // MANFIY: BEGONA sozlama so'rovi KO'RINMAYDI.
    !ids.has(String(cfgForeign[base].id))
      ? ok(`direktor BEGONA sozlama so'rovini ko'rmaydi (${label})`)
      : bad(`direktor BEGONA sozlama so'rovini ko'rmaydi (${label})`,
        'SOZLAMA SO\'ROVI SIZIB CHIQDI');
  }

  // Qidiruv orqali ham sizib chiqmasligi SHART.
  //
  // ⚠ `buildListFilter` da bu ATAYLAB `AND` bilan yozilgan: qidiruv
  // `OR` i kategoriya `OR` ini JIMGINA yozib yuborardi va foydalanuvchi
  // ko'rmasligi kerak bo'lgan kategoriyani qidiruv orqali ochib berardi.
  const srch = await mirror('qidiruv kategoriya chegarasini buzmaydi', (base, f) =>
    call(base, 'GET', `/api/expense-approvals?search=BEGONA-SOZLAMA&limit=50`,
      { as: 'asker', branchId: f.a.id }));
  for (const [base, res] of [[EXPRESS, srch.e], [NEST, srch.n]]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    eq(`qidiruv begona sozlamani ochmaydi (${label})`,
      (res?.body?.data || []).length, 0);
  }

  // Bitta hujjat sifatida ham ochilmaydi.
  await mirror('begona sozlama so\'rovi /:id orqali ham → 403', (base, f) =>
    call(base, 'GET', `/api/expense-approvals/${cfgForeign[base].id}`,
      { as: 'asker', branchId: f.a.id }));
  await mirror("o'z sozlama so'rovi /:id orqali OCHILADI (musbat nazorat)", (base, f) =>
    call(base, 'GET', `/api/expense-approvals/${cfgOwn[base].id}`,
      { as: 'asker', branchId: f.a.id }));

  // MANFIY: direktor sozlama so'rovini RAD ETA olmaydi
  // (`approvals.decide_config` yo'q — servisdagi `assertCanDecide`).
  await mirror("direktor sozlama so'rovini rad eta olmaydi → 403", (base, f) =>
    call(base, 'POST', `/api/expense-approvals/${cfgOwn[base].id}/reject`,
      { as: 'asker', branchId: f.a.id, body: { note: 'urinish' } }));

  // ─────────────────────────────────────────────────────────────────
  section('4) QAROR — rad etish, bekor qilish, qayta urinish');
  // ─────────────────────────────────────────────────────────────────

  await mirror('POST /:id/reject', (base) =>
    call(base, 'POST', `/api/expense-approvals/${pending[base].id}/reject`,
      { body: { note: 'rad' } }));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const row = await prisma.approval.findUnique({ where: { id: pending[base].id } });
    eq(`bazada holat rejected (${label})`, row.status, 'rejected');
    eq(`qaror sanasi yozildi (${label})`, Boolean(row.decidedAt), true);
  }

  await mirror('POST /:id/reject (qayta → 409)', (base) =>
    call(base, 'POST', `/api/expense-approvals/${pending[base].id}/reject`, { body: {} }));

  // BEKOR QILISH: faqat SO'ROVCHINING o'zi.
  const cancelable = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    cancelable[base] = await mkApproval(f.a.id, f.asker.id, { amount: 111_000 });
  }
  // MANFIY: begona odam bekor qila olmaydi.
  await mirror("begona odam bekor qila olmaydi → 403", (base, f) =>
    call(base, 'POST', `/api/expense-approvals/${cancelable[base].id}/cancel`,
      { as: 'dirA', branchId: f.a.id }));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const row = await prisma.approval.findUnique({ where: { id: cancelable[base].id } });
    eq(`rad etilgan urinishdan keyin hamon pending (${label})`, row.status, 'pending');
  }
  // MUSBAT: so'rovchining o'zi bekor qiladi.
  await mirror("so'rovchi o'z so'rovini bekor qiladi", (base, f) =>
    call(base, 'POST', `/api/expense-approvals/${cancelable[base].id}/cancel`,
      { as: 'asker', branchId: f.a.id }));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const row = await prisma.approval.findUnique({ where: { id: cancelable[base].id } });
    eq(`bazada holat canceled (${label})`, row.status, 'canceled');
  }

  // QAYTA URINISH: faqat FAILED holatdan.
  const failed = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    failed[base] = await mkApproval(f.a.id, f.asker.id, {
      status: 'failed', failureReason: 'balans yetmadi', amount: 222_000,
    });
  }
  await mirror('POST /:id/retry', (base) =>
    call(base, 'POST', `/api/expense-approvals/${failed[base].id}/retry`, {}));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const row = await prisma.approval.findUnique({ where: { id: failed[base].id } });
    eq(`retry → pending (${label})`, row.status, 'pending');
    eq(`xato sababi tozalandi (${label})`, row.failureReason, '');
  }
  await mirror('POST /:id/retry (pending holatdan → 409)', (base) =>
    call(base, 'POST', `/api/expense-approvals/${failed[base].id}/retry`, {}));

  // OMMAVIY RAD ETISH.
  const bulk = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    bulk[base] = [
      (await mkApproval(f.a.id, f.asker.id, { amount: 11_000 })).id,
      (await mkApproval(f.a.id, f.asker.id, { amount: 12_000 })).id,
    ];
  }
  await mirror('POST /bulk-reject', (base) =>
    call(base, 'POST', '/api/expense-approvals/bulk-reject',
      { body: { ids: bulk[base], note: 'ommaviy' } }));
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const rows = await prisma.approval.findMany({ where: { id: { in: bulk[base] } } });
    eq(`ikkalasi ham rad etildi (${label})`,
      rows.filter((r) => r.status === 'rejected').length, 2);
  }
  await mirror('POST /bulk-reject (bo\'sh ro\'yxat → 400)', (base) =>
    call(base, 'POST', '/api/expense-approvals/bulk-reject', { body: { ids: [] } }));
  await mirror('POST /bulk-reject (51 ta → 400)', (base) =>
    call(base, 'POST', '/api/expense-approvals/bulk-reject',
      { body: { ids: Array.from({ length: 51 }, () => 'a'.repeat(24)) } }));

  // ─────────────────────────────────────────────────────────────────
  section('5) KONKURENTLIK — 20 bir vaqtdagi rad etish');
  // ─────────────────────────────────────────────────────────────────
  //
  // ⚠ Ikki owner bir vaqtda bosgan bo'lsa FAQAT BITTASI o'tishi kerak.
  // Himoya `transition()` da: shartli `updateMany` ikkinchi urinishda
  // count=0 beradi. "O'qi, keyin yoz" naqshi bunga yo'l ochardi va
  // TASDIQLASHDA bu IKKI MARTA TO'LOV degani bo'lardi.
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    const label = base === EXPRESS ? 'express' : 'nest';
    const target = await mkApproval(f.a.id, f.asker.id, { amount: 333_000 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        call(base, 'POST', `/api/expense-approvals/${target.id}/reject`, { body: {} })
          .catch((err) => ({ status: 0, body: { error: err.message } }))),
    );
    eq(`20 bir vaqtdagi rad etish — FAQAT BITTASI o'tdi (${label})`,
      results.filter((r) => r.status === 200).length, 1);
    eq(`qolganlari 409 (${label})`, results.filter((r) => r.status === 409).length, 19);
    const row = await prisma.approval.findUnique({ where: { id: target.id } });
    eq(`bazada bitta qaror (${label})`, row.status, 'rejected');
  }

  // ─────────────────────────────────────────────────────────────────
  section("6) ATAYLAB KUTILGAN FARQ — tasdiqlash bajaruvchilari");
  // ─────────────────────────────────────────────────────────────────

  const approvable = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    approvable[base] = await mkApproval(f.a.id, f.asker.id, { amount: 444_000 });
  }
  /**
   * ⚠ FARQ TORAYDI — VA BU KUTILGAN EDI.
   *
   * Ilgari NestJS'da BIRORTA bajaruvchi yo'q edi va `approve` har doim
   * 501 qaytarardi. Endi TO'RTTASI ko'chirilgan:
   *   `expense_create`, `deposit_withdraw`, `salary_payment`,
   *   `teacher_compensation_set`.
   *
   * Shuning uchun `expense_create` (fikstura turi) endi ATAYLAB FARQ
   * emas, HAQIQIY PARITET: ikkala stek ham bajarishga urinadi va bo'sh
   * payload'da bir xil yiqiladi.
   */
  await mirror('POST /:id/approve (`expense_create` — endi IKKALASIDA ham bajariladi)',
    (base) => call(base, 'POST',
      `/api/expense-approvals/${approvable[base].id}/approve`, { body: {} }));

  // Bajarish yiqilgach so'rov IKKALA stekda ham `failed` bo'lishi SHART.
  for (const base of [EXPRESS, NEST]) {
    const label = base === EXPRESS ? 'express' : 'nest';
    const row = await prisma.approval.findUnique({
      where: { id: approvable[base].id } });
    eq(`bajarish yiqilgach holat "failed" (${label})`, row.status, 'failed');
  }

  /**
   * ⚠ KO'CHIRILMAGAN TUR — HAMON ATAYLAB FARQ.
   *
   * `group_fee_set` bajaruvchisi `finance/groupFee` da va u hali
   * ko'chirilmagan. Express uni bajaradi (payload bo'sh → 400),
   * NestJS esa 501 qaytaradi.
   *
   * ⚠⚠ ENG MUHIM QISMI — SO'ROV HOLATI. NestJS mavjudlikni HOLAT
   * O'ZGARISHIDAN OLDIN tekshiradi, ya'ni so'rov `pending` bo'lib
   * QOLADI va Express orqali bemalol tasdiqlanadi. Express tartibini
   * ko'r-ko'rona takrorlaganda u `failed` bo'lib BUZILARDI.
   */
  const unmigrated = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    unmigrated[base] = await mkApproval(f.a.id, f.asker.id, {
      kind: 'group_fee_set', category: 'configuration', amount: null,
    });
  }
  await expectDivergence("POST /:id/approve (`group_fee_set` — ko'chirilmagan)",
    (base) => call(base, 'POST',
      `/api/expense-approvals/${unmigrated[base].id}/approve`, { body: {} }),
    // ⚠ EXPRESS 404 — 400 EMAS. Bo'sh payload'da `groupFee` bajaruvchisi
    // "Guruh topilmadi" (404) beradi, `approve` esa `err.statusCode` ni
    // QAYTA UZATADI (`err?.statusCode || 400`). Ya'ni status BAJARUVCHI
    // xatosidan keladi, tasdiqlash oqimidan emas — bu O'LCHANDI, taxmin
    // qilinmadi.
    { expressStatus: 404, nestStatus: 501, nestCode: 'APPROVAL_EXECUTORS_NOT_MIGRATED' });

  {
    const eRow = await prisma.approval.findUnique({
      where: { id: unmigrated[EXPRESS].id } });
    const nRow = await prisma.approval.findUnique({
      where: { id: unmigrated[NEST].id } });
    eq("express: bajarish yiqildi → 'failed'", eRow.status, 'failed');
    // ⚠ AYNAN SHU XOSSA HIMOYA QILINADI: NestJS so'rovni TEGMAY qoldiradi.
    eq("nest: so'rov TEGILMADI → 'pending' (Express'da tasdiqlanadi)",
      nRow.status, 'pending');
  }

  await expectDivergence("POST /bulk-approve (ko'chirilmagan tur)",
    (base) => call(base, 'POST', '/api/expense-approvals/bulk-approve',
      { body: { ids: [unmigrated[base].id] } }),
    // ⚠ `bulk` HAR BIR ID ni ALOHIDA yiqitadi va 200 qaytaradi (qisman
    // muvaffaqiyat NORMAL holat) — ikkala stekda ham 200, farq
    // `failed[].reason` da. Shuning uchun status bo'yicha farq YO'Q.
    { expressStatus: 200, nestStatus: 200 });

  // ─────────────────────────────────────────────────────────────────
  section('7) RUXSAT');
  // ─────────────────────────────────────────────────────────────────
  for (const [m, p] of [
    ['GET', '/api/expense-approvals'],
    ['GET', '/api/expense-approvals/stats'],
    ['GET', '/api/expense-approvals/pending-count'],
    ['GET', '/api/approvals'],
    ['POST', '/api/expense-approvals/bulk-reject'],
  ]) {
    await mirror(`${m} ${p} — autentifikatsiyasiz → 401`, (base) =>
      request(base, m, p, { body: m === 'POST' ? {} : undefined }));
  }
};

run()
  .catch((err) => {
    console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err);
    R.fail += 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
