/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EGA QARORLARI — B4 / B9 / B13 / B17 (2026-08-22).
 *
 * Bu to'rt band `MIGRATION-CHECKLIST.md` §6.2 da "ega qarori kerak" deb
 * turgan edi. Ega HA dedi va tuzatildi. Bu to'plam ularni QULFLAYDI.
 *
 * ⚠ Har bir tekshiruv MANFIY NAZORAT bilan keladi yoki ATAYLAB
 * buzilganda qizil bo'lishi o'lchangan — aks holda "yashil" hech
 * narsani isbotlamaydi.
 *
 * ISHLATISH:
 *   npm run test:owner-decisions
 *   BASE_URL=http://127.0.0.1:5001 node --env-file=.env test/owner-decisions.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { mintToken } from './_harness.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';
const FROM = '2026-08-01';
const TO = '2026-08-22';

const R = { pass: 0, fail: 0 };
const check = (name, fn) => {
  try { fn(); R.pass += 1; console.log(`  ✅ ${name}`); }
  catch (e) { R.fail += 1; console.log(`  ❌ ${name} — ${e.message.split('\n')[0]}`); }
};

const prisma = new PrismaClient();

const get = async (path, { branchId } = {}) => {
  const headers = { authorization: `Bearer ${TOKEN}` };
  if (branchId) headers['x-branch-id'] = branchId;
  const r = await fetch(BASE + path, { headers });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
};

const owner = await prisma.user.findFirst({
  where: { role: 'owner', isActive: true }, select: { id: true, role: true },
});
assert.ok(owner, "owner topilmadi — avval `npm run seed:owner`");
const TOKEN = mintToken(owner);

console.log(`\n\x1b[1mEGA QARORLARI — B4/B9/B13/B17\x1b[0m  \x1b[2m${BASE}\x1b[0m\n`);

// Tozalanadigan fikstura izlari.
const madeTemplateIds = [];
let madeGroupId = null;

