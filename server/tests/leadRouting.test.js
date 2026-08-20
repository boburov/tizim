/**
 * LID YO'NALTIRISH (Faza 6).
 *
 * SAVOL: "Telegram botdan kelgan lid TO'G'RI filialga tushadimi - va
 * qoida topilmasa YO'QOLMAYDIMI?"
 *
 * ENG MUHIM INVARIANT - LID YO'QOLMASLIGI:
 *   Zaxira zanjiri uch bosqichli (manba -> zaxira qoida -> asosiy
 *   filial). Uchinchisi ataylab bor: qoida umuman sozlanmagan markazda
 *   ham lid biror ro'yxatga tushishi kerak. Aks holda tizim ishga
 *   tushgan birinchi kuni barcha lid "yo'q joyga" ketardi.
 *
 * IZOLYATSIYA: o'z test bazasini yaratadi va oxirida O'CHIRADI.
 *
 * ISHLATISH:
 *   npm run test:lead-routing
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Alohida Mongo bazasi o'rniga prefiksli fixture + kafolatli tozalash.
 *
 * ⚠ "ASOSIY FILIAL" FIXTURE'DA YARATILMAYDI. Yo'naltirish qoidasi
 * topilmasa lid ASOSIY filialga tushadi (`matchedBy: "main_branch"`) —
 * bu bazadagi HAQIQIY asosiy filial. Ikkinchi `isMain: true` filial
 * yaratish bazani buzardi va `resolveMainBranchId()` qaysi birini
 * tanlashi noaniq bo'lardi.
 *
 * Shuning uchun A = BAZADAGI mavjud asosiy filial (faqat O'QILADI),
 * B = fixture filiali (qoida nishoni).
 */
const fx = createFixtures();
/** Tozalashda kerak — fixture filialiga bog'langan qoidalarni o'chirish uchun. */
let fxBranchId = null;

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
const check = (n, cond, d = "shart bajarilmadi") => (cond ? ok(n) : bad(n, d));
const grab = async (fn) => {
  try {
    return { value: await fn(), err: null };
  } catch (err) {
    return { value: null, err };
  }
};

