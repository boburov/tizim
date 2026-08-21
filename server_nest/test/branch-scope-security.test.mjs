/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL KO'LAMI — XAVFSIZLIK REGRESSIYASI (B24 + 3 ta nomuvofiqlik).
 *
 * To'rtta TASDIQLANGAN sizish yopildi. Har biri IKKALA stekda BIR VAQTDA
 * tuzatildi — aks holda paritet buzilib, tuzatish "ko'chirish
 * regressiyasi" bo'lib ko'rinardi.
 *
 * ┌────────────────────────────┬──────────────── OLDIN ── KEYIN ─────────┐
 * │ /admin-dashboard/retention │ butun tashkilot  →  faqat o'z filiali   │
 * │ /admin-dashboard/churned-… │ 46 = owner'niki  →  faqat o'z filiali   │
 * │ /activity-logs/:id         │ begona log 200   →  404                 │
 * │ /grades/rating/students/:id│ begona o'quvchi  →  403                 │
 * │ /groups/:id/teacher-periods│ begona guruh 200 →  404                 │
 * │ /lesson-cancellations (B32)│ butun tashkilot  →  faqat o'z filiali   │
 * └────────────────────────────┴────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── BU TEST NEGA O'Z ROLINI YARATADI ──
 *
 * Sizishni ko'rish uchun aktyor IKKI shartni BIRDANIGA qondirishi kerak:
 *   (a) FILIALGA BIRIKTIRILGAN bo'lishi (ya'ni ko'lamlanishi);
 *   (b) tegishli O'QISH RUXSATIGA ega bo'lishi.
 *
 * Seed'dagi `qa_admin_a` (b) ni qondirmaydi: u `activity_logs.read` va
 * `rating.read` ga ega emas va 403 oladi. 403 ni "himoyalangan" deb
 * o'qish ENG XAVFLI xato bo'lardi — u ruxsat rad etilishi, KO'LAM
 * qo'llanishi EMAS. Aynan shu tarzda sizish ko'rinmay qolgan edi.
 *
 * Shuning uchun test vaqtinchalik rol yaratib, unga AYNAN o'sha o'qish
 * ruxsatlarini beradi va `qa_admin_a` ga biriktiradi — filial birikmasi
 * TEGILMAYDI, ya'ni aktyor ko'lamlangan bo'lib qoladi.
 *
 * ── TOZALASH ──
 * Rol va aktyorning asl holati BAZADAN tiklanadi (API'dan EMAS: bu test
 * aynan ruxsat yo'llarini sinaydi va ular buzilsa API orqali tiklash ham
 * yiqilardi). Tiklash YAKUNDA TEKSHIRILADI.
 *
 * ISHLATISH: node --env-file=../server/.env test/branch-scope-security.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import { mintToken, request, EXPRESS, NEST, createReporter } from './_harness.mjs';

const prisma = new PrismaClient();
const T = createReporter('filial ko\'lami — xavfsizlik');
const { ok, bad, skip, section } = T;

/** Shu yurishga xos manzil — umumiy chegara byudjetini yemaydi. */
const RUN_IP = `198.51.100.${(Number(process.hrtime.bigint() % 250n) + 2)}`;
/**
 * ⚠ ROL QIYMATI HAR YURISHDA BETAKROR BO'LISHI SHART.
 *
 * Ruxsat keshi JARAYONGA XOS va ROL QIYMATI bo'yicha kalitlanadi (5
 * daqiqa — `frozen-role-check.sh` ham shu sababdan NestJS'ni qayta
 * ishga tushiradi). Qat'iy qiymat bilan IKKINCHI yurish BIRINCHI
 * yurishning ruxsat to'plamini oladi.
 *
 * O'LCHANDI: rolga `admin_dashboard.read` qo'shilgach ham `/retention`
 * 403 qaytardi, `GET /auth/me` esa o'sha ruxsatni RO'YXATDA ko'rsatib
 * turdi — kesh eski to'plamni berayotgan edi.
 */
const VAL = `__parity_scope${process.hrtime.bigint() % 1000000n}`;

