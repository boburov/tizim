import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";
import { resolveBranchFromGroup } from "../../../helpers/branchContext.helper.js";

// O'QUVCHINI GURUHGA QO'SHISH.
//
// ORQAGA SANA (backdate) QO'RIQCHISI: joinedAt o'tgan oyga qo'yilsa, tizim
// o'sha oylar uchun AVTOMATIK QARZ yaratadi (ensureFinanceForMembershipRange).
// Ilgari bu jimgina sodir bo'lardi - o'quvchi hech qanday ogohlantirishsiz
// to'satdan 3 oylik qarzdor bo'lib qolardi.
//
// Endi: o'tgan oylarga qarz yaratiladigan bo'lsa va summa filial limitidan
// oshsa - a'zolik DARHOL yaratilmaydi, owner tasdig'iga yuboriladi. Bu
// chegirmaning (DISCOUNT_SET) teskarisi va aynan shunday nazoratga muhtoj:
// qarzni sun'iy yaratib, keyin uni "yomon qarz" deb hisobdan chiqarish
// mumkin bo'lardi.
//
// Gate ATAYLAB handler qatlamida: servisning addStudent() funksiyasi ichki
// oqimlardan (transfer, import, tasdiqni bajarish) ham chaqiriladi - u yerda
// qayta tasdiq so'rash cheksiz aylanma hosil qilardi.
const addStudent = asyncHandler(async (req, res) => {
  const groupId = req.params.id;
  const { studentId, joinedAt, leftAt } = req.body;

  const preview = await groupsService.previewBackdate(groupId, { joinedAt, leftAt });

  if (preview.isBackdated) {
    const { needsApproval } = await approvalService.checkExpenseLimit({
      branchId: await resolveBranchFromGroup(groupId),
      amount: preview.estimatedDebt,
      permissions: req.permissions,
    });

    if (needsApproval) {
      const approval = await groupsService.requestBackdate(
        groupId,
        studentId,
        req.body,
        req.user,
      );
      return res.status(202).json({
        success: true,
        data: approval,
        message:
          `Bu amal ${preview.pastMonthCount} oy uchun qarz yaratadi. ` +
          "Tasdiqlash uchun yuborildi - owner tasdiqlagach o'quvchi qo'shiladi.",
      });
    }
  }

  const data = await groupsService.addStudent(groupId, studentId, {
    joinedAt,
    leftAt,
  });

  res.status(201).json({
    success: true,
    data,
    // Qarz yaratilgan bo'lsa foydalanuvchi buni KO'RISHI kerak - jimgina
    // "qo'shildi" deb yozib qo'yish chalkashlikning asosiy manbai edi.
    message: preview.isBackdated
      ? `O'quvchi qo'shildi. ${preview.pastMonthCount} oy uchun qarz yozildi.`
      : "O'quvchi qo'shildi",
    meta: preview.isBackdated ? { backdate: preview } : undefined,
  });
});

export default addStudent;
