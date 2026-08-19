/**
 * OCHILGAN ROUTE'LAR - FILIAL CHEGARASI (Faza 1).
 *
 * KONTEKST: bir qator amallar `requireRole(OWNER)` dan `requirePermission`
 * ga ko'chirildi - filial rahbari o'z filialida ishlay olishi uchun.
 *
 * XAVF: o'sha route'lar owner-only bo'lgani uchun servis qatlamida
 * FILIAL TEKSHIRUVI YO'Q edi (owner baribir hammasini ko'rardi).
 * Ruxsatga ochilgan zahoti ular "boshqa filial ma'lumotini tahrirlash"
 * teshigiga aylanadi.
 *
 * BU TEST har bir ochilgan amalni A filial direktori sifatida B filial
 * obyektiga qo'llab ko'radi va TO'SILISHINI kutadi (403 yoki 404 —
 * pastdagi `mustBlock` izohiga qarang).
 *
 * NEGA MUHIM: bu tekshiruvlar route qatlamida EMAS, SERVIS qatlamida
 * turadi. Route'ni ochish oson va e'tiborsiz qilinadi - servisdagi
 * to'siq esa yagona haqiqiy himoya.
 *
 * IZOLYATSIYA: o'z test bazasini yaratadi va oxirida O'CHIRADI.
 *
 * ISHLATISH:
 *   npm run test:opened-routes
 */
import "dotenv/config";
import mongoose from "mongoose";

const BASE = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
const DB = BASE.replace(/\/([^/?]+)(\?|$)/, "/bayyina_opened_routes_test$2");

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
const grab = async (fn) => {
  try {
    const value = await fn();
    return { value, err: null };
  } catch (err) {
    return { value: null, err };
  }
};

/**
 * Amal B filialga tegishli obyektda TO'SILISHI shart.
 *
 * ══════════════════════════════════════════════════════════════════════
 * NEGA 403 EMAS, «403 YOKI 404»
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu test dastlab qat'iy 403 kutardi va o'n bir joyda yiqilardi —
 * hammasida javob 404 («Foydalanuvchi topilmadi») edi. Tekshirilganda
 * ma'lum bo'ldiki, bu NOSOZLIK EMAS: servislar filial shartini
 * SO'ROVNING O'ZIGA qo'shadi (`findFirst({ id, ...branchCondition })`),
 * ya'ni begona qator umuman TOPILMAYDI va 404 chiqadi.
 *
 * Va 404 bu yerda 403 dan XAVFSIZROQ:
 *
 *   403 = «bu ID mavjud, lekin sizniki emas»  ← ma'lumot sizadi
 *   404 = «bunday narsa yo'q»                  ← hech narsa aytmaydi
 *
 * 403 bilan A filiali direktori ID'larni bittalab sinab, B filialida
 * qaysi o'quvchi/guruh BOR ekanini sanab chiqa olardi. Bu — klassik
 * obyekt sanash (enumeration) zaifligi.
 *
 * ── TEST BO'SHASHIB QOLMAYDI ──
 * Obyekt test boshida HAQIQATAN yaratiladi, ya'ni u MAVJUD. Shu
 * sababli bu yerdagi 404 «yo'q narsa» degani emas, «sizdan
 * yashirilgan» degani. Eng muhimi: uchinchi holat — amal MUVAFFAQIYATLI
 * bajarilishi — avvalgidek SIZISH deb baholanadi.
 *
 * ── XABAR MAZMUNI HAM TEKSHIRILADI ──
 * Xato matni obyekt haqida tafsilot bermasligi kerak (ism, telefon,
 * filial nomi). Aks holda 404 ning butun ma'nosi yo'qolardi.
 */
const LEAKY = /\b(?:filial|branch)\s*[:=]|telefon|\+998/i;

const mustBlock = async (name, fn) => {
  const { err } = await grab(fn);
  if (err?.statusCode === 403 || err?.statusCode === 404) {
    if (LEAKY.test(err.message || "")) {
      return bad(name, `to'sildi (${err.statusCode}), lekin xabar tafsilot sizdirdi: ${err.message}`);
    }
    return ok(name, `${err.statusCode}: ${err.message}`);
  }
  if (err) return bad(name, `kutilgan 403/404, kelgani ${err.statusCode}: ${err.message}`);
  return bad(name, "SIZISH - amal bajarildi, hech qanday xato yo'q");
};

/** O'Z filialidagi obyektda amal ISHLASHI shart (403 bo'lmasligi). */
const mustAllow = async (name, fn) => {
  const { err } = await grab(fn);
  if (err?.statusCode === 403) return bad(name, `o'z filialida ham to'sildi: ${err.message}`);
  return ok(name);
};