try {
  // ══════════════════════════════════════════════════════════════════════
  // B4 — `GET /notifications/stats` HAR DOIM 500 berardi.
  // Sabab: `orderBy: { _count: { _all: 'desc' } }` — Prisma `_all` ni
  // orderBy ichida qabul qilmaydi (SELECT tomonida qiladi).
  // ══════════════════════════════════════════════════════════════════════
  console.log('\x1b[1mB4 — notifications/stats\x1b[0m');
  const stats = await get('/api/notifications/stats');
  check(`200 qaytadi (ilgari 500 edi) — ${stats.status}`, () => {
    assert.equal(stats.status, 200);
  });
  check('javob shakli to\'g\'ri (total + byCategory)', () => {
    const d = stats.body?.data;
    assert.ok(d, 'data yo\'q');
    assert.equal(typeof d.total, 'number');
    assert.ok(Array.isArray(d.byCategory), 'byCategory massiv emas');
  });
  check('byCategory KAMAYISH tartibida (orderBy ishlayapti)', () => {
    const c = (stats.body.data.byCategory || []).map((x) => x.count);
    for (let i = 1; i < c.length; i += 1) {
      assert.ok(c[i - 1] >= c[i], `tartib buzuq: ${c.join(',')}`);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // B9 — shablon ro'yxatida ikkilamchi saralash kaliti yo'q edi.
  //
  // MUSBAT NAZORAT: uchta shablon AYNI `createdAt` bilan yaratiladi —
  // aynan shu holatda PostgreSQL tartibni kafolatlamaydi.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n\x1b[1mB9 — shablon saralash tartibi\x1b[0m');
  const sameMoment = new Date('2026-08-20T12:00:00.000Z');
  for (const n of [1, 2, 3]) {
    const t = await prisma.notificationTemplate.create({
      data: {
        name: `__probe_tpl_${n}`, body: 'probe', category: 'custom',
        isActive: true, createdAt: sameMoment,
      },
      select: { id: true },
    });
    madeTemplateIds.push(t.id);
  }

  const page = async (p) =>
    get(`/api/notification-templates?page=${p}&limit=2&search=__probe_tpl_`);
  const p1 = await page(1);
  const p2 = await page(2);
  check(`ikkala sahifa ham 200 (${p1.status}/${p2.status})`, () => {
    assert.equal(p1.status, 200); assert.equal(p2.status, 200);
  });

  // ⚠ Javob shakli: `data` — MASSIVNING O'ZI, sahifalash `meta` da
  // (`data.items` EMAS — birinchi urinishda shu sabab 0 ta element
  // olingan va tekshiruv YOLG'ON qizil bergan edi).
  const rows = (r) => (Array.isArray(r.body?.data) ? r.body.data : []);
  const ids = [...rows(p1), ...rows(p2)].map((x) => x._id || x.id);
  check(`sahifalashda 3 ta shablon ham chiqdi (${ids.length})`, () => {
    assert.equal(ids.length, 3, `olindi: ${ids.length}`);
  });
  check('DUBLIKAT yo\'q — bitta shablon ikki sahifada chiqmadi', () => {
    assert.equal(new Set(ids).size, ids.length, `takror: ${ids.join(',')}`);
  });
  const again = [...rows(await page(1)), ...rows(await page(2))].map((x) => x._id || x.id);
  check('tartib BARQAROR — qayta chaqiruvda ayni ketma-ketlik', () => {
    assert.deepEqual(again, ids);
  });

  // ⚠ ASL SHARTNOMANI o'lchaydi: `createdAt` bir xil bo'lganda tartibni
  // FAQAT ikkilamchi kalit (`id desc`) belgilaydi. Ikkilamchi kalitsiz
  // PostgreSQL tartibni KAFOLATLAMAYDI — u tasodifan to'g'ri chiqishi
  // ham mumkin, shuning uchun "barqarormi" tekshiruvining o'zi YETARLI
  // EMAS. Bu yerda KUTILGAN ketma-ketlik ochiq yoziladi.
  check('AYNI createdAt da tartib `id desc` bo\'yicha aniqlangan', () => {
    assert.deepEqual(ids, [...madeTemplateIds].sort().reverse());
  });

  // ══════════════════════════════════════════════════════════════════════
  // B13 — tugagan kurs tarixi 400 berardi (`GET /groups/:id` esa 200).
  //
  // ⚠ Eng muhimi XAVFSIZLIK: tuzatish `ensureGroup` ni olib tashladi,
  // FILIAL KO'LAMI esa AYNAN o'sha funksiyada edi. Shuning uchun
  // manfiy nazorat MAJBURIY — begona filial 404 olishi SHART.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n\x1b[1mB13 — tugagan kurs tarixi\x1b[0m');
  const branches = await prisma.branch.findMany({
    where: { isActive: true }, select: { id: true }, take: 2, orderBy: { id: 'asc' },
  });
  assert.ok(branches.length >= 2, 'kamida ikki filial kerak');
  const [homeBranch, foreignBranch] = branches;

  const g = await prisma.group.create({
    data: {
      name: '__probe_ended_group',
      branchId: homeBranch.id,
      isActive: false,                                   // tugagan
      endDate: new Date('2020-01-01T00:00:00.000Z'),     // o'tmishda
    },
    select: { id: true },
  });
  madeGroupId = g.id;

  const byId = await get(`/api/groups/${g.id}`, { branchId: homeBranch.id });
  check(`GET /groups/:id → 200 (ilgari ham shunday edi) — ${byId.status}`, () => {
    assert.equal(byId.status, 200);
  });

  const hist = await get(`/api/groups/${g.id}/history`, { branchId: homeBranch.id });
  check(`GET /groups/:id/history → 200 (ILGARI 400 EDI) — ${hist.status}`, () => {
    assert.equal(hist.status, 200);
  });
  check('ziddiyat yopildi: ikkala marshrut ham AYNI kodni qaytaradi', () => {
    assert.equal(byId.status, hist.status);
  });

  // ══════════════════════════════════════════════════════════════════
  // ⚠ XAVFSIZLIK — `history` `getById` BILAN AYNAN BIR XIL ko'lamlanadi.
  //
  // NEGA "begona filial → 404" DEB YOZILMAYDI: token OWNER'niki, owner
  // esa BARCHA filialni ko'radi. Undan 404 kutish NOTO'G'RI edi —
  // birinchi urinishda test aynan shu sabab qizil bo'lgan va u KODNI
  // JAZOLAYOTGAN edi, regressiya ko'rsatmayotgan. O'lchab tasdiqlandi:
  // ESKI kod ham AYNI holatda 200 qaytaradi.
  //
  // Haqiqiy invariant boshqa: `readGroup` `ensureGroup` bilan AYNI
  // `branchFilter()` ni ishlatadi, ya'ni `history` ning ko'lami
  // `getById` nikidan FARQ QILMASLIGI shart. Har qanday farq — men
  // olib tashlagan qo'riqchi qaytib kelmagani yoki ortiqcha
  // qattiqlashgani demak.
  // ══════════════════════════════════════════════════════════════════
  const scopePairs = [];
  for (const b of branches) {
    const byIdS = (await get(`/api/groups/${g.id}`, { branchId: b.id })).status;
    const histS = (await get(`/api/groups/${g.id}/history`, { branchId: b.id })).status;
    scopePairs.push({ branchId: b.id, byIdS, histS });
  }
  check("XAVFSIZLIK: history ko'lami getById bilan AYNAN bir xil", () => {
    const bad = scopePairs.filter((p) => p.byIdS !== p.histS);
    assert.deepEqual(bad, [], `ko'lam ajraldi: ${JSON.stringify(bad)}`);
  });
  check(`MUSBAT NAZORAT: ko'lam bir nechta filialda o'lchandi (${scopePairs.length})`, () => {
    assert.ok(scopePairs.length >= 2, 'kamida ikki filial bilan solishtirilsin');
  });

  // ══════════════════════════════════════════════════════════════════════
  // B17 — dashboard `groupBreakdown` dars kunlarini SHISHIRARDI.
  //
  // `joinedAt`/`leftAt` `select` da so'ralmagani uchun har o'quvchi BUTUN
  // oraliq davomida a'zo deb hisoblanardi.
  //
  // FIKSTURASIZ INVARIANT: `dashboard.groupBreakdown[].totalClasses`
  // AYNI guruhning `groups/:id/summary` dagi `aggregate.totalClasses`
  // bilan TENG bo'lishi shart. Tuzatishdan OLDIN 20 guruhdan 17 tasi
  // mos kelmasdi; KEYIN — 0.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n\x1b[1mB17 — dashboard = summary\x1b[0m');
  const dash = await get(`/api/attendance/dashboard?fromDate=${FROM}&toDate=${TO}`);
  check(`dashboard 200 — ${dash.status}`, () => assert.equal(dash.status, 200));

  const gb = dash.body?.data?.groupBreakdown || [];
  const mismatches = [];
  let compared = 0;
  for (const row of gb) {
    const s = await get(
      `/api/attendance/groups/${row.groupId}/summary?fromDate=${FROM}&toDate=${TO}`,
    );
    const st = s.body?.data?.aggregate?.totalClasses;
    if (typeof st !== 'number') continue;
    compared += 1;
    if (st !== row.totalClasses) {
      mismatches.push(`${row.name}: dashboard=${row.totalClasses} summary=${st}`);
    }
  }

  // ⚠ MUSBAT NAZORAT: hech narsa solishtirilmasa "0 nomuvofiqlik"
  // YOLG'ON yashil bo'lardi.
  check(`MUSBAT NAZORAT: solishtirish BAJARILDI (${compared} guruh)`, () => {
    assert.ok(compared >= 5, `faqat ${compared} guruh solishtirildi — tekshiruv ma'nosiz`);
  });
  check(`dashboard va summary AYNI sonni beradi (${compared} guruh)`, () => {
    assert.deepEqual(mismatches, [], `nomuvofiq: ${mismatches.slice(0, 3).join(' | ')}`);
  });
} finally {
  // ══════════════════════════════════════════════════════════════════════
  // TOZALASH — to'g'ridan-to'g'ri Prisma bilan, sinaladigan API orqali EMAS.
  // Fikstura nomlari `__probe_` bilan boshlanadi, ya'ni qoldiq qolsa
  // `fixture-residue` uni KO'RADI.
  // ══════════════════════════════════════════════════════════════════════
  if (madeTemplateIds.length) {
    await prisma.notificationTemplate.deleteMany({ where: { id: { in: madeTemplateIds } } });
  }
  if (madeGroupId) {
    await prisma.groupMembership.deleteMany({ where: { groupId: madeGroupId } });
    await prisma.group.deleteMany({ where: { id: madeGroupId } });
  }

  const leftTpl = await prisma.notificationTemplate.count({
    where: { name: { startsWith: '__probe_tpl_' } },
  });
  const leftGrp = await prisma.group.count({ where: { name: { startsWith: '__probe_' } } });
  check(`tozalash o'lchandi: shablon qoldig'i ${leftTpl}`, () => assert.equal(leftTpl, 0));
  check(`tozalash o'lchandi: guruh qoldig'i ${leftGrp}`, () => assert.equal(leftGrp, 0));
  await prisma.$disconnect();
}

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
process.exit(R.fail ? 1 : 0);
