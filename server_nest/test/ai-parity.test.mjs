/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI MASLAHATCHI — PARITET (`/api/ai`, 15/15 marshrut).
 *
 * ── NIMA ISBOTLANADI ──
 *   1. O'QISH (9 marshrut): brifing, reytinglar, hisobotlar, insight
 *      ro'yxati, domen paneli, harakat markazi, subyekt badge'lari,
 *      sozlamalar — javoblar BAYT-BAYT (normalizatsiyadan keyin) bir xil.
 *   2. MARSHRUT TARTIBI: `/reports/latest` `:id` deb o'qilmaydi.
 *   3. HOLAT O'ZGARTIRISH (ack / resolve / dismiss): KO'ZGU fikstura —
 *      har stekka O'Z insight'i. HTTP javobi VA BAZA HOLATI solishtiriladi.
 *   4. SOZLAMA YOZISH (`PUT /config`): ko'zgu filial, baza holati o'lchanadi.
 *   5. QAYTA HISOBLASH (`POST /recompute`): ko'zgu filialda ishlaydi.
 *   6. RUXSAT: `ai.read` bor, lekin `ai.config` YO'Q aktyor sozlamalarga
 *      TEGA OLMAYDI (403) — ikkala stekda ham.
 *   7. VALIDATSIYA: noto'g'ri ObjectId → 400, noma'lum domen → 400,
 *      sababsiz `dismiss` → 400.
 *
 * ── ⚠ NEGA KO'ZGU FIKSTURA ──
 * `ack` ni bir xil insight'ga ikki marta yuborib bo'lmaydi: ikkinchi
 * chaqiruv BIRINCHISINING natijasini ko'radi (`status` allaqachon
 * `acked`) va hech narsa o'lchanmaydi. Shuning uchun har stekka alohida
 * qator beriladi va ID'lar belgiga almashtiriladi.
 *
 * ISHLATISH:  npm run test:ai-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter, nowStamps,
} from './_harness.mjs';
import { makeMirror, runIp } from './_mirror.mjs';

const prisma = new PrismaClient();
const T = createReporter('ai');
const { R, ok, bad, skip, section, both, finish } = T;
const RUN_IP = runIp();

const TAG = `__parity_ai${process.hrtime.bigint() % 100000n}`;
const ROLE_READONLY = `${TAG}_ro`;

/** Stek → fikstura. */
const fx = { [EXPRESS]: null, [NEST]: null };
let ownerToken = null;
let readonlyToken = null;
let readonlyUserId = null;
let readonlySnapshot = null;
let readonlyBranchId = null;
let baseBranchId = null;
const createdBranchIds = [];
const createdInsightIds = [];

const H = (branchId) => ({ 'x-branch-id': branchId, 'x-forwarded-for': RUN_IP });

// ── FIKSTURA ─────────────────────────────────────────────────────────────
const mkInsight = async (branchId, suffix) =>
  prisma.insight.create({
    data: {
      branchId,
      subjectType: 'branch',
      subjectId: branchId,
      subjectLabel: `${TAG}-subject`,
      kind: 'slot_opportunity',
      domain: 'groups',
      stance: 'opportunity',
      severity: 'medium',
      title: `${TAG} sinov insight ${suffix}`,
      score: 0.5,
      confidence: 0.9,
      // ⚠ ATAYLAB SOBIT: `priority` javobda qaytadi va u hisoblanadigan
      // qiymat — fikstura ikkala stekda AYNAN bir xil bo'lishi shart.
      priority: 42,
      engineVersion: '1.0.0',
      status: 'open',
    },
    select: { id: true },
  });

