/**
 * BIRLASHGAN MOLIYAVIY TARIX (LEDGER) - BALANS TO'G'RILIGI TESTI.
 *
 * Bu test spetsifikatsiyada ATAYLAB berilgan hisob-kitob misollarini
 * AYNAN takrorlaydi va natijani tizim hisoblagan balans bilan
 * solishtiradi. Ya'ni u kodni emas, TALABNI tekshiradi.
 *
 * Tekshiriladigan xavflar:
 *
 *   1) ISHORA TESKARILIGI - o'qituvchida "+3 mln" markaz qarzi emas,
 *      o'qituvchi qarzi bo'lib hisoblanishi (eng qimmat xato: kimga
 *      qancha qarzdorligimiz teskari chiqadi).
 *   2) ESKI YOZUVLAR BUZILISHI - konvensiya o'zgargandan keyin
 *      ilgari kiritilgan qoldiqlar boshqa ma'no kasb etishi.
 *   3) IKKI BARAVAR HISOBLASH - boshlang'ich qoldiq ham langar
 *      hujjatdan, ham uning materializatsiyasidan sanalishi.
 *   4) DEPOZIT IKKI BARAVAR - depozitga tushgan pul kirimda ham,
 *      qarzga qoplanganda ham hisoblanishi.
 *   5) GURUHSIZ QARZ YO'QOLISHI - guruhi yo'q o'quvchining eski qarzi
 *      balansda ko'rinmay qolishi.
 *   6) TARIXNI QAYTA HISOBLASH - hiredAt o'zgartirilganda o'tgan
 *      oylarga maosh qarzi paydo bo'lishi.
 *
 * ISHLATISH:  npm run test:ledger
 */

/**
 * ⚠ BU TEST HOZIRDA ISHLAMAYDI — MONGO→POSTGRES MIGRATSIYASI QOLDIG'I.
 *
 * Fikstura MONGOOSE modellari bilan yoziladi, tekshirilayotgan servis
 * esa allaqachon PRISMA'dan o'qiydi. Ya'ni ma'lumot bir bazaga
 * yoziladi, boshqasidan o'qiladi — test `MongooseError: buffering
 * timed out` bilan yiqiladi.
 *
 * ── BU NIMA DEGANI ──
 * Tekshirilayotgan XUSUSIYAT buzilgan degani EMAS. Servis ishlaydi;
 * uni qo'riqlaydigan test ishlamaydi. Ya'ni bu yerda QOPLOV YO'Q va
 * regressiya jimgina o'tib ketishi mumkin.
 *
 * ── KO'CHIRISH NAMUNASI ──
 * `branchScopeExploit.test.js` va `journalTreasury.test.js` xuddi shu
 * muammodan aziyat chekardi va ko'chirildi: fikstura `prisma.*.create`
 * ga o'tkaziladi, `_id` taxallusi saqlanadi (`{...row, _id: row.id}`),
 * oxirida esa `TAG` prefiksi bo'yicha tozalanadi.
 *
 * Bu fayl KATTAROQ: 11 ta model bo'ylab fiksturalar butun fayl bo'ylab
 * sochilgan. Shuning uchun u alohida ish sifatida qoldirildi —
 * yarim ko'chirilgan test ishlamaydiganidan xavfliroq.
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Test ilgari MAVJUD filialni qayta ishlatardi va o'z `TAG` prefiksi
 * bo'yicha tozalanardi. Endi u O'Z filialini yaratadi — chunki
 * `txnSvc.create` / `salaryTxnSvc.create` qo'sh yozuv JURNALIGA post
 * qiladi va filial uchun hisob varaqlarini ochadi. Mavjud filial
 * ishlatilsa o'sha jurnal yozuvlari haqiqiy filialga bog'lanib qolardi
 * va ularni tozalab bo'lmasdi.
 *
 * Tozalash `tests/helpers/prismaFixtures.js` ga ko'chdi va u jurnal
 * yozuvlari bilan hisob varaqlarini ham qamraydi.
 */
