// Foydalanuvchini BUTUNLAY (hard) o'chirish uchun bog'liqlik tekshiruvi.
//
// Qoida: foydalanuvchi biror domen/moliya ma'lumotiga bog'liq bo'lsa -
// o'chirib BO'LMAYDI (aks holda kirim/qarz/oylik hisob-kitoblari
// buziladi). Faqat hech qanday biznes ma'lumoti bo'lmagandagina yozuv
// 100% drop qilinadi.
//
// ═════════════════════════════════════════════════════════════════
// MONGO → POSTGRES: O'CHIRISH TARTIBI ENDI MAJBURIY
//
// Mongo'da tashqi kalitlar (FK) YO'Q edi - qatorlarni istalgan
// tartibda o'chirish mumkin edi va yetim yozuvlar jimgina qolib
// ketardi. PostgreSQL'da FK bor, ya'ni:
//
//   • BOLA qator OTA'sidan OLDIN o'chirilishi shart, aks holda
//     `RESTRICT` xato beradi va butun tranzaksiya orqaga qaytadi;
//   • `SET NULL` bo'lgan bog'lanishlar o'zi tozalanadi;
//   • `CASCADE` bo'lganlari (refresh_tokens, user_branch_assignments,
//     group_schedule_items, debt_write_off_breakdown) o'zi ketadi.
//
// AYNAN SHU sabab bilan quyidagi ketma-ketlik TASODIFIY EMAS. Eng og'ir
// ikkita bog'lanish:
//     payment_transactions.paymentId → student_payments   (RESTRICT)
//     salary_transactions.salaryId   → teacher_salaries   (RESTRICT)
// Ya'ni TO'LOVLAR har doim PLAN/MAOSH qatoridan OLDIN o'chiriladi.
//
// NIMA QO'SHILDI: Mongo varianti bir nechta jadvalni umuman
// o'chirmasdi (depozit, muzlatish, boshlang'ich qoldiq, yomon qarz,
// maosh stavkasi, audit jurnali). U yerda bu "yetim qator" degani edi;
// Postgres'da esa `RESTRICT` tufayli o'chirishning O'ZI ishlamaydi.
// Har bir qo'shimcha o'z joyida izohlangan.
//
// Boshqa moslashtirishlar: `{ student: id }` → `{ studentId: id }`,
// `Group.teachers` massiv → ko'p-ko'pga (`some` / `disconnect`),
// `.distinct("group")` → `findMany({ distinct, select })`,
// `session` → `tx`.
// ═════════════════════════════════════════════════════════════════
import prisma from "../config/prisma.js";

const db = (tx) => tx || prisma;

/**
 * Bloklovchi bog'liqliklar.
 *
 * Foydalanuvchi shu yozuvlarning SUBYEKTI bo'lsa, o'chirish taqiqlanadi.
 * (createdBy/updatedBy kabi audit maydonlari BLOKLAMAYDI - ular
 * "kim qildi" izi, subyekt emas.)
 *
 * `isDeleted` holatidan QAT'I NAZAR sanaladi: soft-delete qilingan
 * yozuv ham havola sifatida qoladi va uni yetim qoldirib bo'lmaydi.
 */
