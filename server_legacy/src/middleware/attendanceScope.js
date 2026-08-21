import ApiError from "../utils/ApiError.js";
import { ROLE_TYPES } from "../constants/roles.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { hasPermission } from "../helpers/permission.helper.js";
import prisma from "../config/prisma.js";

// DAVOMAT / BAHO KO'LAMI (scope).
//
// requirePermission "shu bo'limga umuman kira oladimi?" degan savolga javob
// beradi. Bu middleware esa "AYNAN SHU guruh/o'quvchi uning ma'lumotimi?"
// degan ikkinchi savolga - shuning uchun requirePermission'dan KEYIN turadi.
//
// DIQQAT (regressiya tarixi): ilgari bu yerda `req.user.role` qiymati uchta
// built-in satr bilan solishtirilardi (owner/teacher/student). Custom rollar
// - "Filial direktori", "Bosh o'qituvchi", "Metodist" - hech qaysi shoxga
// tushmay, oxiridagi `return 403` ga yiqilardi. Natijada matritsada BARCHA
// ruxsat belgilangan direktor ham davomat va baho sahifalarida "Ruxsat
// etilmagan" olardi: to'siq ruxsatda emas, ROL NOMIDA edi.
//
// Shuning uchun endi rol NOMIGA emas, roleType'ga qaraydi (kodbazadagi
// umumiy qoida - roles.helper.js dagi isTeacherLike/isStudentLike bilan bir
// xil), xodim (staff) esa FILIAL ko'lami bilan cheklanadi.

// Xodim uchun to'siq ruxsat emas, FILIAL: u o'z filialining guruhlarini
// ko'radi. Owner yoki branches.view_all - hammasini.
const seesAllBranches = (req) =>
  Boolean(req.canSeeAllBranches) ||
  hasPermission(req.permissions, PERMISSIONS.BRANCHES_VIEW_ALL);

const isBranchAllowed = (req, branchId) =>
  (req.allowedBranchIds || []).some((id) => String(id) === String(branchId));

// Xodim ko'lamidagi guruh ID'lari. null = cheklov yo'q (barcha filial).
// Bo'sh massiv = hech qaysi filialga biriktirilmagan -> hech narsa ko'rmaydi
// (branchFilter() dagi fail-closed qoidasi bilan bir xil).
const branchGroupIds = async (req) => {
  if (seesAllBranches(req)) return null;
  const allowed = req.allowedBranchIds || [];
  if (allowed.length === 0) return [];
  const groups = await prisma.group.findMany({
    where: { branchId: { in: allowed.map(String) } },
    select: { id: true },
  });
  return groups.map((g) => g.id);
};

// Foydalanuvchi (o'quvchi) qaysi filiallarga tegishli.
const userBranchIds = (doc) => {
  const ids = new Set();
  if (doc?.homeBranchId) ids.add(String(doc.homeBranchId));
  for (const a of doc?.branchAssignments || []) {
    if (a?.branchId) ids.add(String(a.branchId));
  }
  return ids;
};

