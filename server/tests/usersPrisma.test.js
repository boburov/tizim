/**
 * USERS MODULI — PostgreSQL (Prisma) USTIDA.
 *
 * `tests/authPrisma.test.js` bilan bir xil naqsh: HAQIQIY baza, izolyatsiya
 * qilingan test ma'lumoti, oxirida to'liq tozalash.
 *
 * NEGA AYNAN SHU RO'YXAT: quyidagi xavflarning har biri MongoDB→Prisma
 * ko'chishida JIMGINA buzilishi mumkin edi — ya'ni kod ishlayotgandek
 * ko'rinib, natija noto'g'ri bo'lardi:
 *
 *   1) FILIAL KO'LAMI. `userBranchCondition()` Mongo `$or` dan Prisma `OR`
 *      ga o'tdi. Qidiruv ham `OR` ni band qiladi — ikkinchisi birinchisini
 *      bosib ketsa, filial filtri butunlay yo'qolardi (sizish).
 *   2) PAROL. Mongoose'da `select: false` edi, Prisma'da global `omit`.
 *      Noto'g'ri ko'chirilsa parol HAR BIR javobda ketardi.
 *   3) `_id` SHARTNOMASI. Frontend `u._id`, `u.homeBranchId.name` o'qiydi.
 *      Prisma `id` va alohida `homeBranch` beradi.
 *   4) MAYDON NOMLARI. `{ student: id }` Prisma'da XATO BERMAYDI — u
 *      relation filtri deb o'qiladi va boshqa natija qaytaradi.
 *   5) `undefined` vs `null`. Mongoose'da `= undefined` maydonni o'chirardi,
 *      Prisma'da esa "tegma" degani.
 *   6) IMTIYOZ OSHIRISH. Ko'lam tekshiruvlari `branchAssignments` relation'i
 *      YUKLANGAN bo'lishiga tayanadi — Prisma uni so'ralmasa bermaydi.
 *
 * ISHLATISH:  npm run test:users-prisma
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as usersService from "../src/modules/users/services/users.service.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";
import { ROLES } from "../src/constants/roles.js";

const R = { pass: 0, fail: 0 };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ""}`);
};
const bad = (n, extra = "") => {
  R.fail += 1;
  console.log(`  ❌ ${n}${extra ? ` — ${extra}` : ""}`);
};

// Xato KUTILGANDA: chaqiruv yiqilishi SHART va xabari mos kelishi kerak.
const mustThrow = async (name, fn, match) => {
  try {
    await fn();
    bad(name, "xato kutilgan edi, lekin o'tib ketdi");
  } catch (err) {
    const msg = err?.message || "";
    if (match && !msg.toLowerCase().includes(match.toLowerCase())) {
      bad(name, `boshqa xato: ${msg}`);
    } else {
      ok(name, msg.slice(0, 60));
    }
  }
};

const mustPass = async (name, fn, check) => {
  try {
    const res = await fn();
    const problem = check ? check(res) : null;
    if (problem) bad(name, problem);
    else ok(name);
    return res;
  } catch (err) {
    bad(name, err?.message);
    return null;
  }
};

const SUFFIX = `u${Date.now().toString(36)}`;
const PASSWORD = "Parol12345!";

// Yaratilgan hamma narsa shu yerga yig'iladi va oxirida o'chadi.
const created = { users: [], branches: [], groups: [] };

const cleanup = async () => {
  const uids = created.users.filter(Boolean);
  const gids = created.groups.filter(Boolean);
  if (uids.length) {
    await prisma.payrollAuditLog.deleteMany({
      where: { OR: [{ employeeId: { in: uids } }, { actorId: { in: uids } }] },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: uids } } });
    await prisma.archiveLog.deleteMany({ where: { userId: { in: uids } } });
    await prisma.studentFreeze.deleteMany({ where: { studentId: { in: uids } } });
    await prisma.groupMembership.deleteMany({ where: { studentId: { in: uids } } });
    await prisma.teacherSalary.deleteMany({ where: { teacherId: { in: uids } } });
    await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: uids } } });
  }
  if (gids.length) {
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: gids } } });
    for (const gid of gids) {
      await prisma.group
        .update({ where: { id: gid }, data: { teachers: { set: [] } } })
        .catch(() => {});
    }
    await prisma.group.deleteMany({ where: { id: { in: gids } } });
  }
  if (uids.length) await prisma.user.deleteMany({ where: { id: { in: uids } } });
  if (created.branches.length) {
    await prisma.branch.deleteMany({ where: { id: { in: created.branches } } });
  }
  await prisma.systemNotification.deleteMany({
    where: { message: { contains: SUFFIX } },
  });
};

// Test foydalanuvchisi (servisni chetlab, to'g'ridan-to'g'ri bazaga).
const mkUser = async (data) => {
  const u = await prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      username: data.username,
      passwordHash: data.password || PASSWORD,
      role: data.role,
      homeBranchId: data.homeBranchId,
      hiredAt: data.role === ROLES.TEACHER ? new Date("2024-01-01") : undefined,
      enrolledAt: data.role === ROLES.STUDENT ? new Date("2024-01-01") : undefined,
      ...(data.extraBranchId
        ? { branchAssignments: { create: [{ branchId: data.extraBranchId }] } }
        : {}),
    },
  });
  created.users.push(u.id);
  return u;
};

const run = async () => {
  console.log("\n=== USERS / PRISMA TESTI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  // ── Tayyorgarlik: ikki filial, ularda odamlar ────────────────────
  const branchA = await prisma.branch.create({ data: { name: `A filial ${SUFFIX}` } });
  const branchB = await prisma.branch.create({ data: { name: `B filial ${SUFFIX}` } });
  created.branches.push(branchA.id, branchB.id);

  const dirA = await mkUser({
    firstName: "Direktor", lastName: "Aaa",
    username: `dir_a_${SUFFIX}`, role: "director", homeBranchId: branchA.id,
  });
  const teacherA = await mkUser({
    firstName: "Ustoz", lastName: "Aaa",
    username: `tch_a_${SUFFIX}`, role: ROLES.TEACHER, homeBranchId: branchA.id,
  });
  const teacherB = await mkUser({
    firstName: "Ustoz", lastName: "Bbb",
    username: `tch_b_${SUFFIX}`, role: ROLES.TEACHER, homeBranchId: branchB.id,
  });
  const studentA = await mkUser({
    firstName: "Talaba", lastName: "Aaa",
    username: `std_a_${SUFFIX}`, role: ROLES.STUDENT, homeBranchId: branchA.id,
  });
  // Qo'shimcha filialga biriktirilgan xodim: `branchAssignments` relation'i
  // yuklanmasa, u B filialda "ko'rinmay" qolishi kerak edi.
  const crossUser = await mkUser({
    firstName: "Ikki", lastName: "Filial",
    username: `cross_${SUFFIX}`, role: "reception",
    homeBranchId: branchA.id, extraBranchId: branchB.id,
  });

  const scopeA = { branchId: branchA.id, allowedBranchIds: [branchA.id], canSeeAllBranches: false, userId: dirA.id };
  const scopeB = { branchId: branchB.id, allowedBranchIds: [branchB.id], canSeeAllBranches: false, userId: null };
  const inA = (fn) => runWithBranchContext(scopeA, fn);
  const inB = (fn) => runWithBranchContext(scopeB, fn);

  // ── 1) RO'YXAT + FILIAL KO'LAMI ──────────────────────────────────
  console.log("1) ro'yxat va filial ko'lami");

  await mustPass(
    "kontekstsiz ro'yxat ikkala filial odamini beradi",
    () => usersService.list({ status: "active", limit: 200 }),
    (r) => {
      const ids = r.items.map((u) => u.id);
      return ids.includes(teacherA.id) && ids.includes(teacherB.id)
        ? null
        : "A yoki B filial o'qituvchisi ro'yxatda yo'q";
    },
  );

  await mustPass(
    "A filial konteksti B filial odamini BERMAYDI",
    () => inA(() => usersService.list({ status: "active", limit: 200 })),
    (r) => {
      const ids = r.items.map((u) => u.id);
      if (ids.includes(teacherB.id)) return "B filial o'qituvchisi sizib chiqdi";
      if (!ids.includes(teacherA.id)) return "A filial o'qituvchisi yo'qolib qoldi";
      return null;
    },
  );

  // ENG NOZIK HOLAT: qidiruv `OR` ni band qiladi. Filial sharti `AND` ga
  // qo'shilmasa, bu chaqiruv B filial odamini ham qaytarardi.
  await mustPass(
    "qidiruv + filial sharti BIRGA ishlaydi (OR bosib ketmaydi)",
    () => inA(() => usersService.list({ search: "Ustoz", status: "active", limit: 200 })),
    (r) => {
      const ids = r.items.map((u) => u.id);
      if (ids.includes(teacherB.id)) return "qidiruv filial filtrini yo'q qildi";
      if (!ids.includes(teacherA.id)) return "qidiruv A filial odamini topmadi";
      return null;
    },
  );

  await mustPass(
    "qo'shimcha filialga biriktirilgan xodim B kontekstida ko'rinadi",
    () => inB(() => usersService.list({ staff: true, status: "active", limit: 200 })),
    (r) =>
      r.items.some((u) => u.id === crossUser.id)
        ? null
        : "branchAssignments bo'yicha topilmadi",
  );

  await mustPass(
    "ro'yxatda parol YO'Q",
    () => usersService.list({ status: "active", limit: 50 }),
    (r) =>
      r.items.every((u) => u.passwordHash === undefined)
        ? null
        : "passwordHash javobga tushdi",
  );

  await mustPass(
    "`_id` taxallusi va filial obyekti (frontend shartnomasi)",
    () => inA(() => usersService.list({ staff: true, status: "active", limit: 200 })),
    (r) => {
      const row = r.items.find((u) => u.id === dirA.id);
      if (!row) return "direktor ro'yxatda yo'q";
      if (String(row._id) !== String(row.id)) return "_id taxallusi yo'q";
      if (row.homeBranchId?.name !== branchA.name) {
        return "homeBranchId populate shakli tiklanmadi";
      }
      if (typeof row.activeSessions !== "number") return "activeSessions yo'q";
      if (!row.roleLabel) return "roleLabel yo'q";
      return null;
    },
  );

  await mustPass(
    "o'quvchi qatorida activeGroups/isFrozen bor",
    () => inA(() => usersService.list({ role: ROLES.STUDENT, status: "active", limit: 50 })),
    (r) => {
      const row = r.items.find((u) => u.id === studentA.id);
      if (!row) return "o'quvchi ro'yxatda yo'q";
      if (!Array.isArray(row.activeGroups)) return "activeGroups massiv emas";
      if (row.isFrozen !== false) return "isFrozen noto'g'ri";
      return null;
    },
  );

  await mustPass(
    "staff ro'yxatida o'quvchi YO'Q",
    () => inA(() => usersService.list({ staff: true, status: "active", limit: 200 })),
    (r) =>
      r.items.some((u) => u.id === studentA.id) ? "o'quvchi xodimlar ro'yxatida" : null,
  );

  // ── 2) STATISTIKA ────────────────────────────────────────────────
  console.log("\n2) xodimlar statistikasi");

  await mustPass(
    "staffStats jami = ro'yxatdagi jami (bir xil predikat)",
    async () => {
      const [stats, listed] = await Promise.all([
        inA(() => usersService.staffStats()),
        inA(() => usersService.list({ staff: true, status: "all", limit: 500 })),
      ]);
      return { stats, listed };
    },
    ({ stats, listed }) =>
      stats.total === listed.total
        ? null
        : `stats=${stats.total} list=${listed.total}`,
  );

  await mustPass(
    "staffStats filial bo'yicha kesiladi",
    async () => ({
      a: await inA(() => usersService.staffStats()),
      b: await inB(() => usersService.staffStats()),
    }),
    ({ a, b }) => {
      const dirRowB = b.byRole.find((r) => r.role === "director");
      const dirRowA = a.byRole.find((r) => r.role === "director");
      if (!dirRowA) return "A filialda direktor sanalmadi";
      if (dirRowB && dirRowB.total >= (dirRowA.total || 0) + 1) {
        return "B filial A ning direktorini ham sanadi";
      }
      return null;
    },
  );

  // ── 3) QIDIRUV / MAVJUDLIK / O'QISH ──────────────────────────────
  console.log("\n3) login bandligi va o'qish");

  await mustPass(
    "band login topiladi",
    () => usersService.checkAvailability({ username: `tch_a_${SUFFIX}` }),
    (r) => (r.username?.taken === true ? null : "band login bo'sh deb ko'rsatildi"),
  );
  await mustPass(
    "bo'sh login bo'sh deb qaytadi",
    () => usersService.checkAvailability({ username: `yoq_${SUFFIX}` }),
    (r) => (r.username?.taken === false ? null : "bo'sh login band deb ko'rsatildi"),
  );
  await mustPass(
    "excludeId o'zini hisobga olmaydi",
    () => usersService.checkAvailability({ username: `tch_a_${SUFFIX}`, excludeId: teacherA.id }),
    (r) => (r.username?.taken === false ? null : "o'zini band deb ko'rsatdi"),
  );

  await mustPass(
    "getById foydalanuvchini va branchAssignments'ni beradi",
    () => usersService.getById(crossUser.id),
    (u) =>
      Array.isArray(u.branchAssignments) && u.branchAssignments.length === 1
        ? null
        : "branchAssignments yuklanmadi (ko'lam tekshiruvi buziladi)",
  );

  await mustThrow(
    "getById mavjud bo'lmagan ID uchun 404 (CastError emas)",
    () => usersService.getById("000000000000000000000000"),
    "topilmadi",
  );

  // ── 4) TAHRIRLASH + KO'LAM ───────────────────────────────────────
  console.log("\n4) tahrirlash va ko'lam chegarasi");

  await mustPass(
    "A direktori O'Z filiali o'qituvchisini tahrirlaydi",
    () => usersService.update(teacherA.id, { firstName: "Yangi" }, null, {
      allowedBranchIds: [branchA.id], canSeeAllBranches: false,
    }),
    (u) => (u.firstName === "Yangi" ? null : "ism o'zgarmadi"),
  );

  await mustThrow(
    "A direktori B filial o'qituvchisiga TEGA OLMAYDI",
    () => usersService.update(teacherB.id, { firstName: "Buzildi" }, null, {
      allowedBranchIds: [branchA.id], canSeeAllBranches: false,
    }),
    "huquqingiz yo'q",
  );

  await mustPass(
    "ko'lamsiz (job/seed) chaqiruv cheklanmaydi",
    () => usersService.update(teacherB.id, { firstName: "Job" }, null, null),
    (u) => (u.firstName === "Job" ? null : "job chaqiruvi o'tmadi"),
  );

  await mustThrow(
    "o'qituvchiga o'quvchi maydonini yozib bo'lmaydi",
    () => usersService.update(teacherA.id, { enrolledAt: "2024-05-05" }, null, null),
    "faqat o'quvchi uchun",
  );

  await mustThrow(
    "o'quvchini arxivlab bo'lmaydi (isActive=false)",
    () => usersService.update(studentA.id, { isActive: false }, null, null),
    "arxivlab bo'lmaydi",
  );

  await mustPass(
    "telefon tozalanadi (undefined emas, null yoziladi)",
    async () => {
      await usersService.update(teacherA.id, { phone: "+998901234567" }, null, null);
      await usersService.update(teacherA.id, { phone: "" }, null, null);
      return prisma.user.findUnique({ where: { id: teacherA.id }, select: { phone: true } });
    },
    (u) => (u.phone === null ? null : `phone=${JSON.stringify(u?.phone)}`),
  );

  await mustPass(
    "hiredAt o'zgarishi audit jurnaliga tushadi",
    async () => {
      await usersService.update(teacherA.id, { hiredAt: "2024-03-15" }, dirA, null);
      return prisma.payrollAuditLog.count({
        where: { employeeId: teacherA.id, action: "hr.employment_date_changed" },
      });
    },
    (n) => (n >= 1 ? null : "audit yozuvi yaratilmadi"),
  );

  // ── 5) PAROL ─────────────────────────────────────────────────────
  console.log("\n5) parol o'qish/o'rnatish (eng maxfiy yo'l)");

  await mustPass(
    "haqiqiy owner parolni o'qiydi",
    () => usersService.getPassword(teacherA.id, { actorId: null, isOwner: true }),
    (r) => (r.password === PASSWORD ? null : "parol noto'g'ri qaytdi"),
  );

  await mustThrow(
    "A direktori B filial xodimining parolini O'QIY OLMAYDI",
    () => usersService.getPassword(teacherB.id, { actorId: dirA.id, isOwner: false }),
    "huquqingiz yo'q",
  );

  await mustPass(
    "A direktori O'Z filiali xodimining parolini o'qiydi",
    () => usersService.getPassword(teacherA.id, { actorId: dirA.id, isOwner: false }),
    (r) => (r.username ? null : "javob bo'sh"),
  );

  await mustThrow(
    "A direktori B filial xodimining parolini ALMASHTIRA OLMAYDI",
    () => usersService.setPassword(teacherB.id, "yangi-parol-123", {
      actorId: dirA.id, isOwner: false,
    }),
    "huquqingiz yo'q",
  );

  await mustPass(
    "parol almashtirilganda eski sessiyalar bekor bo'ladi",
    async () => {
      await prisma.refreshToken.create({
        data: {
          userId: teacherA.id,
          tokenHash: `test-${SUFFIX}-1`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await usersService.setPassword(teacherA.id, "boshqa-parol-999", {
        actorId: null, isOwner: true,
      });
      return prisma.refreshToken.count({
        where: { userId: teacherA.id, revokedAt: null },
      });
    },
    (n) => (n === 0 ? null : `${n} ta sessiya tirik qoldi`),
  );

  // ── 6) ARXIVLASH / TIKLASH ───────────────────────────────────────
  console.log("\n6) arxivlash va tiklash");

  await mustThrow(
    "o'quvchini softRemove rad etadi",
    () => usersService.softRemove(studentA.id, {}),
    "arxivlab bo'lmaydi",
  );

  await mustPass(
    "o'qituvchi arxivlanadi va terminatedAt qo'yiladi",
    () => usersService.softRemove(teacherB.id, {}),
    (u) => {
      if (u.isActive !== false) return "isActive true qoldi";
      if (!u.archivedAt) return "archivedAt yo'q";
      if (!u.terminatedAt) return "terminatedAt yo'q (maosh hisoblanib boraveradi)";
      return null;
    },
  );

  await mustPass(
    "arxivlangan xodim faol ro'yxatda YO'Q, arxiv ro'yxatida BOR",
    async () => ({
      active: await inB(() => usersService.list({ staff: true, status: "active", limit: 200 })),
      archived: await inB(() => usersService.list({ staff: true, status: "archived", limit: 200 })),
    }),
    ({ active, archived }) => {
      if (active.items.some((u) => u.id === teacherB.id)) return "faol ro'yxatda qoldi";
      if (!archived.items.some((u) => u.id === teacherB.id)) return "arxiv ro'yxatida yo'q";
      return null;
    },
  );

  await mustThrow(
    "A direktori B filial xodimini tiklay olmaydi",
    () => usersService.restore(teacherB.id, {
      scope: { allowedBranchIds: [branchA.id], canSeeAllBranches: false },
    }),
    "huquqingiz yo'q",
  );

  await mustPass(
    "tiklashda terminatedAt tozalanadi",
    () => usersService.restore(teacherB.id, {}),
    (u) => {
      if (u.isActive !== true) return "isActive tiklanmadi";
      if (u.archivedAt !== null) return "archivedAt qoldi";
      if (u.terminatedAt !== null) return "terminatedAt qoldi";
      return null;
    },
  );

  // ── 7) XODIM YARATISH ────────────────────────────────────────────
  console.log("\n7) xodim yaratish");

  const ownerActor = {
    permissions: ["*"], allowedBranchIds: [branchA.id, branchB.id], canSeeAllBranches: true,
  };

  const newStaff = await mustPass(
    "createStaff xodim yaratadi (qo'shimcha filial bilan)",
    () => usersService.createStaff(
      {
        firstName: "Yangi", lastName: "Xodim",
        username: `new_staff_${SUFFIX}`, password: PASSWORD,
        role: "reception", homeBranchId: branchA.id,
        branchAssignments: [{ branchId: branchB.id }],
      },
      ownerActor,
    ),
    (p) => {
      if (!p?.id) return "profil qaytmadi";
      if (p.passwordHash !== undefined) return "profilda parol bor";
      if (String(p._id) !== String(p.id)) return "_id taxallusi yo'q";
      return null;
    },
  );
  if (newStaff?.id) created.users.push(newStaff.id);

  await mustPass(
    "qo'shimcha filial biriktiruvi yozildi",
    () => prisma.userBranchAssignment.count({ where: { userId: newStaff?.id } }),
    (n) => (n === 1 ? null : `${n} ta biriktiruv`),
  );

  await mustThrow(
    "takroriy login rad etiladi",
    () => usersService.createStaff(
      {
        firstName: "Ikkinchi", lastName: "Xodim",
        username: `new_staff_${SUFFIX}`, password: PASSWORD,
        role: "reception", homeBranchId: branchA.id,
      },
      ownerActor,
    ),
    "allaqachon mavjud",
  );

  await mustThrow(
    "A direktori B filialga xodim qo'sha olmaydi",
    () => usersService.createStaff(
      {
        firstName: "Begona", lastName: "Xodim",
        username: `foreign_${SUFFIX}`, password: PASSWORD,
        role: "reception", homeBranchId: branchB.id,
      },
      // ROL huquqi ATAYLAB to'liq (["*"]) — aks holda chaqiruv rol
      // tekshiruvida yiqilib, FILIAL to'sig'iga umuman yetib bormasdi va
      // test o'zi mo'ljallagan narsani sinamay qo'yardi.
      { permissions: ["*"], allowedBranchIds: [branchA.id], canSeeAllBranches: false },
    ),
    "filial",
  );

  await mustThrow(
    "direktor OWNER rolidagi xodim yarata olmaydi (imtiyoz oshirish)",
    () => usersService.createStaff(
      {
        firstName: "Soxta", lastName: "Ega",
        username: `fake_owner_${SUFFIX}`, password: PASSWORD,
        role: ROLES.OWNER, homeBranchId: branchA.id,
      },
      { permissions: ["users.create"], allowedBranchIds: [branchA.id], canSeeAllBranches: false },
    ),
    "huquqingiz yo'q",
  );

  // ── 8) FILIAL VA ROL BIRIKTIRISH ─────────────────────────────────
  console.log("\n8) filial va rol biriktirish");

  await mustPass(
    "setBranches biriktiruvni TO'LIQ almashtiradi",
    async () => {
      await usersService.setBranches(
        newStaff.id,
        { homeBranchId: branchB.id, branchAssignments: [] },
        ownerActor,
      );
      return prisma.user.findUnique({
        where: { id: newStaff.id },
        select: { homeBranchId: true, branchAssignments: { select: { branchId: true } } },
      });
    },
    (u) => {
      if (u.homeBranchId !== branchB.id) return "asosiy filial o'zgarmadi";
      if (u.branchAssignments.length !== 0) return "eski biriktiruv qoldi";
      return null;
    },
  );

  await mustThrow(
    "o'z rolini o'zgartirib bo'lmaydi",
    () => usersService.setRole(dirA.id, "reception", { id: dirA.id, permissions: ["*"] }),
    "o'z rolingizni",
  );

  await mustPass(
    "setRole rolni almashtiradi va sessiyalarni bekor qiladi",
    async () => {
      await prisma.refreshToken.create({
        data: {
          userId: newStaff.id,
          tokenHash: `test-${SUFFIX}-2`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await usersService.setRole(newStaff.id, "director", ownerActor);
      return {
        role: (await prisma.user.findUnique({
          where: { id: newStaff.id }, select: { role: true },
        })).role,
        live: await prisma.refreshToken.count({
          where: { userId: newStaff.id, revokedAt: null },
        }),
      };
    },
    (r) => {
      if (r.role !== "director") return "rol o'zgarmadi";
      if (r.live !== 0) return "eski sessiya tirik qoldi";
      return null;
    },
  );

  await mustThrow(
    "direktor boshqasiga OWNER rolini bera olmaydi",
    () => usersService.setRole(newStaff.id, ROLES.OWNER, {
      id: dirA.id, permissions: ["roles.update"],
      allowedBranchIds: [branchB.id], canSeeAllBranches: false,
    }),
    "huquqingiz yo'q",
  );

  // ── 9) O'QUVCHI TARIXI ───────────────────────────────────────────
  console.log("\n9) o'quvchining guruh tarixi");

  const group = await prisma.group.create({
    data: {
      name: `Test guruh ${SUFFIX}`,
      branchId: branchA.id,
      schedule: { create: [{ day: "mon", startTime: "09:00", endTime: "10:30" }] },
    },
  });
  created.groups.push(group.id);
  await prisma.groupMembership.create({
    data: { groupId: group.id, studentId: studentA.id, joinedAt: new Date("2024-02-01") },
  });

  await mustPass(
    "studentHistory guruh va jadvalni populate shaklida beradi",
    () => usersService.studentHistory(studentA.id, { page: 1, limit: 20 }),
    (r) => {
      if (r.total !== 1) return `total=${r.total}`;
      const row = r.items[0];
      if (row.group?.name !== group.name) return "guruh yuklanmadi";
      if (!Array.isArray(row.group?.schedule) || row.group.schedule.length !== 1) {
        return "jadval yuklanmadi";
      }
      if (!row._id) return "_id taxallusi yo'q";
      return null;
    },
  );

  await mustThrow(
    "studentHistory o'qituvchi uchun rad etiladi",
    () => usersService.studentHistory(teacherA.id, {}),
    "o'quvchi emas",
  );

  await mustPass(
    "ro'yxatdagi activeGroups guruhni ko'rsatadi",
    () => inA(() => usersService.list({ role: ROLES.STUDENT, status: "active", limit: 50 })),
    (r) => {
      const row = r.items.find((u) => u.id === studentA.id);
      return row?.activeGroups?.[0]?.name === group.name
        ? null
        : "activeGroups bo'sh yoki noto'g'ri";
    },
  );

  // ── 10) BUTUNLAY O'CHIRISH ───────────────────────────────────────
  console.log("\n10) butunlay o'chirish (hard delete)");

  await mustThrow(
    "guruhdagi o'quvchini o'chirib bo'lmaydi",
    () => usersService.permanentRemove(studentA.id, null, { confirmName: "Talaba Aaa" }),
    "guruhga biriktirilgan",
  );

  await mustThrow(
    "noto'g'ri tasdiq ismi rad etiladi",
    async () => {
      await prisma.groupMembership.updateMany({
        where: { studentId: studentA.id },
        data: { leftAt: new Date() },
      });
      return usersService.permanentRemove(studentA.id, null, { confirmName: "Noto'g'ri" });
    },
    "to'liq ismini",
  );

  // Moliyaviy izi bor o'qituvchi: TARIXNI buzmaslik uchun to'sib qo'yilishi shart.
  await mustThrow(
    "moliyaviy izi bor o'qituvchi o'chirilmaydi",
    async () => {
      await prisma.teacherSalary.create({
        data: {
          branchId: branchA.id, teacherId: teacherA.id,
          year: 2025, month: 1, expectedAmount: 1_500_000, paidAmount: 1_500_000,
        },
      });
      return usersService.permanentRemove(teacherA.id, null, { confirmName: "Yangi Aaa" });
    },
    "tarix bor",
  );

  // Izsiz o'qituvchi: o'chirilishi va qoldiq ma'lumot ham ketishi kerak.
  const cleanTeacher = await mkUser({
    firstName: "Toza", lastName: "Ustoz",
    username: `clean_${SUFFIX}`, role: ROLES.TEACHER, homeBranchId: branchA.id,
  });
  await prisma.refreshToken.create({
    data: {
      userId: cleanTeacher.id,
      tokenHash: `test-${SUFFIX}-3`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  await mustPass(
    "izsiz o'qituvchi o'chadi va qoldiq sessiya ham ketadi",
    async () => {
      await usersService.permanentRemove(cleanTeacher.id, null, { confirmName: "Toza Ustoz" });
      return {
        user: await prisma.user.count({ where: { id: cleanTeacher.id } }),
        tokens: await prisma.refreshToken.count({ where: { userId: cleanTeacher.id } }),
      };
    },
    (r) => {
      if (r.user !== 0) return "foydalanuvchi o'chmadi";
      if (r.tokens !== 0) return "refresh token qoldi";
      return null;
    },
  );

  await mustPass(
    "o'chirilgan o'quvchining a'zoligi ham ketadi (cascade)",
    async () => {
      await usersService.permanentRemove(studentA.id, null, { confirmName: "Talaba Aaa" });
      return {
        user: await prisma.user.count({ where: { id: studentA.id } }),
        mem: await prisma.groupMembership.count({ where: { studentId: studentA.id } }),
      };
    },
    (r) => {
      if (r.user !== 0) return "o'quvchi o'chmadi";
      if (r.mem !== 0) return "a'zolik qoldi";
      return null;
    },
  );

  console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
};

run()
  .catch((err) => {
    console.error("\nTEST YIQILDI:", err);
    R.fail += 1;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("tozalash xatosi:", e.message));
    await prisma.$disconnect();
    process.exit(R.fail > 0 ? 1 : 0);
  });