const setup = async () => {
  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isActive: true, isDeleted: false },
    select: { id: true, role: true },
  });
  if (!owner) throw new Error('owner topilmadi');
  ownerToken = mintToken(owner);

  const base = await prisma.branch.findFirst({
    where: { isActive: true, isDeleted: false },
    select: { id: true },
  });
  if (!base) throw new Error('filial topilmadi');
  baseBranchId = base.id;

  // Ko'zgu filiallar — mutatsiya yo'llari uchun (har stekka bittadan).
  for (const stack of [EXPRESS, NEST]) {
    const b = await prisma.branch.create({
      data: {
        name: `${TAG}-${stack === EXPRESS ? 'E' : 'N'}`,
        code: `${TAG.slice(-6)}${stack === EXPRESS ? 'E' : 'N'}`,
        isActive: true,
      },
      select: { id: true },
    });
    createdBranchIds.push(b.id);
    const ins = await mkInsight(b.id, stack === EXPRESS ? 'E' : 'N');
    createdInsightIds.push(ins.id);
    fx[stack] = { branchId: b.id, insightId: ins.id };
  }

  // ── `ai.read` BOR, `ai.config` YO'Q aktyor ──
  const readPerm = await prisma.permission.findMany({
    where: { key: 'ai.read' }, select: { id: true } });
  if (!readPerm.length) throw new Error("`ai.read` ruxsat kaliti topilmadi");
  await prisma.role.create({
    data: {
      value: ROLE_READONLY,
      label: `${TAG} faqat o'qish`,
      permissions: { connect: readPerm.map((p) => ({ id: p.id })) },
    },
  });
  // ⚠ AKTYOR `baseBranchId` GA BIRIKTIRILGAN bo'lishi SHART: filial
  // ko'lami probasi uning O'Z filialida insight KO'RISHIGA tayanadi.
  // Boshqa filialdagi aktyor bilan "begona ko'rinmadi" natijasi
  // hech narsani isbotlamasdi (u umuman hech narsa ko'rmaydi).
  const assigned = await prisma.userBranchAssignment.findFirst({
    where: {
      branchId: baseBranchId,
      user: {
        isActive: true, isDeleted: false,
        role: { notIn: ['owner', 'student', 'teacher'] },
      },
    },
    select: { userId: true },
  });
  const victim = assigned
    ? await prisma.user.findUnique({
        where: { id: assigned.userId }, select: { id: true, role: true } })
    : null;
  if (victim) {
    const assigns = await prisma.userBranchAssignment.findMany({
      where: { userId: victim.id }, select: { id: true, role: true, branchId: true },
    });
    readonlySnapshot = { role: victim.role, assigns };
    readonlyUserId = victim.id;
    await prisma.user.update({ where: { id: victim.id }, data: { role: ROLE_READONLY } });
    // ⚠ MEMORY `effective-role-from-branch-assignment`: `user.role` ni
    // o'zgartirish YETMAYDI — filial biriktirmasidagi rol USTUN turadi.
    for (const a of assigns) {
      await prisma.userBranchAssignment.update({
        where: { id: a.id }, data: { role: ROLE_READONLY } });
    }
    readonlyToken = mintToken({ id: victim.id, role: ROLE_READONLY });
    const home = await prisma.user.findUnique({
      where: { id: victim.id }, select: { homeBranchId: true } });
    readonlyBranchId = baseBranchId;
  }
};

// ── TOZALASH ─────────────────────────────────────────────────────────────
//
// ⚠ MEMORY `test-cleanup-must-not-use-api`: tozalash API'ga TAYANMAYDI —
// test yiqilgan sabab tozalashni ham yiqitardi va fikstura elevatsiyada
// qolib ketardi.
const cleanup = async () => {
  try {
    if (readonlyUserId && readonlySnapshot) {
      await prisma.user.update({
        where: { id: readonlyUserId }, data: { role: readonlySnapshot.role } });
      for (const a of readonlySnapshot.assigns) {
        await prisma.userBranchAssignment.update({
          where: { id: a.id }, data: { role: a.role } });
      }
    }
    await prisma.role.deleteMany({ where: { value: ROLE_READONLY } });
    await prisma.insight.deleteMany({ where: { branchId: { in: createdBranchIds } } });
    await prisma.aiConfig.deleteMany({ where: { branchId: { in: createdBranchIds } } });
    await prisma.aiRun.deleteMany({ where: { branchId: { in: createdBranchIds } } });
    await prisma.aiRanking.deleteMany({ where: { branchId: { in: createdBranchIds } } });
    await prisma.aiReport.deleteMany({ where: { branchId: { in: createdBranchIds } } });
    await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
  } catch (err) {
    console.log(`  ⚠️  tozalashda xato: ${err.message}`);
  }
};