// Guruhga kirish: owner - barchasi; teacher - faqat o'ziga biriktirilgan
// guruh; xodim (direktor va boshqa custom rollar) - faqat o'z filiali;
// student - taqiqlangan. (requirePermission dan KEYIN qo'yiladi.)
export const requireGroupAccess =
  (extractGroupId = (req) => req.params.groupId) =>
  async (req, _res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));

      const roleType = req.role?.roleType;
      if (roleType === ROLE_TYPES.OWNER) return next();
      if (roleType === ROLE_TYPES.STUDENT) {
        return next(new ApiError(403, "Ruxsat etilmagan"));
      }

      const groupId = extractGroupId(req);

      if (roleType === ROLE_TYPES.TEACHER) {
        const g = await prisma.group.findUnique({
          where: { id: String(groupId) },
          // `teachers` KO'P-KO'PGA bog'lanish: Mongo'da guruh hujjati
          // ichidagi ObjectId massivi edi, Prisma'da esa alohida jadval.
          select: { teachers: { select: { id: true } } },
        });
        const isOwn =
          g && (g.teachers || []).some((t) => String(t.id) === String(req.user._id));
        if (isOwn) return next();
        return next(new ApiError(403, "Bu guruh sizga biriktirilmagan"));
      }

      // XODIM (staff): direktor, metodist va h.k. Ruxsat matritsasi allaqachon
      // requirePermission'da tekshirilgan - bu yerda faqat FILIAL chegarasi.
      if (seesAllBranches(req)) return next();

      const g = await prisma.group.findUnique({
        where: { id: String(groupId) },
        select: { branchId: true },
      });
      // Guruh topilmasa ham fail-closed: mavjud emasligini 403 bilan
      // yashiramiz (ID sanab chiqishga yo'l bermaslik uchun).
      if (g && isBranchAllowed(req, g.branchId)) return next();
      return next(new ApiError(403, "Bu guruh sizning filialingizga tegishli emas"));
    } catch (err) {
      next(err);
    }
  };

// O'quvchiga kirish: owner - barchasi; student - faqat o'zi; teacher - faqat
// o'z guruhlaridagi o'quvchi; xodim - faqat o'z filialidagi o'quvchi.
export const requireStudentAccess =
  (extractStudentId = (req) => req.params.id) =>
  async (req, _res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
      const sid = String(extractStudentId(req) || "");
      // scopeGroupIds: handler ma'lumotni qaysi guruhlar bilan cheklashini
      // belgilaydi. Owner/student uchun null (barcha guruhlar ko'rinadi -
      // student baribir faqat o'zini so'raydi). Teacher uchun esa faqat o'zi
      // o'qitadigan guruhlar (A-1 cross-group disclosure fix), xodim uchun
      // esa o'z filialining guruhlari.
      req.scopeGroupIds = null;

      const roleType = req.role?.roleType;
      if (roleType === ROLE_TYPES.OWNER) return next();

      if (roleType === ROLE_TYPES.STUDENT) {
        if (sid && sid === String(req.user._id)) return next();
        return next(new ApiError(403, "Ruxsat etilmagan"));
      }

      if (roleType === ROLE_TYPES.TEACHER) {
        // `teachers: id` Mongo'da massivga tegishlilik edi; Prisma'da
        // bu `some` relation filtri.
        const groups = await prisma.group.findMany({
          where: { teachers: { some: { id: String(req.user._id) } } },
          select: { id: true },
        });
        const groupIds = groups.map((g) => g.id);
        if (groupIds.length === 0) {
          return next(new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas"));
        }
        const membership = await prisma.groupMembership.findFirst({
          where: { studentId: sid, groupId: { in: groupIds }, isDeleted: false },
          select: { id: true },
        });
        if (membership) {
          req.scopeGroupIds = groupIds;
          return next();
        }
        return next(new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas"));
      }

      // XODIM (staff): o'z filialidagi o'quvchi.
      if (seesAllBranches(req)) return next();

      // `branchAssignments` ham alohida jadval - `select` shart, aks
      // holda `userBranchIds` faqat `homeBranchId` ni ko'rib, ikkinchi
      // filialga biriktirilgan o'quvchini "begona" deb rad etardi.
      const student = await prisma.user.findUnique({
        where: { id: sid },
        select: {
          homeBranchId: true,
          branchAssignments: { select: { branchId: true } },
        },
      });
      const targetBranchIds = userBranchIds(student);
      const overlap = (req.allowedBranchIds || []).some((id) =>
        targetBranchIds.has(String(id)),
      );
      if (!overlap) {
        return next(new ApiError(403, "Bu o'quvchi sizning filialingizda emas"));
      }

      // O'quvchi BOSHQA filialda ham o'qiyotgan bo'lishi mumkin - oylik
      // davomat/baho hisobotida o'sha guruhlar ko'rinib qolmasin.
      req.scopeGroupIds = await branchGroupIds(req);
      return next();
    } catch (err) {
      next(err);
    }
  };