const fx = createFixtures();

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → ${d}`);
};
const eq = (name, actual, expected) => {
  if (actual === expected) ok(name, String(actual));
  else bad(name, `kutilgan ${expected}, chiqdi ${actual}`);
};

const TAG = "__ledger_test__";
const fmt = (n) => Number(n).toLocaleString("ru-RU");

const run = async () => {
  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );
  const openingSvc = await import(
    "../src/modules/openingBalance/services/openingBalance.service.js"
  );
  const ledgerSvc = await import("../src/modules/ledger/services/ledger.service.js");
  const groupsSvc = await import("../src/modules/groups/services/groups.service.js");
  const txnSvc = await import("../src/modules/finance/services/transaction.service.js");
  const salaryTxnSvc = await import(
    "../src/modules/teacherSalary/services/salaryTransaction.service.js"
  );

  // ⚠ O'Z FILIALI YARATILADI (ilgari mavjudi qayta ishlatilardi).
  //
  // Sabab: `txnSvc.create` / `salaryTxnSvc.create` qo'sh yozuv JURNALIGA
  // post qiladi va filial uchun hisob varaqlarini ochadi. Mavjud filial
  // ishlatilsa o'sha jurnal yozuvlari HAQIQIY filialga bog'lanib qolardi
  // va tozalab bo'lmasdi — dev bazada doimiy soxta moliyaviy iz.
  const branch = await fx.branch(`${TAG}-filial`);

  const now = new Date();
  const Y = now.getUTCFullYear();
  const M = now.getUTCMonth() + 1;
  const prev = M === 1 ? { y: Y - 1, m: 12 } : { y: Y, m: M - 1 };

  const ctx = {
    branchId: String(branch.id),
    allowedBranchIds: [String(branch.id)],
    canSeeAllBranches: false,
    userId: null,
  };
  const inBranch = (fn) => runWithBranchContext(ctx, fn);

  const mkUser = async (role, suffix, extra = {}) => {
    const u = await fx.user(`${TAG}_${role}${suffix}`, {
      firstName: TAG,
      lastName: `${role}${suffix}`,
      passwordHash: "test1234",
      role,
      homeBranchId: branch.id,
      ...extra,
    });
    return u;
  };

  /**
   * SERVIS YARATGAN yon qatorlarni reyestrga oladi.
   *
   * ⚠ JURNAL YOZUVLARI HAM: `txnSvc.create` va `salaryTxnSvc.create`
   * qo'sh yozuv jurnaliga post qiladi va filial uchun hisob varaqlarini
   * ochadi. Eski `cleanup()` ularni BILMASDI — filial qayta ishlatilgani
   * uchun ular haqiqiy filialga yopishib qolardi.
   */
  const trackServiceRows = async () => {
    const uids = [...(fx.registry.get("user") || [])];
    const gids = [...(fx.registry.get("group") || [])];
    const pairs = [
      ["openingBalance", { userId: { in: uids } }],
      ["studentPayment", { studentId: { in: uids } }],
      ["paymentTransaction", { studentId: { in: uids } }],
      ["depositTransaction", { studentId: { in: uids } }],
      ["studentDeposit", { studentId: { in: uids } }],
      ["groupMembership", { studentId: { in: uids } }],
      ["teacherSalary", { teacherId: { in: uids } }],
      ["salaryTransaction", { teacherId: { in: uids } }],
      ["groupFee", { groupId: { in: gids } }],
      ["journalEntry", { branchId: branch.id }],
    ];
    for (const [model, where] of pairs) {
      const rows = await prisma[model].findMany({ where, select: { id: true } }).catch(() => []);
      for (const r of rows) fx.track(model, r.id);
    }
    const entryIds = [...(fx.registry.get("journalEntry") || [])];
    if (entryIds.length) {
      const lines = await prisma.journalLine
        .findMany({ where: { entryId: { in: entryIds } }, select: { id: true } })
        .catch(() => []);
      for (const l of lines) fx.track("journalLine", l.id);
    }
    const accounts = await prisma.account
      .findMany({ where: { branchId: branch.id }, select: { id: true } })
      .catch(() => []);
    for (const a of accounts) fx.track("account", a.id);
  };

  const cleanup = async () => {
    await trackServiceRows();
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);
  };

  console.log(`\n\x1b[1mBIRLASHGAN MOLIYAVIY TARIX (LEDGER) TESTI\x1b[0m\n`);

  try {
    // ═════════ 1. O'QITUVCHI: spetsifikatsiya §8 misoli ═════════
    //
    //   Opening Balance  +3 000 000
    //   Salary           +2 000 000
    //   Payment          -1 500 000
    //   ─────────────────────────────
    //   Balans           +3 500 000   (markaz o'qituvchiga qarzdor)
    console.log("\x1b[1m1) O'qituvchi: +3 000 000 → +2 000 000 → -1 500 000\x1b[0m");

    const teacher = await mkUser("teacher", 1, {
      hiredAt: new Date(Date.UTC(Y, now.getUTCMonth() - 2, 1)),
    });

    await inBranch(() =>
      openingSvc.create({
        user: teacher.id,
        role: "teacher",
        // + = MARKAZ o'qituvchiga qarzdor. Guruh BERILMAYDI - qoldiq
        // markaz darajasidagi majburiyat.
        amount: 3_000_000,
        branchId: branch.id,
        group: null,
      }),
    );

    let st = await inBranch(() => ledgerSvc.statementFor(teacher.id));
    eq("Boshlang'ich qoldiq ishorasi to'g'ri", st.openingBalance, 3_000_000);
    eq("Faqat qoldiq bo'lganda balans = qoldiq", st.currentBalance, 3_000_000);

    // Hisoblangan maosh (markaz qarzini oshiradi).
    const salary = await prisma.teacherSalary.create({
      data: {
        branchId: branch.id,
        teacherId: teacher.id,
        groupId: null,
        year: prev.y,
        month: prev.m,
        kind: "base",
        expectedAmount: 2_000_000,
        paidAmount: 0,
        status: "unpaid",
        isLocked: true,
      },
    });
    fx.track("teacherSalary", salary.id);

    st = await inBranch(() => ledgerSvc.statementFor(teacher.id));
    eq("Maosh hisoblangach balans", st.currentBalance, 5_000_000);

    // To'lov (markaz qarzini kamaytiradi).
    await inBranch(() =>
      salaryTxnSvc.create(
        {
          salaryId: salary.id,
          amount: 1_500_000,
          method: "cash",
          paidAt: new Date(),
        },
        { _id: null },
      ),
    );

    st = await inBranch(() => ledgerSvc.statementFor(teacher.id));
    eq("Spetsifikatsiya §8 yakuniy balansi", st.currentBalance, 3_500_000);

    // Har bir qator "shu amaldan keyingi balans"ni ko'rsatishi kerak -
    // aynan shu ustun "balans qayerdan chiqdi?" degan savolga javob.
    const last = st.rows[st.rows.length - 1];
    eq("Oxirgi qatorning balanceAfter'i joriy balansga teng", last.balanceAfter, 3_500_000);
    eq("Tarixda 3 ta qator bor", st.rows.length, 3);

    console.log(
      `  \x1b[2m${st.rows
        .map((r) => `${r.amount > 0 ? "+" : ""}${fmt(r.amount)} → ${fmt(r.balanceAfter)}`)
        .join("  |  ")}\x1b[0m`,
    );

    // ═════════ 2. ESKI (flow) YOZUV TESKARI O'QILMAYDI ═════════
    console.log("\n\x1b[1m2) Eski konvensiyadagi yozuv to'g'ri o'qiladi\x1b[0m");

    const legacyTeacher = await mkUser("teacher", 2, { hiredAt: new Date() });
    // Konvensiya o'zgarishidan OLDIN yozilgandek qilib qo'yamiz:
    // eski qoidada o'qituvchida +2 000 000 "u bizga qarz" degani edi.
    const legacyOb = await prisma.openingBalance.create({
      data: {
        userId: legacyTeacher.id,
        role: "teacher",
        amount: 2_000_000,
        signConvention: "flow",
        branchId: branch.id,
        year: prev.y,
        month: prev.m,
        kind: "teacher_debt",
        materializedAt: new Date(),
      },
    });
    fx.track("openingBalance", legacyOb.id);

    st = await inBranch(() => ledgerSvc.statementFor(legacyTeacher.id));
    eq("Eski (flow) yozuv ishorasi ag'darildi", st.openingBalance, -2_000_000);

    // ═════════ 3. O'QUVCHI: spetsifikatsiya §7 misoli ═════════
    //
    //   Opening Balance  -500 000   (o'quvchi markazga qarz)
    //   To'lov           +300 000
    //   ────────────────────────────
    //   Balans           -200 000
    console.log("\n\x1b[1m3) O'quvchi: -500 000 → +300 000 (guruhsiz yaratilgan)\x1b[0m");

    const enrolled = new Date(Date.UTC(Y, now.getUTCMonth(), 1));
    const student = await mkUser("student", 1, { enrolledAt: enrolled });

    await inBranch(() =>
      openingSvc.create({
        user: student.id,
        role: "student",
        amount: -500_000,
        branchId: branch.id,
        // GURUH YO'Q - o'quvchi hali hech qaysi guruhga qo'shilmagan.
        group: null,
        joinedAt: enrolled,
      }),
    );

    const obDoc = await prisma.openingBalance.findFirst({ where: { userId: student.id } });
    eq("Guruhsiz qarz 'kutish' holatida", obDoc.pendingReason, "awaiting_group");
    eq("Materializatsiya qilinmagan", obDoc.materializedAt, null);

    st = await inBranch(() => ledgerSvc.statementFor(student.id));
    eq("Guruhsiz bo'lsa ham balansda KO'RINADI", st.currentBalance, -500_000);
    if (st.summary.openingPending) ok("Kutayotgani hisobotda belgilangan");
    else bad("Kutayotgani hisobotda belgilangan", "openingPending=false");

    // ── Guruhga qo'shamiz: qarz avtomatik yozilishi kerak ──
    // Tarif 0: guruh oylik qarzi balansga aralashmasin, faqat
    // boshlang'ich qarz va to'lov tekshirilsin.
    const group = await fx.group(`${TAG}-guruh`, branch.id, {
      startDate: enrolled,
      isActive: true,
    });
    const zeroFee = await prisma.groupFee.upsert({
      where: { groupId_year_month: { groupId: group.id, year: Y, month: M } },
      update: { amount: 0, source: "manual" },
      create: { groupId: group.id, year: Y, month: M, amount: 0, source: "manual" },
    });
    fx.track("groupFee", zeroFee.id);

    await inBranch(() => groupsSvc.addStudent(group.id, student.id, { joinedAt: enrolled }));

    const obAfter = await prisma.openingBalance.findFirst({ where: { userId: student.id } });
    if (obAfter.materializedAt) {
      ok("Guruhga qo'shilganda qarz avtomatik yozildi");
    } else {
      bad("Guruhga qo'shilganda qarz avtomatik yozildi", obAfter.materializeError || "yozilmadi");
    }
    // ⚠ `pendingReason` endi ENUM (`OpeningPendingReason`), Mongo'dagi
    // erkin satr emas. "Kutish yo'q" holati bo'sh satr bilan emas,
    // `none` qiymati bilan ifodalanadi — DA'VO o'zgarmadi, faqat
    // qiymatning nomi sxemadan keladi.
    eq("Kutish holati tozalandi", obAfter.pendingReason, "none");

    const openingPlan = await prisma.studentPayment.findFirst({
      where: { studentId: student.id, isOpening: true },
    });
    eq("Qarz qatori summasi", Number(openingPlan?.expectedAmount), 500_000);

    // MATERIALIZATSIYADAN KEYIN BALANS O'ZGARMASLIGI SHART: qator
    // paydo bo'ldi, lekin u boshlang'ich qoldiqning O'ZI - ikki marta
    // sanalmasligi kerak.
    st = await inBranch(() => ledgerSvc.statementFor(student.id));
    eq("Materializatsiyadan keyin balans O'ZGARMADI", st.currentBalance, -500_000);

    // ── 300 000 to'lov ──
    await inBranch(() =>
      txnSvc.create(
        {
          paymentId: openingPlan.id,
          amount: 300_000,
          method: "cash",
          paidAt: new Date(),
        },
        { _id: null },
      ),
    );

    st = await inBranch(() => ledgerSvc.statementFor(student.id));
    eq("Spetsifikatsiya §7 yakuniy balansi", st.currentBalance, -200_000);

    // ── Qolgan 200 000 ni ham to'laydi → 0 ──
    await inBranch(() =>
      txnSvc.create(
        {
          paymentId: openingPlan.id,
          amount: 200_000,
          method: "card",
          paidAt: new Date(),
        },
        { _id: null },
      ),
    );

    st = await inBranch(() => ledgerSvc.statementFor(student.id));
    eq("To'liq to'langach balans nol", st.currentBalance, 0);

    // ═════════ 4. DEPOZIT IKKI MARTA HISOBLANMAYDI ═════════
    console.log("\n\x1b[1m4) Depozit orqali to'lov ikki baravar hisoblanmaydi\x1b[0m");

    const student2 = await mkUser("student", 2, { enrolledAt: enrolled });
    await inBranch(() => groupsSvc.addStudent(group.id, student2.id, { joinedAt: enrolled }));

    // A'zolik joriy oy uchun qator YARATGAN (tarif 0 bo'lgani uchun summa
    // nol). Yangisini yaratmaymiz - unique indeks to'g'ri ishlayotgani
    // uchun bu E11000 berardi; mavjud qatorga summa yozamiz.
    // Mongo `findOneAndUpdate(..., { upsert: true })` → Prisma'da
    // `findFirst` + `update`/`create` (kompozit kalit `isOpening` ni
    // qamramaydi, shuning uchun `upsert` to'g'ridan-to'g'ri ishlamaydi).
    const existingCharge = await prisma.studentPayment.findFirst({
      where: {
        studentId: student2.id, groupId: group.id, year: Y, month: M, isOpening: false,
      },
    });
    const charge = existingCharge
      ? await prisma.studentPayment.update({
          where: { id: existingCharge.id },
          data: { baseFee: 400_000, expectedAmount: 400_000 },
        })
      : await prisma.studentPayment.create({
          data: {
            branchId: branch.id, studentId: student2.id, groupId: group.id,
            year: Y, month: M, baseFee: 400_000, expectedAmount: 400_000,
          },
        });
    fx.track("studentPayment", charge.id);

    st = await inBranch(() => ledgerSvc.statementFor(student2.id));
    eq("Hisoblangan oylik qarz sifatida ko'rindi", st.currentBalance, -400_000);

    // Depozitga 400 000 tushadi va avtomatik qarzga qoplanadi.
    const depositSvc = await import("../src/modules/deposits/services/deposit.service.js");
    await inBranch(() =>
      depositSvc.topup(student2.id, { amount: 400_000, method: "cash" }, null),
    );

    const chargeAfter = await prisma.studentPayment.findUnique({ where: { id: charge.id } });
    eq("Depozit qarzni yopdi", Number(chargeAfter.paidAmount), 400_000);

    st = await inBranch(() => ledgerSvc.statementFor(student2.id));
    // +400 000 (depozit kirimi) va -400 000 (qarz) → 0.
    // Agar qoplama ham qator bo'lganida +400 000 bo'lib chiqardi.
    eq("Depozit qoplamasidan keyin balans nol", st.currentBalance, 0);

    // ═════════ 5. BALANS SAQLANMAYDI - QAYTA HISOBLANADI ═════════
    console.log("\n\x1b[1m5) Balans hech qayerda saqlanmaydi\x1b[0m");

    // Manba hujjat o'zgarsa balans DARHOL ergashadi. Agar balans
    // alohida maydonda keshlangan bo'lganida - bu yerda eski qiymat
    // chiqardi.
    await prisma.studentPayment.update({
      where: { id: charge.id },
      data: { expectedAmount: 600_000 },
    });
    st = await inBranch(() => ledgerSvc.statementFor(student2.id));
    eq("Manba o'zgarishi balansga darhol ta'sir qildi", st.currentBalance, -200_000);

    const userDoc = await prisma.user.findUnique({ where: { id: student2.id } });
    if (userDoc.balance === undefined && userDoc.currentBalance === undefined) {
      ok("User hujjatida yoziladigan 'balance' maydoni yo'q");
    } else {
      bad("User hujjatida yoziladigan 'balance' maydoni yo'q", "maydon topildi");
    }

    // ═════════ 6. TARIXNI BUZMASLIK (spetsifikatsiya §6) ═════════
    console.log("\n\x1b[1m6) hiredAt o'zgarishi eski oylarga maosh yaratmaydi\x1b[0m");

    const salariesBefore = await prisma.teacherSalary.count({ where: { teacherId: teacher.id } });
    const balanceBefore = (await inBranch(() => ledgerSvc.statementFor(teacher.id)))
      .currentBalance;

    // Ishga qabul sanasini 8 oy orqaga suramiz.
    await prisma.user.update({
      where: { id: teacher.id },
      data: { hiredAt: new Date(Date.UTC(Y - 1, now.getUTCMonth(), 1)) },
    });

    const salariesAfter = await prisma.teacherSalary.count({ where: { teacherId: teacher.id } });
    const balanceAfter = (await inBranch(() => ledgerSvc.statementFor(teacher.id)))
      .currentBalance;

    eq("Yangi maosh qatori yaratilmadi", salariesAfter, salariesBefore);
    eq("Balans o'zgarmadi", balanceAfter, balanceBefore);
  } finally {
    await cleanup();
  }

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}\n`,
  );
  if (R.fail) R.notes.forEach((n) => console.log(`  \x1b[31m•\x1b[0m ${n}`));

  await prisma.$disconnect().catch(() => {});
  process.exit(R.fail ? 1 : 0);
};

run().catch(async (err) => {
  bad("TEST YIQILDI", err?.message || String(err));
  if (process.env.DEBUG) console.error(err);
  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, \x1b[31m${R.fail} yiqildi\x1b[0m\n`,
  );
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
