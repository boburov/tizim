import prisma from "../../../config/prisma.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { send as sendNotification } from "../../notifications/services/notifications.service.js";

// LID ESLATMALARINI YETKAZISH.
//
// Yagona yo'l - `notifications.service.send`. U bitta amalda ikkalasini
// bajaradi: platformada bildirishnoma yozuvini yaratadi VA Telegram
// bog'langan bo'lsa botga yuboradi (notificationDeliver job orqali).
// Shuning uchun bu yerda "agar tg bog'langan bo'lsa" degan alohida shart
// YO'Q - bog'lanmagan odam xabarni platformada baribir ko'radi.

export const fullName = (lead) =>
  `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lid";

// Mas'ul tayinlanmagan lid uchun ZAXIRA manzil.
// Egasiz eslatma hech kimga bormasa lid jimgina o'lib ketardi - shuning
// uchun u egalarga (owner) tushadi.
const ownerIds = async () => {
  const owners = await prisma.user.findMany({
    where: { role: ROLES.OWNER, isActive: true, isDeleted: false },
    select: { id: true },
  });
  return owners.map((o) => String(o.id));
};

const timeLabel = (date) =>
  date
    ? new Date(date).toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: process.env.TZ_NAME || "Asia/Tashkent",
      })
    : "";

// ── 1) BITTA LID: vaqti kelgan eslatma ──────────────────────────────────
export const notifyLeadReminder = async (lead) => {
  const to = lead.assignedTo ? [String(lead.assignedTo)] : await ownerIds();
  if (!to.length) return { delivered: false, reason: "no-recipient" };

  const note = lead.followUpNote ? `\nIzoh: ${lead.followUpNote}` : "";
  await sendNotification(
    {
      title: "Qayta bog'lanish vaqti",
      body: `${fullName(lead)} — ${lead.phone || ""}${note}`,
      category: "other",
      audience: { type: "auto_system", userIds: to },
      isAuto: true,
      // Idempotentlik: job qayta ishga tushsa yoki bir necha marta
      // urinsa ham bitta eslatma uchun BITTA xabar ketadi.
      dedupeKey: `lead-followup:${lead._id}:${new Date(lead.followUpAt).getTime()}`,
    },
    null,
  );
  return { delivered: true, recipients: to.length };
};

// ── 2) KUNLIK YIG'MA: "bugun N ta lid bilan bog'lanishingiz kerak" ──────
//
// Har xodim FAQAT o'z lidlarini oladi. Egalar (owner) esa butun ro'yxatni
// ko'radi - mas'uli yo'q lidlar ham shu yerda ko'rinadi, aks holda ular
// hech kimning ro'yxatiga tushmasdi.
const MAX_LINES = 20;

const linesOf = (leads) =>
  leads
    .slice(0, MAX_LINES)
    .map((l) => {
      const at = timeLabel(l.followUpAt);
      const note = l.followUpNote ? ` — ${l.followUpNote}` : "";
      return `• ${at} ${fullName(l)} (${l.phone || "raqamsiz"})${note}`;
    })
    .join("\n");

const bodyOf = (leads) => {
  const rest = leads.length > MAX_LINES ? `\n… va yana ${leads.length - MAX_LINES} ta` : "";
  return `${linesOf(leads)}${rest}`;
};

export const sendDailyDigest = async (leads, dayKey) => {
  if (!leads.length) return { sent: 0 };

  // Xodim -> o'z lidlari
  const byUser = new Map();
  for (const lead of leads) {
    if (!lead.assignedTo) continue;
    const key = String(lead.assignedTo);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(lead);
  }

  // Egalar butun ro'yxatni oladi. Ega bir vaqtda mas'ul ham bo'lsa - unga
  // IKKI xabar ketmasin, to'liq ro'yxat o'z ro'yxatining ustiga yozadi
  // (u yaxlit to'plam, ya'ni hech narsa yo'qolmaydi).
  for (const id of await ownerIds()) byUser.set(id, leads);

  let sent = 0;
  for (const [userId, items] of byUser) {
    try {
      await sendNotification(
        {
          title: `Bugun ${items.length} ta lid bilan bog'lanishingiz kerak`,
          body: bodyOf(items),
          category: "other",
          audience: { type: "auto_system", userIds: [userId] },
          isAuto: true,
          dedupeKey: `lead-digest:${userId}:${dayKey}`,
        },
        null,
      );
      sent += 1;
    } catch (err) {
      logger.warn({ err, userId }, "Lid kunlik yig'masi yuborilmadi");
    }
  }

  return { sent };
};
