/**
 * O'QITUVCHINI ISHDAN BO'SHATISH OQIMI TESTI.
 *
 * SAVOL: "Hech qachon ishlamagan o'qituvchini nega o'chirib bo'lmasdi, va
 * haqiqiy qarzdorni o'chirishdan nima to'sib turibdi?"
 *
 * Eski qorovul maosh qatorlarini shunchaki SANARDI. Oylik cron esa har oy
 * HAR BIR o'qituvchiga bo'sh (0 hisoblangan, 0 to'langan) `base`/`group`
 * qatorini ochadi - natijada xato kiritilgan xodim bir yildan keyin
 * "12 ta maosh yozuvi" tufayli abadiy o'chmas bo'lib qolardi.
 *
 * Bu test uchta himoyani qulflaydi:
 *   1. BO'SH qator o'chirishni TO'SMAYDI (materiallik tekshiruvi);
 *   2. PULI bor qator va haqiqiy to'lov HAR DOIM to'sadi (tarix buzilmasin);
 *   3. "Hisobni yopish" qoldiqni ANIQ nolga tushiradi va ikki marta
 *      hisoblamaydi (mavjud jarima ham NET balansga kiradi).
 *
 * IZOLYATSIYA: alohida "<db>_offboarding_test" bazasida ishlaydi va oxirida
 * o'zini o'chiradi - ishchi bazaga TEGMAYDI.
 *
 * ISHLATISH:
 *   npm run test:offboarding
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
 * kafolatli tozalash (`tests/helpers/prismaFixtures.js`). Xavfsizlik va
 * biznes DA'VOLARI o'zgarmadi — faqat ma'lumotga murojaat qatlami.
 *
 * Bog'lanish maydonlari qayta nomlandi: `teacher` → `teacherId`,
 * `group` → `groupId`, `student` → `studentId` va h.k.
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
const check = (name, cond, detail = "") =>
  cond ? ok(name) : bad(name, detail || "shart bajarilmadi");
const money = (n) => new Intl.NumberFormat("ru-RU").format(n || 0);

// Xato kutilgan chaqiruv: xabarni qaytaradi, muvaffaqiyat bo'lsa null.
const expectThrow = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e?.message || String(e);
  }
};

const run = async () => {
  const usersService = await import("../src/modules/users/services/users.service.js");
  const adjustmentService = await import(
    "../src/modules/teacherSalary/services/salaryAdjustment.service.js"
  );

  const branch = await fx.branch("Asosiy-offb", { isActive: true });
  const owner = await fx.user("owner_offb", {
    firstName: "Ega",
    lastName: "Egayev",
    passwordHash: "x",
    role: "owner",
    homeBranchId: branch.id,
  });

  let seq = 0;
  const mkTeacher = async (first) =>
    fx.user(`t_offb_${(seq += 1)}`, {
      firstName: first,
      lastName: "Testov",
      passwordHash: "x",
      role: "teacher",
      homeBranchId: branch.id,
    });

  const mkSalary = async (teacher, over = {}) => {
    const row = await prisma.teacherSalary.create({
      data: {
        branchId: branch.id,
        teacherId: teacher.id,
        kind: "base",
        year: 2026,
        month: 1,
        expectedAmount: 0,
        paidAmount: 0,
        ...over,
      },
    });
    return fx.track("teacherSalary", row.id), row;
  };

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) BO'SH qatorlar o'chirishni to'smaydi\x1b[0m");

  // Cron 12 oy davomida yaratgan bo'sh qatorlar + hech narsa bermagan davr.
  const clean = await mkTeacher("Bosh");
  // "group" turidagi maosh qatori guruhsiz bo'lmaydi — HAQIQIY guruh
  // kerak: `teacher_salaries_groupId_fkey` mavjud bo'lmagan ID ni rad etadi.
  const cronGroup = await fx.group("CRON-GURUH", branch.id);
  for (let m = 1; m <= 12; m += 1) {
    await mkSalary(
      clean,
      m % 2 ? { month: m, kind: "base" } : { month: m, kind: "group", groupId: cronGroup.id },
    );
  }
  // Ochilgan kuniyoq yopilgan davr - bir kun ham dars bo'lmagan.
  const sameDay = new Date("2026-03-05T00:00:00.000Z");
  const zeroPeriod = await prisma.teacherGroupPeriod.create({
    data: {
      teacherId: clean.id,
      groupId: cronGroup.id,
      startDate: sameDay,
      endDate: sameDay,
    },
  });
  fx.track("teacherGroupPeriod", zeroPeriod.id);

  const cleanErr = await expectThrow(() =>
    usersService.permanentRemove(clean.id, owner, { confirmName: "Bosh Testov" }),
  );
  check(
    "12 ta bo'sh qator + nol uzunlikdagi davr — o'chdi",
    cleanErr === null,
    `to'sib qoldi: ${cleanErr}`,
  );
  check(
    "o'chirilgach foydalanuvchi bazada yo'q",
    (await prisma.user.count({ where: { id: clean.id } })) === 0,
  );

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) PULI bor tarix har doim to'sadi\x1b[0m");

  const owed = await mkTeacher("Qarzdor");
  for (let m = 1; m <= 6; m += 1) {
    await mkSalary(owed, { month: m, expectedAmount: 2_935_483 });
  }
  const owedErr = await expectThrow(() =>
    usersService.permanentRemove(owed.id, owner, { confirmName: "Qarzdor Testov" }),
  );
  check("to'lanmagan maoshi bor o'qituvchi — to'sildi", owedErr !== null);
  check(
    "xabarda to'lanmagan qoldiq ko'rsatilgan",
    !!owedErr && owedErr.includes(money(6 * 2_935_483)),
    `xabar: ${owedErr}`,
  );
  check(
    "xabar keyingi qadamni aytadi (Hisobni yopish)",
    !!owedErr && owedErr.includes("Hisobni yopish"),
  );

  // To'liq to'langan, lekin haqiqiy to'lov yozuvi bor - baribir to'silishi kerak.
  const paid = await mkTeacher("Tolangan");
  const paidRow = await mkSalary(paid, {
    expectedAmount: 1_000_000,
    paidAmount: 1_000_000,
  });
  const paidTx = await prisma.salaryTransaction.create({
    data: {
      branchId: branch.id,
      teacherId: paid.id,
      salaryId: paidRow.id,
      year: 2026,
      month: 1,
      amount: 1_000_000,
      method: "cash",
      paidAt: new Date(),
    },
  });
  fx.track("salaryTransaction", paidTx.id);
  const paidErr = await expectThrow(() =>
    usersService.permanentRemove(paid.id, owner, { confirmName: "Tolangan Testov" }),
  );
  check("to'lovi bo'lgan o'qituvchi — to'sildi", paidErr !== null, "o'chib ketdi!");

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) Davomat o'chirishni to'smaydi, lekin YO'QOLMAYDI ham\x1b[0m");

  const marker = await mkTeacher("Belgilagan");
  const grp = await fx.group("Test-guruh", branch.id, {
    // `course` ATAYLAB berilmaydi: u ixtiyoriy FK va soxta ID
    // `groups_courseId_fkey` ni buzardi.
    startDate: new Date("2026-01-05T00:00:00.000Z"),
    schedule: { create: [{ day: "mon", startTime: "10:00", endTime: "12:00" }] },
  });
  const student = await fx.user("s_offb_1", {
    firstName: "Oquvchi",
    lastName: "Testov",
    passwordHash: "x",
    role: "student",
    homeBranchId: branch.id,
  });
  const att = await prisma.attendance.create({
    data: {
      groupId: grp.id,
      studentId: student.id,
      date: new Date("2026-01-05T00:00:00.000Z"),
      dateKey: "2026-01-05",
      status: "present",
      recordedById: marker.id,
    },
  });
  fx.track("attendance", att.id);

  const markerErr = await expectThrow(() =>
    usersService.permanentRemove(marker.id, owner, {
      confirmName: "Belgilagan Testov",
    }),
  );
  check(
    "faqat davomat belgilagan o'qituvchi — o'chdi",
    markerErr === null,
    `to'sib qoldi: ${markerErr}`,
  );
  const attAfter = await prisma.attendance.findUnique({ where: { id: att.id } });
  check("davomat yozuvi JOYIDA qoldi", !!attAfter, "davomat o'chib ketdi!");
  check(
    "davomatning 'kim belgiladi' havolasi uzildi (null)",
    !!attAfter && attAfter.recordedById === null,
    `recordedById: ${attAfter?.recordedById}`,
  );

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) Hisobni yopish qoldiqni aniq nolga tushiradi\x1b[0m");

  const balanceOf = async (teacherId) => {
    const rows = await prisma.teacherSalary.findMany({
      // ⚠ `isDeleted` YO'Q: `TeacherSalary` da soft-delete ustuni umuman
      // yo'q (Mongo sxemasidan qolgan taxmin edi). Ishlab chiqarish kodi
      // ham uni ishlatmaydi — tekshirildi.
      where: { teacherId },
      select: { expectedAmount: true, paidAmount: true },
    });
    return rows.reduce(
      (acc, r) => acc + Number(r.expectedAmount || 0) - Number(r.paidAmount || 0),
      0,
    );
  };

  const before = await balanceOf(owed.id);
  check("yopishdan oldin qoldiq bor", before === 6 * 2_935_483, `${money(before)}`);

  const res = await adjustmentService.settleBalance(
    owed.id,
    { reason: "Ishdan bo'shatildi, hisob-kitob yopildi" },
    owner,
  );
  check("yopilgan summa qoldiqqa teng", res.settled === before, `${money(res.settled)}`);

  const after = await balanceOf(owed.id);
  check("yopilgandan keyin qoldiq = 0", after === 0, `${money(after)}`);

  // Servis yaratgan jarima qatorini reyestrga olamiz (tozalash uchun).
  const adjId = res.adjustment.id || res.adjustment._id;
  fx.track("teacherSalary", adjId);
  const dedRow = await prisma.teacherSalary.findUnique({ where: { id: String(adjId) } });
  check("jarima qatori manfiy summa bilan yozilgan", Number(dedRow?.expectedAmount) === -before);
  check("jarima turi deduction", dedRow?.kind === "deduction");

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) Ikki marta yopilmaydi / mavjud jarima ikki marta sanalmaydi\x1b[0m");

  const twice = await expectThrow(() =>
    adjustmentService.settleBalance(owed.id, { reason: "yana" }, owner),
  );
  check("qoldiq 0 bo'lgach ikkinchi yopish rad etildi", twice !== null);

  // Qisman jarima allaqachon yozilgan holat: NET balans yopilishi kerak.
  const partial = await mkTeacher("Qisman");
  await mkSalary(partial, { expectedAmount: 5_000_000 });
  const partialAdj = await adjustmentService.create(
    {
      teacher: partial.id,
      kind: "deduction",
      amount: 2_000_000,
      year: 2026,
      month: 1,
      reason: "kechikish",
      branchId: branch.id,
    },
    owner,
  );
  fx.track("teacherSalary", partialAdj.id || partialAdj._id);
  const partialRes = await adjustmentService.settleBalance(
    partial.id,
    { reason: "bo'shatildi" },
    owner,
  );
  fx.track("teacherSalary", partialRes.adjustment.id || partialRes.adjustment._id);
  check(
    "mavjud jarima hisobga olindi (5 mln - 2 mln = 3 mln)",
    partialRes.settled === 3_000_000,
    `yopildi: ${money(partialRes.settled)}`,
  );
  check("NET balans nolga tushdi", (await balanceOf(partial.id)) === 0);

  // ─────────────────────────────────────────────────────────────────
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
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
        `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
    );
    if (R.fail) R.notes?.forEach?.((n) => console.log(`  • ${n}`));
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