const blockingCounters = (client, id) => [
  // ── O'quvchi (student) sifatidagi bog'liqliklar ──
  { label: "Guruh a'zoligi", run: () => client.groupMembership.count({ where: { studentId: id } }) },
  { label: "Davomat yozuvlari", run: () => client.attendance.count({ where: { studentId: id } }) },
  { label: "Davomat imtiyozlari", run: () => client.attendanceExemption.count({ where: { studentId: id } }) },
  { label: "Baholar", run: () => client.grade.count({ where: { studentId: id } }) },
  { label: "To'lov hisoblari", run: () => client.studentPayment.count({ where: { studentId: id } }) },
  { label: "To'lov tranzaksiyalari", run: () => client.paymentTransaction.count({ where: { studentId: id } }) },
  { label: "Depozit hisobi", run: () => client.studentDeposit.count({ where: { studentId: id } }) },
  { label: "Depozit tranzaksiyalari", run: () => client.depositTransaction.count({ where: { studentId: id } }) },
  { label: "Chegirmalar", run: () => client.discount.count({ where: { studentId: id } }) },
  { label: "Fikr-mulohazalar", run: () => client.feedback.count({ where: { authorId: id } }) },
  { label: "Lid (konversiya)", run: () => client.lead.count({ where: { studentId: id } }) },

  // ── O'qituvchi (teacher) sifatidagi bog'liqliklar ──
  // Ko'p-ko'pga: guruh o'qituvchilari ro'yxatida turibdimi.
  { label: "Biriktirilgan guruhlar", run: () => client.group.count({ where: { teachers: { some: { id } } } }) },
  { label: "O'qituvchi davomati", run: () => client.teacherAttendance.count({ where: { teacherId: id } }) },
  { label: "O'qituvchi yo'qliklari", run: () => client.teacherAbsence.count({ where: { teacherId: id } }) },
  { label: "O'qituvchi oyliklari", run: () => client.teacherSalary.count({ where: { teacherId: id } }) },
  { label: "Oylik tranzaksiyalari", run: () => client.salaryTransaction.count({ where: { teacherId: id } }) },
  { label: "O'qituvchi guruh davrlari", run: () => client.teacherGroupPeriod.count({ where: { teacherId: id } }) },

  // ── FAQAT POSTGRES SABABLI QO'SHILGANLAR ──
  //
  // Bu jadvallardagi FK `RESTRICT`, ustunlari esa NOT NULL - ya'ni
  // qatorni null'ga tushirib ham bo'lmaydi. Ular hard-delete yo'lida
  // o'chirilmaydi (mansubligi noaniq yoki audit qiymati bor), demak
  // ULARNI OLDINDAN, TUSHUNARLI XABAR BILAN to'sish kerak - aks holda
  // foydalanuvchi tranzaksiya o'rtasidagi xom FK xatosini ko'rardi.
  { label: "Berilgan topshiriqlar", run: () => client.assignment.count({ where: { senderId: id } }) },
  { label: "Topshiriq oluvchilari", run: () => client.assignmentRecipient.count({ where: { studentId: id } }) },
  { label: "Yozilgan baholar", run: () => client.grade.count({ where: { recordedById: id } }) },
  { label: "Belgilangan yo'qliklar", run: () => client.teacherAbsence.count({ where: { recordedById: id } }) },
  { label: "Kassa smenalari", run: () => client.shift.count({ where: { cashierId: id } }) },
  { label: "Tasdiq so'rovlari", run: () => client.approval.count({ where: { requestedById: id } }) },
  { label: "Xodim oyliklari", run: () => client.staffPayroll.count({ where: { employeeId: id } }) },
  { label: "Xodim maosh shartnomasi", run: () => client.staffCompensation.count({ where: { employeeId: id } }) },
  { label: "Xodim maosh to'lovlari", run: () => client.staffSalaryTransaction.count({ where: { employeeId: id } }) },
  { label: "Xodim KPI biriktiruvlari", run: () => client.staffKpiAssignment.count({ where: { employeeId: id } }) },
];

/**
 * Foydalanuvchiga bog'liq, o'chirishni TAQIQLOVCHI ma'lumotlar ro'yxati.
 * Qaytaradi: [{ label, count }] - bo'sh bo'lsa, o'chirish mumkin.
 */
export const findUserBlockingRelations = async (userId) => {
  const id = String(userId);
  const counters = blockingCounters(prisma, id);
  const counts = await Promise.all(counters.map((c) => c.run()));
  return counters
    .map((c, i) => ({ label: c.label, count: counts[i] }))
    .filter((r) => r.count > 0);
};

/**
 * Bloklamaydigan QOLDIQ ma'lumot (sessiya/audit/yetkazish) - hard
 * o'chirishda birga drop qilinadi. Bular hisob-kitobga ta'sir qilmaydi.
 *
 * `tx` berilsa bitta tranzaksiyada KETMA-KET bajariladi (parallel emas).
 */
export const purgeUserResidualData = async (userId, { tx } = {}) => {
  const id = String(userId);
  const client = db(tx);

  // refresh_tokens FK'si CASCADE, lekin ochiq o'chirish arzon va
  // niyatni ko'rsatib turadi.
  await client.refreshToken.deleteMany({ where: { userId: id } });
  await client.activityLog.deleteMany({ where: { userId: id } });
  await client.notificationRecipient.deleteMany({ where: { userId: id } });
  await client.archiveLog.deleteMany({ where: { userId: id } });

  // MAOSH AUDIT JURNALI - `employeeId` RESTRICT va NOT NULL.
  // Mongo'da bu jadval umuman tegilmasdi; Postgres'da uni tozalamasdan
  // foydalanuvchini o'chirib bo'lmaydi. Audit izi shu odamga tegishli
  // bo'lgani uchun u bilan birga ketadi (odam yo'q - izi ham keraksiz).
  await client.payrollAuditLog.deleteMany({ where: { employeeId: id } });

  // Telegram ulanishini uzamiz (botUser yozuvi telegramId bo'yicha qoladi -
  // shu telefon qayta ro'yxatdan o'tsa, eski chat ID topiladi).
  await client.botUser.updateMany({
    where: { userId: id },
    data: { userId: null, flowState: null },
  });
};

