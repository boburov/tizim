import logger from "../config/logger.js";
import prisma from "../config/prisma.js";
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

export const runLessonReminders = async () => {
    const today = localTodayMidnight();
    const dayKey = localTodayKey();
    const dow = localDayOfWeek();
    const dayEnd = new Date(today.getTime() + DAY_MS);

    const groups = await prisma.group.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        schedule: { some: { day: dow } },
      },
      include: { schedule: true }
    });

    if (!groups.length) {
      logger.info({ dayKey }, "Bugun darsi bor guruh yo'q - eslatma yuborilmadi");
      return { sent: 0, skipped: 0 };
    }

    const holidaySet = await holidayKeySetForRange(today, today);

    const perStudent = new Map();

    for (const group of groups) {
      if (!withinCourseBounds(group, today)) continue;

      const sessions = getClassDaysInRange(group, today, today, holidaySet);
      if (!sessions.length) continue;

      const cancelled = await loadCancelledLessonKeys(group.id, today, today);
      const live = sessions.filter((s) => !isCancelledSession(cancelled, s));
      if (!live.length) continue;

      const memberships = await prisma.groupMembership.findMany({
        where: {
          groupId: group.id,
          joinedAt: { lt: dayEnd },
          OR: [{ leftAt: null }, { leftAt: { gt: today } }],
          isDeleted: false,
        },
        select: { studentId: true },
      });

      for (const m of memberships) {
        if (!m.studentId) continue;
        const key = String(m.studentId);
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

    const activeStudents = await prisma.user.findMany({
      where: {
        id: { in: studentIds },
        role: ROLES.STUDENT,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    
    const activeSet = new Set(activeStudents.map((u) => String(u.id)));

    const freezeByStudent = await loadFreezeWindowsByStudent({
      studentId: { in: studentIds },
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
