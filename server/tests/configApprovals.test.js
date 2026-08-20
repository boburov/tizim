/**
 * SOZLAMA TASDIQLARI - UCHIDAN-UCHIGA TEST (3 tur).
 *
 * SAVOL: "Direktor maosh stavkasi / chegirma / ishga olishni belgilaganda,
 * owner tasdiqlagunicha ular tizimga kirib ketmaydimi?"
 *
 * Har bo'limdagi ENG MUHIM tekshiruv - so'rov yuborilgandan keyin haqiqiy
 * hujjat (TeacherGroupPeriod / Discount / User) YARATILMAGAN bo'lishi.
 * Agar yaratilsa, u darhol maosh hisobiga, to'lov hisobiga yoki
 * foydalanuvchi ro'yxatiga kirib ketardi.
 *
 * IZOLYATSIYA: o'z test bazasini yaratadi va oxirida O'CHIRADI - ishchi
 * ma'lumotga (bayyina) tegmaydi.
 *
 * ISHLATISH:
 *   npm run test:config-approval
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Alohida Mongo bazasi + `dropDatabase()` o'rniga prefiksli fixture va
 * kafolatli tozalash (`tests/helpers/prismaFixtures.js`). Xavfsizlik va
 * biznes DA'VOLARI o'zgarmadi — faqat ma'lumotga murojaat qatlami.
 *
 * Bog'lanish maydonlari qayta nomlandi: `teacher` → `teacherId`,
 * `group` → `groupId`, `student` → `studentId` va h.k.
 */
