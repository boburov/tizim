/**
 * IMTIYOZ OSHIRISH TESTI - "direktor qayerda owner'ga aylanadi?"
 *
 * KONTEKST: parollar OCHIQ MATNDA saqlanadi (user.passwordHash maydoni
 * tarixiy nom, ichida ochiq parol). Ularni faqat owner ko'ra oladi:
 *   router.get("/:id/password", requireAuth, requireRole(ROLES.OWNER), ...)
 *
 * LEKIN requireRole'da uchinchi yo'l bor:
 *   requireRole("owner") + `system.admin_access` ruxsati => O'TADI.
 *
 * Va users.service.getPassword'dagi ikkinchi to'siq - assertTargetInScope -
 * `canSeeAllBranches` bo'lsa DARHOL qaytadi (tekshirmaydi).
 *
 * Ya'ni bitta rolda `system.admin_access` + `branches.view_all` birga
 * bo'lsa, o'sha rol BARCHA filialdagi BARCHA xodim parolini o'qiy oladi.
 * Aynan shu ikkisi jonli bazada "director" roliga berib qo'yilgan.
 *
 * Bu test ikkala holatni yonma-yon ko'rsatadi:
 *   A) DRIFT holati   - jonli bazadagidek (view_all + admin_access) -> sizadi
 *   B) SEED holati    - permissions.seed.js shabloni bo'yicha        -> to'siladi
 *
 * O'Z BAZASIDA ishlaydi (lc_priv_test) va oxirida o'chiradi.
 *
 * ISHLATISH:  npm run test:priv
 */
import "dotenv/config";
import mongoose from "mongoose";

import { PERMISSIONS } from "../src/constants/permissions.js";
import { ROLES } from "../src/constants/roles.js";
import { resolveBranchScope } from "../src/helpers/branchAccess.helper.js";

const TEST_DB = "mongodb://127.0.0.1:27017/lc_priv_test";

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

// requireRole(...) middleware'ining mantiqini aynan takrorlaydi.
const passesRequireRoleOwner = ({ userRole, roleType, permissions }) => {
  if (userRole === ROLES.OWNER) return true;
  if (roleType && roleType === ROLES.OWNER) return true;
  return permissions.includes(PERMISSIONS.SYSTEM_ADMIN_ACCESS);
};

const run = async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const usersService = await import("../src/modules/users/services/users.service.js");

  const A = await Branch.create({ name: "A-FILIAL", isMain: true });
  const B = await Branch.create({ name: "B-FILIAL" });

  const mkUser = (name, role, branchId, pwd) =>
    User.create({
      firstName: name,
      lastName: "Test",
      username: name.toLowerCase(),
      passwordHash: pwd, // OCHIQ MATN - tizim shunday saqlaydi
      role,
      homeBranchId: branchId,
      isActive: true,
    });

  // Qurbonlar: B filialda o'qituvchi, va owner.
  const victimTeacherB = await mkUser("TeacherB", "teacher", B._id, "MAXFIY-B-123");
  const ownerUser = await mkUser("TheOwner", ROLES.OWNER, A._id, "OWNER-SIRI-999");

  // Hujumchi: A filial direktori.
  const director = await mkUser("DirectorA", "director", A._id, "dir-parol");

  // ── Ikki ssenariy: DRIFT (jonli baza) va SEED (shablon) ──
  const DRIFT_PERMS = [
    PERMISSIONS.SYSTEM_ADMIN_ACCESS,
    PERMISSIONS.BRANCHES_VIEW_ALL,
    PERMISSIONS.USERS_READ,
  ];
  const SEED_PERMS = [PERMISSIONS.USERS_READ, PERMISSIONS.STUDENTS_READ];

  const attempt = async (label, perms) => {
    const scope = await resolveBranchScope({
      user: director,
      permissions: perms,
      requestedBranchId: null,
    });

    const gate = passesRequireRoleOwner({
      userRole: director.role,
      roleType: "staff",
      permissions: perms,
    });

    if (!gate) {
      return { blockedAt: "requireRole", scope };
    }

    try {
      const data = await usersService.getPassword(String(victimTeacherB._id), {
        allowedBranchIds: scope.allowedBranchIds,
        canSeeAllBranches: scope.canSeeAllBranches,
      });
      return { leaked: data, scope };
    } catch (err) {
      return { blockedAt: `service (${err.statusCode}: ${err.message})`, scope };
    }
  };

  // ─── A) DRIFT: jonli bazadagi direktor ───
  head("A) DRIFT holati - jonli bazadagi direktor (view_all + admin_access)");
  const drift = await attempt("drift", DRIFT_PERMS);
  console.log(
    `  \x1b[2mko'lam: canSeeAll=${drift.scope.canSeeAllBranches}, ruxsat etilgan filiallar=${drift.scope.allowedBranchIds.length}\x1b[0m`,
  );
  if (drift.leaked) {
    bad(
      "A direktori B filial o'qituvchisi parolini OLA OLMAYDI",
      `PAROL SIZDI -> ${drift.leaked.username} : "${drift.leaked.password}"`,
    );
  } else {
    ok("A direktori B filial o'qituvchisi parolini ola olmaydi", drift.blockedAt);
  }

  // Owner paroli alohida himoyalangan (role === owner => 403).
  const ownerAttempt = await (async () => {
    const scope = await resolveBranchScope({
      user: director, permissions: DRIFT_PERMS, requestedBranchId: null,
    });
    try {
      return { leaked: await usersService.getPassword(String(ownerUser._id), {
        allowedBranchIds: scope.allowedBranchIds,
        canSeeAllBranches: scope.canSeeAllBranches,
      }) };
    } catch (err) {
      return { blockedAt: `${err.statusCode}: ${err.message}` };
    }
  })();
  if (ownerAttempt.leaked) {
    bad("owner paroli himoyalangan", `OWNER PAROLI SIZDI -> "${ownerAttempt.leaked.password}"`);
  } else {
    ok("owner paroli himoyalangan", ownerAttempt.blockedAt);
  }

  // ─── B) SEED: shablon bo'yicha direktor ───
  head("B) SEED holati - permissions.seed.js shabloni bo'yicha direktor");
  const seeded = await attempt("seed", SEED_PERMS);
  console.log(
    `  \x1b[2mko'lam: canSeeAll=${seeded.scope.canSeeAllBranches}, ruxsat etilgan filiallar=${seeded.scope.allowedBranchIds.length}\x1b[0m`,
  );
  if (seeded.leaked) {
    bad(
      "SEED direktori ham parolni ola olmaydi",
      `PAROL SIZDI -> "${seeded.leaked.password}" (shablonning o'zi ham xavfli!)`,
    );
  } else {
    ok("SEED direktori parolni ola olmaydi", seeded.blockedAt);
  }

  await mongoose.connection.dropDatabase();
};

run()
  .catch((err) => {
    console.error("\n\x1b[31mTEST YIQILDI:\x1b[0m", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} zaiflik\x1b[0m`,
    );
    if (R.failures.length) {
      console.log("\n\x1b[31mZaifliklar:\x1b[0m");
      for (const f of R.failures) console.log(`  • ${f}`);
    }
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });
