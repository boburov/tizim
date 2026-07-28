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
import mongoose from "mongoose";

const BASE = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
// Ishchi bazaga TEGMASLIK uchun nom almashtiriladi.
const DB = BASE.replace(/\/([^/?]+)(\?|$)/, "/bayyina_approval_test$2");

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
  if (DB === BASE) throw new Error("Test bazasi nomi ajratilmadi - to'xtatildi");
  // Avto-indeks O'CHIRILADI: u fon rejimida ishlab, dropDatabase'dan KEYIN
  // yakunlanib kolleksiyalarni qayta yaratib qo'yardi. Kerakli indeks pastda
  // aniq syncIndexes bilan quriladi.
  mongoose.set("autoIndex", false);
  await mongoose.connect(DB);
  if (!mongoose.connection.name.includes("approval_test")) {
    throw new Error(`Kutilmagan baza: ${mongoose.connection.name}`);
  }

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const Role = (await import("../src/models/role.model.js")).default;
  const Permission = (await import("../src/models/permission.model.js")).default;
  const Discount = (await import("../src/models/discount.model.js")).default;
  const TeacherGroupPeriod = (await import("../src/models/teacherGroupPeriod.model.js")).default;
  const Approval = (await import("../src/models/approval.model.js")).default;
  const { APPROVAL_CATEGORIES, APPROVAL_KINDS } = await import("../src/models/approval.model.js");

  const periodService = await import("../src/modules/groups/services/teacherGroupPeriod.service.js");
  const discountService = await import("../src/modules/finance/services/discount.service.js");
  const groupFeeService = await import("../src/modules/finance/services/groupFee.service.js");
  const usersService = await import("../src/modules/users/services/users.service.js");
  const approvalService = await import(
    "../src/modules/expenseApprovals/services/expenseApproval.service.js"
  );
  const { PERMISSIONS } = await import("../src/constants/permissions.js");
  const { ROLES, ROLE_TYPES } = await import("../src/constants/roles.js");

  // Subyekt qulfi PARTIAL UNIQUE indeksga tayanadi - u qurilmasa test
  // yolg'on "o'tdi" berardi.
  await Approval.syncIndexes();

  const DECIDE = [PERMISSIONS.APPROVALS_DECIDE_CONFIG];

  // ── Fixture ────────────────────────────────────────────────
  const branch = await Branch.create({ name: "Test filial" });
  const mk = async (role, first, last, extra = {}) =>
    User.create({
      firstName: first,
      lastName: last,
      username: `${role}_${first}_${Date.now()}`.toLowerCase(),
      passwordHash: "x",
      role,
      homeBranchId: branch._id,
      ...extra,
    });

  const teacher = await mk(ROLES.TEACHER, "Ali", "Valiyev");
  const student = await mk(ROLES.STUDENT, "Sardor", "Aliyev");
  const director = await mk(ROLES.OWNER, "Dilnoza", "Karimova");
  const ownerUser = await mk(ROLES.OWNER, "Bek", "Toshev");
  const group = await Group.create({ branchId: branch._id, name: "Test guruh" });
  const today = new Date().toISOString().slice(0, 10);

  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m1) MAOSH STAVKASI\x1b[0m");

  const salaryReq = await periodService.requestSalaryTerms(
    {
      op: "create",
      group: group._id,
      body: {
        teacher: String(teacher._id),
        startDate: today,
        salaryType: "percent",
        percentRate: 40,
        requestNote: "Yangi o'qituvchi",
      },
    },
    director,
  );

  check("so'rov yaratildi", !!salaryReq?._id);
  check("kategoriya = configuration", salaryReq.category === APPROVAL_CATEGORIES.CONFIGURATION);
  check("summa YO'Q (takrorlanuvchi xarajat)", salaryReq.amount === null);
  check(
    "\x1b[1mTeacherGroupPeriod YARATILMAGAN\x1b[0m",
    (await TeacherGroupPeriod.countDocuments()) === 0,
    "tasdiqlanmagan stavka maosh hisobiga kiradi!",
  );

  const dupSalary = await grab(() =>
    periodService.requestSalaryTerms(
      {
        op: "create",
        group: group._id,
        body: { teacher: String(teacher._id), startDate: today, salaryType: "fixed", fixedAmount: 9e5 },
      },
      director,
    ),
  );
  check("subyekt qulfi: ikkinchi so'rov 409", dupSalary?.statusCode === 409);

  const selfApprove = await grab(() =>
    approvalService.approve(salaryReq._id, {}, director, ["*"]),
  );
  check("o'z so'rovini o'zi tasdiqlay olmaydi", selfApprove?.statusCode === 403);

  const wrongPerm = await grab(() =>
    approvalService.approve(salaryReq._id, {}, ownerUser, [PERMISSIONS.FINANCE_APPROVE]),
  );
  check("faqat finance.approve bilan sozlama tasdiqlanmaydi", wrongPerm?.statusCode === 403);

  const salaryDone = await approvalService.approve(salaryReq._id, {}, ownerUser, DECIDE);
  check("tasdiqlandi va bajarildi", salaryDone.status === "executed", salaryDone.failureReason);

  const period = await TeacherGroupPeriod.findOne().lean();
  check("endi davr yaratildi", !!period);
  check("foiz stavka to'g'ri", period?.percentRate === 40);
  check("fiksa 0 ga normallashtirildi", period?.fixedAmount === 0);
  check(
    "createdBy = SO'ROVCHI (tasdiqlovchi emas)",
    String(period?.createdBy) === String(director._id),
  );

  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m2) CHEGIRMA\x1b[0m");

  const discReq = await discountService.requestDiscount(
    {
      op: "create",
      body: {
        student: String(student._id),
        group: String(group._id),
        type: "percent",
        value: 30,
        scope: "permanent",
        reason: "Ijtimoiy himoya",
      },
    },
    director,
  );

  check("so'rov yaratildi", !!discReq?._id);
  check("turi = discount_set", discReq.kind === APPROVAL_KINDS.DISCOUNT_SET);
  check("kategoriya = configuration", discReq.category === APPROVAL_CATEGORIES.CONFIGURATION);
  check("o'quvchi ismi snapshot qilindi", discReq.subjectName === "Sardor Aliyev");
  check(
    "\x1b[1mDiscount YARATILMAGAN\x1b[0m",
    (await Discount.countDocuments()) === 0,
    "tasdiqlanmagan chegirma o'quvchi to'lovini kamaytiradi!",
  );

  const dupDisc = await grab(() =>
    discountService.requestDiscount(
      {
        op: "create",
        body: {
          student: String(student._id),
          group: String(group._id),
          type: "fixed",
          value: 100000,
          scope: "permanent",
        },
      },
      director,
    ),
  );
  check("subyekt qulfi: ikkinchi so'rov 409", dupDisc?.statusCode === 409);

  const discDone = await approvalService.approve(discReq._id, {}, ownerUser, DECIDE);
  check("tasdiqlandi va bajarildi", discDone.status === "executed", discDone.failureReason);

  const discount = await Discount.findOne().lean();
  check("endi chegirma yaratildi", !!discount);
  check("foiz to'g'ri", discount?.value === 30 && discount?.type === "percent");
  check("doimiy (permanent)", discount?.scope === "permanent");
  check("faol", discount?.isActive === true);

  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m3) GURUH OYLIK NARXI\x1b[0m");

  // Boshlang'ich narx - "qanchadan qanchaga" snapshot'ini tekshirish uchun.
  const GroupFee = (await import("../src/models/groupFee.model.js")).default;
  const now = new Date();
  const [fy, fm] = [now.getUTCFullYear(), now.getUTCMonth() + 1];
  await GroupFee.create({ group: group._id, year: fy, month: fm, amount: 1_000_000 });

  const feeReq = await groupFeeService.requestGroupFee(
    { groupId: String(group._id), year: fy, month: fm, amount: 400_000, requestNote: "Aksiya" },
    director,
  );

  check("so'rov yaratildi", !!feeReq?._id);
  check("turi = group_fee_set", feeReq.kind === APPROVAL_KINDS.GROUP_FEE_SET);
  check("kategoriya = configuration", feeReq.category === APPROVAL_CATEGORIES.CONFIGURATION);
  check("eski narx snapshot qilindi", feeReq.payload?.previousAmount === 1_000_000);
  check(
    "\x1b[1mnarx O'ZGARMAGAN\x1b[0m",
    (await GroupFee.findOne({ group: group._id, year: fy, month: fm }).lean())?.amount === 1_000_000,
    "tasdiqlanmagan narx barcha o'quvchi hisobini o'zgartiradi!",
  );

  const dupFee = await grab(() =>
    groupFeeService.requestGroupFee(
      { groupId: String(group._id), year: fy, month: fm, amount: 500_000 },
      director,
    ),
  );
  check("subyekt qulfi: ikkinchi so'rov 409", dupFee?.statusCode === 409);

  // TASDIQLOVCHI BOSHQA FILIALNI tanlab turgan bo'lsa ham bajarilishi kerak:
  // executor so'rovning O'Z filial kontekstida ishlaydi.
  const { runWithBranchContext } = await import("../src/helpers/branchContext.helper.js");
  const otherBranch = await Branch.create({ name: "Boshqa filial" });
  const feeDone = await runWithBranchContext(
    {
      branchId: String(otherBranch._id),
      allowedBranchIds: [String(otherBranch._id)],
      canSeeAllBranches: false,
    },
    () => approvalService.approve(feeReq._id, {}, ownerUser, DECIDE),
  );
  check(
    "boshqa filial ko'rinishidan tasdiqlansa ham bajarildi",
    feeDone.status === "executed",
    feeDone.failureReason,
  );

  const fee = await GroupFee.findOne({ group: group._id, year: fy, month: fm }).lean();
  check("endi narx qo'llandi", fee?.amount === 400_000, `keldi: ${fee?.amount}`);
  check("manba 'manual' bo'ldi", fee?.source === "manual");

  // ══════════════════════════════════════════════════════════
  console.log("\n\x1b[1m4) ISHGA OLISH\x1b[0m");

  // Rol fixture'lari: "teacher" roli bitta ruxsatga ega bo'lsin.
  const perm = await Permission.create({
    key: PERMISSIONS.ATTENDANCE_RECORD,
    label: "Davomat",
    group: "attendance",
    module: "attendance",
    action: "record",
  });
  await Role.create({
    value: ROLES.TEACHER,
    label: "O'qituvchi",
    roleType: ROLE_TYPES.TEACHER,
    permissions: [perm._id],
  });

  const usersBefore = await User.countDocuments();
  const hireReq = await usersService.requestHire(
    {
      firstName: "Yangi",
      lastName: "Xodim",
      username: "yangi_xodim",
      password: "maxfiy123",
      role: ROLES.TEACHER,
      homeBranchId: String(branch._id),
      requestNote: "Ikkinchi smenaga",
    },
    director,
  );

  check("so'rov yaratildi", !!hireReq?._id);
  check("turi = staff_hire", hireReq.kind === APPROVAL_KINDS.STAFF_HIRE);
  check(
    "\x1b[1mUser YARATILMAGAN\x1b[0m",
    (await User.countDocuments()) === usersBefore,
    "tasdiqlanmagan xodim tizimga kira olardi!",
  );

  const dupHire = await grab(() =>
    usersService.requestHire(
      {
        firstName: "Boshqa",
        lastName: "Odam",
        username: "yangi_xodim",
        password: "boshqa123",
        role: ROLES.TEACHER,
        homeBranchId: String(branch._id),
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
  const detail = await approvalService.getById(hireReq._id, {
    permissions: DECIDE,
    currentUser: ownerUser,
  });
  check("parol detal javobida ham YO'Q", detail.payload?.password === undefined);
  check("boshqa payload maydonlari saqlanib qoldi", detail.payload?.username === "yangi_xodim");
  const raw = await Approval.findById(hireReq._id).lean();
  check("parol bazada esa turibdi (bajarish uchun kerak)", raw.payload?.password === "maxfiy123");

  // --- IMTIYOZ OSHIRISHDAN HIMOYA ---
  // So'rovchi rolini ruxsatsiz "director"ga almashtiramiz: endi u
  // attendance.record ruxsatiga ega bo'lmagani uchun "teacher" rolini
  // BERA OLMAYDI - owner tasdiqlasa ham.
  await Role.create({
    value: "director",
    label: "Direktor",
    roleType: ROLE_TYPES.STAFF,
    permissions: [],
  });
  await User.updateOne({ _id: director._id }, { $set: { role: "director" } });

  const escalated = await grab(() =>
    approvalService.approve(hireReq._id, {}, ownerUser, DECIDE),
  );
  check(
    "\x1b[1mimtiyoz oshirish to'sildi\x1b[0m",
    !!escalated,
    "so'rovchida yo'q ruxsatli rol owner tasdig'i bilan berilib ketdi!",
  );
  check(
    "so'rov XATO holatiga o'tdi",
    (await Approval.findById(hireReq._id).lean())?.status === "failed",
  );
  check("User baribir yaratilmadi", (await User.countDocuments()) === usersBefore);

  // So'rovchini owner qilib qaytaramiz - endi tasdiq o'tishi kerak.
  await User.updateOne({ _id: director._id }, { $set: { role: ROLES.OWNER } });
  const { invalidateRoleCache } = await import("../src/helpers/permission.helper.js");
  invalidateRoleCache();

  const retried = await approvalService.retry(hireReq._id, DECIDE);
  check("xato so'rov qayta urinishga qaytdi", retried.status === "pending");

  const hireDone = await approvalService.approve(hireReq._id, {}, ownerUser, DECIDE);
  check("tasdiqlandi va bajarildi", hireDone.status === "executed", hireDone.failureReason);

  const hired = await User.findOne({ username: "yangi_xodim" }).select("+passwordHash").lean();
  check("endi xodim yaratildi", !!hired);
  check("roli to'g'ri", hired?.role === ROLES.TEACHER);
  check("filiali to'g'ri", String(hired?.homeBranchId) === String(branch._id));
  check("paroli o'rnatildi", hired?.passwordHash === "maxfiy123");

  // ══════════════════════════════════════════════════════════
  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} xato\x1b[0m`,
  );
  if (R.notes.length) {
    console.log("\n\x1b[31mMuammolar:\x1b[0m");
    for (const n of R.notes) console.log(`  • ${n}`);
  }
};

run()
  .catch((e) => {
    console.error("\n\x1b[31mTest xato:\x1b[0m", e?.message || e);
    console.error(e?.stack?.split("\n").slice(1, 6).join("\n"));
    R.fail += 1;
  })
  .finally(async () => {
    // Test bazasini HAR DOIM o'chiramiz (xato bo'lsa ham).
    try {
      if (
        mongoose.connection.readyState === 1 &&
        mongoose.connection.name.includes("approval_test")
      ) {
        await mongoose.connection.dropDatabase();
      }
    } catch (e) {
      console.error("Tozalash xatosi:", e?.message);
    }
    await mongoose.disconnect();
    process.exit(R.fail > 0 ? 1 : 0);
  });
