/**
 * VALIDATSIYA INVARIANTLARI — PostgreSQL (Prisma) USTIDA.
 *
 * MongoDB'dan ko'chishda 19 ta Mongoose `pre("validate")` hook'i jimgina
 * ishlamay qoldi. Bu test ularning har biri uchun invariant HALI HAM
 * ushlab turilishini tekshiradi.
 *
 * HAR QOIDA IKKI DARAJADA TEKSHIRILADI:
 *
 *   a) SERVIS — foydalanuvchi o'zbekcha xato oladi. Import, job, seed va
 *      ichki chaqiruvlar HTTP/Zod qatlamini chetlab o'tadi, shuning uchun
 *      qoida aynan shu yerda turishi kerak.
 *
 *   b) BAZA (CHECK) — servis chetlab o'tilsa ham (xom SQL, `psql`, qo'lda
 *      yozilgan tuzatish skripti) yozuv o'tmasligi kerak. Bu OXIRGI
 *      himoya chizig'i: pastdagi `prisma.<model>.create` chaqiruvlari
 *      ataylab servisni AYLANIB O'TADI - ular aynan shu qatlamni sinaydi.
 *
 * Faqat (b) bo'lgan qoidalar ham bor (masalan `journal_lines` uchun) -
 * ular uchun servis testi asosiy zanjir testlarida allaqachon bor.
 *
 * ISHLATISH:  npm run test:invariants
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as teacherComp from "../src/modules/teacherSalary/services/teacherCompensation.service.js";
import * as discount from "../src/modules/finance/services/discount.service.js";
import * as kpiRule from "../src/modules/staffPayroll/services/kpiRule.service.js";
import * as staffComp from "../src/modules/staffPayroll/services/staffCompensation.service.js";
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
const mustPass = async (name, fn, check) => {
  try {
    const res = await fn();
    const problem = check ? check(res) : null;
    if (problem) bad(name, problem);
    else ok(name);
    return res;
  } catch (err) {
    bad(name, err?.message?.slice(0, 160));
    return null;
  }
};
const mustThrow = async (name, fn, match) => {
  try {
    await fn();
    bad(name, "xato kutilgan edi, lekin o'tib ketdi");
  } catch (err) {
    const msg = err?.message || "";
    if (match && !msg.toLowerCase().includes(String(match).toLowerCase())) {
      bad(name, `boshqa xato: ${msg.slice(0, 140)}`);
    } else ok(name, msg.split("\n")[0].slice(0, 62));
  }
};

// Baza cheklovi ishlaganini AYNAN cheklov nomi bo'yicha tekshiramiz -
// "biror xato chiqdi" yetarli emas: FK yoki NOT NULL xatosi ham
// o'tib ketardi va test yolg'on yashil bo'lardi.
const mustViolate = async (name, constraint, sql) => {
  try {
    await prisma.$executeRawUnsafe(sql);
    bad(name, `CHECK "${constraint}" ishlamadi — yaroqsiz qator YOZILDI`);
  } catch (err) {
    const msg = err?.message || "";
    if (msg.includes(constraint)) ok(name, constraint);
    else bad(name, `boshqa xato: ${msg.split("\n").slice(-1)[0].slice(0, 120)}`);
  }
};

const S = `inv${Date.now().toString(36)}`;
const created = { users: [], branches: [], groups: [], courses: [], rules: [], discounts: [] };

const cleanup = async () => {
  const { users: uids, branches, groups, courses, rules } = created;
  if (uids.length) {
    await prisma.teacherSalary.deleteMany({ where: { teacherId: { in: uids } } });
    await prisma.teacherCompensation.deleteMany({ where: { teacherId: { in: uids } } });
    await prisma.staffCompensation.deleteMany({ where: { employeeId: { in: uids } } });
    await prisma.staffPayroll.deleteMany({ where: { employeeId: { in: uids } } });
    await prisma.payrollAuditLog.deleteMany({
      where: { OR: [{ employeeId: { in: uids } }, { actorId: { in: uids } }] },
    });
    await prisma.discount.deleteMany({ where: { studentId: { in: uids } } });
    await prisma.studentPayment.deleteMany({ where: { studentId: { in: uids } } });
    await prisma.groupMembership.deleteMany({ where: { studentId: { in: uids } } });
  }
  if (rules.length) await prisma.kpiRule.deleteMany({ where: { id: { in: rules } } });
  if (groups.length) {
    await prisma.discount.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.groupFee.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.group.deleteMany({ where: { id: { in: groups } } });
  }
  if (courses.length) await prisma.course.deleteMany({ where: { id: { in: courses } } });
  if (uids.length) await prisma.user.deleteMany({ where: { id: { in: uids } } });
  if (branches.length) {
    await prisma.account.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  }
};

const mkUser = async (name, role, branchId) => {
  const u = await prisma.user.create({
    data: {
      firstName: name, lastName: "Test",
      username: `${name.toLowerCase()}_${S}`, passwordHash: "x",
      role, homeBranchId: branchId, hiredAt: new Date(Date.UTC(2024, 0, 1)),
    },
  });
  created.users.push(u.id);
  return u;
};

const run = async () => {
  console.log("\n=== VALIDATSIYA INVARIANTLARI / PRISMA TESTI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const br = await prisma.branch.create({ data: { name: `Inv ${S}` } });
  const br2 = await prisma.branch.create({ data: { name: `Inv2 ${S}` } });
  created.branches.push(br.id, br2.id);

  const teacher = await mkUser("Ustoz", ROLES.TEACHER, br.id);
  const student = await mkUser("Oquvchi", ROLES.STUDENT, br.id);
  const staff = await mkUser("Xodim", "reception", br.id);

  const course = await prisma.course.create({
    data: { title: `Kurs ${S}`, code: `c_${S}` },
  });
  created.courses.push(course.id);
  const group = await prisma.group.create({
    data: { name: `Guruh ${S}`, branchId: br.id, courseId: course.id },
  });
  created.groups.push(group.id);
  await prisma.groupMembership.create({
    data: { groupId: group.id, studentId: student.id, joinedAt: new Date(Date.UTC(2025, 0, 1)) },
  });

  const scope = { branchId: br.id, allowedBranchIds: [br.id], canSeeAllBranches: false, userId: null };
  const inBr = (fn) => runWithBranchContext(scope, fn);
  const actor = { id: null, permissions: ["*"], role: ROLES.OWNER };

  // ══ 1) O'QITUVCHI STAVKASI ══════════════════════════════════════
  console.log("1) o'qituvchi stavkasi (teacherCompensation)");

  await mustThrow(
    "SERVIS: ikkala qism ham 'none' bo'lgan stavka rad etiladi",
    () => inBr(() => teacherComp.setCompensation(
      { teacher: teacher.id, baseType: "none", variableType: "none",
        effectiveFrom: new Date(Date.UTC(2025, 0, 1)), branchId: br.id },
      actor,
    )),
    "Kamida bitta maosh qismi",
  );

  const comp1 = await mustPass(
    "SERVIS: baseType='none' bo'lsa baseAmount MAJBURAN 0 ga tushadi",
    () => inBr(() => teacherComp.setCompensation(
      // Foydalanuvchi "fiksa yo'q" deb belgilab, summani ekranda
      // qoldirib ketdi. Tozalanmasa rateResolver uni baribir o'qirdi.
      { teacher: teacher.id, baseType: "none", baseAmount: 3_000_000,
        variableType: "percent", variableRate: 40, percentBase: "billed",
        effectiveFrom: new Date(Date.UTC(2025, 0, 1)), branchId: br.id },
      actor,
    )),
    (c) => (c?.baseAmount === 0 ? null : `baseAmount = ${c?.baseAmount}, 0 kutilgan edi`),
  );

  await mustPass(
    "SERVIS: tuzatishda ham normalizatsiya qo'llanadi (qisman patch)",
    async () => {
      // `{ variableType: "none" }` YOLG'IZ yuboriladi - eski variableRate
      // (40) yozuvda qolib ketmasligi kerak. Fiksani ochamiz, aks holda
      // ikkalasi ham "none" bo'lib qolardi.
      const saved = await inBr(() => teacherComp.amendCompensation(
        comp1._id, { baseType: "fixed_monthly", baseAmount: 2_000_000, variableType: "none" }, actor,
      ));
      return saved;
    },
    (c) => (c?.variableRate === 0 ? null : `variableRate = ${c?.variableRate}, 0 kutilgan edi`),
  );

  await mustThrow(
    "SERVIS: tuzatish stavkani bo'shatib yubora olmaydi",
    () => inBr(() => teacherComp.amendCompensation(
      comp1._id, { baseType: "none" }, actor,
    )),
    "Kamida bitta maosh qismi",
  );

  await mustViolate(
    "BAZA: 'none' qismning summasi 0 dan farq qila olmaydi",
    "teacher_compensations_none_zeroed_check",
    `INSERT INTO teacher_compensations (id,"teacherId","branchId","effectiveFrom","baseType","baseAmount","variableType","variableRate","updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','2030-01-01','none',500000,'percent',10,NOW())`,
  );

  await mustViolate(
    "BAZA: ikkala qism ham 'none' bo'lgan stavka yozilmaydi",
    "teacher_compensations_not_empty_check",
    `INSERT INTO teacher_compensations (id,"teacherId","branchId","effectiveFrom","baseType","baseAmount","variableType","variableRate","updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','2030-01-01','none',0,'none',0,NOW())`,
  );

  await mustViolate(
    "BAZA: foiz stavkasi 100 dan oshmaydi",
    "teacher_compensations_percent_max_check",
    `INSERT INTO teacher_compensations (id,"teacherId","branchId","effectiveFrom","baseType","baseAmount","variableType","variableRate","updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','2030-01-01','none',0,'percent',150,NOW())`,
  );

  await mustViolate(
    "BAZA: yopilgan davr uzunligi musbat bo'lishi shart",
    "teacher_compensations_range_check",
    `INSERT INTO teacher_compensations (id,"teacherId","branchId","effectiveFrom","effectiveTo","baseType","baseAmount","variableType","variableRate","updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','2030-01-01','2030-01-01','fixed_monthly',100,'none',0,NOW())`,
  );

  // ══ 2) O'QITUVCHI OYLIGI ════════════════════════════════════════
  console.log("2) o'qituvchi oyligi (teacherSalary)");

  await mustViolate(
    "BAZA: guruh qatori guruhsiz bo'lolmaydi",
    "teacher_salaries_kind_group_check",
    `INSERT INTO teacher_salaries (id,"teacherId","branchId",kind,year,month,"expectedAmount","updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','group',2030,1,100000,NOW())`,
  );

  await mustViolate(
    "BAZA: fiksa (base) qatori guruhga bog'lanmaydi",
    "teacher_salaries_kind_group_check",
    `INSERT INTO teacher_salaries (id,"teacherId","branchId","groupId",kind,year,month,"expectedAmount","updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','${group.id}','base',2030,1,100000,NOW())`,
  );

  await mustPass(
    "BAZA: boshlang'ich qoldiq (opening) guruhsiz bo'la OLADI",
    async () => {
      // Bu qoidaning teskari tomoni: cheklov haddan tashqari qattiq
      // bo'lsa, "markaz o'qituvchiga qarzdor" fakti umuman yozilmasdi.
      await prisma.$executeRawUnsafe(
        `INSERT INTO teacher_salaries (id,"teacherId","branchId",kind,year,month,"expectedAmount","isOpening","updatedAt")
         VALUES (gen_object_id(),'${teacher.id}','${br.id}','opening',2030,1,-3000000,true,NOW())`,
      );
      return prisma.teacherSalary.findFirst({
        where: { teacherId: teacher.id, kind: "opening", year: 2030 },
      });
    },
    (r) => (r && r.expectedAmount === -3_000_000 ? null : "manfiy qoldiq yozilmadi"),
  );

  // ══ 3) CHEGIRMA ═════════════════════════════════════════════════
  console.log("3) chegirma (discount)");

  await mustThrow(
    "SERVIS: 100% dan katta foiz chegirma rad etiladi",
    () => inBr(() => discount.create(
      { student: student.id, group: group.id, type: "percent", value: 150, scope: "permanent" },
      actor,
    )),
    "Foiz 100 dan oshmasligi",
  );

  await mustThrow(
    "SERVIS: oylik chegirma yil/oysiz rad etiladi (avval JIMGINA yozilardi)",
    () => inBr(() => discount.create(
      { student: student.id, group: group.id, type: "fixed", value: 50_000, scope: "monthly" },
      actor,
    )),
    "yil va oy kerak",
  );

  await mustViolate(
    "BAZA: foiz chegirma 100 dan oshmaydi",
    "discounts_percent_max_check",
    `INSERT INTO discounts (id,"studentId","groupId",type,value,scope,"updatedAt")
     VALUES (gen_object_id(),'${student.id}','${group.id}','percent',150,'permanent',NOW())`,
  );

  await mustViolate(
    "BAZA: oylik chegirma yil/oysiz yozilmaydi",
    "discounts_monthly_scope_check",
    `INSERT INTO discounts (id,"studentId","groupId",type,value,scope,"updatedAt")
     VALUES (gen_object_id(),'${student.id}','${group.id}','fixed',50000,'monthly',NOW())`,
  );

  // ══ 4) KPI QOIDASI ══════════════════════════════════════════════
  console.log("4) KPI qoidasi (kpiRule)");

  await mustThrow(
    "SERVIS: foizli KPI mukofoti 100 dan oshmaydi",
    // Audit buni "moduldagi eng katta cheklanmagan pul teshigi" deb
    // belgilagan: rewardValue=5000 har to'lovning 5000% ini yozib berardi.
    () => kpiRule.create(
      { name: `Teshik ${S}`, trigger: "student_first_payment",
        rewardType: "percent", rewardValue: 5000 },
      actor,
    ),
    "Foiz stavkasi 100 dan oshmasligi",
  );

  const rule = await mustPass(
    "SERVIS: haqiqiy foizli qoida yaratiladi",
    async () => {
      const r = await kpiRule.create(
        { name: `Foiz ${S}`, trigger: "student_first_payment",
          rewardType: "percent", rewardValue: 5 },
        actor,
      );
      created.rules.push(r._id);
      return r;
    },
    (r) => (r?.rewardValue === 5 ? null : "qoida yozilmadi"),
  );

  await mustThrow(
    "SERVIS: turni 'percent' ga o'zgartirish ESKI so'mli qiymatni tutadi",
    async () => {
      // Qisman patch tuzog'i: `{rewardType:"percent"}` yolg'iz yuboriladi,
      // rewardValue esa yozuvda 500 000 so'm bo'lib qoladi.
      const sum = await kpiRule.create(
        { name: `Sum ${S}`, trigger: "student_first_payment",
          rewardType: "fixed", rewardValue: 500_000 },
        actor,
      );
      created.rules.push(sum._id);
      return kpiRule.update(sum._id, { rewardType: "percent" }, actor);
    },
    "Foiz stavkasi 100 dan oshmasligi",
  );

  await mustViolate(
    "BAZA: foizli KPI mukofoti 100 dan oshmaydi",
    "kpi_rules_percent_max_check",
    `INSERT INTO kpi_rules (id,name,trigger,"rewardType","rewardValue","updatedAt")
     VALUES (gen_object_id(),'raw ${S}','student_first_payment','percent',5000,NOW())`,
  );

  // ══ 5) XODIM SHARTNOMASI ════════════════════════════════════════
  console.log("5) xodim shartnomasi (staffCompensation)");

  const sc = await mustPass(
    "SERVIS: fiksa shartnoma o'rnatiladi",
    () => inBr(() => staffComp.setCompensation(
      { employee: staff.id, salaryType: "fixed", baseAmount: 3_000_000,
        effectiveFrom: new Date(Date.UTC(2025, 0, 1)), branchId: br.id },
      actor,
    )),
    (c) => (c?.baseAmount === 3_000_000 ? null : "shartnoma yozilmadi"),
  );

  await mustPass(
    "SERVIS: 'kpi_only' ga o'tkazish fiksa summani 0 QILADI (tuzatish yo'li)",
    // Bu yo'lda koersiya YO'Q edi: `{salaryType:"kpi_only"}` yolg'iz
    // yuborilsa 3 000 000 joyida qolib, maosh varaqasiga hech qachon
    // to'lanmaydigan "asosiy maosh" bo'lib tushardi.
    () => inBr(() => staffComp.amendCompensation(sc._id, { salaryType: "kpi_only" }, actor)),
    (c) => (c?.baseAmount === 0 ? null : `baseAmount = ${c?.baseAmount}, 0 kutilgan edi`),
  );

  await mustViolate(
    "BAZA: yopilgan shartnoma davri musbat bo'lishi shart",
    "staff_compensations_range_check",
    `INSERT INTO staff_compensations (id,"employeeId","branchId","salaryType","baseAmount","effectiveFrom","effectiveTo","updatedAt")
     VALUES (gen_object_id(),'${staff.id}','${br.id}','fixed',100,'2030-01-01','2029-01-01',NOW())`,
  );

  // ══ 6) JURNAL QATORLARI ═════════════════════════════════════════
  console.log("6) jurnal qatorlari (journalLine)");

  const acc = await prisma.account.create({ data: { branchId: br.id, kind: "cash" } });
  const entry = await prisma.journalEntry.create({
    data: { branchId: br.id, date: new Date(), kind: "adjustment", totalDebit: 0, totalCredit: 0 },
  });

  await mustViolate(
    "BAZA: bitta qatorda debet va kredit birga bo'lmaydi",
    // Bu qator YIG'INDI muvozanatidan muammosiz o'tadi (500k == 500k),
    // lekin bitta hisobning ikkala tomonini harakatlantirib, balansni
    // abadiy ikki marta sanatadi.
    "journal_lines_single_side_check",
    `INSERT INTO journal_lines (id,"entryId","accountId","accountKind",debit,credit)
     VALUES (gen_object_id(),'${entry.id}','${acc.id}','cash',500000,500000)`,
  );

  await mustViolate(
    "BAZA: bo'sh qator (ikkalasi ham 0) yozilmaydi",
    "journal_lines_nonzero_check",
    `INSERT INTO journal_lines (id,"entryId","accountId","accountKind",debit,credit)
     VALUES (gen_object_id(),'${entry.id}','${acc.id}','cash',0,0)`,
  );

  await mustViolate(
    "BAZA: manfiy summali qator yozilmaydi",
    "journal_lines_amounts_nonneg_check",
    `INSERT INTO journal_lines (id,"entryId","accountId","accountKind",debit,credit)
     VALUES (gen_object_id(),'${entry.id}','${acc.id}','cash',-500000,0)`,
  );

  await prisma.journalEntry.delete({ where: { id: entry.id } });

  // ══ 7) HISOBLAR ═════════════════════════════════════════════════
  console.log("7) hisoblar (account)");

  await mustViolate(
    "BAZA: filiallararo hisob qarshi filialsiz bo'lmaydi",
    "accounts_counterparty_shape_check",
    `INSERT INTO accounts (id,"branchId",kind,"updatedAt") VALUES (gen_object_id(),'${br.id}','due_from',NOW())`,
  );

  await mustViolate(
    "BAZA: oddiy hisobda qarshi filial bo'lmaydi",
    "accounts_counterparty_shape_check",
    `INSERT INTO accounts (id,"branchId",kind,"counterpartyBranchId","updatedAt")
     VALUES (gen_object_id(),'${br.id}','cash','${br2.id}',NOW())`,
  );

  await mustViolate(
    "BAZA: filial o'ziga qarzdor bo'la olmaydi",
    "accounts_no_self_counterparty_check",
    `INSERT INTO accounts (id,"branchId",kind,"counterpartyBranchId","updatedAt")
     VALUES (gen_object_id(),'${br.id}','due_from','${br.id}',NOW())`,
  );

  // ══ 8) BOSHLANG'ICH QOLDIQ ══════════════════════════════════════
  console.log("8) boshlang'ich qoldiq (openingBalance)");

  await mustViolate(
    "BAZA: nol qoldiq yozilmaydi",
    "opening_balances_nonzero_check",
    `INSERT INTO opening_balances (id,"userId","branchId",kind,amount,year,month,role,"updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','teacher_debt',0,2025,1,'teacher',NOW())`,
  );

  await mustViolate(
    "BAZA: kasrli qoldiq yozilmaydi (butun so'm)",
    "opening_balances_integer_check",
    `INSERT INTO opening_balances (id,"userId","branchId",kind,amount,year,month,role,"updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','teacher_debt',3000000.5,2025,1,'teacher',NOW())`,
  );

  await mustViolate(
    "BAZA: 500 mln dan katta qoldiq yozilmaydi",
    "opening_balances_max_check",
    `INSERT INTO opening_balances (id,"userId","branchId",kind,amount,year,month,role,"updatedAt")
     VALUES (gen_object_id(),'${teacher.id}','${br.id}','teacher_debt',900000000,2025,1,'teacher',NOW())`,
  );

  await mustPass(
    "BAZA: MANFIY qoldiq yoziladi — ishora ma'noli, cheklanmaydi",
    async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO opening_balances (id,"userId","branchId",kind,amount,year,month,role,"updatedAt")
         VALUES (gen_object_id(),'${teacher.id}','${br.id}','teacher_debt',-3000000,2025,1,'teacher',NOW())`,
      );
      return prisma.openingBalance.findFirst({ where: { userId: teacher.id } });
    },
    (r) => (r?.amount === -3_000_000 ? null : `amount = ${r?.amount}`),
  );

  // ══ 9) XODIM MUKOFOTI / JARIMASI ════════════════════════════════
  console.log("9) xodim mukofoti / jarimasi (staffPayrollAdjustment)");

  await mustViolate(
    "BAZA: 0 so'mlik mukofot yozilmaydi",
    "staff_payroll_adjustments_amount_min_check",
    `INSERT INTO staff_payroll_adjustments (id,"employeeId","branchId",kind,year,month,amount,reason,"updatedAt")
     VALUES (gen_object_id(),'${staff.id}','${br.id}','bonus',2025,1,0,'test',NOW())`,
  );

  await mustViolate(
    "BAZA: manfiy summa yozilmaydi (ishora `kind` da)",
    "staff_payroll_adjustments_amount_min_check",
    `INSERT INTO staff_payroll_adjustments (id,"employeeId","branchId",kind,year,month,amount,reason,"updatedAt")
     VALUES (gen_object_id(),'${staff.id}','${br.id}','penalty',2025,1,-50000,'test',NOW())`,
  );

  await mustViolate(
    "BAZA: 13-oy yozilmaydi",
    "staff_payroll_adjustments_month_check",
    `INSERT INTO staff_payroll_adjustments (id,"employeeId","branchId",kind,year,month,amount,reason,"updatedAt")
     VALUES (gen_object_id(),'${staff.id}','${br.id}','bonus',2025,13,50000,'test',NOW())`,
  );

  await mustViolate(
    "BAZA: sababsiz jarima yozilmaydi",
    "staff_payroll_adjustments_reason_len_check",
    `INSERT INTO staff_payroll_adjustments (id,"employeeId","branchId",kind,year,month,amount,reason,"updatedAt")
     VALUES (gen_object_id(),'${staff.id}','${br.id}','penalty',2025,1,50000,'',NOW())`,
  );

  await mustViolate(
    "BAZA: yassilangan carriedFrom yarim to'ldirilmaydi",
    // Mongo'da `carriedFrom` BITTA ichki obyekt edi - yo bor, yo yo'q.
    // Ikkita ustunga bo'linganda "yil bor, oy yo'q" holati paydo bo'ldi.
    "staff_payroll_adjustments_carried_from_pair_check",
    `INSERT INTO staff_payroll_adjustments (id,"employeeId","branchId",kind,year,month,amount,reason,"carriedFromYear","updatedAt")
     VALUES (gen_object_id(),'${staff.id}','${br.id}','opening_debt',2025,2,50000,'ko''chirildi',2025,NOW())`,
  );

  // ══ 10) QOLGAN SOF QOIDALAR ═════════════════════════════════════
  console.log("10) bayram, lead marshruti, sana oraliqlari, o'tkazma");

  await mustViolate(
    "BAZA: bir martalik bayram yilsiz bo'lmaydi",
    "holidays_recurring_year_check",
    `INSERT INTO holidays (id,name,message,month,day,"isRecurring","updatedAt")
     VALUES (gen_object_id(),'Test ${S}','xabar',3,21,false,NOW())`,
  );

  await mustViolate(
    "BAZA: takrorlanuvchi bayramda yil bo'lmaydi",
    "holidays_recurring_year_check",
    `INSERT INTO holidays (id,name,message,month,day,"isRecurring",year,"updatedAt")
     VALUES (gen_object_id(),'Test2 ${S}','xabar',3,21,true,2025,NOW())`,
  );

  await mustViolate(
    "BAZA: zaxira lead qoidasida manba bo'lmaydi",
    "lead_routing_rules_fallback_shape_check",
    `INSERT INTO lead_routing_rules (id,"branchId","isFallback","sourceKey","updatedAt")
     VALUES (gen_object_id(),'${br.id}',true,'instagram',NOW())`,
  );

  await mustViolate(
    "BAZA: oddiy lead qoidasi manbasiz bo'lmaydi",
    "lead_routing_rules_fallback_shape_check",
    `INSERT INTO lead_routing_rules (id,"branchId","isFallback","updatedAt")
     VALUES (gen_object_id(),'${br.id}',false,NOW())`,
  );

  await mustViolate(
    "BAZA: muzlatish tugashi boshlanishidan oldin bo'lmaydi",
    "student_freezes_range_check",
    `INSERT INTO student_freezes (id,"studentId","startDate","endDate","updatedAt")
     VALUES (gen_object_id(),'${student.id}','2025-06-01','2025-05-01',NOW())`,
  );

  await mustPass(
    "BAZA: bir kunlik muzlatish (start = end) MUMKIN",
    async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO student_freezes (id,"studentId","startDate","endDate","updatedAt")
         VALUES (gen_object_id(),'${student.id}','2025-06-01','2025-06-01',NOW())`,
      );
      const r = await prisma.studentFreeze.findFirst({ where: { studentId: student.id } });
      await prisma.studentFreeze.deleteMany({ where: { studentId: student.id } });
      return r;
    },
    (r) => (r ? null : "yozilmadi"),
  );

  await mustViolate(
    "BAZA: filial o'ziga pul jo'nata olmaydi",
    "cash_transfers_distinct_branches_check",
    `INSERT INTO cash_transfers (id,"fromBranchId","toBranchId",amount,"sentAt","updatedAt")
     VALUES (gen_object_id(),'${br.id}','${br.id}',100000,NOW(),NOW())`,
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
    process.exit(R.fail ? 1 : 0);
  });