/** ⚠ MEMORY `cleanup-must-be-asserted`: qoldiq O'LCHANADI. */
const assertNoResidue = async () => {
  const left = {
    branch: await prisma.branch.count({ where: { id: { in: createdBranchIds } } }),
    insight: await prisma.insight.count({ where: { branchId: { in: createdBranchIds } } }),
    role: await prisma.role.count({ where: { value: ROLE_READONLY } }),
    stuck: readonlyUserId
      ? await prisma.user.count({ where: { id: readonlyUserId, role: ROLE_READONLY } })
      : 0,
  };
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  if (total === 0) ok("tozalash — QOLDIQ YO'Q (o'lchandi)");
  else bad('tozalash — QOLDIQ QOLDI', JSON.stringify(left));
};

// ── ALMASHTIRISHLAR ──────────────────────────────────────────────────────
const stamp = nowStamps();

/**
 * ⚠ UMUMIY ID BELGISI: `aiConfig.id` va `aiRun.id` NI BAZA yaratadi va
 * ular fiksturada oldindan ma'lum EMAS. Ularsiz test har doim qizil
 * bo'lardi — lekin farq biznesda emas, kalit generatsiyasida.
 * Almashtirish OXIRIDA turadi: undan oldingi ANIQ almashtirishlar
 * (filial, insight) o'z belgisini oladi.
 */
const anyObjectId = (v) =>
  typeof v === 'string' ? v.replace(/^[0-9a-f]{24}$/, '<ID>') : v;

const subsOf = (base) => {
  const f = fx[base] || {};
  const side = base === EXPRESS ? 'E' : 'N';
  return [
    [f.branchId, '<BRANCH>'],
    [f.insightId, '<INSIGHT>'],
    // ⚠ Fikstura qo'shimchasi (`... insight E` / `... insight N`) —
    // u FIKSTURAGA xos, stekka emas.
    [`sinov insight ${side}`, 'sinov insight <SIDE>'],
    [`${TAG}-${side}`, '<BRANCH_NAME>'],
    [TAG, '<TAG>'],
    anyObjectId,
    stamp,
  ];
};

