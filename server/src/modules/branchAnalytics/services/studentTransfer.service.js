import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentDeposit from "../../../models/studentDeposit.model.js";
import Branch from "../../../models/branch.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { ACCOUNT_KINDS, ENTRY_KINDS } from "../../../constants/ledger.js";
import { isBranchAllowed } from "../../../helpers/branchContext.helper.js";
import { assertTargetInScope } from "../../../helpers/branchAccess.helper.js";
import * as journal from "../../journal/services/journal.service.js";

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

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

/**
 * KO'CHIRISHDAN OLDIN: nima bo'lishini oldindan ko'rsatadi.
 *
 * NEGA ALOHIDA: ko'chirish qaytarib bo'lmaydigan amal (guruh a'zoligi
 * yopiladi, jurnalga yozuv tushadi). Operator natijani OLDIN ko'rishi
 * va tasdiqlashi kerak.
 */
export const preview = async (studentId, toBranchId) => {
  const student = await User.findOne({
    _id: studentId,
    role: ROLES.STUDENT,
    isDeleted: { $ne: true },
  })
    .select("firstName lastName homeBranchId")
    .lean();
  if (!student) throw new ApiError(404, "O'quvchi topilmadi");

  const fromBranchId = student.homeBranchId;
  if (!fromBranchId) {
    throw new ApiError(400, "O'quvchi hech qaysi filialga biriktirilmagan");
  }
  if (String(fromBranchId) === String(toBranchId)) {
    throw new ApiError(400, "O'quvchi allaqachon shu filialda");
  }

  const [toBranch, deposit, activeMemberships] = await Promise.all([
    Branch.findOne({ _id: toBranchId, isDeleted: false }).select("name").lean(),
    StudentDeposit.findOne({ student: toObjectId(studentId) }).lean(),
    GroupMembership.find({
      student: toObjectId(studentId),
      leftAt: null,
      isDeleted: { $ne: true },
    })
      .populate("group", { name: 1, branchId: 1 })
      .lean(),
  ]);

  if (!toBranch) throw new ApiError(400, "Maqsad filial topilmadi");

  return {
    student: {
      _id: student._id,
      name: `${student.firstName} ${student.lastName || ""}`.trim(),
    },
    fromBranchId,
    toBranchId: toBranch._id,
    toBranchName: toBranch.name,
    // Ko'chadigan pul.
    depositBalance: deposit?.balance || 0,
    // Yopiladigan guruhlar - operator ularni ko'rib tasdiqlasin.
    groupsToClose: activeMemberships.map((m) => ({
      membershipId: m._id,
      groupId: m.group?._id,
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
  const student = await User.findById(studentId).select(
    "homeBranchId branchAssignments",
  );
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

  // ── 1) Eski guruhlarni yopamiz ──
  if (info.groupsToClose.length) {
    await GroupMembership.updateMany(
      {
        _id: { $in: info.groupsToClose.map((g) => g.membershipId) },
        leftAt: null,
      },
      { $set: { leftAt: at } },
    );
  }

  // ── 2) Depozitni jurnalda ko'chiramiz ──
  //
  // StudentDeposit hujjatining O'ZI o'zgarmaydi - u o'quvchiga bog'langan,
  // filialga emas. O'zgaradigan narsa - qaysi filial kassasida shu pul
  // turgani, va bu FAQAT jurnalda ifodalanadi.
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
      createdBy: currentUser?._id || null,
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
      createdBy: currentUser?._id || null,
    });
  }

  // ── 3) O'quvchini yangi filialga biriktiramiz ──
  student.homeBranchId = toObjectId(toBranchId);
  await student.save();

  return {
    ...info,
    transferredAt: at,
    closedGroups: info.groupsToClose.length,
    movedDeposit: depositBalance,
    note: note || "",
  };
};
