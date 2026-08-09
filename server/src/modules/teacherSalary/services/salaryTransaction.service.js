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
  if (salary.group) {
    group = await Group.findById(salary.group, {
      isActive: 1,
      isDeleted: 1,
      branchId: 1,
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
      branchId,
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
    const teacher = await User.findById(salary.teacher)
      .select("firstName lastName")
      .lean();
    const approval = await createRequest({
      branchId,
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
    branchId,
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
