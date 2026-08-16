import asyncHandler from "../../../middleware/asyncHandler.js";
import ApiError from "../../../utils/ApiError.js";
import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { assertTargetInScope } from "../../../helpers/branchAccess.helper.js";
import * as openingBalanceService from "../services/openingBalance.service.js";

/**
 * Boshlang'ich qoldiqni QO'LDA kiritish.
 *
 * Odam yaratish formasida qoldiq kiritilmagan (yoki o'sha yerda yozilmay
 * qolgan) bo'lsa - yagona kirish nuqtasi shu. Ikkinchi marta yuborilsa
 * `duplicate` qaytadi va PUL IKKI MARTA YOZILMAYDI (user bo'yicha unique
 * indeks).
 */
const create = asyncHandler(async (req, res) => {
  // `branchAssignments` ATAYLAB yuklanadi: assertTargetInScope odamning
  // filiallarini `homeBranchId` VA `branchAssignments[]` dan yig'adi.
  // Prisma relation'ni so'ralmasa bermaydi - unutilsa qo'shimcha filialga
  // biriktirilgan odam "begona" bo'lib ko'rinardi (fail-closed regressiya).
  const user = await prisma.user.findUnique({
    where: { id: String(req.body.user) },
    select: {
      id: true,
      role: true,
      homeBranchId: true,
      enrolledAt: true,
      branchAssignments: { select: { branchId: true } },
    },
  });
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");

  // FILIAL CHEGARASI: bu route endi owner-only emas
  // (`finance.opening_balance`), shuning uchun boshqa filial odamiga
  // qarz/avans yozib qo'yish to'siladi. Yozuv O'ZGARMAS - noto'g'ri
  // filialga tushsa uni faqat korreksiya bilan tuzatib bo'lardi.
  assertTargetInScope(req.allowedBranchIds, req.canSeeAllBranches, user);

  // Rol uchta guruhga keltiriladi: o'quvchi / o'qituvchi / qolgan hammasi
  // (direktor, administrator, buxgalter... - ular "staff" hisobida).
  const role =
    user.role === ROLES.STUDENT || user.role === ROLES.TEACHER
      ? user.role
      : "staff";

  const result = await openingBalanceService.create(
    {
      user: user.id,
      role,
      amount: req.body.amount,
      group: req.body.group || null,
      branchId: user.homeBranchId || null,
      joinedAt: user.enrolledAt || null,
      note: req.body.note || "",
    },
    { currentUser: req.user },
  );

  if (result.status === "duplicate") {
    throw new ApiError(409, "Bu odamga boshlang'ich qoldiq allaqachon kiritilgan");
  }

  res.status(201).json({
    success: true,
    data: result.opening,
    message: "Boshlang'ich qoldiq kiritildi",
  });
});

export default create;
