import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId } from "../../../utils/serialize.js";
import { EXPENSE_KINDS } from "../../../constants/approvals.js";
import {
  branchFilter,
  isBranchAllowed,
} from "../../../helpers/branchContext.helper.js";
import {
  checkExpenseLimit,
  createRequest,
} from "../../expenseApprovals/services/expenseApproval.service.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as teacherSalaryService from "./teacherSalary.service.js";
import * as financialTx from "../../finance/services/financialTransaction.service.js";
import { runFinanceTxn } from "../../finance/services/financeTxn.helper.js";

// O'qituvchiga maosh to'lovi (chiqim). Qoldiqdan (expected - paid) ORTIQ to'lashga
// yo'l qo'yilmaydi - cheklov shartli-atomik update bilan tekshiriladi, shuning
// uchun parallel double-click ham capdan o'tib keta olmaydi (C3).
// Umumiy tekshiruvlar: to'g'ridan-to'g'ri to'lovda ham, tasdiqlangan
// so'rovni bajarishda ham AYNAN SHU qoidalar qo'llanadi. Tasdiq paytida
// qayta chaqiriladi - so'rov berilgandan keyin guruh arxivlangan yoki
// qoldiq o'zgargan bo'lishi mumkin.
//
// MONGO → PRISMA
//   { salary: id } → { salaryId: id },  { teacher } → { teacherId }
//   trx.softDelete(by) → update({ isDeleted, deletedAt, deletedBy })
//   `isDeleted: { $ne: true }` → `isDeleted: false`
//
// DIQQAT: TeacherSalary'da `isDeleted` USTUNI YO'Q (u hosila jadval),
// SalaryTransaction'da esa BOR - shuning uchun filtrlar assimetrik.
const actorId = (u) => u?.id || u?._id || null;

const validateSalaryPayment = async ({ salaryId, paidAt }) => {
  const salary = await prisma.teacherSalary.findUnique({
    where: { id: String(salaryId) },
  });
  if (!salary) throw new ApiError(404, "Maosh topilmadi");

  // GURUHSIZ QATORLAR (markaz darajasi): fiksa oylik (kind:"base"),
  // KPI mukofoti, ushlanma va boshlang'ich qoldiq guruhga BOG'LANMAYDI -
  // shuni SalaryTransaction modeli ham ochiq yozgan (`group` default null).
  //
  // Ilgari bu yerda guruh SHARTSIZ talab qilinardi va natijada markaz
  // darajasidagi HAR QANDAY qatorga to'lov "Guruh topilmadi" (404) bilan
  // rad etilardi - ya'ni fiksa oylikni tizim orqali to'lab bo'lmasdi.
  //
  // Guruh BOR bo'lsa tekshiruv avvalgidek qat'iy qoladi (arxivlangan
  // guruhga to'lov yozilmaydi).
  let group = null;
  if (salary.groupId) {
    group = await prisma.group.findUnique({
      where: { id: salary.groupId },
      select: { id: true, isActive: true, isDeleted: true, branchId: true, endDate: true },
    });
    assertGroupActive(group);
  }

  // FILIAL: guruh bo'lsa undan meros, bo'lmasa maosh qatorining O'ZIDAN
  // (TeacherSalary.branchId majburiy maydon). Foydalanuvchi kontekstidan
  // OLINMAYDI - owner "barcha filiallar" rejimida to'lasa noto'g'ri
  // filial yozilardi.
  const branchId = group ? group.branchId : salary.branchId;
  if (!branchId) throw new ApiError(400, "Maoshning filiali aniqlanmadi");

  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");
  // Kelajak sanaga chiqim yozib bo'lmaydi (kassa kunlik hisobi buzilmasin)
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "To'lov sanasi kelajakda bo'lishi mumkin emas");
  }

  return { salary, group, branchId, day };
};

// Balansni oshirib, tranzaksiyani yozadi. Ikkala yo'l ham shuni ishlatadi.
const writeSalaryTransaction = async ({
  salary,
  branchId,
  day,
  amount,
  method,
  note,
  createdBy,
  expenseApprovalId = null,
}) => {
  // ── ATOMIK: balans + tranzaksiya + jurnal + audit BITTA amalda ──
  //
  // Ilgari rollback QO'LDA edi (`catch { applyPaidDelta(-amount) }`) va
  // qaytarishning o'zi yiqilsa maosh "to'langan" bo'lib qolardi.
  // Endi tranzaksiya buni kafolatlaydi.
  //
  // Jurnal yozuvi ENDI "Maosh" kategoriyasiga va o'qituvchiga
  // bog'lanadi (Faza 7) — ilgari u nomsiz `expense` edi va chiqim
  // kategoriyalari hisobotida markazning eng katta xarajati
  // KO'RINMASDI.
  const created = await runFinanceTxn(async (tx) => {
    const updated = await teacherSalaryService.applyPaidDelta(salary.id, amount, {
      capToRemaining: true,
      tx,
    });
    if (!updated) {
      const remaining = Math.max(
        0,
        (salary.expectedAmount || 0) - (salary.paidAmount || 0),
      );
      throw new ApiError(
        400,
        `To'lov qoldiqdan oshib ketadi (qoldiq: ${remaining} so'm)`,
      );
    }

    const row = await tx.salaryTransaction.create({
      data: {
        branchId,
        salaryId: salary.id,
        teacherId: salary.teacherId,
        groupId: salary.groupId,
        year: salary.year,
        month: salary.month,
        amount,
        method,
        paidAt: day,
        note: note || "",
        createdById: createdBy ? String(createdBy) : null,
        expenseApprovalId: expenseApprovalId ? String(expenseApprovalId) : null,
      },
    });

    await financialTx.postTeacherPayroll(
      { salaryTransactionId: row.id },
      createdBy ? { id: createdBy } : null,
      { tx },
    );
    return row;
  });

  return withLegacyId(created);
};