const run = async () => {
  if (DB === BASE) throw new Error("Test bazasi nomi ajratilmadi - to'xtatildi");
  mongoose.set("autoIndex", false);
  await mongoose.connect(DB);
  if (!mongoose.connection.name.includes("opened_routes_test")) {
    throw new Error(`Kutilmagan baza: ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;

  const usersService = await import("../src/modules/users/services/users.service.js");
  const freezeService = await import(
    "../src/modules/studentFreeze/services/studentFreeze.service.js"
  );
  const historyService = await import(
    "../src/modules/activityHistory/services/activityHistory.service.js"
  );

  // ── Ma'lumot: ikki filial, har birida bitta o'quvchi va bitta o'qituvchi ──
  const A = await Branch.create({ name: "A filial", isMain: true });
  const B = await Branch.create({ name: "B filial" });

  const mkUser = async (username, role, branchId) =>
    User.create({
      firstName: username,
      lastName: "Test",
      username,
      passwordHash: "parol-123",
      role,
      homeBranchId: branchId,
    });

  const studentA = await mkUser("student_a", "student", A._id);
  const studentB = await mkUser("student_b", "student", B._id);
  const teacherA = await mkUser("teacher_a", "teacher", A._id);
  const teacherB = await mkUser("teacher_b", "teacher", B._id);

  const groupB = await Group.create({
    name: "B guruh",
    branchId: B._id,
    schedule: [{ day: "mon", startTime: "10:00", endTime: "11:00" }],
    startDate: new Date("2026-01-01"),
  });

  // A filial direktorining ko'lami: FAQAT A.
  const scopeA = {
    allowedBranchIds: [String(A._id)],
    canSeeAllBranches: false,
  };
  // Owner: hamma filial.
  const scopeOwner = { allowedBranchIds: [], canSeeAllBranches: true };

  console.log("\n\x1b[1mOCHILGAN ROUTE'LAR - FILIAL CHEGARASI\x1b[0m");

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) PATCH /users/:id — tahrirlash\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await mustBlock("A direktori B o'qituvchisini TAHRIRLAY olmaydi", () =>
    usersService.update(String(teacherB._id), { firstName: "Buzildi" }, null, scopeA),
  );
  await mustAllow("A direktori O'Z o'qituvchisini tahrirlaydi", () =>
    usersService.update(String(teacherA._id), { firstName: "Yangi" }, null, scopeA),
  );
  await mustAllow("Owner B o'qituvchisini tahrirlaydi", () =>
    usersService.update(String(teacherB._id), { firstName: "Owner" }, null, scopeOwner),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) DELETE /users/:id + restore — arxivlash\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await mustBlock("A direktori B o'qituvchisini ARXIVLAY olmaydi", () =>
    usersService.softRemove(String(teacherB._id), { scope: scopeA }),
  );
  await mustBlock("A direktori B o'qituvchisini TIKLAY olmaydi", () =>
    usersService.restore(String(teacherB._id), { scope: scopeA }),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) /users/:id/password — parol\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // DIQQAT: parolda ko'lam BOSHQACHA hisoblanadi - aktyorning HAQIQIY
  // filiallari bazadan o'qiladi (credentialScope.helper.js), chunki
  // `branches.view_all` allowedBranchIds ro'yxatining o'zini kengaytiradi.
  const directorA = await mkUser("director_a", "teacher", A._id);

  await mustBlock("A direktori B o'qituvchisining parolini O'QIY olmaydi", () =>
    usersService.getPassword(String(teacherB._id), {
      actorId: String(directorA._id),
      isOwner: false,
    }),
  );
  await mustBlock("A direktori B o'qituvchisining parolini ALMASHTIRA olmaydi", () =>
    usersService.setPassword(String(teacherB._id), "yangi-parol-123", {
      actorId: String(directorA._id),
      isOwner: false,
    }),
  );
  await mustAllow("A direktori O'Z o'qituvchisining parolini o'qiydi", () =>
    usersService.getPassword(String(teacherA._id), {
      actorId: String(directorA._id),
      isOwner: false,
    }),
  );

  // EKSPLUATATSIYA: soxta keng ro'yxat berib ko'ramiz. Servis unga
  // ISHONMASLIGI kerak - u aktyorning haqiqiy filiallarini o'zi o'qiydi.
  await mustBlock(
    "Soxta keng ko'lam berilsa ham parol ochilmaydi (servis ro'yxatga ishonmaydi)",
    () =>
      usersService.getPassword(String(teacherB._id), {
        actorId: String(directorA._id),
        isOwner: false,
        allowedBranchIds: [String(A._id), String(B._id)],
        canSeeAllBranches: true,
      }),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) /student-freezes — muzlatish\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await mustBlock("A direktori B o'quvchisini MUZLATA olmaydi", () =>
    freezeService.freeze(String(studentB._id), { scope: scopeA }),
  );
  await mustBlock("A direktori B o'quvchisini muzlatishdan CHIQARA olmaydi", () =>
    freezeService.unfreeze(String(studentB._id), { scope: scopeA }),
  );
  await mustBlock("A direktori B o'quvchisining muzlatish TARIXINI ko'ra olmaydi", () =>
    freezeService.listForStudent(String(studentB._id), scopeA),
  );
  await mustAllow("A direktori O'Z o'quvchisining tarixini ko'radi", () =>
    freezeService.listForStudent(String(studentA._id), scopeA),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) /activity-history — timeline\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await mustBlock("A direktori B o'quvchisining timeline'ini ko'ra olmaydi", () =>
    historyService.getStudentTimeline(String(studentB._id), { scope: scopeA }),
  );
  await mustAllow("A direktori O'Z o'quvchisining timeline'ini ko'radi", () =>
    historyService.getStudentTimeline(String(studentA._id), { scope: scopeA }),
  );
  await mustBlock("A direktori B guruhining timeline'ini ko'ra olmaydi", () =>
    historyService.getGroupTimeline(String(groupB._id), { scope: scopeA }),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m6) Kontekstsiz chaqiruv (job/seed) to'silmaydi\x1b[0m");
  // ─────────────────────────────────────────────────────────

  await mustAllow("scope berilmasa tekshiruv o'tkazib yuboriladi (job/seed)", () =>
    usersService.update(String(teacherB._id), { firstName: "Job" }, null, null),
  );

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
