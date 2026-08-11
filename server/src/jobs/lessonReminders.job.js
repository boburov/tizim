import logger from "../config/logger.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import User from "../models/user.model.js";
import { send as sendNotification } from "../modules/notifications/services/notifications.service.js";
import { holidayKeySetForRange } from "../modules/holidays/services/holidays.service.js";
import {
  loadCancelledLessonKeys,
  isCancelledSession,
} from "../helpers/lessonCancellation.helper.js";
import {
  loadFreezeWindowsByStudent,
  isFrozenOn,
} from "../helpers/studentFreeze.helper.js";
import {
  localTodayMidnight,
  localTodayKey,
  localDayOfWeek,
  getClassDaysInRange,
  withinCourseBounds,
} from "../helpers/attendance.helper.js";
import { ROLES } from "../constants/roles.js";

export const JOB_NAME = "daily.lesson-reminder";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ERTALABKI DARS ESLATMASI.
 *
 * Har kuni ertalab bugun darsi bor HAR BIR o'quvchiga bitta xabar
 * yuboradi - platformaga va (bot ulangan bo'lsa) Telegramga. Ikkinchi
 * kanal alohida kod talab qilmaydi: `notifications.service.send()`
 * yozuvni yaratadi, `notificationDeliver` job esa uni botga uzatadi.
 *
 * ─── "BUGUN DARS BOR" NIMANI ANGLATADI ───
 * Bu savolga aniq javob berish uchun beshta shart tekshiriladi va
 * ularning har biri alohida sababga ega:
 *
 *   1. Guruh JADVALIDA shu hafta kuni bor  - getClassDaysInRange
 *      (jadval versiyalarini ham hisobga oladi: o'tgan oy o'chirilgan
 *      kun bugun "tirilib" qolmasin);
 *   2. Bugun BAYRAM emas                    - holidaySet;
 *   3. Sana kurs CHEGARASIDA                - withinCourseBounds
 *      (getClassDaysInRange faqat startDate'ni biladi, endDate'ni emas);
 *   4. Dars BEKOR qilinmagan                - lessonCancellation;
 *   5. O'quvchi MUZLATILMAGAN va faol a'zo  - freeze + membership.
 *
 * Bittasi ham tushib qolsa eslatma yolg'on bo'ladi: o'quvchi bayram
 * kuni yoki bekor qilingan darsga kelib qolardi. Shuning uchun bu
 * yerda "taxminan to'g'ri" yetarli emas.
 *
 * ─── NEGA HAR O'QUVCHIGA BITTA XABAR ───
 * Bir o'quvchi bir kunda ikki guruhda o'qishi mumkin. Guruh bo'yicha
 * yuborilsa u ikkita alohida xabar olardi. Shuning uchun avval
 * o'quvchi bo'yicha yig'iladi, keyin bitta xabarda hammasi ro'yxat
 * bo'lib ketadi.
 *
 * `dedupeKey` kunlik: job qayta ishga tushsa ham (deploy, xatolikdan
 * keyingi urinish) o'quvchi kuniga bittadan ortiq eslatma olmaydi.
 */
export const runLessonReminders = async () => {
    const today = localTodayMidnight();
    const dayKey = localTodayKey();
    const dow = localDayOfWeek();
    const dayEnd = new Date(today.getTime() + DAY_MS);

    const groups = await Group.find({
      isActive: true,
      isDeleted: { $ne: true },
      "schedule.day": dow,
    }).lean();

    if (!groups.length) {
      logger.info({ dayKey }, "Bugun darsi bor guruh yo'q - eslatma yuborilmadi");
      return { sent: 0, skipped: 0 };
    }

    const holidaySet = await holidayKeySetForRange(today, today);

    // studentId -> [{ group, startTime, endTime }]
    const perStudent = new Map();

    for (const group of groups) {
      if (!withinCourseBounds(group, today)) continue;

      const sessions = getClassDaysInRange(group, today, today, holidaySet);
      if (!sessions.length) continue;

      const cancelled = await loadCancelledLessonKeys(group._id, today, today);
      const live = sessions.filter((s) => !isCancelledSession(cancelled, s));
      if (!live.length) continue;

      // Shu sanada FAOL a'zolar: bugun qo'shilgan ham kiradi (joinedAt
      // kun ichida bo'lishi mumkin), bugun chiqqan esa kirmaydi.
      const memberships = await GroupMembership.find(
        {
          group: group._id,
          joinedAt: { $lt: dayEnd },
          $or: [{ leftAt: null }, { leftAt: { $gt: today } }],
          isDeleted: { $ne: true },
        },
        { student: 1 },
      ).lean();

      for (const m of memberships) {
        if (!m.student) continue;
        const key = String(m.student);
        if (!perStudent.has(key)) perStudent.set(key, []);
        for (const s of live) {
          perStudent.get(key).push({
            group: group.name,
            startTime: s.startTime,
            endTime: s.endTime,
          });
        }
      }
    }

    if (!perStudent.size) {
      logger.info({ dayKey }, "Bugun darsi bor o'quvchi topilmadi");
      return { sent: 0, skipped: 0 };
    }

    const studentIds = [...perStudent.keys()];

    // FAQAT FAOL o'quvchi. Arxivlangan/o'chirilgan odam a'zolikda
    // qolib ketishi mumkin - unga xabar yuborish xato bo'lardi.
    const activeStudents = await User.find(
      {
        _id: { $in: studentIds },
        role: ROLES.STUDENT,
        isActive: true,
        isDeleted: { $ne: true },
      },
      { _id: 1 },
    ).lean();
    const activeSet = new Set(activeStudents.map((u) => String(u._id)));

    // Muzlatish oynalari - o'quvchi bo'yicha, bitta so'rovda.
    const freezeByStudent = await loadFreezeWindowsByStudent({
      student: { $in: studentIds },
    });
    const todayMs = today.getTime();

    let sent = 0;
    let skipped = 0;

    for (const [studentId, lessons] of perStudent) {
      if (!activeSet.has(studentId)) {
        skipped += 1;
        continue;
      }
      if (isFrozenOn(freezeByStudent.get(studentId) || [], todayMs)) {
        skipped += 1;
        continue;
      }

      // Vaqt bo'yicha tartib - o'quvchi kunini shu ketma-ketlikda o'qiydi.
      lessons.sort((a, b) => a.startTime.localeCompare(b.startTime));
      const lines = lessons.map(
        (l) => `• ${l.startTime}–${l.endTime} · ${l.group}`,
      );
      const first = lessons[0];

      try {
        await sendNotification(
          {
            title: "Bugun darsingiz bor",
            body:
              lessons.length === 1
                ? `Bugun soat ${first.startTime} da "${first.group}" guruhida darsingiz bor. Kechikmang!`
                : `Bugun ${lessons.length} ta darsingiz bor:\n${lines.join("\n")}`,
            category: "attendance",
            audience: { type: "auto_system", userIds: [studentId] },
            isAuto: true,
            dedupeKey: `lesson-reminder:${studentId}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        // Bitta o'quvchi tushib qolsa qolganlari yuborilaversin.
        logger.warn({ err, studentId }, "Dars eslatmasi yuborilmadi");
      }
    }

    logger.info(
      { dayKey, groups: groups.length, sent, skipped },
      "Ertalabki dars eslatmalari yuborildi",
    );
    return { sent, skipped };
};

export default function defineLessonReminders(agenda) {
  agenda.define(JOB_NAME, runLessonReminders);
}