const fx = createFixtures();
let fxBranchId = null;

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → ${d}`);
};
const check = (n, cond, d = "") => (cond ? ok(n) : bad(n, d || "shart bajarilmadi"));
const grab = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

const run = async () => {
  const { APPROVAL_CATEGORIES, APPROVAL_KINDS } = await import(
    "../src/constants/approvals.js"
  );

  const periodService = await import("../src/modules/groups/services/teacherGroupPeriod.service.js");
  const discountService = await import("../src/modules/finance/services/discount.service.js");
  const groupFeeService = await import("../src/modules/finance/services/groupFee.service.js");
  const usersService = await import("../src/modules/users/services/users.service.js");
  const approvalService = await import(
    "../src/modules/expenseApprovals/services/expenseApproval.service.js"
  );
  const { PERMISSIONS } = await import("../src/constants/permissions.js");
  const { ROLES, ROLE_TYPES } = await import("../src/constants/roles.js");

  // ⚠ Subyekt qulfi PARTIAL UNIQUE indeksga tayanadi. Prisma'da indeks
  // migratsiyadan keladi (sinxronlash yo'q), shuning uchun uning BAZADA
  // borligi tekshiriladi — aks holda "ikkinchi so'rov 409" tekshiruvi
  // yolg'on yashil berardi.
  const lockIdx = await prisma.$queryRaw`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'expense_approvals'
      AND indexdef ILIKE '%subjectKey%' AND indexdef ILIKE '%UNIQUE%'
  `;
  check("subyekt qulfi indeksi bazada mavjud", lockIdx.length > 0,
    "partial unique migratsiyasi qo'llanmagan — qulf tekshiruvlari ma'nosiz");

  const DECIDE = [PERMISSIONS.APPROVALS_DECIDE_CONFIG];

  // ── Fixture ────────────────────────────────────────────────
  const branch = await fx.branch("Test-filial");
  fxBranchId = branch.id;
  const mk = async (role, first, last, extra = {}) =>
    fx.user(`${role}_${first}`.toLowerCase(), {
      firstName: first,
      lastName: last,
      passwordHash: "x",
      role,
      homeBranchId: branch.id,
      ...extra,
    });

  const teacher = await mk(ROLES.TEACHER, "Ali", "Valiyev");
  const student = await mk(ROLES.STUDENT, "Sardor", "Aliyev");
  const director = await mk(ROLES.OWNER, "Dilnoza", "Karimova");
  const ownerUser = await mk(ROLES.OWNER, "Bek", "Toshev");
  const group = await fx.group("Test-guruh", branch.id);
  const today = new Date().toISOString().slice(0, 10);

  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m1) MAOSH STAVKASI\x1b[0m");

  const salaryReq = await periodService.requestSalaryTerms(
    {
      op: "create",
      group: group.id,
      body: {
        teacher: String(teacher.id),
        startDate: today,
        salaryType: "percent",
        percentRate: 40,
        requestNote: "Yangi o'qituvchi",
      },
    },
    director,
  );

  check("so'rov yaratildi", !!salaryReq?.id);
  check("kategoriya = configuration", salaryReq.category === APPROVAL_CATEGORIES.CONFIGURATION);
  check("summa YO'Q (takrorlanuvchi xarajat)", salaryReq.amount === null);
  check(
    "\x1b[1mTeacherGroupPeriod YARATILMAGAN\x1b[0m",
    // ⚠ FIXTURE GURUHI bo'yicha: baza bo'sh emas, global `count()`
    // boshqa guruhlarning davrlarini ham sanardi.
    (await prisma.teacherGroupPeriod.count({ where: { groupId: group.id } })) === 0,
    "tasdiqlanmagan stavka maosh hisobiga kiradi!",
  );

  const dupSalary = await grab(() =>
    periodService.requestSalaryTerms(
      {
        op: "create",
        group: group.id,
        body: { teacher: String(teacher.id), startDate: today, salaryType: "fixed", fixedAmount: 9e5 },
      },
      director,
    ),
  );
  check("subyekt qulfi: ikkinchi so'rov 409", dupSalary?.statusCode === 409);

  const selfApprove = await grab(() =>
    approvalService.approve(salaryReq.id, {}, director, ["*"]),
  );
  check("o'z so'rovini o'zi tasdiqlay olmaydi", selfApprove?.statusCode === 403);

  const wrongPerm = await grab(() =>
    approvalService.approve(salaryReq.id, {}, ownerUser, [PERMISSIONS.FINANCE_APPROVE]),
  );
  check("faqat finance.approve bilan sozlama tasdiqlanmaydi", wrongPerm?.statusCode === 403);

  const salaryDone = await approvalService.approve(salaryReq.id, {}, ownerUser, DECIDE);
  check("tasdiqlandi va bajarildi", salaryDone.status === "executed", salaryDone.failureReason);

  const period = await prisma.teacherGroupPeriod.findFirst({ where: { groupId: group.id } });
  if (period) fx.track("teacherGroupPeriod", period.id);
  check("endi davr yaratildi", !!period);
  check("foiz stavka to'g'ri", period?.percentRate === 40);
  check("fiksa 0 ga normallashtirildi", period?.fixedAmount === 0);
  check(
    "createdBy = SO'ROVCHI (tasdiqlovchi emas)",
    String(period?.createdById) === String(director.id),
  );

  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m2) CHEGIRMA\x1b[0m");

  const discReq = await discountService.requestDiscount(
    {
      op: "create",
      body: {
        student: String(student.id),
        group: String(group.id),
        type: "percent",
        value: 30,
        scope: "permanent",
        reason: "Ijtimoiy himoya",
      },
    },
    director,
  );

  check("so'rov yaratildi", !!discReq?.id);
  check("turi = discount_set", discReq.kind === APPROVAL_KINDS.DISCOUNT_SET);
  check("kategoriya = configuration", discReq.category === APPROVAL_CATEGORIES.CONFIGURATION);
  check("o'quvchi ismi snapshot qilindi", discReq.subjectName === "Sardor Aliyev");
  check(
    "\x1b[1mDiscount YARATILMAGAN\x1b[0m",
    (await prisma.discount.count({ where: { groupId: group.id } })) === 0,
    "tasdiqlanmagan chegirma o'quvchi to'lovini kamaytiradi!",
  );

  const dupDisc = await grab(() =>
    discountService.requestDiscount(
      {
        op: "create",
        body: {
          student: String(student.id),
          group: String(group.id),
          type: "fixed",
          value: 100000,
          scope: "permanent",
        },
      },
      director,
    ),
  );
  check("subyekt qulfi: ikkinchi so'rov 409", dupDisc?.statusCode === 409);

  const discDone = await approvalService.approve(discReq.id, {}, ownerUser, DECIDE);
  check("tasdiqlandi va bajarildi", discDone.status === "executed", discDone.failureReason);

  const discount = await prisma.discount.findFirst({ where: { groupId: group.id } });
  if (discount) fx.track("discount", discount.id);
  check("endi chegirma yaratildi", !!discount);
  check("foiz to'g'ri", discount?.value === 30 && discount?.type === "percent");
  check("doimiy (permanent)", discount?.scope === "permanent");
  check("faol", discount?.isActive === true);

  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m3) GURUH OYLIK NARXI\x1b[0m");

  // Boshlang'ich narx - "qanchadan qanchaga" snapshot'ini tekshirish uchun.
  const now = new Date();
  const [fy, fm] = [now.getUTCFullYear(), now.getUTCMonth() + 1];
  await fx.groupFee(group.id, fy, fm, 1_000_000);

  const feeReq = await groupFeeService.requestGroupFee(
    { groupId: String(group.id), year: fy, month: fm, amount: 400_000, requestNote: "Aksiya" },
    director,
  );

  check("so'rov yaratildi", !!feeReq?.id);
  check("turi = group_fee_set", feeReq.kind === APPROVAL_KINDS.GROUP_FEE_SET);
  check("kategoriya = configuration", feeReq.category === APPROVAL_CATEGORIES.CONFIGURATION);
  check("eski narx snapshot qilindi", feeReq.payload?.previousAmount === 1_000_000);
  check(
    "\x1b[1mnarx O'ZGARMAGAN\x1b[0m",
    Number(
      (await prisma.groupFee.findFirst({ where: { groupId: group.id, year: fy, month: fm } }))
        ?.amount,
    ) === 1_000_000,
    "tasdiqlanmagan narx barcha o'quvchi hisobini o'zgartiradi!",
  );

  const dupFee = await grab(() =>
    groupFeeService.requestGroupFee(
      { groupId: String(group.id), year: fy, month: fm, amount: 500_000 },
      director,
    ),
  );
  check("subyekt qulfi: ikkinchi so'rov 409", dupFee?.statusCode === 409);

  // TASDIQLOVCHI BOSHQA FILIALNI tanlab turgan bo'lsa ham bajarilishi kerak:
  // executor so'rovning O'Z filial kontekstida ishlaydi.
  const { runWithBranchContext } = await import("../src/helpers/branchContext.helper.js");
  const otherBranch = await fx.branch("Boshqa-filial");
  const feeDone = await runWithBranchContext(
    {
      branchId: String(otherBranch.id),
      allowedBranchIds: [String(otherBranch.id)],
      canSeeAllBranches: false,
    },
    () => approvalService.approve(feeReq.id, {}, ownerUser, DECIDE),
  );
  check(
    "boshqa filial ko'rinishidan tasdiqlansa ham bajarildi",
    feeDone.status === "executed",
    feeDone.failureReason,
  );

  const fee = await prisma.groupFee.findFirst({
    where: { groupId: group.id, year: fy, month: fm },
  });
  check("endi narx qo'llandi", fee?.amount === 400_000, `keldi: ${fee?.amount}`);
  check("manba 'manual' bo'ldi", fee?.source === "manual");

  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m4) ISHGA OLISH\x1b[0m");

  // ══════════════════════════════════════════════════════════
  // ROL FIXTURE'LARI — ⚠ BUILT-IN ROLLAR YARATILMAYDI.
  //
  // Mongo davrida baza bo'sh edi va test `teacher`/`director` rollarini
  // O'ZI yaratardi. HAQIQIY bazada ular ALLAQACHON bor (unique `value`),
  // shuning uchun yaratish yiqilardi — va ularning ruxsatlarini
  // o'zgartirish JONLI konfiguratsiyani buzardi.
  //
  // Testning MAQSADI o'zgarmadi: u so'rovchida BO'LMAGAN ruxsatli rolni
  // berib bo'lmasligini isbotlaydi. Buning uchun built-in rol emas,
  // SUFFIKSLI fixture rollari ishlatiladi — ruxsat katalogiga esa
  // umuman tegilmaydi (`fx.role` mavjud kalitlarga `connect` qiladi).
  // ══════════════════════════════════════════════════════════
  const grantedRole = await fx.role("cfg-teacher", [PERMISSIONS.ATTENDANCE_RECORD], {
    roleType: ROLE_TYPES.TEACHER,
  });
  const weakRole = await fx.role("cfg-weak", [], { roleType: ROLE_TYPES.STAFF });

  const hiredUsername = `yangi_xodim_${fx.suffix}`;
  const usersBefore = await prisma.user.count({ where: { username: hiredUsername } });
  const hireReq = await usersService.requestHire(
    {
      firstName: "Yangi",
      lastName: "Xodim",
      username: hiredUsername,
      password: "maxfiy123",
      role: grantedRole.value,
      homeBranchId: String(branch.id),
      requestNote: "Ikkinchi smenaga",
    },
    director,
  );

  check("so'rov yaratildi", !!hireReq?.id);
  check("turi = staff_hire", hireReq.kind === APPROVAL_KINDS.STAFF_HIRE);
  check(
    "\x1b[1mUser YARATILMAGAN\x1b[0m",
    // ⚠ FIXTURE LOGINI bo'yicha: global `count()` bazadagi 800+
    // foydalanuvchini sanardi va tekshiruv ma'nosini yo'qotardi.
    (await prisma.user.count({ where: { username: hiredUsername } })) === usersBefore,
    "tasdiqlanmagan xodim tizimga kira olardi!",
  );

  const dupHire = await grab(() =>
    usersService.requestHire(
      {
        firstName: "Boshqa",
        lastName: "Odam",
        // ⚠ AYNAN o'sha login — subyekt qulfi shu kalit bo'yicha ishlaydi.
        username: hiredUsername,
        password: "boshqa123",
        role: grantedRole.value,
        homeBranchId: String(branch.id),
      },
      director,
    ),
  );
  check("subyekt qulfi: bir xil login uchun ikkinchi so'rov 409", dupHire?.statusCode === 409);

  // --- PAROL SIZISHI ---
  const listed = await approvalService.list({ permissions: DECIDE, currentUser: ownerUser });
  const hireRow = listed.items.find((i) => i.kind === APPROVAL_KINDS.STAFF_HIRE);
  check(
    "\x1b[1mparol ro'yxat javobida YO'Q\x1b[0m",
    hireRow && hireRow.payload?.password === undefined,
    "tasdiqlar ro'yxatini ko'ra oladigan har kim parolni o'qib olardi",
  );
  const detail = await approvalService.getById(hireReq.id, {
    permissions: DECIDE,
    currentUser: ownerUser,
  });
  check("parol detal javobida ham YO'Q", detail.payload?.password === undefined);
  check("boshqa payload maydonlari saqlanib qoldi", detail.payload?.username === hiredUsername);
  const raw = await prisma.approval.findUnique({ where: { id: hireReq.id } });
  check("parol bazada esa turibdi (bajarish uchun kerak)", raw.payload?.password === "maxfiy123");

  // --- IMTIYOZ OSHIRISHDAN HIMOYA ---
  // So'rovchi rolini ruxsatsiz "director"ga almashtiramiz: endi u
  // attendance.record ruxsatiga ega bo'lmagani uchun "teacher" rolini
  // BERA OLMAYDI - owner tasdiqlasa ham.
  await prisma.user.update({ where: { id: director.id }, data: { role: weakRole.value } });

  const escalated = await grab(() =>
    approvalService.approve(hireReq.id, {}, ownerUser, DECIDE),
  );
  check(
    "\x1b[1mimtiyoz oshirish to'sildi\x1b[0m",
    !!escalated,
    "so'rovchida yo'q ruxsatli rol owner tasdig'i bilan berilib ketdi!",
  );
  check(
    "so'rov XATO holatiga o'tdi",
    (await prisma.approval.findUnique({ where: { id: hireReq.id } }))?.status === "failed",
  );
  check(
    "User baribir yaratilmadi",
    (await prisma.user.count({ where: { username: hiredUsername } })) === usersBefore,
  );

  // So'rovchini owner qilib qaytaramiz - endi tasdiq o'tishi kerak.
  await prisma.user.update({ where: { id: director.id }, data: { role: ROLES.OWNER } });
  const { invalidateRoleCache } = await import("../src/helpers/permission.helper.js");
  invalidateRoleCache();

  const retried = await approvalService.retry(hireReq.id, DECIDE);
  check("xato so'rov qayta urinishga qaytdi", retried.status === "pending");

  const hireDone = await approvalService.approve(hireReq.id, {}, ownerUser, DECIDE);
  check("tasdiqlandi va bajarildi", hireDone.status === "executed", hireDone.failureReason);

  const hired = await prisma.user.findUnique({
    where: { username: hiredUsername },
    omit: { passwordHash: false },
  });
  if (hired) fx.track("user", hired.id);
  check("endi xodim yaratildi", !!hired);
  check("roli to'g'ri", hired?.role === grantedRole.value);
  check("filiali to'g'ri", String(hired?.homeBranchId) === String(branch.id));
  check("paroli o'rnatildi", hired?.passwordHash === "maxfiy123");

};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    // ══════════════════════════════════════════════════════════
    // SERVIS YARATGAN YON QATORLAR.
    //
    // Tasdiq BAJARILGANDA zanjir uzayadi: maosh sharti tasdig'i
    // `TeacherGroupPeriod` ochadi, u esa `TeacherSalary` qatorlarini
    // generatsiya qiladi. Ular reyestrga olinmasa filial/guruh/xodimni
    // `teacher_salaries_*_fkey` RESTRICT tufayli o'chirib bo'lmasdi.
    // ══════════════════════════════════════════════════════════
    const branchId = fxBranchId || "";
    const approvals = await prisma.approval
      .findMany({ where: { branchId }, select: { id: true } })
      .catch(() => []);
    for (const a of approvals) fx.track("approval", a.id);

    const fxGroups = await prisma.group
      .findMany({ where: { branchId }, select: { id: true } })
      .catch(() => []);
    const gids = fxGroups.map((g) => g.id);

    const salaries = await prisma.teacherSalary
      .findMany({ where: { branchId }, select: { id: true } })
      .catch(() => []);
    for (const r of salaries) fx.track("teacherSalary", r.id);

    const periods = await prisma.teacherGroupPeriod
      .findMany({ where: { groupId: { in: gids } }, select: { id: true } })
      .catch(() => []);
    for (const r of periods) fx.track("teacherGroupPeriod", r.id);

    const discounts = await prisma.discount
      .findMany({ where: { groupId: { in: gids } }, select: { id: true } })
      .catch(() => []);
    for (const r of discounts) fx.track("discount", r.id);

    const fees = await prisma.groupFee
      .findMany({ where: { groupId: { in: gids } }, select: { id: true } })
      .catch(() => []);
    for (const r of fees) fx.track("groupFee", r.id);

    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} xato\x1b[0m`,
    );
    if (R.notes?.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      for (const n of R.notes) console.log(`  • ${n}`);
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
