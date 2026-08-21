import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `server/src/helpers/userRelations.helper.js` NING KO'CHIRMASI.
 *
 * Foydalanuvchini BUTUNLAY (hard) o'chirish uchun bog'liqlik tekshiruvi va
 * kaskad o'chirish. Qoida: foydalanuvchi biror domen/moliya ma'lumotiga
 * bog'liq bo'lsa — o'chirib BO'LMAYDI (aks holda kirim/qarz/oylik
 * hisob-kitoblari buziladi).
 *
 * ── O'CHIRISH TARTIBI MAJBURIY ──
 *
 * PostgreSQL'da FK bor, ya'ni BOLA qator OTA'sidan OLDIN o'chirilishi
 * shart, aks holda `RESTRICT` xato beradi va butun tranzaksiya orqaga
 * qaytadi. Eng og'ir ikkita bog'lanish:
 *     payment_transactions.paymentId → student_payments  (RESTRICT)
 *     salary_transactions.salaryId   → teacher_salaries  (RESTRICT)
 * Ya'ni TO'LOVLAR har doim PLAN/MAOSH qatoridan OLDIN o'chiriladi.
 * Quyidagi ketma-ketlik TASODIFIY EMAS — o'zgartirmang.
 *
 * ── ✅ `hardDeleteGroupData` ENDI SHU YERDA ──
 *
 * Uni FAQAT `groups.service.permanentRemove` chaqiradi. Ilgari u
 * ataylab qoldirilgan edi (chaqiruvchisiz kod ikkinchi manba bo'lib
 * ajralib ketardi); `groups` yozish yo'llari ko'chirilgach o'sha
 * to'lqin uni shu faylga qo'shdi — Express bilan BIR XIL faylda,
 * ya'ni tartib ham bir joyda saqlanadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Prisma tranzaksiya klienti yoki asosiy klient. */
type Db = any;

export interface BlockingRelation {
  label: string;
  count: number;
}