const run = async () => {
  const routingModule = await import("../src/modules/leads/services/leadRouting.service.js");
  // `routing.create` LeadRoutingRule YOZADI — har bir yozuvni reyestrga
  // olamiz, aks holda tozalash ularni ko'rmasdi.
  const routing = {
    ...routingModule,
    create: async (...args) => {
      const r = await routingModule.create(...args);
      if (r?.id || r?._id) fx.track("leadRoutingRule", r.id || r._id);
      return r;
    },
  };

  // A — BAZADAGI haqiqiy asosiy filial (yaratilmaydi, faqat o'qiladi).
  const A = await prisma.branch.findFirst({
    where: { isMain: true, isDeleted: false },
    select: { id: true, name: true },
  });
  if (!A) throw new Error("Bazada asosiy filial yo'q — `ensureMainBranch()` yurgazilmagan?");

  // ⚠ MUSBAT NAZORAT: bazada oldindan yo'naltirish qoidasi bo'lsa,
  // "qoidasiz holat" tekshiruvi NOTO'G'RI natija berardi.
  const existingRules = await prisma.leadRoutingRule.count();
  if (existingRules > 0) {
    bad(
      "boshlang'ich holat toza",
      `bazada ${existingRules} ta yo'naltirish qoidasi bor — "qoidasiz holat" tekshiruvi ma'nosiz`,
    );
  }

  const B = await fx.branch("Yunusobod");
  fxBranchId = B.id;

  const admin = await fx.user("admin_b", {
    firstName: "Admin",
    lastName: "B",
    passwordHash: "p",
    role: "teacher",
    homeBranchId: B.id,
  });

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) QOIDASIZ HOLAT - lid yo'qolmaydi\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const noRule = await routing.route({ source: "telegram_nomalum" });
  check(
    "Qoida yo'q -> ASOSIY filialga tushadi",
    String(noRule.branchId) === String(A.id) && noRule.matchedBy === "main_branch",
    `matchedBy=${noRule.matchedBy}`,
  );
  check(
    "Manbasiz lid ham yo'qolmaydi",
    (await routing.route({})).matchedBy === "main_branch",
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) MANBA QOIDASI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await routing.create({
    branchId: String(B.id),
    sourceKey: "telegram_yunusobod",
    assigneeId: String(admin.id),
  });

  const bySource = await routing.route({ source: "telegram_yunusobod" });
  check(
    "Manba bo'yicha to'g'ri filialga tushdi",
    String(bySource.branchId) === String(B.id) && bySource.matchedBy === "source",
    `matchedBy=${bySource.matchedBy}`,
  );
  check(
    "Qoidadagi xodimga biriktirildi",
    String(bySource.assigneeId) === String(admin.id),
    "aks holda lid filialda egasiz qolardi",
  );

  // Katta-kichik harf ahamiyatsiz - bot istalgan shaklda yuborishi mumkin.
  const upper = await routing.route({ source: "TELEGRAM_YUNUSOBOD" });
  check(
    "Katta harfli manba ham topiladi",
    String(upper.branchId) === String(B.id),
    "normalizatsiyasiz qoida bir holatda ishlab, boshqasida jimgina o'tkazib yuborardi",
  );

  // Boshqa manba baribir asosiy filialga.
  const other = await routing.route({ source: "instagram" });
  check("Mos kelmagan manba asosiyga tushadi", other.matchedBy === "main_branch");

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) ZAXIRA QOIDA\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await routing.create({ branchId: String(B.id), isFallback: true });

  const fb = await routing.route({ source: "instagram" });
  check(
    "Zaxira qoida ishladi",
    String(fb.branchId) === String(B.id) && fb.matchedBy === "fallback",
    `matchedBy=${fb.matchedBy}`,
  );

  const stillSource = await routing.route({ source: "telegram_yunusobod" });
  check(
    "Manba qoidasi zaxiradan USTUN",
    stillSource.matchedBy === "source",
    `matchedBy=${stillSource.matchedBy}`,
  );

  const dupFallback = await grab(() =>
    routing.create({ branchId: String(A.id), isFallback: true }),
  );
  check(
    "Ikkinchi zaxira qoida RAD ETILADI",
    dupFallback.err?.statusCode === 409,
    "ikkitasi bo'lsa tanlov tasodifiy bo'lib qolardi",
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) VALIDATSIYA\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const noSource = await grab(() => routing.create({ branchId: String(A.id) }));
  check(
    "Manbasiz oddiy qoida RAD ETILADI",
    noSource.err !== null,
    "u hech qachon mos kelmasdi - o'lik qoida",
  );

  const fallbackWithSource = await grab(() =>
    routing.create({
      branchId: String(A.id),
      isFallback: true,
      sourceKey: "x",
    }),
  );
  check("Zaxira + manba birga RAD ETILADI", fallbackWithSource.err !== null);

  const dupSource = await grab(() =>
    routing.create({ branchId: String(B.id), sourceKey: "telegram_yunusobod" }),
  );
  check("Takroriy manba+filial RAD ETILADI", dupSource.err?.statusCode === 409);

  const badBranch = await grab(() =>
    routing.create({
      // Mavjud bo'lmagan filial — Prisma kaliti 24 belgili hex SATR.
      branchId: "f".repeat(24),
      sourceKey: "x",
    }),
  );
  check("Mavjud bo'lmagan filial RAD ETILADI", badBranch.err?.statusCode === 400);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) MANBA - LeadOption ObjectId bilan\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // ⚠ QOIDA KALITI VARIANT NOMIDAN KELTIRIB CHIQARILADI.
  //
  // `resolveSourceKey()` LeadOption ID sini uning NOMIGA aylantiradi
  // (`name.trim().toLowerCase()`). Fixture nomi suffiks bilan bo'lgani
  // uchun kalitni qattiq "instagram" deb yozib bo'lmaydi — aks holda
  // qoida hech qachon mos kelmasdi va test o'zining fixture'i tufayli
  // yiqilardi (mantiq esa to'g'ri ishlayotgan bo'lardi).
  const optName = `Instagram-${fx.suffix}`;
  const optKey = optName.trim().toLowerCase();
  const opt = await prisma.leadOption.create({
    data: { kind: "source", name: optName },
  });
  fx.track("leadOption", opt.id);
  await routing.create({
    branchId: String(A.id),
    sourceKey: optKey,
    priority: 10,
  });

  const byOption = await routing.route({ source: String(opt.id) });
  check(
    "LeadOption ID manba nomiga aylantiriladi",
    String(byOption.branchId) === String(A.id) && byOption.matchedBy === "source",
    `matchedBy=${byOption.matchedBy} — bot ID, operator matn yuboradi; ikkalasi ham ishlashi kerak`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m6) QOIDANI O'CHIRISH / NOFAOL QILISH\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const rules = await routing.list();
  check("Ro'yxat qaytadi", rules.length === 3, `${rules.length} ta qoida`);
  check(
    "Zaxira qoida oxirida turadi",
    rules[rules.length - 1].isFallback === true,
    "ro'yxatda tartib yechim tartibini aks ettirishi kerak",
  );

  // ⚠ Kalit fixture suffiksi bilan — qattiq "instagram" deb qidirilsa
  // `target` `undefined` bo'lardi.
  const target = rules.find((r) => r.sourceKey === optKey);
  await routing.update(String(target.id), { isActive: false });
  const afterDisable = await routing.route({ source: optKey });
  check(
    "Nofaol qoida qo'llanmaydi - zaxiraga tushadi",
    afterDisable.matchedBy === "fallback",
    `matchedBy=${afterDisable.matchedBy}`,
  );

  await routing.remove(String(target.id));
  check("Qoida o'chirildi", (await routing.list()).length === 2);

};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    // ⚠ Qoidalarni AVVAL o'chiramiz: ular filialga FK bilan bog'langan.
    await prisma.leadRoutingRule.deleteMany({ where: { branchId: { in: [String(fxBranchId)] } } })
      .catch(() => {});
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
        `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
    );
    if (R.fail) {
      console.log("\nYiqilganlar:");
      R.notes.forEach((n) => console.log(`  • ${n}`));
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
