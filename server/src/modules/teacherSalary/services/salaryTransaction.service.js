import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { EXPENSE_KINDS } from "../../../models/approval.model.js";
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

// O'qituvchiga maosh to'lovi (chiqim). Qoldiqdan (expected - paid) ORTIQ to'lashga
// yo'l qo'yilmaydi - cheklov shartli-atomik update bilan tekshiriladi, shuning
// uchun parallel double-click ham capdan o'tib keta olmaydi (C3).
// Umumiy tekshiruvlar: to'g'ridan-to'g'ri to'lovda ham, tasdiqlangan
// so'rovni bajarishda ham AYNAN SHU qoidalar qo'llanadi. Tasdiq paytida
// qayta chaqiriladi - so'rov berilgandan keyin guruh arxivlangan yoki
// qoldiq o'zgargan bo'lishi mumkin.
const validateSalaryPayment = async ({ salaryId, paidAt }) => {
  const salary = await TeacherSalary.findById(salaryId);
  if (!salary) throw new ApiError(404, "Maosh topilmadi");

  // Arxivlangan guruh maoshiga to'lov yozilmaydi (avval arxivdan chiqarish kerak).
  // branchId ham shu yerdan olinadi - qo'shimcha so'rov shart emas.
  const group = await Group.findById(salary.group, {
    isActive: 1,
    isDeleted: 1,
    branchId: 1,
  });
  assertGroupActive(group);
  // FILIAL: guruhdan meros. Foydalanuvchi kontekstidan OLINMAYDI - owner
  // "barcha filiallar" rejimida to'lasa noto'g'ri filial yozilardi.
  if (!group?.branchId) throw new ApiError(400, "Guruhning filiali aniqlanmadi");

  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");
  // Kelajak sanaga chiqim yozib bo'lmaydi (kassa kunlik hisobi buzilmasin)
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "To'lov sanasi kelajakda bo'lishi mumkin emas");
  }

  return { salary, group, day };
};

// Balansni oshirib, tranzaksiyani yozadi. Ikkala yo'l ham shuni ishlatadi.
const writeSalaryTransaction = async ({
  salary,
  group,
  day,
  amount,
  method,
  note,
  createdBy,
  expenseApprovalId = null,
}) => {
  // Avval balans atomik oshiriladi (cap sharti bilan), keyin tranzaksiya yoziladi.
  const updated = await teacherSalaryService.applyPaidDelta(salary._id, amount, {
    capToRemaining: true,
  });
  if (!updated) {
    const remaining = Math.max(0, (salary.expectedAmount || 0) - (salary.paidAmount || 0));
    throw new ApiError(
      400,
      `To'lov qoldiqdan oshib ketadi (qoldiq: ${remaining} so'm)`,
    );
  }

  try {
    return await SalaryTransaction.create({
      branchId: group.branchId,
      salary: salary._id,
      teacher: salary.teacher,
      group: salary.group,
      year: salary.year,
      month: salary.month,
      amount,
      method,
      paidAt: day,
      note: note || "",
      createdBy: createdBy || null,
      expenseApprovalId,
    });
  } catch (err) {
    // Tranzaksiya yozilmasa - balans oshirilgancha qolmasin (rollback)
    await teacherSalaryService.applyPaidDelta(salary._id, -amount);
    throw err;
  }
};

export const create = async ({ salaryId, amount, method, paidAt, note }, currentUser) => {
  const { salary, group, day } = await validateSalaryPayment({ salaryId, paidAt });

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
  if (!isBranchAllowed(group.branchId)) {
    throw new ApiError(404, "Maosh topilmadi");
  }

  // CHIQIM LIMITI: summa filial limitidan oshsa - pul HOZIR chiqmaydi,
  // "tasdiq kutilmoqda" so'rovi yaratiladi. Balansga TEGILMAYDI.
  const { needsApproval, threshold } = await checkExpenseLimit({
    branchId: group.branchId,
    amount,
    permissions: currentUser?.permissions,
  });

  if (needsApproval) {
    const teacher = await User.findById(salary.teacher)
      .select("firstName lastName")
      .lean();
    const approval = await createRequest({
      branchId: group.branchId,
      kind: EXPENSE_KINDS.SALARY_PAYMENT,
      amount,
      threshold,
      payload: { salaryId: String(salary._id), method, paidAt: day, note: note || "" },
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
    group,
    day,
    amount,
    method,
    note,
    createdBy: currentUser?._id,
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
  const existing = await SalaryTransaction.findOne({
    expenseApprovalId: approval._id,
  });
  if (existing) return existing;

  const { salaryId, method, paidAt, note } = approval.payload || {};

  // QAYTA VALIDATSIYA: so'rov va tasdiq orasida holat o'zgargan bo'lishi
  // mumkin (guruh arxivlangan, qoldiq kamaygan). Payload'ga ishonmaymiz.
  const { salary, group, day } = await validateSalaryPayment({
    salaryId,
    paidAt,
  });

  if (String(group.branchId) !== String(approval.branchId)) {
    throw new ApiError(400, "Guruhning filiali o'zgargan");
  }

  return writeSalaryTransaction({
    salary,
    group,
    day,
    amount: approval.amount,
    method,
    note,
    createdBy: approval.requestedBy,
    expenseApprovalId: approval._id,
  });
};

// To'lovni bekor qiladi (soft-delete), balansni atomik kamaytiradi.
export const remove = async (id, currentUser) => {
  // FILIAL: boshqa filial to'lovini bekor qilib bo'lmaydi (SalaryTransaction'da
  // branchId bor, shuning uchun to'g'ridan-to'g'ri filtr).
  const trx = await SalaryTransaction.findOne({
    _id: id,
    ...branchFilter(),
    isDeleted: { $ne: true },
  });
  if (!trx) throw new ApiError(404, "Tranzaksiya topilmadi");
  await trx.softDelete(currentUser?._id);
  await teacherSalaryService.applyPaidDelta(trx.salary, -trx.amount);
  return { _id: id };
};
