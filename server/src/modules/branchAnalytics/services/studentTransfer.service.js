import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { ACCOUNT_KINDS, ENTRY_KINDS } from "../../../constants/ledger.js";
import { isBranchAllowed } from "../../../helpers/branchContext.helper.js";
import { assertTargetInScope } from "../../../helpers/branchAccess.helper.js";
import * as journal from "../../journal/services/journal.service.js";

// ─────────────────────────────────────────────────────────────────────
// NEGA BU MODUL `financialTransaction.service.js` NI ISHLATMAYDI
//
// O'quvchini boshqa filialga ko'chirishda uning DEPOZITI ham ko'chadi.
// Bu markaziy servisdagi amal emas: pul markazdan chiqmaydi, faqat
// "qaysi filial kassasida turgani" o'zgaradi — shuning uchun
// filiallararo JUFT yozuv (chiquvchi + kiruvchi).
//
// Bu hodisa TAKRORLANADI (bir o'quvchi bir necha marta ko'chirilishi
// mumkin) — aynan shu sabab (refModel, refId) idempotentlik kaliti
// bo'la olmaydi. Qarang FINANCE-ARCHITECTURE.md, "STEP 4 ilovasi".
// ─────────────────────────────────────────────────────────────────────

// O'QUVCHINI FILIALLARARO KO'CHIRISH.
//
// ══════════════════════════════════════════════════════════════════
// NIMA KO'CHADI VA NIMA KO'CHMAYDI
// ══════════════════════════════════════════════════════════════════
//
// KO'CHADI:
//   - `homeBranchId` (o'quvchi endi yangi filialga tegishli)
//   - DEPOZIT QOLDIG'I - u o'quvchining puli va u bilan birga yuradi
//
// KO'CHMAYDI (ATAYLAB):
//   - TARIX: o'tgan to'lovlar, davomat, baholar eski filialda qoladi.
//     Ular O'SHA filialda sodir bo'lgan va hisobotni qayta yozish
//     "o'tgan oy boshqacha edi" degan holatni keltirib chiqarardi.
//   - QARZ: to'lanmagan oyliklar eski filialning talabi bo'lib qoladi.
//     Aks holda yangi filial rahbari o'zi yaratmagan qarzni undirishga
//     majbur bo'lardi.
//   - GURUH A'ZOLIGI: eski guruhlar YOPILADI (leftAt), yangi filialda
//     o'quvchi qaytadan guruhga yoziladi. Guruh filialga bog'langan.
//
// ══════════════════════════════════════════════════════════════════
// DEPOZIT QANDAY KO'CHADI - JURNAL YOZUVLARI
// ══════════════════════════════════════════════════════════════════
// Depozit A filialning kassasida turgan HAQIQIY pul. O'quvchi B ga
// o'tsa, pul ham o'tishi kerak - aks holda B filial o'quvchiga
// xizmat ko'rsatadi, puli esa A da qoladi.
//
//   A filialda:  Debet depozit(A)    / Kredit due_to(B)
//   B filialda:  Debet due_from(A)   / Kredit depozit(B)
//
// Ya'ni A endi B ga qarzdor. Haqiqiy pul keyinroq inkassatsiya bilan
// o'tadi - va o'sha paytda due_to/due_from yopiladi.
//
// IKKALA yozuv ham `isInternal: true` - konsolidatsiyada ular ayiriladi.

/**
 * KO'CHIRISHDAN OLDIN: nima bo'lishini oldindan ko'rsatadi.
 *
 * NEGA ALOHIDA: ko'chirish qaytarib bo'lmaydigan amal (guruh a'zoligi
 * yopiladi, jurnalga yozuv tushadi). Operator natijani OLDIN ko'rishi
 * va tasdiqlashi kerak.
 */
export const preview = async (studentId, toBranchId) => {
  const student = await prisma.user.findFirst({
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
    prisma.branch.findFirst({
      where: { id: String(toBranchId), isDeleted: false },
      select: { id: true, name: true },
    }),
    // `{ student: id }` -> `{ studentId: id }`. `StudentDeposit.studentId`
    // unique, shuning uchun `findUnique` ham bo'lardi - lekin depozit
    // hali ochilmagan bo'lishi mumkin (null), `findUnique` esa shuni
    // bemalol qaytaradi.
    prisma.studentDeposit.findUnique({ where: { studentId: String(studentId) } }),
    prisma.groupMembership.findMany({
      where: { studentId: String(studentId), leftAt: null, isDeleted: false },
      // Mongo `.populate("group", ...)` maydonni obyektga almashtirardi;
      // Prisma ALOHIDA relation qaytaradi - `m.group` bo'lib qoladi va
      // pastdagi o'qish shakli o'zgarmaydi.
      include: { group: { select: { id: true, name: true, branchId: true } } },
    }),
  ]);

  if (!toBranch) throw new ApiError(400, "Maqsad filial topilmadi");

  return {
    student: {
      // Klient `_id` ni kutadi - javob chegarasidagi eski shakl.
      _id: student.id,
      name: `${student.firstName} ${student.lastName || ""}`.trim(),
    },
    fromBranchId,
    toBranchId: toBranch.id,
    toBranchName: toBranch.name,
    // Ko'chadigan pul.
    depositBalance: deposit?.balance || 0,
    // Yopiladigan guruhlar - operator ularni ko'rib tasdiqlasin.
    groupsToClose: activeMemberships.map((m) => ({
      membershipId: m.id,
      groupId: m.group?.id,
      groupName: m.group?.name || "",
    })),
  };
};

