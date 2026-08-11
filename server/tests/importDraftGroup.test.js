/**
 * QORALAMADAGI GURUH NOMI.
 *
 * SAVOL: "Fayldagi guruh nomi tizimda yo'q bo'lsa nima bo'ladi?"
 *
 * Ilgari u qatorda qolib, HAR tekshiruvda "guruh topilmadi" xatosini
 * berardi. Jadvalda guruh esa TANLOVDAN olinadi - ya'ni foydalanuvchi
 * o'sha qiymatni tanlay ham olmasdi (ro'yxatda yo'q), o'chirishdan
 * boshqa chora qolmasdi. Eng ko'p uchraydigan sabab - shablonning O'Z
 * namuna qatori ("IELTS-A1").
 *
 * Endi qoralama bosqichida bo'shatiladi. Bu test ikkala tomonni ham
 * qo'riqlaydi:
 *   1. YO'Q guruh  -> bo'shatiladi, xato YO'Q;
 *   2. BOR guruh   -> tegilmaydi (aks holda tuzatish ma'nosini yo'qotardi).
 *
 * O'Z BAZASIDA ishlaydi (lc_draft_group_test) va oxirida o'chiradi.
 *
 * ISHLATISH:  npm run test:draft-group
 */
import "dotenv/config";
import mongoose from "mongoose";
import ExcelJS from "exceljs";

const TEST_DB = "mongodb://127.0.0.1:27017/lc_draft_group_test";

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
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));

// Importer ustunlari bo'yicha haqiqiy xlsx yasaydi - readSheet
// sarlavhalarni aynan shu nomlar bo'yicha topadi.
const buildSheet = async (importer, rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(importer.sheetName || "Ma'lumot");
  ws.columns = importer.columns.map((c) => ({ header: c.header, key: c.key }));
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const run = async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const { getImporter } = await import("../src/modules/imports/registry/index.js");
  const { draftFromFile } = await import(
    "../src/modules/imports/services/importEngine.service.js"
  );
  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );

  const branch = await Branch.create({ name: "Asosiy filial", isMain: true });
  await Group.create({
    branchId: branch._id,
    name: "HAQIQIY-GURUH",
    isActive: true,
    startDate: new Date("2026-01-05"),
  });

  const importer = getImporter("students");
  const buffer = await buildSheet(importer, [
    // 1) Shablonning namuna qatoridagi kabi - bunday guruh YO'Q.
    { firstName: "Ali", lastName: "Valiyev", groupName: "IELTS-A1" },
    // 2) Haqiqatan mavjud guruh.
    { firstName: "Vali", lastName: "Aliyev", groupName: "HAQIQIY-GURUH" },
  ]);

  const result = await runWithBranchContext(
    {
      branchId: String(branch._id),
      allowedBranchIds: [String(branch._id)],
      canSeeAllBranches: false,
      userId: null,
    },
    () =>
      draftFromFile({
        importer,
        buffer,
        fileName: "test.xlsx",
        actor: { permissions: ["*"] },
      }),
  );

  const [r1, r2] = result.rows;
  const groupErr = (r) =>
    (r.errors || []).find((e) => e.field === "groupName")?.message || "";

  console.log("\n\x1b[1m1) Tizimda YO'Q guruh\x1b[0m");
  check(
    "guruh nomi bo'shatildi",
    r1.raw.groupName === "",
    `qoldi: "${r1.raw.groupName}"`,
  );
  check("guruh xatosi YO'Q", !groupErr(r1), `xato: "${groupErr(r1)}"`);

  console.log("\n\x1b[1m2) Tizimda BOR guruh\x1b[0m");
  check(
    "guruh nomi saqlandi",
    r2.raw.groupName === "HAQIQIY-GURUH",
    `olindi: "${r2.raw.groupName}"`,
  );
  check("guruh xatosi YO'Q", !groupErr(r2), `xato: "${groupErr(r2)}"`);

  console.log(`\n\x1b[1mNATIJA\x1b[0m  ${R.pass} o'tdi, ${R.fail} yiqildi`);
  for (const f of R.failures) console.log(`  \x1b[31m•\x1b[0m ${f}`);

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(R.fail ? 1 : 0);
};

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ulanish yo'q */
  }
  process.exit(1);
});