const req = (base, path, token) =>
  request(base, 'GET', path, { token, headers: { 'x-forwarded-for': RUN_IP } });

/**
 * Bir xil so'rovni ikkala stekka yuboradi va KUTILGAN statusni talab
 * qiladi.
 *
 * ⚠ Bu `both()` EMAS: bu yerda "ikkalasi bir xil" YETARLI EMAS —
 * ikkalasi ham 200 bo'lsa ular BIR XIL SIZADI va oddiy paritet
 * solishtiruvi buni YASHIL deb yozardi. Shuning uchun AYNIQSA KUTILGAN
 * qiymat tekshiriladi.
 */
const expectBoth = async (name, path, token, want) => {
  let e, n;
  try {
    [e, n] = await Promise.all([req(EXPRESS, path, token), req(NEST, path, token)]);
  } catch (err) { skip(name, err.message); return; }
  if (e.status === 429 || n.status === 429) {
    skip(name, `tezlik chegarasi — express=${e.status}, nest=${n.status}`);
    return;
  }
  if (e.status === want && n.status === want) {
    ok(`${name} — ikkala stek ${want}`);
  } else {
    bad(name, `kutilgan ${want}; express=${e.status}, nest=${n.status}`);
  }
  return { e, n };
};

let snap = null;
let qa = null;