export const create = async ({ salaryId, amount, method, paidAt, note }, currentUser) => {
  const { salary, branchId, day } = await validateSalaryPayment({ salaryId, paidAt });

  // FILIAL: boshqa filial o'qituvchisiga to'lab bo'lmaydi.
  //
  // Bu tekshiruv validateSalaryPayment ICHIDA emas, ataylab shu yerda:
  // executeApproved ham o'sha funksiyani chaqiradi, lekin tasdiqlash
  // owner kontekstida bo'ladi va u yerda ko'lam boshqacha - o'sha yo'l
  // approval.branchId bilan alohida tekshiriladi.
  //
  // Ahamiyati faqat ko'rinish emas: har filialning O'Z chiqim limiti bor,
  // shuning uchun begona filialga to'lash o'sha filial limitini ham
  // aylanib o'tardi.
  if (!isBranchAllowed(branchId)) {
    throw new ApiError(404, "Maosh topilmadi");
  }

  // CHIQIM LIMITI: summa filial limitidan oshsa - pul HOZIR chiqmaydi,
  // "tasdiq kutilmoqda" so'rovi yaratiladi. Balansga TEGILMAYDI.
  const { needsApproval, threshold } = await checkExpenseLimit({
    branchId,
    amount,
    permissions: currentUser?.permissions,
  });

  if (needsApproval) {
    const teacher = await prisma.user.findUnique({
      where: { id: salary.teacherId },
      select: { firstName: true, lastName: true },
    });
    const approval = await createRequest({
      branchId,
      kind: EXPENSE_KINDS.SALARY_PAYMENT,
      amount,
      threshold,
      payload: { salaryId: String(salary.id), method, paidAt: day, note: note || "" },
      subjectName: teacher
        ? `${teacher.firstName} ${teacher.lastName || ""}`.trim()
        : "O'qituvchi",
      contextName: `${salary.month}/${salary.year} maosh`,
      currentUser,
    });
    // Chaqiruvchi (handler) buni ko'rib 202 qaytaradi.
    return { pendingApproval: true, approval };
  }

  return writeSalaryTransaction({
    salary,
    branchId,
    day,
    amount,
    method,
    note,
    createdBy: actorId(currentUser),
  });
};

/**
 * TASDIQLANGAN so'rovni bajaradi (expenseApproval.service'dan chaqiriladi).
 *
 * AYNAN BIR MARTA: avval shu so'rov bo'yicha tranzaksiya bor-yo'qligini
 * tekshiramiz. Agar bor bo'lsa - jarayon o'tgan safar tranzaksiyani yozib,
 * holatni yangilashga ulgurmagan. Qayta to'lamaymiz, mavjudini qaytaramiz.
 * Ikkinchi himoya - expenseApprovalId partial unique indeksi.
 */
export const executeApproved = async (approval) => {
  const approvalId = String(approval.id ?? approval._id);
  const existing = await prisma.salaryTransaction.findFirst({
    where: { expenseApprovalId: approvalId },
  });
  if (existing) return withLegacyId(existing);

  const { salaryId, method, paidAt, note } = approval.payload || {};

  // QAYTA VALIDATSIYA: so'rov va tasdiq orasida holat o'zgargan bo'lishi
  // mumkin (guruh arxivlangan, qoldiq kamaygan). Payload'ga ishonmaymiz.
  const { salary, branchId, day } = await validateSalaryPayment({
    salaryId,
    paidAt,
  });

  if (String(branchId) !== String(approval.branchId)) {
    throw new ApiError(400, "Maoshning filiali o'zgargan");
  }

  return writeSalaryTransaction({
    salary,
    branchId,
    day,
    amount: approval.amount,
    method,
    note,
    createdBy: approval.requestedById || approval.requestedBy,
    expenseApprovalId: approvalId,
  });
};

// To'lovni bekor qiladi (soft-delete), balansni atomik kamaytiradi.
export const remove = async (id, currentUser) => {
  // FILIAL: boshqa filial to'lovini bekor qilib bo'lmaydi (SalaryTransaction'da
  // branchId bor, shuning uchun to'g'ridan-to'g'ri filtr).
  const trx = await prisma.salaryTransaction.findFirst({
    where: { id: String(id), ...branchFilter(), isDeleted: false },
  });
  if (!trx) throw new ApiError(404, "Tranzaksiya topilmadi");
  await prisma.salaryTransaction.update({
    where: { id: trx.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
  });
  await teacherSalaryService.applyPaidDelta(trx.salaryId, -trx.amount);
  return { id: trx.id, _id: trx.id };
};
