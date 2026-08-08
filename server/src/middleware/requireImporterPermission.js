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

  // Ba'zi importlar bir nechta huquqni birdan talab qiladi. Masalan
  // xodim importi odam yaratadi VA rol biriktiradi - users.routes.js
  // dagi POST /staff yo'lida ham AYNAN shu ikkitasi so'raladi. Import
  // o'sha yo'lning ommaviy varianti bo'lgani uchun talab ham bir xil
  // bo'lishi shart, aks holda import "yon eshik" bo'lib qolardi.
  for (const extra of importer.extraPermissions || []) {
    if (!hasPermission(req.permissions, extra)) {
      return next(new ApiError(403, "Ruxsat etilmagan"));
    }
  }

  req.importer = importer;
  next();
};

export default requireImporterPermission;
