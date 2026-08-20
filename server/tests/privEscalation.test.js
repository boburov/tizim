/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMTIYOZ OSHIRISH TESTI — "direktor qayerda owner'ga aylanadi?"
 *
 * ── NIMANI ISBOTLAYDI (o'zgarmadi) ──
 *
 * Parollar OCHIQ MATNDA saqlanadi (`User.passwordHash` — tarixiy nom,
 * ichida ochiq parol). `requireRole("owner")` da UCHINCHI yo'l bor:
 * `system.admin_access` ruxsati ham O'TKAZADI. Va eski
 * `assertTargetInScope` `canSeeAllBranches` bo'lsa DARHOL qaytardi.
 *
 * Ya'ni bitta rolda `system.admin_access` + `branches.view_all` birga
 * bo'lsa, o'sha rol BARCHA filialdagi BARCHA xodim parolini o'qiy olardi.
 * Aynan shu ikkisi jonli bazada "director" roliga berib qo'yilgan edi.
 *
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * 1) BAZA. Ilgari alohida Mongo bazasi (`lc_priv_test`) ochilib, oxirida
 *    `dropDatabase()` qilinardi. PostgreSQL'da bu naqsh ishlamaydi
 *    (migratsiya + `DATABASE_URL` ga bog'langan yagona klient), shuning
 *    uchun izolyatsiya PREFIKSLI FIXTURE + kafolatli tozalash bilan —
 *    qarang `tests/helpers/prismaFixtures.js`.
 *
 * 2) SERVIS SHARTNOMASI. `getPassword(id, currentUser)` endi
 *    `{ allowedBranchIds, canSeeAllBranches }` EMAS,
 *    `{ actorId, isOwner }` oladi (`credentialScope`). Bu aynan shu test
 *    ochgan teshikni yopish uchun qilingan tuzatish: servis uzatilgan
 *    ko'lamga ISHONMAYDI va aktyorning haqiqiy filiallarini o'zi o'qiydi.
 *
 * ⚠ XAVFSIZLIK DA'VOLARI O'ZGARMADI. Ikkala ssenariy ham saqlangan:
 *    A) DRIFT — jonli bazadagidek (view_all + admin_access)
 *    B) SEED  — `permissions.seed.js` shabloni bo'yicha
 *
 * ── NEGATIV NAZORAT (yangi) ──
 *
 * Test QOIDA CHETLAB O'TILGANDA YIQILISHINI ko'rsatishi kerak. Shuning
 * uchun ESKI (zaif) tekshiruv ham yonma-yon yuritiladi:
 * `assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, ...)`
 * — u DRIFT ruxsatlari bilan O'TKAZIB YUBORISHI SHART. O'tkazmasa,
 * demak test endi teshikni sezmayapti va uning o'zi buzuq.
 *
 * ISHLATISH:  npm run test:priv
 * ═══════════════════════════════════════════════════════════════════════════
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";

import { PERMISSIONS } from "../src/constants/permissions.js";
import { ROLES, ROLE_TYPES } from "../src/constants/roles.js";
import {
  resolveBranchScope,
  assertTargetInScope,
} from "../src/helpers/branchAccess.helper.js";
import { createFixtures, finishFixtures } from "./helpers/prismaFixtures.js";
import * as usersService from "../src/modules/users/services/users.service.js";

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

/** `requireRole(...)` middleware'ining mantiqini AYNAN takrorlaydi. */
const passesRequireRoleOwner = ({ userRole, roleType, permissions }) => {
  if (userRole === ROLES.OWNER) return true;
  if (roleType && roleType === ROLES.OWNER) return true;
  return permissions.includes(PERMISSIONS.SYSTEM_ADMIN_ACCESS);
};

const fx = createFixtures();