/**
 * KO'CHIRISHNI BAJARADI.
 *
 * TARTIB MUHIM:
 *   1. Guruh a'zoliklari yopiladi (eski filialda dars tugadi)
 *   2. Depozit jurnalda ko'chiriladi (pul yangi filialga o'tdi)
 *   3. homeBranchId yangilanadi (endi o'quvchi yangi filialniki)
 *
 * Agar 2 yiqilsa 3 bajarilmaydi - o'quvchi eski filialda qoladi va
 * amalni qayta urinish mumkin. Teskari tartibda bo'lsa, o'quvchi
 * yangi filialda bo'lib, puli eskisida qolardi.
 */
export const transfer = async (studentId, { toBranchId, note }, currentUser) => {
  const info = await preview(studentId, toBranchId);
  const { fromBranchId, depositBalance } = info;

  // KO'LAM: ikkala filial ham chaqiruvchining ruxsatida bo'lishi shart.
  //
  // Faqat bittasini tekshirish yetarli emas: A filial direktori
  // o'quvchini B ga "itarib yuborib", B ning rahbarini xabarsiz
  // qoldirardi - va B ning kassasiga qarz paydo bo'lardi.
  const student = await prisma.user.findUnique({
    where: { id: String(studentId) },
    select: {
      id: true,
      homeBranchId: true,
      // `branchAssignments` ALOHIDA jadval (Mongo'da ichki massiv edi) -
      // `assertTargetInScope` uni o'qiydi, shuning uchun include SHART.
      branchAssignments: { select: { branchId: true } },
    },
  });
  if (!student) throw new ApiError(404, "O'quvchi topilmadi");
  assertTargetInScope(
    currentUser?.allowedBranchIds,
    currentUser?.canSeeAllBranches,
    student,
  );
  if (!isBranchAllowed(toBranchId)) {
    throw new ApiError(
      403,
      "Maqsad filialga ham kirish huquqingiz bo'lishi kerak",
    );
  }

  const at = new Date();

  // ═══════════════════════════════════════════════════════════════
  // UCHALA QADAM BITTA TRANZAKSIYADA.
  //
  // Ilgari ular alohida edi va yuqoridagi izoh buni oqlardi:
  // "2 yiqilsa 3 bajarilmaydi - qayta urinish mumkin". Tartib
  // to'g'ri edi, lekin oraliq holat baribir bazada QOLARDI:
  // guruhlar yopilgan, depozit ko'chmagan, o'quvchi eski filialda.
  // Operator buni ko'rmasdi va qayta urinish guruhlarni IKKINCHI
  // marta yopishga urinardi (`leftAt: null` sharti tufayli zararsiz,
  // lekin holat baribir chalkash edi).
  //
  // Endi yo hammasi, yo hech biri. Tartib SAQLANADI - u jurnal
  // yozuvlarining mantiqiy ketma-ketligi uchun hamon muhim.
  //
  // Bu ko'chirish regressiyasi emas, KUCHAYTIRISH: muvaffaqiyat
  // yo'li aynan avvalgidek, faqat yarim bajarilgan holat endi
  // mumkin emas.
  // ═══════════════════════════════════════════════════════════════
  await prisma.$transaction(async (tx) => {
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

    // ── 2) Depozitni jurnalda ko'chiramiz ──
    //
    // StudentDeposit hujjatining O'ZI o'zgarmaydi - u o'quvchiga
    // bog'langan, filialga emas. O'zgaradigan narsa - qaysi filial
    // kassasida shu pul turgani, va bu FAQAT jurnalda ifodalanadi.
    if (depositBalance > 0) {
      await journal.post({
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
        refModel: "User",
        refId: studentId,
        isInternal: true,
        counterpartyBranchId: toBranchId,
        createdBy: currentUser?.id || currentUser?._id || null,
        tx,
      });

      await journal.post({
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
        refModel: "User",
        refId: studentId,
        isInternal: true,
        counterpartyBranchId: fromBranchId,
        createdBy: currentUser?.id || currentUser?._id || null,
        tx,
      });
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
    note: note || "",
  };
};
