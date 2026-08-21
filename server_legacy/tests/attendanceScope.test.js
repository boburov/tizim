/**
 * DAVOMAT / BAHO KO'LAMI MIDDLEWARE TESTI.
 *
 * SAVOL: "Direktorda ATTENDANCE_READ bor - demak davomatni ko'radi, shundaymi?"
 *
 * YO'Q edi. requirePermission ruxsatni tekshiradi va o'tkazadi, keyin
 * attendanceScope.js rol NOMINI uchta built-in satr bilan solishtirardi
 * (owner/teacher/student). "Filial direktori" hech qaysisiga to'g'ri
 * kelmay, oxirgi `return 403` ga yiqilardi. Matritsada BARCHA ruxsat
 * belgilangan bo'lsa ham "Ruxsat etilmagan" chiqardi - chunki to'siq
 * ruxsatda emas, ROL NOMIDA edi.
 *
 * Bu test ikki tomonni ham qo'riqlaydi:
 *   1. XODIM O'TADI    - direktor o'z filiali guruhiga kira oladi;
 *   2. FILIAL YOPIQ    - lekin BOSHQA filial guruhiga kira olmaydi.
 *
 * Ikkinchisi birinchisidan muhimroq: "hamma staff'ni o'tkazib yuborish"
 * bug'ni yopadi, lekin filiallararo sizish ochadi.
 *
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Ilgari alohida Mongo bazasi (`lc_scope_mw_test`) + `dropDatabase()`.
 * Endi PREFIKSLI FIXTURE + kafolatli tozalash
 * (`tests/helpers/prismaFixtures.js`). Sinalayotgan middleware
 * (`attendanceScope.js`) va uning DA'VOLARI o'zgarmadi.
 *
 * `Group.teachers` massiv edi → ko'p-ko'pga bog'lanish (`connect`).
 * `GroupMembership.{student,group}` → `{studentId,groupId}`.
 *
 * ISHLATISH:  npm run test:scope-mw
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";

import { ROLE_TYPES } from "../src/constants/roles.js";
import { PERMISSIONS } from "../src/constants/permissions.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

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

// Middleware'ni chaqirib, natijani {allowed, status, message} ga aylantiradi.
const call = (mw, req) =>
  new Promise((resolve, reject) => {
    mw(req, {}, (err) => {
      if (!err) return resolve({ allowed: true });
      if (err instanceof Error && err.statusCode) {
        return resolve({ allowed: false, status: err.statusCode, message: err.message });
      }
      return reject(err);
    });
  });

const expectAllow = async (name, mw, req) => {
  const r = await call(mw, req);
  if (r.allowed) ok(name);
  else bad(name, `${r.status} "${r.message}"`);
  return r;
};

const expectDeny = async (name, mw, req) => {
  const r = await call(mw, req);
  if (!r.allowed && r.status === 403) ok(name, r.message);
  else bad(name, r.allowed ? "O'TKAZIB YUBORDI!" : `kutilmagan ${r.status}`);
  return r;
};

const run = async () => {
  const { requireGroupAccess, requireStudentAccess } = await import(
    "../src/middleware/attendanceScope.js"
  );

  // ─── Fixture: 2 filial, har birida guruh + o'quvchi ───
  const A = await fx.branch("A-FILIAL");
  const B = await fx.branch("B-FILIAL");

  const mkUser = (name, role, branchId) =>
    fx.user(name.toLowerCase(), {
      firstName: name,
      lastName: "Test",
      passwordHash: "x",
      role,
      homeBranchId: branchId,
      isActive: true,
    });

  const teacher = await mkUser("TeacherA", "teacher", A.id);
  const studA = await mkUser("StudentA", "student", A.id);
  const studB = await mkUser("StudentB", "student", B.id);
  const director = await mkUser("DirectorA", "director", A.id);

  const gA = await fx.group("GROUP-A", A.id, {
    isActive: true,
    teachers: { connect: [{ id: teacher.id }] },
  });
  const gB = await fx.group("GROUP-B", B.id, { isActive: true });

  await fx.membership(gA.id, studA.id);
  await fx.membership(gB.id, studB.id);

  // requireAuth qanday req yasasa - shunday. `role` = EFFEKTIV rol hujjati.
  //
  // ⚠⚠ `_id` TAXALLUSI SHART ⚠⚠
  //
  // `middleware/auth.js:40` `req.user` ni AYNAN shunday quradi:
  //     const user = { ...found, _id: found.id };
  // chunki servislar/middleware'lar hali `req.user._id` ni o'qiydi
  // (`attendanceScope.js` ham: `String(req.user._id)`).
  //
  // Fixture xom Prisma qatorini bergan edi — unda `_id` YO'Q, ya'ni
  // solishtiruv `"undefined"` bilan ketardi. Natijada uchta MUSBAT
  // holat noto'g'ri yiqilardi, MANFIY holatlar esa NOTO'G'RI SABABDAN
  // o'tardi ("hech kim hech narsaga mos kelmadi"). Taxallus qo'shilgach
  // test haqiqiy so'rovni takrorlaydi va ikkala tomon ham ma'noli.
  const asReqUser = (u) => ({ ...u, _id: u.id });

  const reqAs = (user, roleType, { branchIds = [], all = false, perms = [] } = {}) => ({
    user: asReqUser(user),
    role: { roleType },
    permissions: perms,
    allowedBranchIds: branchIds.map(String),
    canSeeAllBranches: all,
  });

  // Direktorda davomat/baho ruxsatlari BOR - ular hech qachon to'siq emas.
  const DIRECTOR_PERMS = [
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_RECORD,
    PERMISSIONS.GRADES_READ,
  ];

  // ─── 1. GURUHGA KIRISH ───
  head("1) requireGroupAccess");

  await expectAllow(
    "direktor O'Z filiali guruhiga kiradi",
    requireGroupAccess(() => gA.id),
    reqAs(director, ROLE_TYPES.STAFF, { branchIds: [A.id], perms: DIRECTOR_PERMS }),
  );

  await expectDeny(
    "direktor BOSHQA filial guruhiga kira olmaydi",
    requireGroupAccess(() => gB.id),
    reqAs(director, ROLE_TYPES.STAFF, { branchIds: [A.id], perms: DIRECTOR_PERMS }),
  );

  await expectAllow(
    "owner har qanday guruhga kiradi",
    requireGroupAccess(() => gB.id),
    reqAs(director, ROLE_TYPES.OWNER, { branchIds: [A.id], perms: ["*"] }),
  );

  await expectAllow(
    "branches.view_all bo'lgan xodim boshqa filialga kiradi",
    requireGroupAccess(() => gB.id),
    reqAs(director, ROLE_TYPES.STAFF, {
      branchIds: [A.id],
      perms: [...DIRECTOR_PERMS, PERMISSIONS.BRANCHES_VIEW_ALL],
    }),
  );

  await expectAllow(
    "o'qituvchi O'Z guruhiga kiradi",
    requireGroupAccess(() => gA.id),
    reqAs(teacher, ROLE_TYPES.TEACHER, { branchIds: [A.id] }),
  );

  await expectDeny(
    "o'qituvchi begona guruhga kira olmaydi",
    requireGroupAccess(() => gB.id),
    reqAs(teacher, ROLE_TYPES.TEACHER, { branchIds: [A.id] }),
  );

  await expectDeny(
    "o'quvchi guruh davomatiga kira olmaydi",
    requireGroupAccess(() => gA.id),
    reqAs(studA, ROLE_TYPES.STUDENT, { branchIds: [A.id] }),
  );

  // Filialsiz xodim - fail-closed (branchFilter() dagi qoida bilan bir xil).
  await expectDeny(
    "filialga biriktirilmagan xodim hech narsa ko'rmaydi",
    requireGroupAccess(() => gA.id),
    reqAs(director, ROLE_TYPES.STAFF, { branchIds: [], perms: DIRECTOR_PERMS }),
  );

  // ─── 2. O'QUVCHIGA KIRISH ───
  head("2) requireStudentAccess");

  const rDirA = reqAs(director, ROLE_TYPES.STAFF, {
    branchIds: [A.id],
    perms: DIRECTOR_PERMS,
  });
  await expectAllow(
    "direktor O'Z filiali o'quvchisini ko'radi",
    requireStudentAccess(() => studA.id),
    rDirA,
  );
  // Ko'lam guruhlari o'rnatilgan bo'lishi shart: aks holda hisobot boshqa
  // filialdagi a'zolikni ham qo'shib yuborardi.
  if (Array.isArray(rDirA.scopeGroupIds)) {
    const ids = rDirA.scopeGroupIds.map(String);
    if (ids.includes(String(gA.id)) && !ids.includes(String(gB.id))) {
      ok("scopeGroupIds faqat A filial guruhlari", `${ids.length} guruh`);
    } else {
      bad("scopeGroupIds faqat A filial guruhlari", `olindi: ${ids.join(", ")}`);
    }
  } else {
    bad("scopeGroupIds faqat A filial guruhlari", `massiv emas: ${rDirA.scopeGroupIds}`);
  }

  await expectDeny(
    "direktor BOSHQA filial o'quvchisini ko'ra olmaydi",
    requireStudentAccess(() => studB.id),
    reqAs(director, ROLE_TYPES.STAFF, { branchIds: [A.id], perms: DIRECTOR_PERMS }),
  );

  await expectAllow(
    "o'quvchi O'ZINI ko'radi",
    requireStudentAccess(() => studA.id),
    reqAs(studA, ROLE_TYPES.STUDENT, { branchIds: [A.id] }),
  );

  await expectDeny(
    "o'quvchi BOSHQANI ko'ra olmaydi",
    requireStudentAccess(() => studB.id),
    reqAs(studA, ROLE_TYPES.STUDENT, { branchIds: [A.id] }),
  );

  await expectAllow(
    "o'qituvchi o'z guruhidagi o'quvchini ko'radi",
    requireStudentAccess(() => studA.id),
    reqAs(teacher, ROLE_TYPES.TEACHER, { branchIds: [A.id] }),
  );

  await expectDeny(
    "o'qituvchi begona o'quvchini ko'ra olmaydi",
    requireStudentAccess(() => studB.id),
    reqAs(teacher, ROLE_TYPES.TEACHER, { branchIds: [A.id] }),
  );

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

    console.log(`\n\x1b[1mNATIJA\x1b[0m  ${R.pass} o'tdi, ${R.fail} yiqildi`);
    for (const f of R.failures) console.log(`  \x1b[31m•\x1b[0m ${f}`);
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
