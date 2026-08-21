/**
 * EXCEL EKSPORT - FILIAL KO'LAMI VA USTUN OQ RO'YXATI TESTI.
 *
 * NEGA kerak: eksport yangi ma'lumot chiqish yo'li. Ro'yxat endpoint'lari
 * filial bo'yicha tekshirilgan (branchLeak, branchScopeExploit), lekin
 * eksport ularni CHETLAB o'tib o'z so'rovini yozsa yoki client so'ragan
 * ustunni ko'r-ko'rona qo'shsa - o'sha himoya orqa eshikdan buziladi.
 *
 * Bu test uch narsani tekshiradi:
 *   1. Eksport qatorlarida BOSHQA filial ma'lumoti yo'q.
 *   2. Reyestrda yo'q maydon (passwordHash - ichida OCHIQ parol turadi!)
 *      va ruxsat yetmaydigan ustun (telefon) so'ralsa - tushib qoladi.
 *   3. Tayyor XLSX faylning O'ZIDA ular yo'q (bufer qayta o'qiladi).
 *
 * Va bitta OGOHLANTIRUVCHI tekshiruv (4-bo'lim): filial konteksti
 * bo'lmasa eksport BARCHA filialni qaytaradi. Bu 2-bosqichda Agenda
 * job qo'shilganda eng katta xavf - job request'dan tashqarida ishlaydi.
 *
 * O'Z BAZASIDA ishlaydi (lc_export_test) va oxirida o'chiradi.
 *
 * ISHLATISH:  npm run test:export
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
 * kafolatli tozalash (`tests/helpers/prismaFixtures.js`).
 *
 * ⚠ SIZISH TEKSHIRUVI KUCHAYTIRILDI: endi baza BO'SH EMAS, ya'ni
 * "A filial faqat A qatorlarini ko'radi" tekshiruvi FIXTURE nomlari
 * bo'yicha emas, FIXTURE FILIALI bo'yicha bajariladi — begona qator
 * chiqsa darhol ko'rinadi.
 *
 * `StudentPayment.{student,group}` → `{studentId,groupId}`.
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

// Faqat A filialga ruxsati bor direktor konteksti.
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

const run = async () => {
  const { getDataset, resolveColumns } = await import(
    "../src/modules/exports/registry/index.js"
  );
  const { collectRows, generateXlsx } = await import(
    "../src/modules/exports/services/exports.service.js"
  );

  const paymentsDs = getDataset("student-payments");
  const teachersDs = getDataset("teachers");

  // ─── Fixture: 2 filial, har birida o'quvchi + guruh + to'lov + o'qituvchi ───
  const A = await fx.branch("A-FILIAL");
  const B = await fx.branch("B-FILIAL");

  const mkUser = async (name, role, branchId, phone) =>
    fx.user(name.toLowerCase(), {
      firstName: name,
      lastName: "Test",
      // DIQQAT: bu maydonda loyiha qoidasiga ko'ra OCHIQ parol turadi.
      // Eksportga tushib qolsa - butun baza parollari Excel'da tarqaladi.
      passwordHash: `SIR-PAROL-${name}`,
      role,
      homeBranchId: branchId,
      phone,
      isActive: true,
      ...(role === "teacher" ? { hiredAt: new Date("2024-01-15") } : {}),
    });

  const studA = await mkUser("StudentA", "student", A.id, "+998900000001");
  const studB = await mkUser("StudentB", "student", B.id, "+998900000002");
  await mkUser("TeacherA", "teacher", A.id, "+998900000003");
  await mkUser("TeacherB", "teacher", B.id, "+998900000004");

  const gA = await fx.group("GROUP-A", A.id, { isActive: true });
  const gB = await fx.group("GROUP-B", B.id, { isActive: true });

  // Summalar ataylab farqli - aralashsa darhol ko'rinadi.
  const A_AMOUNT = 1_000_000;
  const B_AMOUNT = 7_000_000;

  const mkPayment = async (student, group, branchId, amount) => {
    const row = await prisma.studentPayment.create({
      data: {
      branchId,
      studentId: student.id,
      groupId: group.id,
      year: YEAR,
      month: MONTH,
      baseFee: amount,
      expectedAmount: amount,
      paidAmount: amount / 2,
      status: "partial",
      },
    });
    return fx.track("studentPayment", row.id), row;
  };

  await mkPayment(studA, gA, A.id, A_AMOUNT);
  await mkPayment(studB, gB, B.id, B_AMOUNT);

  // ─── 1. Eksport qatorlari filial bo'yicha kesilganmi ───
  head("1) Eksport qatorlari (collectRows) - filial ko'lami");
  await asBranch(A.id, async () => {
    const rows = await collectRows(paymentsDs, { year: YEAR, month: MONTH });
    const names = rows.map((r) => r.studentName).join(" | ");
    // ⚠ Nom o'rniga FIXTURE nomi bo'yicha: baza bo'sh emas, shuning
    // uchun "StudentB" satri boshqa qatorda ham uchrashi mumkin edi.
    const leaked = rows.some((r) => String(r.studentName).includes(studB.firstName));
    const wrongMoney = rows.some((r) => r.expectedAmount === B_AMOUNT);

    if (leaked || wrongMoney) {
      bad(
        "A direktori faqat A to'lovlarini eksport qiladi",
        `B filial ma'lumoti chiqdi: ${names}`,
      );
    } else {
      ok("A direktori faqat A to'lovlarini eksport qiladi", `${rows.length} qator: ${names}`);
    }
  });

  // ─── 2. Ustun oq ro'yxati ───
  head("2) Ustun oq ro'yxati (resolveColumns)");

  // 2a. Reyestrda umuman yo'q maydonlar.
  const sneaky = resolveColumns(paymentsDs, ["finance.read"], [
    "studentName",
    "passwordHash",
    "_id",
    "student.passwordHash",
    "__proto__",
  ]);
  const sneakyKeys = sneaky.map((c) => c.key);
  if (sneakyKeys.length === 1 && sneakyKeys[0] === "studentName") {
    ok("reyestrda yo'q maydon tashlanadi", `natija: ${sneakyKeys.join(", ")}`);
  } else {
    bad("reyestrda yo'q maydon tashlanadi", `o'tib ketdi: ${sneakyKeys.join(", ")}`);
  }

  // 2b. Ustun darajasidagi ruxsat: telefon students.read talab qiladi.
  const noPhone = resolveColumns(paymentsDs, ["finance.read"], [
    "studentName",
    "studentPhone",
  ]);
  if (noPhone.some((c) => c.key === "studentPhone")) {
    bad("students.read'siz telefon ustuni berilmaydi", "telefon o'tib ketdi");
  } else {
    ok("students.read'siz telefon ustuni berilmaydi");
  }

  // 2c. Ruxsat bo'lsa - o'sha ustun ishlaydi (test teskarisini ham tekshirsin,
  // aks holda "hamma narsani bloklash" ham testdan o'tib ketardi).
  const withPhone = resolveColumns(paymentsDs, ["finance.read", "students.read"], [
    "studentName",
    "studentPhone",
  ]);
  if (withPhone.some((c) => c.key === "studentPhone")) {
    ok("students.read bilan telefon ustuni ochiladi");
  } else {
    bad("students.read bilan telefon ustuni ochiladi", "ruxsat bor, lekin berilmadi");
  }

  // 2d. Owner ("*") hamma ustunni oladi.
  const ownerCols = resolveColumns(paymentsDs, ["*"], ["studentPhone"]);
  if (ownerCols.length === 1) {
    ok("owner (*) barcha ustunlarga kira oladi");
  } else {
    bad("owner (*) barcha ustunlarga kira oladi", `${ownerCols.length} ta ustun qaytdi`);
  }

  // ─── 3. TAYYOR XLSX faylning o'zi ───
  head("3) Yaratilgan XLSX fayl ichi");
  await asBranch(A.id, async () => {
    // Client "hamma narsani" so'ramoqchi bo'lgan holat.
    const columns = resolveColumns(paymentsDs, ["finance.read"], [
      "studentName",
      "groupName",
      "expectedAmount",
      "studentPhone",
      "passwordHash",
    ]);

    const { buffer, rowCount } = await generateXlsx({
      dataset: paymentsDs,
      columns,
      filters: { year: YEAR, month: MONTH },
      meta: {
        actorName: "Test Direktor",
        generatedAt: new Date("2025-07-01T10:00:00Z"),
        branchLabel: "A-FILIAL",
        filterLabel: `year: ${YEAR}; month: ${MONTH}`,
      },
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(paymentsDs.sheetName);

    if (!ws) {
      bad("XLSX o'qildi", `"${paymentsDs.sheetName}" varag'i topilmadi`);
      return;
    }
    ok("XLSX o'qildi", `${rowCount} qator, ${ws.rowCount} jadval qatori`);

    // Sarlavhalar.
    const headers = (ws.getRow(1).values || []).filter(Boolean).map(String);
    if (headers.includes("Telefon")) {
      bad("faylda telefon ustuni yo'q", `sarlavhalar: ${headers.join(", ")}`);
    } else {
      ok("faylda telefon ustuni yo'q", headers.join(", "));
    }

    // Butun kitob bo'ylab matn qidiruv: parol yoki B filial izi.
    let dump = "";
    wb.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        dump += (row.values || []).map((v) => (v == null ? "" : String(v))).join(" ") + "\n";
      });
    });

    if (dump.includes("SIR-PAROL")) {
      bad("faylda parol yo'q", "passwordHash qiymati faylga tushgan!");
    } else {
      ok("faylda parol yo'q");
    }

    if (dump.includes("StudentB") || dump.includes("GROUP-B")) {
      bad("faylda boshqa filial yo'q", "B filial ma'lumoti faylga tushgan!");
    } else {
      ok("faylda boshqa filial yo'q");
    }

    // "Ma'lumot" varag'i - kim/qachon/qaysi filial yozilganmi.
    const info = wb.getWorksheet("Ma'lumot");
    if (info && dump.includes("A-FILIAL") && dump.includes("Test Direktor")) {
      ok("Ma'lumot varag'i to'ldirilgan");
    } else {
      bad("Ma'lumot varag'i to'ldirilgan", "audit ma'lumotlari yetishmayapti");
    }
  });

  // ─── 4. O'qituvchilar: role filtri qattiq belgilanganmi ───
  head("4) O'qituvchilar dataseti - role almashtirib bo'lmaydi");
  await asBranch(A.id, async () => {
    // Client "role: owner" yubormoqchi bo'ldi. filterSchema'da bunday
    // kalit yo'q - Zod uni strip qiladi, fetchPage esa role'ni o'zi qo'yadi.
    const filters = teachersDs.filterSchema.parse({ role: "owner", status: "active" });
    if (filters.role !== undefined) {
      bad("role filtri strip qilinadi", `role o'tib ketdi: ${filters.role}`);
    } else {
      ok("role filtri strip qilinadi");
    }

    const rows = await collectRows(teachersDs, filters);
    const names = rows.map((r) => r.fullName).join(" | ");
    if (rows.some((r) => String(r.fullName).includes("TeacherB"))) {
      bad("A direktori faqat A o'qituvchilarini ko'radi", `B chiqdi: ${names}`);
    } else if (rows.some((r) => String(r.fullName).includes("Student"))) {
      bad("faqat o'qituvchilar chiqadi", `o'quvchi chiqdi: ${names}`);
    } else {
      ok("A direktori faqat A o'qituvchilarini ko'radi", `${rows.length} qator: ${names}`);
    }
  });

  // ─── 5. OGOHLANTIRISH: kontekstsiz eksport ───
  head("5) Filial konteksti YO'Q holat (2-bosqich uchun ogohlantirish)");
  {
    // ATAYLAB asBranch'siz - Agenda job xuddi shunday ishlaydi.
    const rows = await collectRows(paymentsDs, { year: YEAR, month: MONTH });
    const sawBoth =
      rows.some((r) => String(r.studentName).includes("StudentA")) &&
      rows.some((r) => String(r.studentName).includes("StudentB"));

    if (sawBoth) {
      // Bu KUTILGAN natija: branchFilter() kontekstsiz {} qaytaradi.
      // Shuning uchun 2-bosqichda Agenda job MAJBURIY ravishda
      // runWithBranchContext() ichida ishga tushirilishi kerak.
      ok(
        "kontekstsiz eksport BARCHA filialni qaytaradi (kutilgan)",
        "→ Agenda job runWithBranchContext() ichida bo'lishi SHART",
      );
    } else {
      // Semantika o'zgargan - bu yomon emas, lekin 2-bosqich rejasi
      // shu xatti-harakatga tayangan, shuning uchun e'tibor berilsin.
      bad(
        "kontekstsiz eksport xatti-harakati o'zgargan",
        `${rows.length} qator qaytdi - branchContext semantikasi tekshirilsin`,
      );
    }
  }

};

run()
  .catch((err) => {
    console.error("\n\x1b[31mTEST YIQILDI:\x1b[0m", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} toza\x1b[0m / \x1b[31m${R.fail} muammo\x1b[0m`,
    );
    if (R.failures.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      R.failures.forEach((f) => console.log(`  • ${f}`));
      process.exitCode = 1;
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