const run = async () => {
  const owner = await prisma.user.findFirst({
    where: { username: 'owner' }, select: { id: true, role: true },
  });
  qa = await prisma.user.findFirst({
    where: { username: 'qa_admin_a' },
    select: { id: true, role: true, branchAssignments: { select: { id: true, role: true, branchId: true } } },
  });
  if (!owner || !qa?.branchAssignments.length) {
    throw new Error("fixture yo'q (owner / qa_admin_a filial birikmasi)");
  }
  snap = { role: qa.role, assigns: qa.branchAssignments.map((a) => ({ id: a.id, role: a.role })) };
  const branchA = qa.branchAssignments[0].branchId;
  const ownerToken = mintToken(owner);

  // ── ko'lamlangan, LEKIN RUXSATLI aktyor ──
  const wanted = [
    'activity_logs.read', 'rating.read', 'groups.read', 'grades.read',
    // B32 uchun SHART — `GET /lesson-cancellations` shu ruxsat ostida.
    'attendance.read',
    // ⚠ B24 uchun SHART: usiz `/retention` 403 qaytaradi va bu
    // "ko'lam ishlayapti" bilan ADASHTIRILARDI — 403 ruxsat rad
    // etilishi, KO'LAM qo'llanishi EMAS.
    'admin_dashboard.read',
  ];
  const perms = await prisma.permission.findMany({
    where: { key: { in: wanted } }, select: { id: true, key: true },
  });
  if (perms.length !== wanted.length) {
    throw new Error(`ruxsat topilmadi: ${wanted.filter((w) => !perms.some((p) => p.key === w))}`);
  }
  await prisma.role.deleteMany({ where: { value: VAL } });
  await prisma.role.create({
    data: { value: VAL, label: VAL, permissions: { connect: perms.map((p) => ({ id: p.id })) } },
  });
  await prisma.user.update({ where: { id: qa.id }, data: { role: VAL } });
  for (const a of snap.assigns) {
    await prisma.userBranchAssignment.update({ where: { id: a.id }, data: { role: VAL } });
  }
  const token = mintToken({ id: qa.id, role: VAL });

  // ── ko'lam ichidagi va tashqarisidagi nishonlar ──
  const inScope = { OR: [{ homeBranchId: branchA }, { branchAssignments: { some: { branchId: branchA } } }] };
  const inIds = (await prisma.user.findMany({ where: inScope, select: { id: true } })).map((u) => u.id);

  const mineLog = await prisma.activityLog.findFirst({ where: { userId: { in: inIds } }, select: { id: true } });
  const otherLog = await prisma.activityLog.findFirst({ where: { userId: { notIn: inIds } }, select: { id: true } });
  const mineStu = await prisma.user.findFirst({ where: { role: 'student', isDeleted: false, ...inScope }, select: { id: true } });
  const otherStu = await prisma.user.findFirst({ where: { role: 'student', isDeleted: false, NOT: inScope }, select: { id: true } });
  const otherGrp = await prisma.group.findFirst({ where: { branchId: { not: branchA }, isDeleted: false }, select: { id: true } });
  const mineGrp = await prisma.group.findFirst({ where: { branchId: branchA, isDeleted: false }, select: { id: true } });

  // ═════════════════ 1) activity-logs/:id ═════════════════
  section('activity-logs/:id — ro\'yxat yashirgan yozuv id bilan ochilmasin');
  // ⚠ MUSBAT NAZORAT BIRINCHI: usiz quyidagi 404 "ko'lam ishlayapti"
  // dan emas, "marshrut umuman ishlamayapti" dan ham kelishi mumkin edi.
  if (mineLog) await expectBoth("MUSBAT NAZORAT: O'Z filiali logi", `/api/activity-logs/${mineLog.id}`, token, 200);
  else skip('MUSBAT NAZORAT: log', "o'z filialida log yo'q");
  if (otherLog) await expectBoth('BEGONA filial logi → 404', `/api/activity-logs/${otherLog.id}`, token, 404);
  else skip('begona log', 'topilmadi');
  // ⚠ 404, 403 EMAS: 403 yozuv MAVJUDLIGINI tasdiqlardi.
  await expectBoth("mavjud bo'lmagan log ham AYNI 404", `/api/activity-logs/${'a'.repeat(24)}`, token, 404);

  // ═════════════════ 2) grades rating/students/:id ═════════════════
  section('grades rating/students/:id — begona o\'quvchi reytingi');
  if (mineStu) await expectBoth("MUSBAT NAZORAT: O'Z filiali o'quvchisi", `/api/grades/rating/students/${mineStu.id}`, token, 200);
  else skip("MUSBAT NAZORAT: o'quvchi", "o'z filialida o'quvchi yo'q");
  if (otherStu) await expectBoth("BEGONA o'quvchi → 403", `/api/grades/rating/students/${otherStu.id}`, token, 403);
  else skip("begona o'quvchi", 'topilmadi');

  // ═════════════════ 3) groups teacher-periods ═════════════════
  section('groups/:id/teacher-periods — guruh 404 bo\'lsa timeline ham 404');
  if (mineGrp) await expectBoth("MUSBAT NAZORAT: O'Z guruhi", `/api/groups/${mineGrp.id}/teacher-periods`, token, 200);
  else skip("MUSBAT NAZORAT: guruh", "o'z filialida guruh yo'q");
  if (otherGrp) {
    // ⚠ IKKALASI BIRGA O'LCHANADI: asl nuqson aynan shu IKKI javob
    // ORASIDAGI ZIDDIYAT edi (guruh 404, timeline 200).
    await expectBoth('NAZORAT: begona GET /groups/:id → 404', `/api/groups/${otherGrp.id}`, token, 404);
    await expectBoth('BEGONA guruh teacher-periods → 404', `/api/groups/${otherGrp.id}/teacher-periods`, token, 404);
  } else skip('begona guruh', 'topilmadi');

  // ═════════════════ 4) B24 retention / churned-students ═════════════════
  section('B24 — churn ko\'lami (owner ≠ filial direktori)');
  for (const path of ['/api/admin-dashboard/retention', '/api/admin-dashboard/churned-students']) {
    const r = await expectBoth(`${path.split('/').pop()} — ikkalasi 200`, path, token, 200);
    if (!r) continue;
    const o = await req(EXPRESS, path, ownerToken);
    if (o.status !== 200) { skip(`${path} owner bazasi`, `owner ${o.status}`); continue; }

    // ⚠ MUSBAT NAZORAT: aktyor HAQIQATAN 200 olgan bo'lishi SHART.
    // Aks holda 403 tanasi owner'ning 200 tanasidan "farq qiladi" deb
    // YOLG'ON YASHIL chiqardi — ya'ni ruxsat rad etilishi ko'lam
    // qo'llanishi bilan adashtirilardi.
    if (r.e.status !== 200 || r.n.status !== 200) {
      skip(`${path} ko'lam solishtiruvi`, `aktyor 200 olmadi (express=${r.e.status}, nest=${r.n.status})`);
      continue;
    }

    // ⚠ IKKALA STEK HAM ALOHIDA TEKSHIRILADI.
    //
    // Ilgari bu yerda faqat Express tanasi o'lchanardi — ya'ni FAQAT
    // NestJS'da ko'lam yo'qolsa test YASHIL qolardi. Sabotaj tekshiruvi
    // aynan shuni ochdi: NestJS'ning to'rtta qo'riqchisi qaytarilganda
    // uchtasi tutildi, B24 esa TUTILMADI.
    const rows = (b) => (Array.isArray(b?.data) ? b.data.length : null);
    const all = rows(o.body);
    if (rows(r.e.body) === null || all === null) {
      // `retention` massiv emas — HAR IKKALA stek tanasi owner'nikidan
      // farq qilishi kerak.
      for (const [stack, res] of [['express', r.e], ['nest', r.n]]) {
        const same = JSON.stringify(res.body?.data) === JSON.stringify(o.body?.data);
        if (same) bad(`${path} KO'LAM YO'Q (${stack})`, 'filial direktori owner bilan AYNAN bir xil tanani oldi');
        else ok(`${path} (${stack}) — direktor tanasi owner'nikidan FARQ qiladi`);
      }
      continue;
    }
    // ═══════════════════════════════════════════════════════════════
    // ⚠ "KAMROQ" YETARLI EMAS — AYNAN QANCHA KERAKLIGI BAZADAN OLINADI.
    //
    // `scoped < all` tekshiruvi ikki holatda ham o'tardi: ko'lam
    // TO'G'RI qo'llanganda ham, marshrut BUZILIB bo'sh qaytarganda ham.
    // Ustiga, aktyorning filialida churn BO'LMASA (bu bazada aynan
    // shunday) natija 0 bo'ladi va "kamroq" hech nimani isbotlamaydi.
    //
    // Shuning uchun kutilgan son BAZADAN mustaqil hisoblanadi va AYNAN
    // solishtiriladi. `all` esa owner uchun JAMI songa teng bo'lishi
    // kerak — bu marshrutning umuman ishlayotganini qulflaydi.
    // ═══════════════════════════════════════════════════════════════
    const churnWhere = { leftReason: 'removed', leftAt: { not: null }, isDeleted: false };
    const expectScoped = await prisma.groupMembership.count({
      where: { ...churnWhere, group: { branchId: branchA } },
    });
    const expectAll = await prisma.groupMembership.count({ where: churnWhere });

    if (all !== expectAll) {
      bad(`${path} owner bazasi`, `owner ${all} ta, bazada ${expectAll} ta — marshrut kutilganidek ishlamayapti`);
    } else if (rows(r.e.body) !== expectScoped || rows(r.n.body) !== expectScoped) {
      bad(
        `${path} KO'LAM NOTO'G'RI`,
        `express=${rows(r.e.body)}, nest=${rows(r.n.body)}; o'z filialida bazada ` +
          `${expectScoped} ta bor (owner ${all} ta). Teng yoki ortiq bo'lsa — B24 qaytgan.`,
      );
    } else if (expectScoped === expectAll) {
      // Bitta filialli bazada ko'lamni AJRATIB bo'lmaydi.
      skip(`${path}`, `filial churn'i jami churn bilan teng (${expectAll}) — ajratib bo'lmadi`);
    } else {
      ok(
        `${path} — IKKALA stekda ham direktor AYNAN o'z filialining ` +
          `${expectScoped} tasini oldi (owner ${all}; ilgari direktor ham ${all} ta ko'rardi)`,
      );
    }
  }

  // ═════════════════ 5) B32 lesson-cancellations ═════════════════
  //
  // ⚠ NEGA O'Z FIKSTURASI: bazada bekor qilingan dars umuman bo'lmasligi
  // mumkin va o'shanda "0 qator" natijasi ko'lam ishlaganini EMAS,
  // ma'lumot yo'qligini bildirardi. Ikkala tomonga BITTADAN yozuv
  // qo'yiladi va AYNIQSA "begona 0, o'ziniki 1" talab qilinadi.
  section("B32 — /lesson-cancellations filial ko'lami");
  if (!mineGrp || !otherGrp) {
    skip('B32', "ko'lam ichida yoki tashqarisida guruh yo'q");
  } else {
    const KEY_MINE = '2099-01-05';
    const KEY_OTHER = '2099-01-06';
    const mk = (groupId, dateKey) => prisma.lessonCancellation.create({
      data: {
        groupId, date: new Date(`${dateKey}T00:00:00.000Z`), dateKey,
        slot: '', reason: 'other', note: `${VAL} zond`, billable: false,
      },
      select: { id: true },
    });
    let cMine = null;
    let cOther = null;
    try {
      cMine = await mk(mineGrp.id, KEY_MINE);
      cOther = await mk(otherGrp.id, KEY_OTHER);

      const r = await expectBoth(
        "/lesson-cancellations — ikkalasi 200", '/api/lesson-cancellations', token, 200,
      );
      if (r && r.e.status === 200 && r.n.status === 200) {
        for (const [stack, res] of [['express', r.e], ['nest', r.n]]) {
          const rows = Array.isArray(res.body?.data) ? res.body.data : [];
          const mine = rows.filter((x) => String(x.groupId) === String(mineGrp.id)).length;
          const foreign = rows.filter((x) => String(x.groupId) === String(otherGrp.id)).length;
          if (foreign > 0) {
            bad(
              `B32 SIZISH (${stack})`,
              `begona filial guruhining ${foreign} ta bekor qilingan darsi ko'rindi ` +
                '(guruh nomi, sana, sabab, IZOH va kim yozgani bilan)',
            );
          } else if (mine === 0) {
            // ⚠ MUSBAT NAZORAT: "0 begona" o'z-o'zidan hech nimani
            // isbotlamaydi — marshrut umuman bo'sh qaytargan bo'lishi
            // ham mumkin.
            skip(`B32 (${stack})`, "o'z filiali yozuvi ham ko'rinmadi — o'lchov ishonchsiz");
          } else {
            ok(`B32 (${stack}) — o'z filialidan ${mine} ta, begona filialdan 0 ta`);
          }
        }
      }
    } finally {
      const ids = [cMine?.id, cOther?.id].filter(Boolean);
      if (ids.length) {
        await prisma.lessonCancellation.deleteMany({ where: { id: { in: ids } } });
      }
      const left = await prisma.lessonCancellation.count({
        where: { note: { contains: VAL } } });
      if (left === 0) ok('B32 fixture tozalandi (bazadan tasdiqlandi)');
      else bad('B32 FIXTURE QOLDI', `${left} ta yozuv`);
    }
  }
};

