import asyncHandler from "./asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { verifyAccess } from "../utils/jwt.js";
import User from "../models/user.model.js";
import { resolveRole } from "../helpers/permission.helper.js";
import {
  resolveBranchScope,
  resolveRoleForBranch,
} from "../helpers/branchAccess.helper.js";
import { runWithBranchContext } from "../helpers/branchContext.helper.js";
import { assertBranchIntent } from "../helpers/branchIntent.guard.js";

// Verifies access JWT and populates req.user / req.permissions / req.role
const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

  let payload;
  try {
    payload = verifyAccess(token);
  } catch {
    throw new ApiError(401, "Token yaroqsiz yoki muddati o'tgan");
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, "Foydalanuvchi topilmadi");

  // 1-BOSQICH: asosiy (global) rol.
  const baseRole = await resolveRole(user.role);

  // MUZLATISH: rol muzlatilgan bo'lsa MAVJUD sessiya ham darhol uziladi -
  // access token amal qilib tursa ham foydalanuvchi panelga kira olmaydi.
  // 403 emas, 401 qaytaramiz: client interceptor'i login sahifasiga oladi.
  if (baseRole.isFrozen) {
    throw new ApiError(401, "Sizning rolingiz muzlatilgan. Administratorga murojaat qiling");
  }

  // FILIAL KO'LAMI.
  //
  // NEGA shu yerda: route'lar requireAuth'ni ALOHIDA ulaydi (global emas),
  // shuning uchun filial kontekstini alohida middleware qilsak, uni har bir
  // route'ga qo'shishni unutish mumkin - va unutilgan joy jimgina boshqa
  // filial ma'lumotini ochib qo'yardi. requireAuth ichida bo'lsa,
  // autentifikatsiya bor joyda ko'lam ham DOIM bor.
  //
  // DIQQAT (tartib): ko'lamni ASOSIY rol ruxsatlari bilan aniqlaymiz.
  // Filialga xos rol keyin qo'llanadi - aks holda halqa hosil bo'lardi
  // (ko'lam uchun ruxsat kerak, ruxsat uchun ko'lam kerak).
  const scope = await resolveBranchScope({
    user,
    permissions: baseRole.permissions,
    requestedBranchId: req.headers["x-branch-id"]
      ? String(req.headers["x-branch-id"]).trim()
      : null,
  });

  // FILIAL NIYATI: client kutgan filial server hal qilganiga mos keladimi.
  //
  // Ko'lam hal qilingandan KEYIN, lekin hech narsa yozilishidan OLDIN
  // turishi shart - shu sababli aynan shu joyda (batafsil sabab:
  // helpers/branchIntent.guard.js).
  assertBranchIntent(req, scope);

  // 2-BOSQICH: FILIALGA XOS ROL.
  //
  // Bir odam A filialda "direktor", B filialda "o'qituvchi" bo'lishi mumkin.
  // branchAssignments'da shu filial uchun boshqa rol ko'rsatilgan bo'lsa,
  // RUXSATLAR ham o'shanikidan olinadi - aks holda branchAssignments[].role
  // shunchaki bezak bo'lib qolardi.
  //
  // Aniq filial tanlanmagan bo'lsa (konsolidatsiya rejimi) asosiy rol ishlaydi.
  const branchRoleValue = resolveRoleForBranch(user, scope.branchId);
  let effectiveRole = baseRole;

  if (branchRoleValue && branchRoleValue !== user.role) {
    const branchRole = await resolveRole(branchRoleValue);
    // Filialga xos rol ham muzlatilgan bo'lishi mumkin - o'sha filialda
    // ishlay olmaydi (lekin boshqa filialda ishlashi mumkin).
    if (branchRole.isFrozen) {
      throw new ApiError(
        403,
        "Bu filialdagi rolingiz muzlatilgan. Administratorga murojaat qiling",
      );
    }
    effectiveRole = branchRole;
  }

  req.user = user;
  req.role = effectiveRole;
  req.permissions = effectiveRole.permissions;
  // Asosiy rol ham qoladi - ba'zi tekshiruvlar unga tayanadi.
  req.baseRole = baseRole;

  req.branchId = scope.branchId;
  req.allowedBranchIds = scope.allowedBranchIds;
  req.canSeeAllBranches = scope.canSeeAllBranches;
  req.branchRole = branchRoleValue;

  // ALS konteksti: shundan keyingi barcha async chaqiruvlar
  // branchFilter() / branchMatchStage() orqali ko'lamni ko'radi.
  runWithBranchContext(
    {
      branchId: scope.branchId,
      allowedBranchIds: scope.allowedBranchIds,
      canSeeAllBranches: scope.canSeeAllBranches,
      userId: String(user._id),
    },
    () => next(),
  );
});

export default requireAuth;
