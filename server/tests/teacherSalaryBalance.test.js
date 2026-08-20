/**
 * O'QITUVCHINING JORIY MAOSH HOLATI (balanceByTeacher) TESTI.
 *
 * SAVOL: "oyning o'rtasida o'qituvchi kelib 'maoshim qancha bo'ldi?' desa,
 *         tizim to'g'ri raqam aytadimi?"
 *
 * Bu oddiy yig'indi EMAS: joriy oy maoshi oy BOSHIDA to'liq summa bilan
 * yaratiladi (generateMonthlySalary job), ya'ni 8-avgustda ham "31 kunlik
 * oylik" kutilayotgan bo'lib turadi. Kartochka esa SHU KUNGACHA ishlab
 * olinganini ko'rsatishi kerak. Ikkisi adashtirilsa, oy o'rtasidagi
 * hisob-kitobda o'qituvchiga OYLIK to'lab yuborilardi.
 *
 * Tekshiriladigan holatlar:
 *   1. Oddiy holat (skrinshotdagi ssenariy: 1-iyulda ishga olingan,
 *      8-avgust) - har oltita raqam.
 *   2. Oy o'rtasida ishga olingan - proratsiya IKKI marta qo'llanmasligi
 *      kerak (qator allaqachon bo'lingan, uning ustiga elapsed/total
 *      ko'paytirsak summa oshib ketardi).
 *   3. Avans (bu oy uchun to'lov) - jami qoldiqdan yechiladi.
 *   4. Mukofot (bonus) - DISKRET, proratsiya qilinmaydi.
 *   5. Joriy oy qatori hali yaratilmagan - fiksa stavkadan jonli hisoblanadi.
 *
 * ISHLATISH:  npm run test:salary-balance
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

const BASE_DB = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
// Ishchi bazani ifloslantirmaslik uchun nomga qo'shimcha qo'shamiz.
/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Alohida Mongo bazasi + `dropDatabase()` o'rniga prefiksli fixture va
 * kafolatli tozalash. Har o'qituvchi SHU yurish uchun yaratiladi, ya'ni
 * `balanceByTeacher` faqat fixture ma'lumotini ko'radi — bazadagi
 * begona maosh qatorlari natijaga ta'sir qilmaydi.
 *
 * `TeacherSalary.teacher` → `teacherId`, `TeacherCompensation.teacher`
 * → `teacherId`.
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
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const eq = (name, actual, expected) =>
  actual === expected
    ? ok(name, `= ${actual}`)
    : bad(name, `kutilgan ${expected}, olindi ${actual}`);

const D = (s) => new Date(`${s}T00:00:00.000Z`);
// Mahalliy (Asia/Tashkent = UTC+5) kalendar kuni shu sana bo'lsin.
const NOW = (s) => new Date(`${s}T09:00:00.000Z`);

const run = async () => {
  const salaryService = await import(
    "../src/modules/teacherSalary/services/teacherSalary.service.js"
  );

  const branch = await fx.branch("TSB", { isActive: true });

  let seq = 0;
  const mkTeacher = async (over = {}) =>
    fx.user(`t_bal_${(seq += 1)}`, {
      firstName: "Olim",
      lastName: "Testov",
      passwordHash: "x",
      role: "teacher",
      homeBranchId: branch.id,
      ...over,
    });

  const mkComp = async (teacher, over = {}) => {
    const row = await prisma.teacherCompensation.create({
      data: {
        teacherId: teacher.id,
        branchId: branch.id,
        effectiveFrom: over.effectiveFrom || teacher.hiredAt,
        baseType: "fixed_monthly",
        baseAmount: 1_200_000,
        variableType: "none",
        ...over,
      },
    });
    return fx.track("teacherCompensation", row.id), row;
  };

  const mkSalary = async (teacher, over = {}) => {
    const row = await prisma.teacherSalary.create({
      data: {
        branchId: branch.id,
        teacherId: teacher.id,
        kind: "base",
        year: 2026,
        month: 7,
        expectedAmount: 1_200_000,
        paidAmount: 0,
        ...over,
      },
    });
    return fx.track("teacherSalary", row.id), row;
  };

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) Oddiy holat — 1-iyulda ishga olingan, bugun 8-avgust\x1b[0m");

  // 31 kunlik avgustning 7 kuni o'tgan (bugun sanalmaydi):
  //   1 200 000 * 7 / 31 = 270 968
  const t1 = await mkTeacher({ hiredAt: D("2026-07-01") });
  await mkComp(t1);
  await mkSalary(t1, { month: 7 }); // iyul - to'lanmagan
  await mkSalary(t1, { month: 8 }); // avgust - oy boshida to'liq yaratilgan

  const b1 = await salaryService.balanceByTeacher(t1.id, { now: NOW("2026-08-08") });

  eq("FIX MAOSH (amaldagi stavka)", b1.fixedMonthly, 1_200_000);
  eq("JAMI DAROMAD (avgust, to'liq oy)", b1.monthlyTotal, 1_200_000);
  eq("ISHLAGAN KUN (1-iyul → 8-avgust)", b1.daysWorked, 38);
  eq("OY BOSHIGACHA QOLDIQ (iyul)", b1.previousRemaining, 1_200_000);
  eq("BU OY (SHU KUNGACHA)", b1.currentAccrued, Math.round((1_200_000 * 7) / 31));
  eq(
    "JAMI QOLDIQ",
    b1.totalRemaining,
    1_200_000 + Math.round((1_200_000 * 7) / 31),
  );
  eq("o'tgan kunlar", b1.elapsedDays, 7);

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) Oy o'rtasida ishga olingan — proratsiya IKKI marta emas\x1b[0m");

  // 15-avgustda ishga olingan, bugun 20-avgust.
  // Qator allaqachon bo'lingan: 1 200 000 * 17 / 31 = 658 065.
  // Shu kungacha esa atigi 5 kun: 1 200 000 * 5 / 31 = 193 548.
  // Sodda "elapsed/totalDays" nisbati 658 065 * 19/31 = 403 000 berардi.
  const t2 = await mkTeacher({ hiredAt: D("2026-08-15") });
  await mkComp(t2);
  await mkSalary(t2, {
    month: 8,
    expectedAmount: Math.round((1_200_000 * 17) / 31),
    payableDays: 17,
    totalDays: 31,
  });

  const b2 = await salaryService.balanceByTeacher(t2.id, { now: NOW("2026-08-20") });
  eq("JAMI DAROMAD (bo'lingan oy)", b2.monthlyTotal, Math.round((1_200_000 * 17) / 31));
  eq("BU OY (SHU KUNGACHA) = 5 kun", b2.currentAccrued, Math.round((1_200_000 * 5) / 31));
  eq("ISHLAGAN KUN (15 → 20 avgust)", b2.daysWorked, 5);
  eq("o'tgan oy qoldig'i yo'q", b2.previousRemaining, 0);

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) Avans — bu oy uchun to'lov jami qoldiqdan yechiladi\x1b[0m");

  const t3 = await mkTeacher({ hiredAt: D("2026-07-01") });
  await mkComp(t3);
  await mkSalary(t3, { month: 8, paidAmount: 200_000 });

  const b3 = await salaryService.balanceByTeacher(t3.id, { now: NOW("2026-08-08") });
  const accrued3 = Math.round((1_200_000 * 7) / 31);
  eq("bu oy to'langani ko'rindi", b3.currentPaid, 200_000);
  eq("JAMI QOLDIQ = ishlangani − avans", b3.totalRemaining, accrued3 - 200_000);

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) Mukofot (bonus) DISKRET — proratsiya qilinmaydi\x1b[0m");

  const t4 = await mkTeacher({ hiredAt: D("2026-07-01") });
  await mkComp(t4);
  await mkSalary(t4, { month: 8 });
  await mkSalary(t4, {
    month: 8,
    kind: "bonus",
    expectedAmount: 500_000,
    reason: "KPI",
    source: "manual",
  });

  const b4 = await salaryService.balanceByTeacher(t4.id, { now: NOW("2026-08-08") });
  eq("JAMI DAROMAD = fiksa + mukofot", b4.monthlyTotal, 1_700_000);
  eq(
    "mukofot TO'LIQ qo'shildi (fiksa esa ulushicha)",
    b4.currentAccrued,
    Math.round((1_200_000 * 7) / 31) + 500_000,
  );

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) Joriy oy qatori hali yaratilmagan — stavkadan jonli\x1b[0m");

  // Job oy boshida ishlagan, o'qituvchi esa keyin qo'shilgan: qator yo'q.
  // Kartochka "0 so'm" ko'rsatsa, stavka belgilanmagandek tuyulardi.
  const t5 = await mkTeacher({ hiredAt: D("2026-08-01") });
  await mkComp(t5);

  const b5 = await salaryService.balanceByTeacher(t5.id, { now: NOW("2026-08-08") });
  eq("JAMI DAROMAD stavkadan olindi", b5.monthlyTotal, 1_200_000);
  eq("BU OY (SHU KUNGACHA)", b5.currentAccrued, Math.round((1_200_000 * 7) / 31));

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m6) Stavkasiz o'qituvchi — hamma raqam nol, xato yo'q\x1b[0m");

  const t6 = await mkTeacher({ hiredAt: D("2026-08-01") });
  const b6 = await salaryService.balanceByTeacher(t6.id, { now: NOW("2026-08-08") });
  eq("FIX MAOSH", b6.fixedMonthly, 0);
  eq("JAMI DAROMAD", b6.monthlyTotal, 0);
  eq("JAMI QOLDIQ", b6.totalRemaining, 0);

};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ${
        R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"
      }`,
    );
    if (R.fail) R.notes.forEach((n) => console.log(`  - ${n}`));
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
