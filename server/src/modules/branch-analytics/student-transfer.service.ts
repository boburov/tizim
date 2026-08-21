import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { ACCOUNT_KINDS, ENTRY_KINDS } from '../../common/constants/ledger.js';
import { isBranchAllowed } from '../../common/als/branch-context.js';
import { assertTargetInScope } from '../../common/rbac/branch-access.service.js';
import { JournalService } from '../journal/journal.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHINI FILIALLARARO KO'CHIRISH
 * (`branchAnalytics/services/studentTransfer.service.js` KO'CHIRMASI).
 *
 * ── NEGA BU MODUL `financialTransaction` NI ISHLATMAYDI ──
 * Depozit ko'chishi MARKAZIY servisdagi amal emas: pul markazdan
 * chiqmaydi, faqat "qaysi filial kassasida turgani" o'zgaradi — shuning
 * uchun FILIALLARARO JUFT yozuv. Bu hodisa TAKRORLANADI (bir o'quvchi
 * bir necha marta ko'chirilishi mumkin), ya'ni `(refModel, refId)`
 * idempotentlik kaliti bo'la OLMAYDI.
 *
 * ── NIMA KO'CHADI VA NIMA KO'CHMAYDI ──
 * KO'CHADI: `homeBranchId`, DEPOZIT QOLDIG'I (o'quvchining puli).
 * KO'CHMAYDI (ATAYLAB):
 *   • TARIX — o'tgan to'lovlar/davomat/baholar O'SHA filialda sodir
 *     bo'lgan; hisobotni qayta yozish "o'tgan oy boshqacha edi"
 *     holatini keltirardi;
 *   • QARZ — to'lanmagan oyliklar ESKI filialning talabi bo'lib qoladi,
 *     aks holda yangi filial rahbari O'ZI YARATMAGAN qarzni undirishga
 *     majbur bo'lardi;
 *   • GURUH A'ZOLIGI — eski guruhlar YOPILADI (guruh filialga bog'langan).
 *
 * ── DEPOZIT QANDAY KO'CHADI ──
 *   A filialda:  Debet depozit(A)   / Kredit due_to(B)
 *   B filialda:  Debet due_from(A)  / Kredit depozit(B)
 * Ya'ni A endi B ga QARZDOR. Haqiqiy pul keyinroq inkassatsiya bilan
 * o'tadi. IKKALA yozuv ham `isInternal: true` — konsolidatsiyada
 * ayiriladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class StudentTransferService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly journal: JournalService,
  ) {}

  /**
   * KO'CHIRISHDAN OLDIN: nima bo'lishini OLDINDAN ko'rsatadi.
   *
   * ⚠ NEGA ALOHIDA: ko'chirish QAYTARIB BO'LMAYDIGAN amal (guruh
   * a'zoligi yopiladi, jurnalga yozuv tushadi). Operator natijani
   * OLDIN ko'rishi va tasdiqlashi kerak.
   */
  async preview(studentId: string, toBranchId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: String(studentId), role: ROLES.STUDENT, isDeleted: false },
      select: { id: true, firstName: true, lastName: true, homeBranchId: true },
    });
    if (!student) throw new ApiError(404, "O'quvchi topilmadi");

    const fromBranchId = student.homeBranchId;
    if (!fromBranchId) {
      throw new ApiError(400, "O'quvchi hech qaysi filialga biriktirilmagan");
    }
    if (String(fromBranchId) === String(toBranchId)) {
      throw new ApiError(400, "O'quvchi allaqachon shu filialda");
    }

    const [toBranch, deposit, activeMemberships] = await Promise.all([
      this.prisma.branch.findFirst({
        where: { id: String(toBranchId), isDeleted: false },
        select: { id: true, name: true },
      }),
      this.prisma.studentDeposit.findUnique({
        where: { studentId: String(studentId) },
      }),
      this.prisma.groupMembership.findMany({
        where: { studentId: String(studentId), leftAt: null, isDeleted: false },
        include: { group: { select: { id: true, name: true, branchId: true } } },
      }),
    ]);

    if (!toBranch) throw new ApiError(400, 'Maqsad filial topilmadi');

    return {
      student: {
        // Klient `_id` ni kutadi — javob chegarasidagi eski shakl.
        _id: student.id,
        name: `${student.firstName} ${student.lastName || ''}`.trim(),
      },
      fromBranchId,
      toBranchId: toBranch.id,
      toBranchName: toBranch.name,
      // Ko'chadigan pul.
      depositBalance: Number((deposit as any)?.balance || 0),
      // Yopiladigan guruhlar — operator ularni ko'rib tasdiqlasin.
      groupsToClose: activeMemberships.map((m: any) => ({
        membershipId: m.id,
        groupId: m.group?.id,
        groupName: m.group?.name || '',
      })),
    };
  }

  /**
   * KO'CHIRISHNI BAJARADI.
   *
   * ⚠ TARTIB MUHIM:
   *   1. Guruh a'zoliklari yopiladi (eski filialda dars tugadi)
   *   2. Depozit JURNALDA ko'chiriladi (pul yangi filialga o'tdi)
   *   3. `homeBranchId` yangilanadi
   * Teskari tartibda o'quvchi yangi filialda bo'lib, PULI eskisida
   * qolardi.
   *
   * ⚠⚠ UCHALA QADAM BITTA TRANZAKSIYADA. Ilgari ular alohida edi va
   * tartik to'g'ri bo'lsa-da ORALIQ HOLAT bazada QOLARDI: guruhlar
   * yopilgan, depozit ko'chmagan, o'quvchi eski filialda. Operator
   * buni ko'rmasdi. Endi yo hammasi, yo hech biri — tartib esa jurnal
   * yozuvlarining mantiqiy ketma-ketligi uchun SAQLANADI.
   */
  async transfer(
    studentId: string,
    { toBranchId, note }: { toBranchId: string; note?: string },
    currentUser: any,
  ) {
    const info = await this.preview(studentId, toBranchId);
    const { fromBranchId, depositBalance } = info;

    // ⚠ KO'LAM: IKKALA filial ham chaqiruvchining ruxsatida bo'lishi
    // SHART. Faqat bittasini tekshirish yetarli emas: A filial
    // direktori o'quvchini B ga "itarib yuborib", B ning rahbarini
    // XABARSIZ qoldirardi — va B ning kassasiga QARZ paydo bo'lardi.
    const student = await this.prisma.user.findUnique({
      where: { id: String(studentId) },
      select: {
        id: true,
        homeBranchId: true,
        // ⚠ `branchAssignments` ALOHIDA jadval — `assertTargetInScope`
        // uni o'qiydi, shuning uchun `select` SHART.
        branchAssignments: { select: { branchId: true } },
      },
    });
    if (!student) throw new ApiError(404, "O'quvchi topilmadi");
    assertTargetInScope(
      currentUser?.allowedBranchIds,
      currentUser?.canSeeAllBranches,
      student as never,
    );
    if (!isBranchAllowed(toBranchId)) {
      throw new ApiError(
        403, "Maqsad filialga ham kirish huquqingiz bo'lishi kerak",
      );
    }

    const at = new Date();

    await this.prisma.$transaction(async (tx: any) => {
      // ── 1) Eski guruhlarni yopamiz ──
      if (info.groupsToClose.length) {
        await tx.groupMembership.updateMany({
          where: {
            id: { in: info.groupsToClose.map((g) => g.membershipId) },
            leftAt: null,
          },
          data: { leftAt: at },
        });
      }

      // ── 2) Depozitni JURNALDA ko'chiramiz ──
      //
      // ⚠ `StudentDeposit` hujjatining O'ZI o'zgarmaydi — u o'quvchiga
      // bog'langan, filialga emas. O'zgaradigan narsa — qaysi filial
      // kassasida shu pul turgani, va bu FAQAT jurnalda ifodalanadi.
      if (depositBalance > 0) {
        await this.journal.post({
          branchId: fromBranchId,
          date: at,
          kind: ENTRY_KINDS.INTER_BRANCH,
          memo: `O'quvchi ko'chirildi: depozit ${depositBalance} ${info.toBranchName} ga`,
          lines: [
            { accountKind: ACCOUNT_KINDS.DEPOSIT, debit: depositBalance },
            {
              accountKind: ACCOUNT_KINDS.DUE_TO,
              credit: depositBalance,
              counterpartyBranchId: toBranchId,
            },
          ],
          refModel: 'User',
          refId: studentId,
          isInternal: true,
          counterpartyBranchId: toBranchId,
          createdBy: currentUser?.id || currentUser?._id || null,
          tx,
        } as never);

        await this.journal.post({
          branchId: toBranchId,
          date: at,
          kind: ENTRY_KINDS.INTER_BRANCH,
          memo: `O'quvchi qabul qilindi: depozit ${depositBalance}`,
          lines: [
            {
              accountKind: ACCOUNT_KINDS.DUE_FROM,
              debit: depositBalance,
              counterpartyBranchId: fromBranchId,
            },
            { accountKind: ACCOUNT_KINDS.DEPOSIT, credit: depositBalance },
          ],
          refModel: 'User',
          refId: studentId,
          isInternal: true,
          counterpartyBranchId: fromBranchId,
          createdBy: currentUser?.id || currentUser?._id || null,
          tx,
        } as never);
      }

      // ── 3) O'quvchini yangi filialga biriktiramiz ──
      await tx.user.update({
        where: { id: student.id },
        data: { homeBranchId: String(toBranchId) },
      });
    });

    return {
      ...info,
      transferredAt: at,
      closedGroups: info.groupsToClose.length,
      movedDeposit: depositBalance,
      note: note || '',
    };
  }
}
