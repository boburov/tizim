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
import mongoose from "mongoose";

const BASE = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
const DB = BASE.replace(/\/([^/?]+)(\?|$)/, "/bayyina_routing_test$2");

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
  if (DB === BASE) throw new Error("Test bazasi nomi ajratilmadi - to'xtatildi");
  mongoose.set("autoIndex", false);
  await mongoose.connect(DB);
  if (!mongoose.connection.name.includes("routing_test")) {
    throw new Error(`Kutilmagan baza: ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const LeadOption = (await import("../src/models/leadOption.model.js")).default;
  const LeadRoutingRule = (await import("../src/models/leadRoutingRule.model.js")).default;
  await LeadRoutingRule.syncIndexes();

  const routing = await import("../src/modules/leads/services/leadRouting.service.js");

  const A = await Branch.create({ name: "Chilonzor", isMain: true });
  const B = await Branch.create({ name: "Yunusobod" });

  const admin = await User.create({
    firstName: "Admin",
    lastName: "B",
    username: "admin_b",
    passwordHash: "p",
    role: "teacher",
    homeBranchId: B._id,
  });

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) QOIDASIZ HOLAT - lid yo'qolmaydi\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const noRule = await routing.route({ source: "telegram_nomalum" });
  check(
    "Qoida yo'q -> ASOSIY filialga tushadi",
    String(noRule.branchId) === String(A._id) && noRule.matchedBy === "main_branch",
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
    branchId: String(B._id),
    sourceKey: "telegram_yunusobod",
    assigneeId: String(admin._id),
  });

  const bySource = await routing.route({ source: "telegram_yunusobod" });
  check(
    "Manba bo'yicha to'g'ri filialga tushdi",
    String(bySource.branchId) === String(B._id) && bySource.matchedBy === "source",
    `matchedBy=${bySource.matchedBy}`,
  );
  check(
    "Qoidadagi xodimga biriktirildi",
    String(bySource.assigneeId) === String(admin._id),
    "aks holda lid filialda egasiz qolardi",
  );

  // Katta-kichik harf ahamiyatsiz - bot istalgan shaklda yuborishi mumkin.
  const upper = await routing.route({ source: "TELEGRAM_YUNUSOBOD" });
  check(
    "Katta harfli manba ham topiladi",
    String(upper.branchId) === String(B._id),
    "normalizatsiyasiz qoida bir holatda ishlab, boshqasida jimgina o'tkazib yuborardi",
  );

  // Boshqa manba baribir asosiy filialga.
  const other = await routing.route({ source: "instagram" });
  check("Mos kelmagan manba asosiyga tushadi", other.matchedBy === "main_branch");

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) ZAXIRA QOIDA\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await routing.create({ branchId: String(B._id), isFallback: true });

  const fb = await routing.route({ source: "instagram" });
  check(
    "Zaxira qoida ishladi",
    String(fb.branchId) === String(B._id) && fb.matchedBy === "fallback",
    `matchedBy=${fb.matchedBy}`,
  );

  const stillSource = await routing.route({ source: "telegram_yunusobod" });
  check(
    "Manba qoidasi zaxiradan USTUN",
    stillSource.matchedBy === "source",
    `matchedBy=${stillSource.matchedBy}`,
  );

  const dupFallback = await grab(() =>
    routing.create({ branchId: String(A._id), isFallback: true }),
  );
  check(
    "Ikkinchi zaxira qoida RAD ETILADI",
    dupFallback.err?.statusCode === 409,
    "ikkitasi bo'lsa tanlov tasodifiy bo'lib qolardi",
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) VALIDATSIYA\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const noSource = await grab(() => routing.create({ branchId: String(A._id) }));
  check(
    "Manbasiz oddiy qoida RAD ETILADI",
    noSource.err !== null,
    "u hech qachon mos kelmasdi - o'lik qoida",
  );

  const fallbackWithSource = await grab(() =>
    routing.create({
      branchId: String(A._id),
      isFallback: true,
      sourceKey: "x",
    }),
  );
  check("Zaxira + manba birga RAD ETILADI", fallbackWithSource.err !== null);

  const dupSource = await grab(() =>
    routing.create({ branchId: String(B._id), sourceKey: "telegram_yunusobod" }),
  );
  check("Takroriy manba+filial RAD ETILADI", dupSource.err?.statusCode === 409);

  const badBranch = await grab(() =>
    routing.create({
      branchId: String(new mongoose.Types.ObjectId()),
      sourceKey: "x",
    }),
  );
  check("Mavjud bo'lmagan filial RAD ETILADI", badBranch.err?.statusCode === 400);

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) MANBA - LeadOption ObjectId bilan\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const opt = await LeadOption.create({ kind: "source", name: "Instagram" });
  await routing.create({
    branchId: String(A._id),
    sourceKey: "instagram",
    priority: 10,
  });

  const byOption = await routing.route({ source: String(opt._id) });
  check(
    "LeadOption ID manba nomiga aylantiriladi",
    String(byOption.branchId) === String(A._id) && byOption.matchedBy === "source",
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

  const target = rules.find((r) => r.sourceKey === "instagram");
  await routing.update(String(target._id), { isActive: false });
  const afterDisable = await routing.route({ source: "instagram" });
  check(
    "Nofaol qoida qo'llanmaydi - zaxiraga tushadi",
    afterDisable.matchedBy === "fallback",
    `matchedBy=${afterDisable.matchedBy}`,
  );

  await routing.remove(String(target._id));
  check("Qoida o'chirildi", (await routing.list()).length === 2);

  // ── Yakun ──
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

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

run().catch(async (err) => {
  console.error("\x1b[31mTEST YIQILDI:\x1b[0m", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ulanmagan bo'lsa e'tiborsiz */
  }
  process.exit(1);
});