run()
  .catch((e) => bad('to\'plam yiqildi', e.message))
  .finally(async () => {
    // ═══════════════ TOZALASH — BAZADAN ═══════════════
    try {
      if (qa && snap) {
        await prisma.user.update({ where: { id: qa.id }, data: { role: snap.role } });
        for (const a of snap.assigns) {
          await prisma.userBranchAssignment.update({ where: { id: a.id }, data: { role: a.role } });
        }
      }
      await prisma.role.deleteMany({ where: { value: VAL } });

      // ── TIKLASH TEKSHIRILADI (jimgina yiqilmasin) ──
      const now = await prisma.user.findUnique({
        where: { id: qa.id },
        select: { role: true, branchAssignments: { select: { role: true } } },
      });
      const stuck = [now.role, ...now.branchAssignments.map((a) => a.role)].filter((r) => r === VAL);
      const roleLeft = await prisma.role.count({ where: { value: VAL } });
      if (stuck.length || roleLeft) {
        bad('FIXTURE TIKLANMADI', `sinov rolida qolgan: ${stuck.length}, rol qatori: ${roleLeft}`);
      } else {
        ok('fixture roli va birikmalari tiklandi, sinov roli o\'chdi (bazadan tasdiqlandi)');
      }
    } catch (err) {
      bad('tozalash yiqildi', err.message);
    }
    await prisma.$disconnect();
    process.exit(T.finish({ requireSuccess: false }));
  });
