import studentPaymentsImporter from "./studentPayments.importer.js";
import teacherSalaryPaymentsImporter from "./teacherSalaryPayments.importer.js";

// IMPORT REYESTRI - eksport reyestri bilan bir xil mantiq.
//
// Yangi modul qo'shish uchun bitta fayl yoziladi (shartnoma:
// key/label/permission/columns/prepare/validateRow/dedupeKey/commitRow)
// va shu yerga ulanadi. Dvigatel (importEngine), shablon generatori,
// yuklash oynasi va xatolik hisoboti - hammasi umumiy, o'zgartirilmaydi.
const IMPORTERS = Object.freeze({
  [studentPaymentsImporter.key]: studentPaymentsImporter,
  [teacherSalaryPaymentsImporter.key]: teacherSalaryPaymentsImporter,
});

export const getImporter = (key) => IMPORTERS[key] || null;

export const listImporters = () => Object.values(IMPORTERS);

export default IMPORTERS;
