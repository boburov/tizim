import logger from "../config/logger.js";
import prisma from "../config/prisma.js";
import { listForGroupOnDate } from "../modules/attendance/services/attendance.service.js";
import { send as sendNotification } from "../modules/notifications/services/notifications.service.js";
import {
  localTodayMidnight,
  localDayOfWeek,
  localTodayKey,
} from "../helpers/attendance.helper.js";
import { ROLES } from "../constants/roles.js";

export const JOB_NAME = "daily.attendance-unmarked";

export default function defineAttendanceReminders(agenda) {
  agenda.define(JOB_NAME, async () => {
    const today = localTodayMidnight();
    const dow = localDayOfWeek();
    const dayKey = localTodayKey();

    const groups = await prisma.group.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        schedule: { some: { day: dow } },
      },
      include: { teachers: { select: { id: true } } }
    });

    const perTeacher = new Map();
    const ownerDigest = [];

    for (const g of groups) {
      let data;
      try {
        data = await listForGroupOnDate(g.id, today);
      } catch (err) {
        logger.warn({ err, groupId: g.id }, "Guruh davomati o'qilmadi");
        continue;
      }
      if (!data.isClassDay) continue;
      const total = data.rows.length;
      if (total === 0) continue;
      const unmarked = data.rows.filter((r) => !r.attendance).length;
      if (unmarked === 0) continue;

      ownerDigest.push({ name: g.name, unmarked, total });
      for (const t of g.teachers || []) {
        const k = String(t.id);
        if (!perTeacher.has(k)) perTeacher.set(k, []);
        perTeacher.get(k).push({ name: g.name, unmarked, total });
      }
    }

    let sent = 0;
    for (const [teacherId, list] of perTeacher) {
      const lines = list.map(
        (x) => `• ${x.name}: ${x.unmarked}/${x.total} belgilanmagan`,
      );
      try {
        await sendNotification(
          {
            title: "Bugungi davomat belgilanmagan",
            body: `Quyidagi guruhlarda bugungi davomat to'liq belgilanmagan:\n${lines.join("\n")}`,
            category: "attendance",
            audience: { type: "auto_system", userIds: [teacherId] },
            isAuto: true,
            dedupeKey: `att-unmarked:${teacherId}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        logger.warn({ err, teacherId }, "O'qituvchi eslatmasi yuborilmadi");
      }
    }

    if (ownerDigest.length > 0) {
      const owners = await prisma.user.findMany({
        where: { role: ROLES.OWNER, isActive: true, isDeleted: false },
        select: { id: true },
      });
      if (owners.length) {
        const lines = ownerDigest.map((x) => `• ${x.name}: ${x.unmarked}/${x.total}`);
        try {
          await sendNotification(
            {
              title: "Davomat belgilanmagan guruhlar",
              body: `Bugun ${ownerDigest.length} ta guruhda davomat to'liq belgilanmadi:\n${lines.join("\n")}`,
              category: "attendance",
              audience: { type: "auto_system", userIds: owners.map((o) => String(o.id)) },
              isAuto: true,
              dedupeKey: `att-unmarked-owner:${dayKey}`,
            },
            null,
          );
        } catch (err) {
          logger.warn({ err }, "Egasiga davomat hisoboti yuborilmadi");
        }
      }
    }
  });
}
