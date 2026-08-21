import logger from "../config/logger.js";
import { deliverAssignment } from "../modules/assignments/services/assignments.service.js";

export const JOB_NAME = "assignment.deliver";

// Bitta vazifani bot orqali yetkazadi (so'rov oqimidan ajratilgan: 30 ta
// hujjat yuborish bir necha soniya olishi mumkin, o'qituvchi kutmasin).
//
// Idempotent: deliverAssignment faqat status="pending" oluvchilarni uradi,
// shuning uchun job qayta ishga tushsa ham dublikat fayl yuborilmaydi.
//
// lockLifetime notification job'idan uzunroq (15 daqiqa): hujjat yuborish
// matndan sekinroq va katta guruhda 5 daqiqa yetmay qolishi mumkin.
export default function defineAssignmentDeliver(agenda) {
  agenda.define(
    JOB_NAME,
    { concurrency: 1, lockLifetime: 15 * 60 * 1000 },
    async (job) => {
      const { assignmentId } = job.attrs.data || {};
      if (!assignmentId) return;
      try {
        await deliverAssignment(assignmentId);
      } catch (err) {
        logger.error({ err, assignmentId }, "Vazifa yetkazishda xato");
        throw err; // Agenda qayta urinadi
      }
    },
  );
}
