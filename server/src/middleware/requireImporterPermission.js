import ApiError from "../utils/ApiError.js";
import { hasPermission } from "../helpers/permission.helper.js";
import { getImporter } from "../modules/imports/registry/index.js";

/**
 * IMPORT RUXSATI - reyestrdan dinamik olinadi (requireDatasetPermission
 * bilan bir xil naqsh).
 *
 * DIQQAT: import ruxsati O'QISH emas, YOZISH huquqiga bog'langan
 * (finance.pay, salary.pay). Ro'yxatni ko'ra oladigan xodim avtomatik
 * ravishda ommaviy yozish huquqini OLMASLIGI kerak - bu importning eng
 * muhim farqi eksportdan.
 */
const requireImporterPermission = () => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));

  const importer = getImporter(req.params.importerKey);
  if (!importer) return next(new ApiError(404, "Bunday import turi topilmadi"));

  if (!hasPermission(req.permissions, importer.permission)) {
    return next(new ApiError(403, "Ruxsat etilmagan"));
  }

  req.importer = importer;
  next();
};

export default requireImporterPermission;