/**
 * O'QUVCHIGA oid BARCHA yozuvlarni FIZIK o'chiradi (cascade hard-delete).
 *
 * Lead (lid) yozuvi SAQLANADI - faqat bog'lanish uziladi (studentId=null),
 * shunda sotuv konversiya statistikasi buzilmaydi.
 *
 * Moliyaviy recalc uchun ta'sirlangan guruh ID'lari qaytariladi -
 * ular o'chirishdan OLDIN yig'iladi (keyin topib bo'lmaydi).
 *
 * TARTIB FK BO'YICHA: bola → ota.
 */
export const hardDeleteStudentData = async (studentId, { tx } = {}) => {
  const id = String(studentId);
  const client = db(tx);

  // Recalc uchun ta'sirlangan guruhlar - to'lov va a'zoliklardan.
  const [payRows, memRows] = await Promise.all([
    client.studentPayment.findMany({
      where: { studentId: id },
      select: { groupId: true },
      distinct: ["groupId"],
    }),
    client.groupMembership.findMany({
      where: { studentId: id },
      select: { groupId: true },
      distinct: ["groupId"],
    }),
  ]);
  const groupIds = [
    ...new Set(
      [...payRows, ...memRows].map((r) => r.groupId).filter(Boolean).map(String),
    ),
  ];

  // ── 1) MOLIYA: eng chuqur bolalardan yuqoriga ──
  // payment_transactions.paymentId → student_payments  (RESTRICT)
  await client.paymentTransaction.deleteMany({ where: { studentId: id } });
  // debt_write_offs.studentId → users (RESTRICT) - yozuvning O'ZI ketishi
  // shart. Breakdown unga CASCADE bilan bog'langan, o'zi ketadi.
  await client.debtWriteOff.deleteMany({ where: { studentId: id } });
  // deposit_transactions.depositId → student_deposits (RESTRICT)
  await client.depositTransaction.deleteMany({ where: { studentId: id } });
  await client.studentDeposit.deleteMany({ where: { studentId: id } });
  await client.studentPayment.deleteMany({ where: { studentId: id } });

  // ── 2) DOMEN ──
  await client.groupMembership.deleteMany({ where: { studentId: id } });
  await client.attendance.deleteMany({ where: { studentId: id } });
  await client.attendanceExemption.deleteMany({ where: { studentId: id } });
  await client.grade.deleteMany({ where: { studentId: id } });
  await client.discount.deleteMany({ where: { studentId: id } });
  await client.feedback.deleteMany({ where: { authorId: id } });
  // student_freezes.studentId → users (RESTRICT, NOT NULL)
  await client.studentFreeze.deleteMany({ where: { studentId: id } });
  // assignment_recipients.studentId → users (RESTRICT, NOT NULL)
  await client.assignmentRecipient.deleteMany({ where: { studentId: id } });
  // opening_balances.userId → users (RESTRICT, NOT NULL). Yozuv import
  // idempotentligining langari edi, lekin odamning O'ZI o'chgach u
  // hech nimani himoya qilmaydi (qayta import yangi ID yaratadi).
  await client.openingBalance.deleteMany({ where: { userId: id } });

  await client.lead.updateMany({
    where: { studentId: id },
    data: { studentId: null },
  });

  return groupIds;
};

/**
 * O'QITUVCHIGA oid BARCHA yozuvlarni FIZIK o'chiradi.
 *
 * MOLIYAVIY IZCHILLIK NOZIKLIGI (o'quvchidan FARQLI): o'qituvchi
 * maoshlari o'zaro BOG'LIQ EMAS - har biri o'z davri stavkasi + guruh
 * kirimidan hisoblanadi. Shu sababli bu o'qituvchini o'chirish boshqa
 * o'qituvchilar maoshini O'ZGARTIRMAYDI; guruh kirimi ham o'zgarmaydi.
 */
export const hardDeleteTeacherData = async (teacherId, { tx } = {}) => {
  const id = String(teacherId);
  const client = db(tx);

  // Ta'sirlangan guruhlar - davrlardan va guruh biriktiruvidan.
  const [periodRows, groupRows] = await Promise.all([
    client.teacherGroupPeriod.findMany({
      where: { teacherId: id },
      select: { groupId: true },
      distinct: ["groupId"],
    }),
    client.group.findMany({
      where: { teachers: { some: { id } } },
      select: { id: true },
    }),
  ]);
  const groupIds = [
    ...new Set(
      [
        ...periodRows.map((r) => r.groupId),
        ...groupRows.map((r) => r.id),
      ]
        .filter(Boolean)
        .map(String),
    ),
  ];

  // ── MOLIYA (chiqim tomoni) - TARTIB MUHIM ──
  // salary_transactions.salaryId → teacher_salaries (RESTRICT):
  // to'lovlar maosh qatorlaridan OLDIN o'chirilishi SHART.
  await client.salaryTransaction.deleteMany({ where: { teacherId: id } });
  await client.teacherSalary.deleteMany({ where: { teacherId: id } });
  await client.teacherGroupPeriod.deleteMany({ where: { teacherId: id } });
  // teacher_compensations.teacherId → users (RESTRICT, NOT NULL).
  // Mongo'da tegilmasdi; stavka tarixi faqat shu odamga tegishli.
  await client.teacherCompensation.deleteMany({ where: { teacherId: id } });
  // opening_balances.userId → users (RESTRICT) - o'qituvchida ham bo'lishi
  // mumkin (boshlang'ich qoldiq).
  await client.openingBalance.deleteMany({ where: { userId: id } });

  // ── HR / domen ──
  await client.teacherAttendance.deleteMany({ where: { teacherId: id } });
  await client.teacherAbsence.deleteMany({ where: { teacherId: id } });
  await client.feedback.deleteMany({ where: { authorId: id } });

  // O'QUVCHI DAVOMATI O'CHIRILMAYDI - u GURUHGA tegishli, o'qituvchiga
  // emas. Faqat "kim belgiladi" audit havolasi uziladi, aks holda yozuv
  // mavjud bo'lmagan foydalanuvchiga ishora qilib qolardi. O'quvchining
  // dars tarixi bir xodim ishdan ketgani uchun yo'qolmasligi kerak.
  await client.attendance.updateMany({
    where: { recordedById: id },
    data: { recordedById: null },
  });

  // Guruh biriktiruvidan olib tashlaymiz.
  //
  // Mongo'da bu `$pull` edi (massivdan element chiqarish). Prisma'da
  // ko'p-ko'pga bog'lanish `disconnect` bilan uziladi - ya'ni join
  // jadvalidagi qator o'chadi. Guruhning O'ZI tegilmaydi.
  for (const gid of groupRows.map((g) => g.id)) {
    // eslint-disable-next-line no-await-in-loop
    await client.group.update({
      where: { id: gid },
      data: { teachers: { disconnect: { id } } },
    });
  }

  return groupIds;
};

/**
 * GURUHGA oid BARCHA yozuvlarni FIZIK o'chiradi.
 *
 * DIQQAT: depozit-qoplama (source:"deposit" PaymentTransaction) o'quvchi
 * depozitiga QAYTARILISHI kerak (aks holda garov buziladi) - bu esa
 * chaqiruvchida (groups.service.permanentRemove) o'chirishdan OLDIN
 * bajariladi. Bu funksiya faqat o'chiradi.
 *
 * Ta'sirlangan o'quvchilar (completedAt qayta hisoblash uchun)
 * o'chirishdan OLDIN yig'iladi.
 *
 * TARTIB FK BO'YICHA: bola → ota. Xususan:
 *   payment_transactions → student_payments  (RESTRICT)
 *   salary_transactions  → teacher_salaries  (RESTRICT)
 *   debt_write_off_breakdown → debt_write_offs (CASCADE)
 */
export const hardDeleteGroupData = async (groupId, { tx } = {}) => {
  const id = String(groupId);
  const client = db(tx);

  const memberRows = await client.groupMembership.findMany({
    where: { groupId: id },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  const studentIds = memberRows.map((r) => String(r.studentId)).filter(Boolean);

  // ── MOLIYA (kirim): bolalardan boshlab ──
  await client.paymentTransaction.deleteMany({ where: { groupId: id } });
  // debt_write_offs.groupId → groups (RESTRICT): guruh o'chishi uchun
  // yomon qarz yozuvlari ham ketishi shart (breakdown CASCADE bilan).
  await client.debtWriteOff.deleteMany({ where: { groupId: id } });
  await client.studentPayment.deleteMany({ where: { groupId: id } });
  await client.groupFee.deleteMany({ where: { groupId: id } });
  await client.discount.deleteMany({ where: { groupId: id } });

  // ── MOLIYA (chiqim) ──
  await client.salaryTransaction.deleteMany({ where: { groupId: id } });
  await client.teacherSalary.deleteMany({ where: { groupId: id } });
  await client.teacherGroupPeriod.deleteMany({ where: { groupId: id } });

  // ── DOMEN ──
  await client.groupMembership.deleteMany({ where: { groupId: id } });
  await client.attendance.deleteMany({ where: { groupId: id } });
  await client.grade.deleteMany({ where: { groupId: id } });
  await client.teacherAbsence.deleteMany({ where: { groupId: id } });
  await client.feedback.deleteMany({ where: { groupId: id } });
  // lesson_cancellations.groupId → groups (RESTRICT). Mongo'da tegilmasdi.
  await client.lessonCancellation.deleteMany({ where: { groupId: id } });

  return studentIds;
};
