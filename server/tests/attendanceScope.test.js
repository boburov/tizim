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
 * O'Z BAZASIDA ishlaydi (lc_scope_mw_test) va oxirida o'chiradi.
 *
 * ISHLATISH:  npm run test:scope-mw
 */
import "dotenv/config";
import mongoose from "mongoose";

import { ROLE_TYPES } from "../src/constants/roles.js";
import { PERMISSIONS } from "../src/constants/permissions.js";

const TEST_DB = "mongodb://127.0.0.1:27017/lc_scope_mw_test";

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
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const GroupMembership = (await import("../src/models/groupMembership.model.js")).default;
  const { requireGroupAccess, requireStudentAccess } = await import(
    "../src/middleware/attendanceScope.js"
  );

  // ─── Fixture: 2 filial, har birida guruh + o'quvchi ───
  const A = await Branch.create({ name: "A-FILIAL", isMain: true });
  const B = await Branch.create({ name: "B-FILIAL" });

  const mkUser = (name, role, branchId) =>
    User.create({
      firstName: name,
      lastName: "Test",
      username: name.toLowerCase(),
      passwordHash: "x",
      role,
      homeBranchId: branchId,
      isActive: true,
    });

  const teacher = await mkUser("TeacherA", "teacher", A._id);
  const studA = await mkUser("StudentA", "student", A._id);
  const studB = await mkUser("StudentB", "student", B._id);
  const director = await mkUser("DirectorA", "director", A._id);

  const gA = await Group.create({
    branchId: A._id,
    name: "GROUP-A",
    isActive: true,
    teachers: [teacher._id],
  });
  const gB = await Group.create({ branchId: B._id, name: "GROUP-B", isActive: true });

  await GroupMembership.create({ student: studA._id, group: gA._id });
  await GroupMembership.create({ student: studB._id, group: gB._id });

  // requireAuth qanday req yasasa - shunday. `role` = EFFEKTIV rol hujjati.
  const reqAs = (user, roleType, { branchIds = [], all = false, perms = [] } = {}) => ({
    user,
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
    requireGroupAccess(() => gA._id),
    reqAs(director, ROLE_TYPES.STAFF, { branchIds: [A._id], perms: DIRECTOR_PERMS }),
  );

  await expectDeny(
    "direktor BOSHQA filial guruhiga kira olmaydi",
    requireGroupAccess(() => gB._id),
    reqAs(director, ROLE_TYPES.STAFF, { branchIds: [A._id], perms: DIRECTOR_PERMS }),
  );

  await expectAllow(
    "owner har qanday guruhga kiradi",
    requireGroupAccess(() => gB._id),
    reqAs(director, ROLE_TYPES.OWNER, { branchIds: [A._id], perms: ["*"] }),
  );

  await expectAllow(
    "branches.view_all bo'lgan xodim boshqa filialga kiradi",
    requireGroupAccess(() => gB._id),
    reqAs(director, ROLE_TYPES.STAFF, {
      branchIds: [A._id],
      perms: [...DIRECTOR_PERMS, PERMISSIONS.BRANCHES_VIEW_ALL],
    }),
  );

  await expectAllow(
    "o'qituvchi O'Z guruhiga kiradi",
    requireGroupAccess(() => gA._id),
    reqAs(teacher, ROLE_TYPES.TEACHER, { branchIds: [A._id] }),
  );

  await expectDeny(
    "o'qituvchi begona guruhga kira olmaydi",
    requireGroupAccess(() => gB._id),
    reqAs(teacher, ROLE_TYPES.TEACHER, { branchIds: [A._id] }),
  );

  await expectDeny(
    "o'quvchi guruh davomatiga kira olmaydi",
    requireGroupAccess(() => gA._id),
    reqAs(studA, ROLE_TYPES.STUDENT, { branchIds: [A._id] }),
  );

  // Filialsiz xodim - fail-closed (branchFilter() dagi qoida bilan bir xil).
  await expectDeny(
    "filialga biriktirilmagan xodim hech narsa ko'rmaydi",
    requireGroupAccess(() => gA._id),
    reqAs(director, ROLE_TYPES.STAFF, { branchIds: [], perms: DIRECTOR_PERMS }),
  );

  // ─── 2. O'QUVCHIGA KIRISH ───
  head("2) requireStudentAccess");

  const rDirA = reqAs(director, ROLE_TYPES.STAFF, {
    branchIds: [A._id],
    perms: DIRECTOR_PERMS,
  });
  await expectAllow(
    "direktor O'Z filiali o'quvchisini ko'radi",
    requireStudentAccess(() => studA._id),
    rDirA,
  );
  // Ko'lam guruhlari o'rnatilgan bo'lishi shart: aks holda hisobot boshqa
  // filialdagi a'zolikni ham qo'shib yuborardi.
  if (Array.isArray(rDirA.scopeGroupIds)) {
    const ids = rDirA.scopeGroupIds.map(String);
    if (ids.includes(String(gA._id)) && !ids.includes(String(gB._id))) {
      ok("scopeGroupIds faqat A filial guruhlari", `${ids.length} guruh`);
    } else {
      bad("scopeGroupIds faqat A filial guruhlari", `olindi: ${ids.join(", ")}`);
    }
  } else {
    bad("scopeGroupIds faqat A filial guruhlari", `massiv emas: ${rDirA.scopeGroupIds}`);
  }

  await expectDeny(
    "direktor BOSHQA filial o'quvchisini ko'ra olmaydi",
    requireStudentAccess(() => studB._id),
    reqAs(director, ROLE_TYPES.STAFF, { branchIds: [A._id], perms: DIRECTOR_PERMS }),
  );

  await expectAllow(
    "o'quvchi O'ZINI ko'radi",
    requireStudentAccess(() => studA._id),
    reqAs(studA, ROLE_TYPES.STUDENT, { branchIds: [A._id] }),
  );

  await expectDeny(
    "o'quvchi BOSHQANI ko'ra olmaydi",
    requireStudentAccess(() => studB._id),
    reqAs(studA, ROLE_TYPES.STUDENT, { branchIds: [A._id] }),
  );

  await expectAllow(
    "o'qituvchi o'z guruhidagi o'quvchini ko'radi",
    requireStudentAccess(() => studA._id),
    reqAs(teacher, ROLE_TYPES.TEACHER, { branchIds: [A._id] }),
  );

  await expectDeny(
    "o'qituvchi begona o'quvchini ko'ra olmaydi",
    requireStudentAccess(() => studB._id),
    reqAs(teacher, ROLE_TYPES.TEACHER, { branchIds: [A._id] }),
  );

  // ─── Yakun ───
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