@Injectable()
export class UserRelationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private db(tx?: Db): Db {
    return tx || (this.prisma as unknown as Db);
  }

  /**
   * Bloklovchi bog'liqliklar ro'yxati.
   *
   * Foydalanuvchi shu yozuvlarning SUBYEKTI bo'lsa, o'chirish taqiqlanadi.
   * (`createdBy`/`updatedBy` kabi audit maydonlari BLOKLAMAYDI — ular
   * "kim qildi" izi, subyekt emas.)
   *
   * ⚠ `isDeleted` holatidan QAT'I NAZAR sanaladi: soft-delete qilingan
   * yozuv ham havola sifatida qoladi va uni yetim qoldirib bo'lmaydi.
   */
  private blockingCounters(client: Db, id: string) {
    return [
      // ── O'quvchi (student) sifatidagi bog'liqliklar ──
      { label: "Guruh a'zoligi", run: () => client.groupMembership.count({ where: { studentId: id } }) },
      { label: 'Davomat yozuvlari', run: () => client.attendance.count({ where: { studentId: id } }) },
      { label: 'Davomat imtiyozlari', run: () => client.attendanceExemption.count({ where: { studentId: id } }) },
      { label: 'Baholar', run: () => client.grade.count({ where: { studentId: id } }) },
      { label: "To'lov hisoblari", run: () => client.studentPayment.count({ where: { studentId: id } }) },
      { label: "To'lov tranzaksiyalari", run: () => client.paymentTransaction.count({ where: { studentId: id } }) },
      { label: 'Depozit hisobi', run: () => client.studentDeposit.count({ where: { studentId: id } }) },
      { label: 'Depozit tranzaksiyalari', run: () => client.depositTransaction.count({ where: { studentId: id } }) },
      { label: 'Chegirmalar', run: () => client.discount.count({ where: { studentId: id } }) },
      { label: 'Fikr-mulohazalar', run: () => client.feedback.count({ where: { authorId: id } }) },
      { label: 'Lid (konversiya)', run: () => client.lead.count({ where: { studentId: id } }) },

      // ── O'qituvchi (teacher) sifatidagi bog'liqliklar ──
      // Ko'p-ko'pga: guruh o'qituvchilari ro'yxatida turibdimi.
      { label: 'Biriktirilgan guruhlar', run: () => client.group.count({ where: { teachers: { some: { id } } } }) },
      { label: "O'qituvchi davomati", run: () => client.teacherAttendance.count({ where: { teacherId: id } }) },
      { label: "O'qituvchi yo'qliklari", run: () => client.teacherAbsence.count({ where: { teacherId: id } }) },
      { label: "O'qituvchi oyliklari", run: () => client.teacherSalary.count({ where: { teacherId: id } }) },
      { label: 'Oylik tranzaksiyalari', run: () => client.salaryTransaction.count({ where: { teacherId: id } }) },
      { label: "O'qituvchi guruh davrlari", run: () => client.teacherGroupPeriod.count({ where: { teacherId: id } }) },

      // ── FAQAT POSTGRES SABABLI QO'SHILGANLAR ──
      //
      // Bu jadvallardagi FK `RESTRICT`, ustunlari esa NOT NULL — ya'ni
      // qatorni null'ga tushirib ham bo'lmaydi. Ular hard-delete yo'lida
      // o'chirilmaydi (mansubligi noaniq yoki audit qiymati bor), demak
      // ULARNI OLDINDAN, TUSHUNARLI XABAR BILAN to'sish kerak — aks holda
      // foydalanuvchi tranzaksiya o'rtasidagi xom FK xatosini ko'rardi.
      { label: 'Berilgan topshiriqlar', run: () => client.assignment.count({ where: { senderId: id } }) },
      { label: 'Topshiriq oluvchilari', run: () => client.assignmentRecipient.count({ where: { studentId: id } }) },
      { label: 'Yozilgan baholar', run: () => client.grade.count({ where: { recordedById: id } }) },
      { label: "Belgilangan yo'qliklar", run: () => client.teacherAbsence.count({ where: { recordedById: id } }) },
      { label: 'Kassa smenalari', run: () => client.shift.count({ where: { cashierId: id } }) },
      { label: "Tasdiq so'rovlari", run: () => client.approval.count({ where: { requestedById: id } }) },
      { label: 'Xodim oyliklari', run: () => client.staffPayroll.count({ where: { employeeId: id } }) },
      { label: 'Xodim maosh shartnomasi', run: () => client.staffCompensation.count({ where: { employeeId: id } }) },
      { label: "Xodim maosh to'lovlari", run: () => client.staffSalaryTransaction.count({ where: { employeeId: id } }) },
      { label: 'Xodim KPI biriktiruvlari', run: () => client.staffKpiAssignment.count({ where: { employeeId: id } }) },
    ];
  }

  /**
   * O'chirishni TAQIQLOVCHI ma'lumotlar ro'yxati.
   * Bo'sh bo'lsa — o'chirish mumkin.
   */
  async findUserBlockingRelations(userId: string): Promise<BlockingRelation[]> {
    const id = String(userId);
    const counters = this.blockingCounters(this.prisma as unknown as Db, id);
    const counts = await Promise.all(counters.map((c) => c.run()));
    return counters
      .map((c, i) => ({ label: c.label, count: counts[i] as number }))
      .filter((r) => r.count > 0);
  }

  /**
   * Bloklamaydigan QOLDIQ ma'lumot (sessiya/audit/yetkazish) — hard
   * o'chirishda birga drop qilinadi. Bular hisob-kitobga ta'sir qilmaydi.
   *
   * `tx` berilsa bitta tranzaksiyada KETMA-KET bajariladi (parallel emas).
   */
  async purgeUserResidualData(userId: string, { tx }: { tx?: Db } = {}): Promise<void> {
    const id = String(userId);
    const client = this.db(tx);

    // refresh_tokens FK'si CASCADE, lekin ochiq o'chirish arzon va
    // niyatni ko'rsatib turadi.
    await client.refreshToken.deleteMany({ where: { userId: id } });
    await client.activityLog.deleteMany({ where: { userId: id } });
    await client.notificationRecipient.deleteMany({ where: { userId: id } });
    await client.archiveLog.deleteMany({ where: { userId: id } });

    // MAOSH AUDIT JURNALI — `employeeId` RESTRICT va NOT NULL. Uni
    // tozalamasdan foydalanuvchini o'chirib bo'lmaydi. Audit izi shu
    // odamga tegishli (odam yo'q — izi ham keraksiz).
    await client.payrollAuditLog.deleteMany({ where: { employeeId: id } });

    // Telegram ulanishini uzamiz (botUser yozuvi telegramId bo'yicha
    // qoladi — shu telefon qayta ro'yxatdan o'tsa, eski chat ID topiladi).
    await client.botUser.updateMany({
      where: { userId: id },
      data: { userId: null, flowState: null },
    });
  }

  /**
   * O'QUVCHIGA oid BARCHA yozuvlarni FIZIK o'chiradi (cascade hard-delete).
   *
   * Lead (lid) yozuvi SAQLANADI — faqat bog'lanish uziladi
   * (`studentId = null`), shunda sotuv konversiya statistikasi buzilmaydi.
   *
   * Moliyaviy recalc uchun ta'sirlangan guruh ID'lari qaytariladi — ular
   * o'chirishdan OLDIN yig'iladi (keyin topib bo'lmaydi).
   */
  async hardDeleteStudentData(studentId: string, { tx }: { tx?: Db } = {}): Promise<string[]> {
    const id = String(studentId);
    const client = this.db(tx);

    // Recalc uchun ta'sirlangan guruhlar — to'lov va a'zoliklardan.
    const [payRows, memRows] = await Promise.all([
      client.studentPayment.findMany({
        where: { studentId: id },
        select: { groupId: true },
        distinct: ['groupId'],
      }),
      client.groupMembership.findMany({
        where: { studentId: id },
        select: { groupId: true },
        distinct: ['groupId'],
      }),
    ]);
    const groupIds = [
      ...new Set(
        [...payRows, ...memRows]
          .map((r: any) => r.groupId)
          .filter(Boolean)
          .map(String),
      ),
    ];

    // ── 1) MOLIYA: eng chuqur bolalardan yuqoriga ──
    // payment_transactions.paymentId → student_payments (RESTRICT)
    await client.paymentTransaction.deleteMany({ where: { studentId: id } });
    // debt_write_offs.studentId → users (RESTRICT) — yozuvning O'ZI ketishi
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
    // idempotentligining langari edi, lekin odamning O'ZI o'chgach u hech
    // nimani himoya qilmaydi (qayta import yangi ID yaratadi).
    await client.openingBalance.deleteMany({ where: { userId: id } });

    await client.lead.updateMany({
      where: { studentId: id },
      data: { studentId: null },
    });

    return groupIds;
  }

  /**
   * O'QITUVCHIGA oid BARCHA yozuvlarni FIZIK o'chiradi.
   *
   * MOLIYAVIY IZCHILLIK NOZIKLIGI (o'quvchidan FARQLI): o'qituvchi
   * maoshlari o'zaro BOG'LIQ EMAS — har biri o'z davri stavkasi + guruh
   * kirimidan hisoblanadi. Shu sababli bu o'qituvchini o'chirish boshqa
   * o'qituvchilar maoshini O'ZGARTIRMAYDI; guruh kirimi ham o'zgarmaydi.
   */
  async hardDeleteTeacherData(teacherId: string, { tx }: { tx?: Db } = {}): Promise<string[]> {
    const id = String(teacherId);
    const client = this.db(tx);

    // Ta'sirlangan guruhlar — davrlardan va guruh biriktiruvidan.
    const [periodRows, groupRows] = await Promise.all([
      client.teacherGroupPeriod.findMany({
        where: { teacherId: id },
        select: { groupId: true },
        distinct: ['groupId'],
      }),
      client.group.findMany({
        where: { teachers: { some: { id } } },
        select: { id: true },
      }),
    ]);
    const groupIds = [
      ...new Set(
        [
          ...periodRows.map((r: any) => r.groupId),
          ...groupRows.map((r: any) => r.id),
        ]
          .filter(Boolean)
          .map(String),
      ),
    ];

    // ── MOLIYA (chiqim tomoni) — TARTIB MUHIM ──
    // salary_transactions.salaryId → teacher_salaries (RESTRICT):
    // to'lovlar maosh qatorlaridan OLDIN o'chirilishi SHART.
    await client.salaryTransaction.deleteMany({ where: { teacherId: id } });
    await client.teacherSalary.deleteMany({ where: { teacherId: id } });
    await client.teacherGroupPeriod.deleteMany({ where: { teacherId: id } });
    // teacher_compensations.teacherId → users (RESTRICT, NOT NULL).
    // Stavka tarixi faqat shu odamga tegishli.
    await client.teacherCompensation.deleteMany({ where: { teacherId: id } });
    // opening_balances.userId → users (RESTRICT) — o'qituvchida ham
    // bo'lishi mumkin (boshlang'ich qoldiq).
    await client.openingBalance.deleteMany({ where: { userId: id } });

    // ── HR / domen ──
    await client.teacherAttendance.deleteMany({ where: { teacherId: id } });
    await client.teacherAbsence.deleteMany({ where: { teacherId: id } });
    await client.feedback.deleteMany({ where: { authorId: id } });

    // O'QUVCHI DAVOMATI O'CHIRILMAYDI — u GURUHGA tegishli, o'qituvchiga
    // emas. Faqat "kim belgiladi" audit havolasi uziladi, aks holda yozuv
    // mavjud bo'lmagan foydalanuvchiga ishora qilib qolardi.
    await client.attendance.updateMany({
      where: { recordedById: id },
      data: { recordedById: null },
    });

    // Guruh biriktiruvidan olib tashlaymiz. Ko'p-ko'pga bog'lanish
    // `disconnect` bilan uziladi — join jadvalidagi qator o'chadi.
    // Guruhning O'ZI tegilmaydi.
    for (const gid of groupRows.map((g: any) => g.id)) {
      // eslint-disable-next-line no-await-in-loop
      await client.group.update({
        where: { id: gid },
        data: { teachers: { disconnect: { id } } },
      });
    }

    return groupIds;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * GURUHGA OID BARCHA YOZUVLARNI FIZIK O'CHIRADI (hard cascade).
   *
   * ⚠ TARTIB MAJBURIY — bola qator OTA'sidan OLDIN. Eng og'ir bog'lanish:
   *     payment_transactions.paymentId → student_payments  (RESTRICT)
   *     salary_transactions.salaryId   → teacher_salaries  (RESTRICT)
   * Ya'ni TO'LOVLAR har doim PLAN/MAOSH qatoridan OLDIN o'chiriladi.
   *
   * ⚠ JURNALGA TEGILMAYDI: u o'zgarmas moliyaviy daftar
   * (`journal_entries.groupId` — RESTRICT). Chaqiruvchi
   * (`permanentRemove`) jurnal yozuvi bor guruhni OLDINDAN 409 bilan
   * to'sadi, shunda FK xatosi tranzaksiya o'rtasida chiqmaydi.
   *
   * @returns guruhda a'zoligi bo'lgan o'quvchi ID'lari (yakunlash
   *          sanasini qayta hisoblash uchun)
   * ═══════════════════════════════════════════════════════════════════
   */
  async hardDeleteGroupData(groupId: string, { tx }: { tx?: Db } = {}): Promise<string[]> {
    const id = String(groupId);
    const client = this.db(tx);

    const memberRows = await client.groupMembership.findMany({
      where: { groupId: id },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    const studentIds = memberRows
      .map((r: { studentId: unknown }) => String(r.studentId))
      .filter(Boolean);

    // ── MOLIYA (kirim): bolalardan boshlab ──
    await client.paymentTransaction.deleteMany({ where: { groupId: id } });
    // `debt_write_offs.groupId` → `groups` (RESTRICT): guruh o'chishi uchun
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
    // `lesson_cancellations.groupId` → `groups` (RESTRICT).
    await client.lessonCancellation.deleteMany({ where: { groupId: id } });

    return studentIds;
  }
}
