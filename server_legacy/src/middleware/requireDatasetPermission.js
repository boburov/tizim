import ApiError from "../utils/ApiError.js";
import { hasPermission } from "../helpers/permission.helper.js";
import { getDataset } from "../modules/exports/registry/index.js";

/**
 * EKSPORT RUXSATI - dataset reyestridan olinadi.
 *
 * NEGA alohida middleware: eksport route'i BITTA (`/:datasetKey`), lekin
 * har bir dataset o'z ruxsatini talab qiladi (to'lovlar - finance.read,
 * o'qituvchilar - teachers.read). requirePermission() qattiq kalit
 * kutadi, shuning uchun bu yerda kalit reyestrdan dinamik olinadi.
 *
 * MUHIM: dataset topilmasa 404, ruxsat yetmasa 403 - lekin ikkalasi ham
 * *avval* autentifikatsiyadan o'tgan bo'ladi (requireAuth oldin turadi),
 * shuning uchun anonim so'rov dataset'lar ro'yxatini sanab chiqa olmaydi.
 */
const requireDatasetPermission = () => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));

  const dataset = getDataset(req.params.datasetKey);
  if (!dataset) return next(new ApiError(404, "Bunday hisobot turi topilmadi"));

  if (!hasPermission(req.permissions, dataset.permission)) {
    return next(new ApiError(403, "Ruxsat etilmagan"));
  }

  // Handler qayta qidirmasin.
  req.dataset = dataset;
  next();
};

export default requireDatasetPermission;