const run = async () => {
  await waitForStacks();
  await setup();
  const { mirror, expectStatus, bothDb } = makeMirror(T, fx, subsOf);

  // ═══ 1. O'QISH ═════════════════════════════════════════════════════════
  section("O'QISH — 9 marshrut, umumiy filial");
  const get = (p) => (base) =>
    request(base, 'GET', p, { token: ownerToken, headers: H(baseBranchId) });

  await both('GET /ai/briefing', get('/api/ai/briefing'), subsOf);
  await both('GET /ai/briefing?actionLimit=3', get('/api/ai/briefing?actionLimit=3'), subsOf);
  await both('GET /ai/rankings', get('/api/ai/rankings'), subsOf);
  await both('GET /ai/reports/latest', get('/api/ai/reports/latest'), subsOf);
  await both('GET /ai/reports/latest?period=weekly',
    get('/api/ai/reports/latest?period=weekly'), subsOf);
  await both('GET /ai/reports', get('/api/ai/reports'), subsOf);
  await both('GET /ai/insights', get('/api/ai/insights'), subsOf);
  await both('GET /ai/insights?limit=5&stance=risk',
    get('/api/ai/insights?limit=5&stance=risk'), subsOf);
  await both('GET /ai/insights/domain/finance',
    get('/api/ai/insights/domain/finance'), subsOf);
  await both('GET /ai/insights/domain/students',
    get('/api/ai/insights/domain/students'), subsOf);
  await both('GET /ai/action-center', get('/api/ai/action-center'), subsOf);
  await both('GET /ai/config', get('/api/ai/config'), subsOf);

  // ⚠ MARSHRUT TARTIBI: `latest` `:id` DAN OLDIN bo'lmasa 400 kelardi.
  const latest = await request(NEST, 'GET', '/api/ai/reports/latest',
    { token: ownerToken, headers: H(baseBranchId) });
  if (latest.status === 200) ok("marshrut tartibi — `/reports/latest` `:id` deb o'qilmadi");
  else bad('marshrut tartibi', `kutilgan 200, kelgan ${latest.status}`);

  // `by-subjects` — POST, chunki 500 ta ID query'ga sig'maydi.
  const someStudents = await prisma.user.findMany({
    where: { role: 'student', isDeleted: false }, select: { id: true }, take: 5 });
  if (someStudents.length) {
    await both('POST /ai/insights/by-subjects', (base) =>
      request(base, 'POST', '/api/ai/insights/by-subjects', {
        token: ownerToken, headers: H(baseBranchId),
        body: { subjectIds: someStudents.map((s) => s.id) } }), subsOf);
  } else {
    skip('POST /ai/insights/by-subjects', "o'quvchi topilmadi");
  }

  // ═══ 2. VALIDATSIYA ════════════════════════════════════════════════════
  section('VALIDATSIYA — noto\'g\'ri kirish IKKALA stekda bir xil rad etiladi');
  await both('GET /ai/reports/:id — ID formati buzuq → 400', (base) =>
    request(base, 'GET', '/api/ai/reports/not-an-object-id',
      { token: ownerToken, headers: H(baseBranchId) }), subsOf);
  await both('GET /ai/insights/domain/xyz — noma\'lum domen → 400', (base) =>
    request(base, 'GET', '/api/ai/insights/domain/xyz',
      { token: ownerToken, headers: H(baseBranchId) }), subsOf);
  await both('GET /ai/insights?limit=9999 — chegara oshdi → 400', (base) =>
    request(base, 'GET', '/api/ai/insights?limit=9999',
      { token: ownerToken, headers: H(baseBranchId) }), subsOf);
  await both('PUT /ai/config — vazn 1 dan katta → 400', (base) =>
    request(base, 'PUT', '/api/ai/config', {
      token: ownerToken, headers: H(baseBranchId),
      body: { confidenceFloor: 5 } }), subsOf);

  // ═══ 3. RUXSAT ═════════════════════════════════════════════════════════
  section('RUXSAT — `ai.read` bor, `ai.config` YO\'Q');
  if (!readonlyToken) {
    skip('ruxsat tekshiruvi', 'admin aktyor topilmadi');
  } else {
    // MUSBAT NAZORAT: o'qiy oladi (aks holda 403 lar "ruxsat ishladi"
    // emas, "token yaroqsiz" degani bo'lardi).
    const readOk = await request(NEST, 'GET', '/api/ai/insights',
      { token: readonlyToken, headers: H(baseBranchId) });
    if (readOk.status === 200) ok("musbat nazorat — `ai.read` bilan o'qish ISHLADI");
    else bad('musbat nazorat', `kutilgan 200, kelgan ${readOk.status} ` +
      `${JSON.stringify(readOk.body).slice(0, 200)}`);

    await both('GET /ai/config — `ai.config` yo\'q → 403', (base) =>
      request(base, 'GET', '/api/ai/config',
        { token: readonlyToken, headers: H(baseBranchId) }), subsOf);
    await both('PUT /ai/config — `ai.config` yo\'q → 403', (base) =>
      request(base, 'PUT', '/api/ai/config', {
        token: readonlyToken, headers: H(baseBranchId),
        body: { confidenceFloor: 0.5 } }), subsOf);
    await both('POST /ai/recompute — `ai.config` yo\'q → 403', (base) =>
      request(base, 'POST', '/api/ai/recompute', {
        token: readonlyToken, headers: H(baseBranchId), body: {} }), subsOf);
  }

  // ═══ 3b. FILIAL KO'LAMI ════════════════════════════════════════════════
  //
  // ⚠ NEGA ALOHIDA: `ai.read` BOR aktyor BEGONA filialning insight'ini
  // ko'rmasligi kerak. 403 ni "himoyalangan" deb o'qish ENG XAVFLI xato
  // bo'lardi — u RUXSAT rad etilishi, KO'LAM qo'llanishi EMAS. Shuning
  // uchun aktyor `ai.read` ga EGA va yuqorida MUSBAT NAZORATDAN o'tgan.
  section("FILIAL KO'LAMI — begona filial insight'i ko'rinmaydi");
  if (!readonlyToken) {
    skip("filial ko'lami", 'ko\'lamlangan aktyor topilmadi');
  } else {
    // ⚠ MUSBAT NAZORAT SHU PROBAGA XOS: aktyor O'Z filialida insight
    // KO'RISHI shart. Aks holda pastdagi "ko'rinmadi" natijasi
    // "ko'lam ishladi" emas, "umuman hech narsa yo'q" degani bo'lardi.
    for (const [label, base] of [['express', EXPRESS], ['nest', NEST]]) {
      const own = await request(base, 'GET', '/api/ai/insights?limit=500', {
        token: readonlyToken, headers: H(readonlyBranchId) });
      const ownCount = (own.body?.data || []).length;
      if (own.status === 200 && ownCount > 0) {
        ok(`${label}: musbat nazorat — o'z filialida ${ownCount} ta insight KO'RINDI`);
      } else {
        bad(`${label}: MUSBAT NAZORAT YIQILDI`,
          `status=${own.status}, yozuv=${ownCount} — "begona ko'rinmadi" natijasi ` +
          "ISHONCHSIZ (aktyor umuman hech narsa ko'rmayotgan bo'lishi mumkin)");
      }

      const f = fx[base];
      // (a) RO'YXAT: begona filial ID'sini OCHIQ so'rasa ham ko'rinmasin.
      const list = await request(base, 'GET', '/api/ai/insights?limit=500', {
        token: readonlyToken, headers: H(f.branchId) });
      const ids = (list.body?.data || []).map((i) => i.id);
      if (list.status === 200 && !ids.includes(f.insightId)) {
        ok(`${label}: begona filial insight'i RO'YXATDA yo'q (${ids.length} ta yozuv)`);
      } else if (list.status === 403) {
        ok(`${label}: begona filial ID'si RAD ETILDI (403)`);
      } else {
        bad(`${label}: FILIAL KO'LAMI SIZDI`,
          `status=${list.status}, begona insight ro'yxatda: ${ids.includes(f.insightId)}`);
      }

      // (b) TO'G'RIDAN-TO'G'RI OBYEKT: begona insight'ni o'zgartirib
      //     bo'lmasin (`findScoped` → 404).
      const ack = await request(base, 'POST', `/api/ai/insights/${f.insightId}/ack`, {
        token: readonlyToken, headers: H(f.branchId), body: {} });
      if (ack.status === 404 || ack.status === 403) {
        ok(`${label}: begona insight'ni o'zgartirib bo'lmadi (${ack.status})`);
      } else {
        bad(`${label}: BEGONA INSIGHT O'ZGARTIRILDI`,
          `status=${ack.status} ${JSON.stringify(ack.body).slice(0, 200)}`);
      }
    }
  }

  // ═══ 4. HOLAT O'ZGARTIRISH — KO'ZGU FIKSTURA ═══════════════════════════
  section("HOLAT O'ZGARTIRISH — ko'zgu fikstura + BAZA HOLATI");

  expectStatus(
    await mirror('POST /ai/insights/:id/ack', (base, f) =>
      request(base, 'POST', `/api/ai/insights/${f.insightId}/ack`, {
        token: ownerToken, headers: H(f.branchId), body: {} })),
    200, 'POST /ai/insights/:id/ack');
  await bothDb('ack — baza holati', (f) =>
    prisma.insight.findUnique({
      where: { id: f.insightId },
      select: { status: true, acknowledgedById: true } }));

  expectStatus(
    await mirror('POST /ai/insights/:id/resolve', (base, f) =>
      request(base, 'POST', `/api/ai/insights/${f.insightId}/resolve`, {
        token: ownerToken, headers: H(f.branchId), body: {} })),
    200, 'POST /ai/insights/:id/resolve');
  await bothDb('resolve — baza holati', (f) =>
    prisma.insight.findUnique({
      where: { id: f.insightId },
      select: { status: true, outcome: true } }));

  // `dismiss` — sabab MAJBURIY (sababsiz rad etish modelni kalibrlashga
  // imkon bermaydi).
  await mirror('POST /ai/insights/:id/dismiss — sababsiz → 400', (base, f) =>
    request(base, 'POST', `/api/ai/insights/${f.insightId}/dismiss`, {
      token: ownerToken, headers: H(f.branchId), body: {} }));

  // Yangi qator — `dismiss` ni o'lchash uchun (avvalgisi allaqachon
  // `resolved`).
  for (const stack of [EXPRESS, NEST]) {
    const ins = await mkInsight(fx[stack].branchId, 'D');
    createdInsightIds.push(ins.id);
    fx[stack].dismissId = ins.id;
  }
  const subsOf2 = (base) => [
    ...subsOf(base),
    [fx[base].dismissId, '<DISMISS>'],
  ];
  const M2 = makeMirror(T, fx, subsOf2);
  M2.expectStatus(
    await M2.mirror('POST /ai/insights/:id/dismiss', (base, f) =>
      request(base, 'POST', `/api/ai/insights/${f.dismissId}/dismiss`, {
        token: ownerToken, headers: H(f.branchId),
        body: { reason: 'parity sinovi' } })),
    200, 'POST /ai/insights/:id/dismiss');
  await M2.bothDb('dismiss — baza holati', (f) =>
    prisma.insight.findUnique({
      where: { id: f.dismissId },
      select: { status: true, dismissReason: true } }));

  // ═══ 5. SOZLAMA YOZISH ═════════════════════════════════════════════════
  section('SOZLAMA YOZISH — ko\'zgu filial + BAZA HOLATI');
  expectStatus(
    await mirror('PUT /ai/config', (base, f) =>
      request(base, 'PUT', '/api/ai/config', {
        token: ownerToken, headers: H(f.branchId),
        body: { branchId: f.branchId, confidenceFloor: 0.55,
                narrationEnabled: false } })),
    200, 'PUT /ai/config');
  await bothDb('PUT /ai/config — baza holati', (f) =>
    prisma.aiConfig.findFirst({
      where: { branchId: f.branchId },
      select: { confidenceFloor: true, narrationEnabled: true, engineVersion: true } }));

  // ═══ 6. QAYTA HISOBLASH ════════════════════════════════════════════════
  section("QAYTA HISOBLASH — ko'zgu filial (bo'sh, lekin YO'L o'lchanadi)");
  expectStatus(
    await mirror('POST /ai/recompute', (base, f) =>
      request(base, 'POST', '/api/ai/recompute', {
        token: ownerToken, headers: H(f.branchId),
        body: { branchId: f.branchId } })),
    200, 'POST /ai/recompute');
  await bothDb('recompute — AiRun yozuvi', (f) =>
    prisma.aiRun.findFirst({
      where: { branchId: f.branchId },
      select: { status: true, scope: true, trigger: true },
      orderBy: { startedAt: 'desc' } }));

  return finish();
};

let code = 1;
try {
  code = await run();
} catch (err) {
  console.error(`\n  ❌ TO'PLAM YIQILDI: ${err.stack || err.message}\n`);
  code = 1;
} finally {
  await cleanup();
  await assertNoResidue();
  await prisma.$disconnect();
}
process.exit(code || (R.fail ? 1 : 0));
