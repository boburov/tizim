/**
 * O'QITUVCHI DAVOMATI HOLATLARI.
 *
 * Ilgari bu ro'yxat `models/teacherAttendance.model.js` ichida edi va
 * Mongoose sxemasining `enum` i bo'lib xizmat qilardi. Model fayllari
 * ko'chirish tugagach o'chiriladi, ro'yxat esa SERVISGA kerak
 * (`bulkRecord` kelgan statusni shu bo'yicha tekshiradi) - shuning
 * uchun u konstantaga chiqarildi.
 *
 * ═══════════════════════════════════════════════════════════════════
 * "exempt" ATAYLAB YO'Q.
 *
 * O'quvchida "imtiyoz" tushunchasi bor (AttendanceExemption), lekin
 * o'qituvchida yo'q: u yo keldi, yo kelmadi, yo sababli kelmadi.
 * Ro'yxatga "exempt" qo'shilsa maosh hisobi uni qanday qarashini
 * bilmasdi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Qiymatlar Prisma `TeacherAttendanceStatus` enum'i bilan AYNAN bir
 * xil bo'lishi SHART - aks holda yozuv bazada rad etiladi.
 */
export const TEACHER_ATTENDANCE_STATUSES = Object.freeze([
  "present",
  "absent",
  "excused",
]);

export default TEACHER_ATTENDANCE_STATUSES;
