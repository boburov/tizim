// Foydalanuvchini BUTUNLAY (hard) o'chirish uchun bog'liqlik tekshiruvi.
//
// Qoida: foydalanuvchi biror domen/moliya ma'lumotiga bog'liq bo'lsa -
// o'chirib BO'LMAYDI (aks holda kirim/qarz/oylik hisob-kitoblari
// buziladi). Faqat hech qanday biznes ma'lumoti bo'lmagandagina yozuv
// 100% drop qilinadi.
//
// ─────────────────────────────────────────────────────────────────
// MONGO → PRISMA: NIMA O'ZGARDI VA NIMA O'ZGARMADI
//
// O'ZGARMADI: bloklovchi bog'liqliklar ro'yxati, ularning ma'nosi,
// o'chirish tartibi va qaytariladigan qiymatlar. Bu fayl PUL bilan
// ishlaydi, shuning uchun mantiq bir xil qoldi.
//
// O'ZGARDI:
//   - `{ student: id }` → `{ studentId: id }`. Prisma'da `student` bu
//     RELATION, `studentId` esa ustun. Eskisini yozib qo'yish xato
//     bermaydi - u boshqa ma'noga ega bo'lib, jimgina noto'g'ri
//     natija berardi.
//   - `Group.teachers` massiv edi, endi ko'p-ko'pga bog'lanish:
//     `{ teachers: { some: { id } } }` va `disconnect`.
//   - `.distinct("group")` → `findMany({ distinct, select })`.
//   - `session` → `tx` (Prisma tranzaksiya klienti).
// ─────────────────────────────────────────────────────────────────
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

  await client.refreshToken.deleteMany({ where: { userId: id } });
  await client.activityLog.deleteMany({ where: { userId: id } });
  await client.notificationRecipient.deleteMany({ where: { userId: id } });
  await client.archiveLog.deleteMany({ where: { userId: id } });

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

  await client.groupMembership.deleteMany({ where: { studentId: id } });
  await client.attendance.deleteMany({ where: { studentId: id } });
  await client.attendanceExemption.deleteMany({ where: { studentId: id } });
  await client.grade.deleteMany({ where: { studentId: id } });
  await client.studentPayment.deleteMany({ where: { studentId: id } });
  await client.paymentTransaction.deleteMany({ where: { studentId: id } });
  await client.studentDeposit.deleteMany({ where: { studentId: id } });
  await client.depositTransaction.deleteMany({ where: { studentId: id } });
  await client.discount.deleteMany({ where: { studentId: id } });
  await client.feedback.deleteMany({ where: { authorId: id } });
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

  // Moliya (chiqim tomoni): maosh hisoblari + maosh to'lovlari.
  await client.teacherGroupPeriod.deleteMany({ where: { teacherId: id } });
  await client.teacherSalary.deleteMany({ where: { teacherId: id } });
  await client.salaryTransaction.deleteMany({ where: { teacherId: id } });
  // HR/domen: davomat, yo'qliklar, o'qituvchi yozgan fikr-mulohazalar.
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

  // Domen: a'zoliklar, davomat, baholar, guruh yo'qliklari, fikrlar.
  await client.groupMembership.deleteMany({ where: { groupId: id } });
  await client.attendance.deleteMany({ where: { groupId: id } });
  await client.grade.deleteMany({ where: { groupId: id } });
  await client.teacherAbsence.deleteMany({ where: { groupId: id } });
  await client.feedback.deleteMany({ where: { groupId: id } });
  // Moliya (kirim): oylik narx, to'lov hisoblari, tranzaksiyalar, chegirmalar.
  await client.groupFee.deleteMany({ where: { groupId: id } });
  await client.studentPayment.deleteMany({ where: { groupId: id } });
  await client.paymentTransaction.deleteMany({ where: { groupId: id } });
  await client.discount.deleteMany({ where: { groupId: id } });
  // Moliya (chiqim): dars davrlari, maosh hisoblari, maosh to'lovlari.
  await client.teacherGroupPeriod.deleteMany({ where: { groupId: id } });
  await client.teacherSalary.deleteMany({ where: { groupId: id } });
  await client.salaryTransaction.deleteMany({ where: { groupId: id } });

  return studentIds;
};