const run = async () => {
  // ── Ikki filial: A (hujumchining filiali) va B (qurbon filiali) ──
  const A = await fx.branch("A-FILIAL");
  const B = await fx.branch("B-FILIAL");

  const mkUser = (name, role, branchId, pwd) =>
    fx.user(name, {
      firstName: name,
      lastName: "Test",
      passwordHash: pwd, // OCHIQ MATN — tizim shunday saqlaydi
      role,
      homeBranchId: branchId,
      isActive: true,
    });

  // Qurbonlar: B filialda o'qituvchi, va owner.
  const victimTeacherB = await mkUser("TeacherB", ROLES.TEACHER, B.id, "MAXFIY-B-123");
  const ownerUser = await mkUser("TheOwner", ROLES.OWNER, A.id, "OWNER-SIRI-999");
  // Hujumchi: A filial direktori.
  const director = await mkUser("DirectorA", "director", A.id, "dir-parol");
  // MUSBAT NAZORAT uchun: A filialda (hujumchi bilan BIR filialda) xodim.
  const peerA = await mkUser("PeerA", ROLES.TEACHER, A.id, "PEER-A-777");

  const DRIFT_PERMS = [
    PERMISSIONS.SYSTEM_ADMIN_ACCESS,
    PERMISSIONS.BRANCHES_VIEW_ALL,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_PASSWORD,
  ];
  const SEED_PERMS = [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.USERS_PASSWORD,
  ];

  /**
   * Hujum urinishi.
   *
   * `gate` — route qatlami (`requireRole`/`requirePermission`).
   * `getPassword` — servis qatlami (`credentialScope`).
   *
   * ⚠ Aktyor `{ actorId, isOwner }` sifatida uzatiladi — bu HTTP
   * qatlamidagi `credentialScope(req)` ning aynan natijasi.
   */
  const attempt = async (targetId, perms) => {
    const scope = await resolveBranchScope({
      user: director,
      permissions: perms,
      requestedBranchId: null,
    });

    const gate = passesRequireRoleOwner({
      userRole: director.role,
      roleType: ROLE_TYPES.STAFF,
      permissions: perms,
    });
    if (!gate) return { blockedAt: "requireRole", scope };

    try {
      const data = await usersService.getPassword(String(targetId), {
        actorId: String(director.id),
        // Direktor HAQIQIY owner emas — `roleType === "staff"`.
        isOwner: false,
      });
      return { leaked: data, scope };
    } catch (err) {
      return { blockedAt: `servis (${err.statusCode}: ${err.message})`, scope };
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // MUSBAT NAZORAT — TEST HAQIQATAN SERVISGACHA YETADIMI
  //
  // Busiz pastdagi "sizmadi" natijasi HECH NARSANI isbotlamasdi: agar
  // `getPassword` har doim xato tashlasa (yoki fixture buzuq bo'lsa) test
  // ham yashil bo'lardi. Shuning uchun avval RUXSAT ETILGAN yo'l
  // ko'rsatiladi: direktor O'Z filialidagi xodim parolini O'QIY OLADI.
  // ═══════════════════════════════════════════════════════════════════
  head("0) MUSBAT NAZORAT — ruxsat etilgan yo'l ishlaydi");
  const control = await attempt(peerA.id, DRIFT_PERMS);
  if (control.leaked?.password === "PEER-A-777") {
    ok("direktor O'Z filialidagi xodim parolini o'qiydi", `"${control.leaked.password}"`);
  } else {
    bad(
      "MUSBAT NAZORAT YIQILDI",
      `o'z filialidagi parol o'qilmadi (${control.blockedAt || "kutilmagan javob"}) — ` +
        `pastdagi tekshiruvlar ENDI HECH NARSANI isbotlamaydi`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // NEGATIV NAZORAT — TEST TESHIKNI SEZA OLADIMI
  //
  // Eski (zaif) tekshiruv AYNAN shu ma'lumot bilan chaqiriladi. U
  // O'TKAZIB YUBORISHI SHART — chunki `branches.view_all`
  // `canSeeAllBranches` ni yoqadi va eski `assertTargetInScope` shunda
  // darhol qaytadi.
  //
  // Agar bu chaqiruv XATO tashlasa, demak fixture yoki ko'lam noto'g'ri
  // qurilgan va pastdagi "sizmadi" natijasi ham ma'nosiz bo'lardi.
  // ═══════════════════════════════════════════════════════════════════
  head("0b) NEGATIV NAZORAT — chetlab o'tilgan qoida SEZILADI");
  {
    const scope = await resolveBranchScope({
      user: director,
      permissions: DRIFT_PERMS,
      requestedBranchId: null,
    });
    const victimRow = await prisma.user.findUnique({
      where: { id: victimTeacherB.id },
      select: {
        role: true,
        homeBranchId: true,
        branchAssignments: { select: { branchId: true, role: true } },
      },
    });
    let bypassed = false;
    try {
      // ESKI, ZAIF WIRING: so'rovdan kelgan ko'lamga ishonish.
      assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, victimRow);
      bypassed = true;
    } catch {
      bypassed = false;
    }
    if (bypassed) {
      ok(
        "eski wiring (`canSeeAllBranches`) B filial xodimini O'TKAZIB YUBORADI",
        `canSeeAll=${scope.canSeeAllBranches}, filiallar=${scope.allowedBranchIds.length}`,
      );
    } else {
      bad(
        "NEGATIV NAZORAT YIQILDI",
        "eski zaif tekshiruv ham to'sdi — test endi teshikni ajrata olmaydi " +
          "(fixture yoki ko'lam noto'g'ri qurilgan)",
      );
    }
  }

  // ═══════════════════ A) DRIFT ═══════════════════
  head("A) DRIFT holati — jonli bazadagi direktor (view_all + admin_access)");
  const drift = await attempt(victimTeacherB.id, DRIFT_PERMS);
  console.log(
    `  \x1b[2mko'lam: canSeeAll=${drift.scope.canSeeAllBranches}, ` +
      `ruxsat etilgan filiallar=${drift.scope.allowedBranchIds.length}\x1b[0m`,
  );
  if (drift.leaked) {
    bad(
      "A direktori B filial o'qituvchisi parolini OLA OLMAYDI",
      `PAROL SIZDI → ${drift.leaked.username} : "${drift.leaked.password}"`,
    );
  } else {
    ok("A direktori B filial o'qituvchisi parolini ola olmaydi", drift.blockedAt);
  }

  // Owner paroli ALOHIDA himoyalangan (`role === owner` → 403).
  const ownerAttempt = await attempt(ownerUser.id, DRIFT_PERMS);
  if (ownerAttempt.leaked) {
    bad("owner paroli himoyalangan", `OWNER PAROLI SIZDI → "${ownerAttempt.leaked.password}"`);
  } else {
    ok("owner paroli himoyalangan", ownerAttempt.blockedAt);
  }

  // ═══════════════════ B) SEED ═══════════════════
  head("B) SEED holati — permissions.seed.js shabloni bo'yicha direktor");
  const seeded = await attempt(victimTeacherB.id, SEED_PERMS);
  console.log(
    `  \x1b[2mko'lam: canSeeAll=${seeded.scope.canSeeAllBranches}, ` +
      `ruxsat etilgan filiallar=${seeded.scope.allowedBranchIds.length}\x1b[0m`,
  );
  if (seeded.leaked) {
    bad(
      "SEED direktori ham parolni ola olmaydi",
      `PAROL SIZDI → "${seeded.leaked.password}" (shablonning o'zi ham xavfli!)`,
    );
  } else {
    ok("SEED direktori parolni ola olmaydi", seeded.blockedAt);
  }

  // ═══════════════════ C) PAROL ALMASHTIRISH ═══════════════════
  //
  // O'QISH bilan bir xil chegara: begona filial xodimining parolini
  // ALMASHTIRISH ham o'sha hisobga kirishni beradi.
  head("C) Parolni ALMASHTIRISH ham bir xil chegarada");
  try {
    await usersService.setPassword(String(victimTeacherB.id), "BOSQINCHI-123", {
      actorId: String(director.id),
      isOwner: false,
    });
    bad(
      "A direktori B filial xodimining parolini almashtira olmaydi",
      "PAROL ALMASHTIRILDI — hisob egallandi",
    );
  } catch (err) {
    ok(
      "A direktori B filial xodimining parolini almashtira olmaydi",
      `${err.statusCode}: ${err.message}`,
    );
  }

  // Qurbonning paroli HAQIQATAN o'zgarmaganini tasdiqlaymiz.
  const after = await prisma.user.findUnique({
    where: { id: victimTeacherB.id },
    omit: { passwordHash: false },
  });
  if (after?.passwordHash === "MAXFIY-B-123") {
    ok("qurbonning paroli o'zgarmagan (bazadan tasdiqlandi)");
  } else {
    bad("qurbonning paroli o'zgargan", `bazada: "${after?.passwordHash}"`);
  }
};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    await finishFixtures(fx, { ok, bad });
    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} zaiflik\x1b[0m`,
    );
    if (R.failures.length) {
      console.log("\n\x1b[31mZaifliklar:\x1b[0m");
      for (const f of R.failures) console.log(`  • ${f}`);
    }
    await prisma.$disconnect();
    process.exit(R.fail ? 1 : 0);
  });
