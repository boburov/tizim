/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESURS KO'LAMI REYESTRI — MUVOFIQLIK TESTI.
 *
 * SAVOL (o'zgarmadi): "Yangi model qo'shilganda uning filialga qanday
 * bog'lanishi haqida O'YLASHGA majbur bo'lamizmi?"
 *
 * Bu test hech qanday sizishni izlamaydi — u REYESTR bilan HAQIQAT
 * o'rtasidagi farqni topadi:
 *
 *   1. Sxemada bor, reyestrda YO'Q → yangi model qo'shildi, lekin uning
 *      ko'lami hal qilinmadi. Aynan shu yo'l bilan `Feedback` va
 *      `ActivityLog` filtrsiz qolib ketgan edi.
 *   2. Reyestrda bor, sxemada YO'Q → model o'chirilgan/nomi o'zgargan.
 *   3. Reyestrda `branch`, lekin sxemada `branchId` maydoni YO'Q →
 *      `branchFilter()` JIMGINA hech narsa topmaydi.
 *   4. Sxemada `branchId` BOR, lekin reyestrda `branch` emas → maydon
 *      to'ldiriladi, ammo hech qachon filtrlanmaydi.
 *
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * ILGARI: `readdirSync("src/models")` bilan `*.model.js` fayllari
 * sanalar, keyin har biri import qilinib `mongoose.models` dan sxema
 * olinar va `schema.path("branchId")` tekshirilardi.
 *
 * ENDI: HAQIQAT MANBAI `prisma/schema.prisma`. Fayl matn sifatida
 * o'qiladi va `model X { ... }` bloklaridan maydonlar ajratiladi.
 *
 * ⚠ BU KUCHSIZLANISH EMAS, KUCHAYISH: Mongoose sxemasi kodda yozilgan
 * "niyat" edi; `schema.prisma` esa bazadagi HAQIQIY ustunlar manbai
 * (migratsiyalar undan generatsiya qilinadi). Ya'ni tekshiruv endi
 * niyatni emas, amaldagi jadval tuzilmasini solishtiradi.
 *
 * BAZA KERAK EMAS — faqat sxema fayli o'qiladi.
 *
 * ── NEGA KO'CHIRILDI (dalil) ──
 * NestJS tomonida ekvivalenti YO'Q edi: `branch-scope-security` AYNIQSA
 * TANLANGAN endpointlarni sinaydi, bu esa REYESTR TO'LIQLIGINI — ya'ni
 * "yangi model qo'shilganda uning ko'lami hal qilinganmi" degan savolni.
 * Ikkalasi bir-birini almashtirmaydi.
 *
 * ⚠ KO'CHIRISHDA U BUZUQ HOLATDA EDI: `prisma/` `server/` ga ko'chirilgan,
 * ya'ni test qidirgan `server_legacy/prisma/schema.prisma` endi YO'Q.
 * Musbat nazorat (`models.size < 50`) tufayli u JIMGINA o'tib ketmasdi,
 * balki yiqilardi — lekin uni hech kim yurgizmayotgan edi.
 *
 * ISHLATISH:  npm run test:resource-scope
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  RESOURCE_SCOPE,
  SCOPE,
  requiresBranchField,
} from './resource-scope.registry.mjs';

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

/**
 * `schema.prisma` ni o'qib, model → maydonlar to'plamini quradi.
 *
 * ⚠ ATAYLAB SODDA MATN TAHLILI: Prisma rasmiy AST kutubxonasi bu
 * loyihada yo'q va uni faqat test uchun qo'shish bog'liqlikni
 * kengaytirardi. Bizga kerak bo'lgani — model nomlari va maydon
 * nomlari; ular sxemada qat'iy shaklda yozilgan.
 *
 * `@@map`, `@relation`, izoh qatorlari va bloklar e'tiborsiz qoldiriladi.
 */
const parsePrismaSchema = (text) => {
  const models = new Map();
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = modelRe.exec(text)) !== null) {
    const [, name, body] = m;
    const fields = new Set();
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+\S/);
      if (fm) fields.add(fm[1]);
    }
    models.set(name, fields);
  }
  return models;
};

/** `StudentPayment` → `studentPayment` (reyestr kalitlari shu shaklda). */
const toRegistryKey = (modelName) =>
  modelName.charAt(0).toLowerCase() + modelName.slice(1);

const run = async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(here, "../prisma/schema.prisma"); // server/prisma/schema.prisma
  const models = parsePrismaSchema(readFileSync(schemaPath, "utf8"));

  // ── MUSBAT NAZORAT: tahlilchi HAQIQATAN ishladimi ──
  //
  // Busiz bo'sh natija "hamma model reyestrdan o'tgan" bo'lib
  // ko'rinardi — ya'ni sxema o'qilmagani JIMGINA yashil bo'lardi.
  console.log("\n\x1b[1mRESURS KO'LAMI REYESTRI\x1b[0m");
  if (models.size < 50) {
    bad(
      "MUSBAT NAZORAT: schema.prisma tahlil qilinmadi",
      `faqat ${models.size} ta model topildi — quyidagi tekshiruvlar ma'nosiz`,
    );
  } else {
    ok("schema.prisma tahlil qilindi", `${models.size} ta model`);
  }
  // Ma'lum bir model va maydoni HAQIQATAN topilganini ham tasdiqlaymiz.
  if (models.get("Group")?.has("branchId")) {
    ok("tahlilchi maydonlarni to'g'ri ajratadi", "Group.branchId topildi");
  } else {
    bad("tahlilchi maydonlarni ajrata olmadi", "Group.branchId topilmadi");
  }

  const schemaKeys = [...models.keys()].map(toRegistryKey).sort();
  console.log(
    `  \x1b[2m${schemaKeys.length} model, reyestrda ${Object.keys(RESOURCE_SCOPE).length} yozuv\x1b[0m\n`,
  );

  // ── 1) Reyestrda yo'q modellar ──
  console.log("\x1b[1m1) Har bir model reyestrda bormi\x1b[0m");
  const missing = schemaKeys.filter((n) => !RESOURCE_SCOPE[n]);
  if (missing.length === 0) {
    ok("hamma model reyestrdan o'tgan", `${schemaKeys.length} ta`);
  } else {
    bad(
      "reyestrda YO'Q modellar bor",
      `${missing.join(", ")} — test/resource-scope.registry.mjs ga qo'shing va ko'lamini hal qiling`,
    );
  }

  // ── 2) Eskirgan yozuvlar ──
  console.log("\n\x1b[1m2) Reyestrda ortiqcha yozuv bormi\x1b[0m");
  const stale = Object.keys(RESOURCE_SCOPE).filter((n) => !schemaKeys.includes(n));
  if (stale.length === 0) {
    ok("eskirgan yozuv yo'q");
  } else {
    bad("reyestrda mavjud bo'lmagan model bor", stale.join(", "));
  }

  // ── 3) Sxema bilan solishtirish ──
  console.log("\n\x1b[1m3) Deklaratsiya sxemaga mos keladimi\x1b[0m");

  /**
   * Deklaratsiya sxemaga mos keladimi — YAGONA qoida funksiyasi.
   *
   * Alohida ajratildi, chunki pastdagi NEGATIV NAZORAT uni SOXTA
   * ma'lumot bilan chaqiradi: qoida buzilganda test HAQIQATAN
   * yiqilishini ko'rsatish uchun.
   */
  const checkOne = (key, scope, fields) => {
    if (!fields) return null;
    // BRANCH va BRANCH_OPTIONAL — ikkalasida ham maydon BO'LISHI shart.
    // Farqi filtrlashda: birinchisi `branchFilter()` bilan kesiladi,
    // ikkinchisi resolver ichida (null = butun tarmoq).
    const declaredBranch = scope === SCOPE.BRANCH || scope === SCOPE.BRANCH_OPTIONAL;
    const actualBranch = fields.has("branchId");

    if (declaredBranch && !actualBranch) {
      return {
        name: `"${key}" reyestrda \`${scope}\`, lekin sxemada branchId YO'Q`,
        detail: "branchFilter() hech narsa topmaydi",
      };
    }
    if (!declaredBranch && actualBranch) {
      return {
        name: `"${key}" sxemada branchId BOR, lekin reyestrda \`${scope}\``,
        detail: "maydon to'ldiriladi, lekin filtrlanmaydi",
      };
    }
    // BRANCH_PAIR: `branchId` o'rniga `fromBranchId` + `toBranchId`.
    if (scope === SCOPE.BRANCH_PAIR) {
      if (!fields.has("fromBranchId") || !fields.has("toBranchId")) {
        return {
          name: `"${key}" reyestrda \`branch-pair\`, lekin juft maydon YO'Q`,
          detail: "fromBranchId / toBranchId kutilgan edi",
        };
      }
    }
    return null;
  };

  let mismatches = 0;
  for (const [key, scope] of Object.entries(RESOURCE_SCOPE)) {
    const modelName = key.charAt(0).toUpperCase() + key.slice(1);
    const fields = models.get(modelName);
    const problem = checkOne(key, scope, fields);
    if (problem) {
      bad(problem.name, problem.detail);
      mismatches += 1;
    }
  }
  if (mismatches === 0) ok("barcha deklaratsiyalar sxemaga mos");

  // ── 3b) NEGATIV NAZORAT — qoida buzilganda SEZILADIMI ──
  //
  // Tekshiruvning O'ZI ishlayotganini isbotlaymiz: ataylab noto'g'ri
  // juftlik beriladi va `checkOne` muammo QAYTARISHI shart. Aks holda
  // yuqoridagi "barcha deklaratsiyalar mos" natijasi shunchaki
  // "tekshiruv hech narsa qilmadi" degani bo'lishi mumkin edi.
  console.log("\n\x1b[1m3b) Negativ nazorat — nomuvofiqlik seziladimi\x1b[0m");
  {
    const branchless = new Set(["id", "name"]);
    const withBranch = new Set(["id", "branchId"]);
    const cases = [
      ["`branch` deb e'lon qilingan, maydonsiz model", checkOne("soxta", SCOPE.BRANCH, branchless)],
      ["`global` deb e'lon qilingan, branchId'li model", checkOne("soxta", SCOPE.GLOBAL, withBranch)],
      ["`branch-pair`, juft maydonsiz model", checkOne("soxta", SCOPE.BRANCH_PAIR, branchless)],
    ];
    const undetected = cases.filter(([, res]) => res === null).map(([n]) => n);
    if (undetected.length === 0) {
      ok("uch xil nomuvofiqlikning HAMMASI seziladi", `${cases.length}/3`);
    } else {
      bad("NEGATIV NAZORAT YIQILDI", `sezilmadi: ${undetected.join("; ")}`);
    }
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

  const branchCount = Object.values(RESOURCE_SCOPE).filter((s) => s === SCOPE.BRANCH).length;
  ok(
    "filtrlanishi shart bo'lgan modellar aniqlangan",
    `${branchCount} ta to'g'ridan-to'g'ri, ${
      Object.keys(RESOURCE_SCOPE).length - branchCount
    } ta bilvosita/global`,
  );
  ok("requiresBranchField ishlaydi", `group → ${requiresBranchField("group")}`);

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
