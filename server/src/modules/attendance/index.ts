/**
 * ATTENDANCE MODULINING OMMAVIY API'SI — boshqa modullar FAQAT shu fayl orqali
 * kiradi (`scripts/arch-scan.mjs` R1).
 *
 * ⚠ MODUL KLASSI BU YERDA YO'Q — ATAYLAB.
 * Uni re-eksport qilish ish vaqtida SIKL yaratardi: servisni olish
 * uchun `*.module.ts` ham yuklanardi, u esa boshqa modullarni
 * import qiladi ("Cannot access 'XModule' before initialization").
 * Modul klassi `<modul>/<modul>.module.js` dan olinadi — u ham
 * ommaviy kirish nuqtasi.
 */
export { AttendanceService } from './attendance.service.js';
export { TeacherAbsenceService } from './teacher-absence.service.js';
export { computeRate } from './attendance.internals.js';
