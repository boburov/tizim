/**
 * EXCEL IMPORT DVIGATELI TESTI.
 *
 * NEGA kerak: import - eng xavfli yozish yo'li. Bitta fayl bilan yuzlab
 * moliyaviy yozuv yaratiladi va uni orqaga qaytarish qo'lda qilinadi.
 * Shuning uchun quyidagilar KAFOLATLANISHI shart:
 *
 *   1. Boshqa filial o'quvchisiga to'lov yozib bo'lmaydi (filial ko'lami).
 *   2. Bitta qatordagi xato qolganlarini TO'XTATMAYDI (qisman muvaffaqiyat).
 *   3. Bir xil faylni ikki marta yuklash pulni IKKI MARTA yozmaydi
 *      (idempotentlik) - eng qimmatga tushadigan xato.
 *   4. Fayl ichidagi takror qatorlar aniqlanadi.
 *   5. Pul mavjud servis orqali yoziladi: qoldiq to'g'ri hisoblanadi va
 *      ortiqcha to'lov depozitga tushadi.
 *
 * O'Z BAZASIDA ishlaydi (lc_import_test) va oxirida o'chiradi.
 *
 * ISHLATISH:  npm run test:import
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";
import ExcelJS from "exceljs";

import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";

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

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.failures.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);

const asBranch = (branchId, fn) =>
  runWithBranchContext(
    {
      branchId: String(branchId),
      allowedBranchIds: [String(branchId)],
      canSeeAllBranches: false,
      userId: null,
    },
    fn,
  );

const YEAR = 2025;
const MONTH = 6;
const PAID_AT = "2025-06-15";

// Berilgan qatorlardan xotirada xlsx bufer yasaydi (foydalanuvchi
// yuklaydigan faylning aynan o'zi).
const makeXlsx = async (columns, rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ma'lumot");
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 20 }));
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const run = async () => {
  const { getImporter } = await import("../src/modules/imports/registry/index.js");
  const { preview, commit } = await import(
    "../src/modules/imports/services/importEngine.service.js"
  );
  const { buildTemplate } = await import(
    "../src/modules/imports/services/template.service.js"
  );

  // ⚠ FIXTURE NOMLARI SUFFIKSLI. Excel qatorlariga qattiq satr
  // ("studenta", "GROUP-A") yozilsa importer ularni TOPA OLMAYDI va
  // hamma qator "error" bo'lardi — test o'z fixture'i tufayli yiqilardi,
  // importer esa to'g'ri ishlayotgan bo'lardi.
  const importer = getImporter("student-payments");
  const cols = importer.columns;

  // ─── Fixture ───
  const A = await fx.branch("A-FILIAL");
  const B = await fx.branch("B-FILIAL");

  const mkStudent = (name, branchId) =>
    fx.user(name.toLowerCase(), {
      firstName: name,
      lastName: "Test",
      passwordHash: "x",
      role: "student",
      homeBranchId: branchId,
      isActive: true,
    });

  const studA = await mkStudent("StudentA", A.id);
  const studA2 = await mkStudent("StudentA2", A.id);
  const studB = await mkStudent("StudentB", B.id);

  const gA = await fx.group("GROUP-A", A.id, { isActive: true });
  const gB = await fx.group("GROUP-B", B.id, { isActive: true });

  const EXPECTED = 1_000_000;
  const mkObligation = async (student, group, branchId) => {
    const row = await prisma.studentPayment.create({
      data: {
        branchId,
        studentId: student.id,
        groupId: group.id,
        year: YEAR,
        month: MONTH,
        baseFee: EXPECTED,
        expectedAmount: EXPECTED,
        paidAmount: 0,
        status: "unpaid",
      },
    });
    return fx.track("studentPayment", row.id), row;
  };

  await mkObligation(studA, gA, A.id);
  await mkObligation(studA2, gA, A.id);
  await mkObligation(studB, gB, B.id);

  const currentUser = { _id: studA.id, permissions: ["*"] };

  // ─── 1. Shablon ───
  head("1) Shablon generatsiyasi");
  {
    const buf = await buildTemplate(importer);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    const headers = (ws.getRow(1).values || []).filter(Boolean).map(String);
    const required = cols.filter((c) => c.required).map((c) => c.header);
    const allPresent = required.every((h) => headers.includes(h));
    allPresent
      ? ok("shablonda barcha majburiy ustun bor", `${headers.length} ustun`)
      : bad("shablonda barcha majburiy ustun bor", headers.join(", "));

    wb.getWorksheet("Yo'riqnoma")
      ? ok("yo'riqnoma varag'i bor")
      : bad("yo'riqnoma varag'i bor", "topilmadi");
  }

  // ─── 2. FILIAL KO'LAMI ───
  head("2) Filial ko'lami - boshqa filial o'quvchisi");
  await asBranch(A.id, async () => {
    const buffer = await makeXlsx(cols, [
      {
        studentRef: studA.username,
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: 200000,
        method: "naqd",
        paidAt: PAID_AT,
      },
      {
        // B filial o'quvchisi - A direktori uchun "topilmadi" bo'lishi shart.
        studentRef: studB.username,
        groupName: gB.name,
        year: YEAR,
        month: MONTH,
        amount: 500000,
        method: "naqd",
        paidAt: PAID_AT,
      },
    ]);

    const res = await preview({ importer, buffer, fileName: "t.xlsx" });
    const rowB = res.rows.find((r) => r.raw.studentRef === studB.username);
    const rowA = res.rows.find((r) => r.raw.studentRef === studA.username);

    if (rowB?.status === "error") {
      ok("boshqa filial o'quvchisi rad etildi", rowB.errors[0]?.message?.slice(0, 60));
    } else {
      bad("boshqa filial o'quvchisi rad etildi", `holat: ${rowB?.status}`);
    }
    rowA?.status === "ok"
      ? ok("o'z filiali o'quvchisi qabul qilindi")
      : bad("o'z filiali o'quvchisi qabul qilindi", `holat: ${rowA?.status}`);
  });

  // ─── 3. QISMAN MUVAFFAQIYAT ───
  head("3) Bitta xato qator qolganlarini to'xtatmaydi");
  await asBranch(A.id, async () => {
    const buffer = await makeXlsx(cols, [
      {
        studentRef: studA.username,
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: 300000,
        method: "naqd",
        paidAt: PAID_AT,
      },
      {
        studentRef: "yoq-bunday-odam",
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: 100000,
        method: "naqd",
        paidAt: PAID_AT,
      },
      {
        studentRef: studA2.username,
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: 400000,
        method: "karta",
        paidAt: PAID_AT,
      },
    ]);

    const res = await commit({ importer, buffer, fileName: "t.xlsx", currentUser });
    const s = res.summary;

    if (s.imported === 2 && s.error === 1) {
      ok("2 ta yozildi, 1 tasi xato", `jami ${s.total}`);
    } else {
      bad(
        "2 ta yozildi, 1 tasi xato",
        `imported=${s.imported} error=${s.error} failed=${s.failed}`,
      );
    }

    // Pul haqiqatan yozilganmi va qoldiq to'g'rimi.
    const p = await prisma.studentPayment.findFirst({
      where: { studentId: studA.id, groupId: gA.id },
    });
    Number(p?.paidAmount) === 300000
      ? ok("qoldiq to'g'ri hisoblandi", `to'langan ${money(Number(p.paidAmount))}`)
      : bad("qoldiq to'g'ri hisoblandi", `paidAmount=${p?.paidAmount}`);

    p?.status === "partial"
      ? ok("holat 'partial' ga o'tdi")
      : bad("holat 'partial' ga o'tdi", `status=${p?.status}`);

    res.failedRows.length === 1
      ? ok("xatolik hisobotida 1 qator")
      : bad("xatolik hisobotida 1 qator", `${res.failedRows.length} ta`);
  });

  // ─── 4. IDEMPOTENTLIK ───
  head("4) Bir xil faylni ikki marta yuklash");
  await asBranch(A.id, async () => {
    const buffer = await makeXlsx(cols, [
      {
        studentRef: studA.username,
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: 100000,
        method: "naqd",
        paidAt: PAID_AT,
      },
    ]);

    const first = await commit({ importer, buffer, fileName: "t.xlsx", currentUser });
    const afterFirst = await prisma.studentPayment.findFirst({ where: { studentId: studA.id, groupId: gA.id } });

    // Ikkinchi marta - AYNAN o'sha fayl.
    const second = await commit({ importer, buffer, fileName: "t.xlsx", currentUser });
    const afterSecond = await prisma.studentPayment.findFirst({ where: { studentId: studA.id, groupId: gA.id } });

    first.summary.imported === 1
      ? ok("birinchi yuklash yozdi")
      : bad("birinchi yuklash yozdi", JSON.stringify(first.summary));

    if (afterFirst.paidAmount === afterSecond.paidAmount) {
      ok(
        "ikkinchi yuklash PUL QO'SHMADI",
        `to'langan ${money(afterSecond.paidAmount)} (o'zgarmadi)`,
      );
    } else {
      bad(
        "ikkinchi yuklash PUL QO'SHMADI",
        `${money(afterFirst.paidAmount)} -> ${money(afterSecond.paidAmount)} IKKI MARTA YOZILDI`,
      );
    }

    second.summary.imported === 0
      ? ok("ikkinchi yuklash 'takror' deb belgilandi")
      : bad("ikkinchi yuklash 'takror' deb belgilandi", JSON.stringify(second.summary));
  });

  // ─── 5. FAYL ICHIDAGI TAKROR ───
  head("5) Fayl ichida bir xil qator ikki marta");
  await asBranch(A.id, async () => {
    const row = {
      studentRef: studA2.username,
      groupName: gA.name,
      year: YEAR,
      month: MONTH,
      amount: 55000,
      method: "naqd",
      paidAt: PAID_AT,
    };
    const buffer = await makeXlsx(cols, [row, { ...row }]);
    const res = await preview({ importer, buffer, fileName: "t.xlsx" });

    if (res.summary.valid === 1 && res.summary.duplicate === 1) {
      ok("ikkinchi nusxa 'takror' deb belgilandi");
    } else {
      bad("ikkinchi nusxa 'takror' deb belgilandi", JSON.stringify(res.summary));
    }
  });

  // ─── 6. ORTIQCHA TO'LOV DEPOZITGA ───
  head("6) Qarzdan ortgan pul depozitga tushadi");
  await asBranch(A.id, async () => {
    const before = await prisma.studentPayment.findFirst({ where: { studentId: studA2.id, groupId: gA.id } });
    const remaining = before.expectedAmount - before.paidAmount;
    const overpay = remaining + 250_000;

    const buffer = await makeXlsx(cols, [
      {
        studentRef: studA2.username,
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: overpay,
        method: "naqd",
        paidAt: PAID_AT,
      },
    ]);

    const res = await commit({ importer, buffer, fileName: "t.xlsx", currentUser });
    const after = await prisma.studentPayment.findFirst({ where: { studentId: studA2.id, groupId: gA.id } });
    const dep = await prisma.studentDeposit.findFirst({ where: { studentId: studA2.id } });

    res.summary.imported === 1
      ? ok("ortiqcha to'lov qabul qilindi", `${money(overpay)}`)
      : bad("ortiqcha to'lov qabul qilindi", JSON.stringify(res.summary));

    after.paidAmount === after.expectedAmount
      ? ok("oylik to'liq yopildi")
      : bad("oylik to'liq yopildi", `${money(after.paidAmount)}/${money(after.expectedAmount)}`);

    dep?.balance === 250_000
      ? ok("ortgan pul depozitga tushdi", money(dep.balance))
      : bad("ortgan pul depozitga tushdi", `balans=${money(dep?.balance)}`);
  });

  // ─── 7. NOTO'G'RI MA'LUMOT ───
  head("7) Noto'g'ri qiymatlar aniqlanadi");
  await asBranch(A.id, async () => {
    const buffer = await makeXlsx(cols, [
      {
        studentRef: studA.username,
        groupName: gA.name,
        year: YEAR,
        month: 13, // noto'g'ri oy
        amount: 100000,
        method: "naqd",
        paidAt: PAID_AT,
      },
      {
        studentRef: studA.username,
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: -5000, // manfiy summa
        method: "naqd",
        paidAt: PAID_AT,
      },
      {
        studentRef: studA.username,
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: 10000,
        method: "bitcoin", // noma'lum to'lov turi
        paidAt: PAID_AT,
      },
      {
        studentRef: studA.username,
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: 10000,
        method: "naqd",
        paidAt: "2099-01-01", // kelajak sana
      },
    ]);

    const res = await preview({ importer, buffer, fileName: "t.xlsx" });
    if (res.summary.error === 4 && res.summary.valid === 0) {
      ok("to'rttala xato ham tutildi");
    } else {
      bad("to'rttala xato ham tutildi", JSON.stringify(res.summary));
    }

    const fields = res.rows.flatMap((r) => (r.errors || []).map((e) => e.field));
    const wanted = ["Oy", "To'lov summasi", "To'lov turi", "To'lov sanasi"];
    const missing = wanted.filter((w) => !fields.includes(w));
    missing.length === 0
      ? ok("xatolar to'g'ri ustunga bog'landi", fields.join(", "))
      : bad("xatolar to'g'ri ustunga bog'landi", `yetishmaydi: ${missing.join(", ")}`);
  });

  // ─── 8. F.I.O NOMUVOFIQLIGI ───
  head("8) F.I.O login bilan mos kelmasa");
  await asBranch(A.id, async () => {
    const buffer = await makeXlsx(cols, [
      {
        studentRef: studA.username,
        studentName: "Boshqa Odam",
        groupName: gA.name,
        year: YEAR,
        month: MONTH,
        amount: 10000,
        method: "naqd",
        paidAt: PAID_AT,
      },
    ]);
    const res = await preview({ importer, buffer, fileName: "t.xlsx" });
    res.summary.error === 1
      ? ok("nomuvofiq F.I.O rad etildi")
      : bad("nomuvofiq F.I.O rad etildi", JSON.stringify(res.summary));
  });

  // ─── 9. SARLAVHA YO'Q ───
  head("9) Majburiy ustun yo'q fayl");
  await asBranch(A.id, async () => {
    const partial = cols.filter((c) => c.key !== "amount");
    const buffer = await makeXlsx(partial, [
      { studentRef: studA.username, groupName: gA.name, year: YEAR, month: MONTH, paidAt: PAID_AT },
    ]);
    try {
      await preview({ importer, buffer, fileName: "t.xlsx" });
      bad("majburiy ustunsiz fayl rad etildi", "xato berilmadi");
    } catch (e) {
      e?.statusCode === 400 && /majburiy ustun/i.test(e.message)
        ? ok("majburiy ustunsiz fayl rad etildi", e.message.slice(0, 50))
        : bad("majburiy ustunsiz fayl rad etildi", e.message);
    }
  });

  // ─── 10. Yozuvlar filialga to'g'ri bog'landimi ───
  head("10) Yozilgan tranzaksiyalar filiali");
  {
    // ⚠ FIXTURE o'quvchilari bo'yicha: baza bo'sh emas, filtrsiz
    // `find({})` bazadagi barcha tranzaksiyani olardi.
    const txs = await prisma.paymentTransaction.findMany({
      where: { studentId: { in: [studA.id, studA2.id, studB.id] } },
    });
    const wrong = txs.filter((t) => String(t.branchId) !== String(A.id));
    wrong.length === 0
      ? ok("barcha tranzaksiya A filialga yozildi", `${txs.length} ta`)
      : bad("barcha tranzaksiya A filialga yozildi", `${wrong.length} tasi boshqa filialda`);

    const bTx = txs.filter((t) => String(t.student) === String(studB.id));
    bTx.length === 0
      ? ok("B filial o'quvchisiga hech narsa yozilmadi")
      : bad("B filial o'quvchisiga hech narsa yozilmadi", `${bTx.length} ta yozuv`);
  }

};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} toza\x1b[0m / \x1b[31m${R.fail} muammo\x1b[0m`,
    );
    if (R.failures.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      R.failures.forEach((f) => console.log(`  • ${f}`));
      process.exitCode = 1;
    }
    // Import servisi yaratgan tranzaksiya/depozit/jurnal qatorlari.
    const uids = [...(fx.registry.get("user") || [])];
    const bids = [...(fx.registry.get("branch") || [])];
    for (const [model, where] of [
      ["paymentTransaction", { studentId: { in: uids } }],
      ["depositTransaction", { studentId: { in: uids } }],
      ["studentDeposit", { studentId: { in: uids } }],
      ["importJob", { branchId: { in: bids } }],
      ["journalEntry", { branchId: { in: bids } }],
    ]) {
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
      .findMany({ where: { branchId: { in: bids } }, select: { id: true } })
      .catch(() => []);
    for (const a of accounts) fx.track("account", a.id);

    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
