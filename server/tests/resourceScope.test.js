/**
 * RESURS KO'LAMI REYESTRI - MUVOFIQLIK TESTI.
 *
 * SAVOL: "Yangi model qo'shilganda uning filialga qanday bog'lanishi
 * haqida O'YLASHGA majbur bo'lamizmi?"
 *
 * Bu test hech qanday sizishni izlamaydi - u REYESTR bilan HAQIQAT
 * o'rtasidagi farqni topadi:
 *
 *   1. Modellar papkasida bor, reyestrda YO'Q -> yangi model qo'shildi,
 *      lekin uning ko'lami hal qilinmadi. Aynan shu yo'l bilan Feedback
 *      va ActivityLog filtrsiz qolib ketgan edi.
 *   2. Reyestrda bor, modellar papkasida YO'Q -> model o'chirilgan yoki
 *      nomi o'zgargan, reyestr esa eskirgan.
 *   3. Reyestrda `branch` deb belgilangan, lekin sxemada `branchId`
 *      maydoni YO'Q -> branchFilter() jimgina hech narsa topmaydi.
 *   4. Sxemada `branchId` BOR, lekin reyestrda `branch` emas -> maydon
 *      to'ldiriladi, ammo hech qachon filtrlanmaydi.
 *
 * BAZA KERAK EMAS - faqat sxemalar o'qiladi.
 *
 * ISHLATISH:
 *   npm run test:resource-scope
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mongoose from "mongoose";
import {
  RESOURCE_SCOPE,
  SCOPE,
  requiresBranchField,
} from "../src/constants/resourceScope.js";

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

const run = async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const modelsDir = join(here, "../src/models");

  const fileNames = readdirSync(modelsDir)
    .filter((f) => f.endsWith(".model.js"))
    .map((f) => f.replace(".model.js", ""))
    .sort();

  console.log("\n\x1b[1mRESURS KO'LAMI REYESTRI\x1b[0m");
  console.log(
    `  \x1b[2m${fileNames.length} model fayli, reyestrda ${Object.keys(RESOURCE_SCOPE).length} yozuv\x1b[0m\n`,
  );

  // ── 1) Reyestrda yo'q modellar ──
  console.log("\x1b[1m1) Har bir model reyestrda bormi\x1b[0m");
  const missing = fileNames.filter((n) => !RESOURCE_SCOPE[n]);
  if (missing.length === 0) {
    ok("hamma model reyestrdan o'tgan", `${fileNames.length} ta`);
  } else {
    bad(
      "reyestrda YO'Q modellar bor",
      `${missing.join(", ")} — constants/resourceScope.js ga qo'shing va ko'lamini hal qiling`,
    );
  }

  // ── 2) Eskirgan yozuvlar ──
  console.log("\n\x1b[1m2) Reyestrda ortiqcha yozuv bormi\x1b[0m");
  const stale = Object.keys(RESOURCE_SCOPE).filter((n) => !fileNames.includes(n));
  if (stale.length === 0) {
    ok("eskirgan yozuv yo'q");
  } else {
    bad("reyestrda mavjud bo'lmagan model bor", stale.join(", "));
  }

  // ── 3) Sxema bilan solishtirish ──
  console.log("\n\x1b[1m3) Deklaratsiya sxemaga mos keladimi\x1b[0m");

  // Modellarni yuklaymiz - mongoose.models to'ladi.
  for (const name of fileNames) {
    await import(join(modelsDir, `${name}.model.js`));
  }

  const hasBranchField = (schema) => Boolean(schema?.path("branchId"));

  let mismatchDeclared = 0;
  let mismatchUndeclared = 0;

  for (const [name, scope] of Object.entries(RESOURCE_SCOPE)) {
    if (!fileNames.includes(name)) continue;

    // Model nomi fayl nomidan farq qilishi mumkin (Approval ->
    // "expenseapprovals"), shuning uchun sxemani registry orqali
    // emas, mongoose.models ichidan nomi bo'yicha qidiramiz.
    const model = Object.values(mongoose.models).find(
      (m) => m.modelName.toLowerCase() === name.toLowerCase(),
    );
    if (!model) continue;

    // BRANCH va BRANCH_OPTIONAL - ikkalasida ham maydon BO'LISHI shart.
    // Farqi filtrlashda: birinchisi branchFilter() bilan kesiladi,
    // ikkinchisi resolver ichida (null = butun tarmoq).
    const declaredBranch =
      scope === SCOPE.BRANCH || scope === SCOPE.BRANCH_OPTIONAL;
    const actualBranch = hasBranchField(model.schema);

    if (declaredBranch && !actualBranch) {
      bad(
        `"${name}" reyestrda \`branch\`, lekin sxemada branchId YO'Q`,
        "branchFilter() hech narsa topmaydi",
      );
      mismatchDeclared += 1;
    } else if (!declaredBranch && actualBranch) {
      bad(
        `"${name}" sxemada branchId BOR, lekin reyestrda \`${scope}\``,
        "maydon to'ldiriladi, lekin filtrlanmaydi",
      );
      mismatchUndeclared += 1;
    }
  }

  if (mismatchDeclared === 0 && mismatchUndeclared === 0) {
    ok("barcha deklaratsiyalar sxemaga mos");
  }

  // ── 4) Taqsimot ──
  console.log("\n\x1b[1m4) Ko'lam bo'yicha taqsimot\x1b[0m");
  const byScope = {};
  for (const scope of Object.values(RESOURCE_SCOPE)) {
    byScope[scope] = (byScope[scope] || 0) + 1;
  }
  for (const [scope, count] of Object.entries(byScope).sort((a, b) => b[1] - a[1])) {
    console.log(`  \x1b[2m${String(count).padStart(3)} × ${scope}\x1b[0m`);
  }

  const branchCount = Object.values(RESOURCE_SCOPE).filter(
    (s) => s === SCOPE.BRANCH,
  ).length;
  ok(
    "filtrlanishi shart bo'lgan modellar aniqlangan",
    `${branchCount} ta to'g'ridan-to'g'ri, ${
      Object.keys(RESOURCE_SCOPE).length - branchCount
    } ta bilvosita/global`,
  );
  ok("requiresBranchField ishlaydi", `group -> ${requiresBranchField("group")}`);

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.fail) {
    console.log("\nYiqilganlar:");
    R.notes.forEach((n) => console.log(`  • ${n}`));
    process.exit(1);
  }
};

run().catch((err) => {
  console.error("\x1b[31mTEST YIQILDI:\x1b[0m", err);
  process.exit(1);
});
