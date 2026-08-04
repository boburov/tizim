import { Send, Ban, UserX } from "lucide-react";

/**
 * FOYDALANUVCHINING BOT HOLATI (server bilan bir xil kalitlar).
 *
 * "blocked" va "not_linked" ATAYLAB ajratilgan: birinchisida odam botni
 * bir marta ochgan-u keyin bloklagan (undan blokdan chiqarishni so'rash
 * kerak), ikkinchisida botni umuman ko'rmagan (unga havola berish kerak).
 * Yechimi har xil bo'lgani uchun ko'rinishi ham har xil.
 */
export const BOT_STATUS = Object.freeze({
  LINKED: "linked",
  BLOCKED: "blocked",
  NOT_LINKED: "not_linked",
});

export const BOT_STATUS_META = {
  [BOT_STATUS.LINKED]: {
    label: "Botga ulangan",
    short: "Ulangan",
    tone: "success",
    icon: Send,
    hint: "Xabar va vazifalar Telegram orqali yetib boradi.",
  },
  [BOT_STATUS.BLOCKED]: {
    label: "Botni bloklagan",
    short: "Bloklagan",
    tone: "danger",
    icon: Ban,
    hint: "Telegram xabarlari YETIB BORMAYDI. O'quvchidan botni blokdan chiqarishni so'rang.",
  },
  [BOT_STATUS.NOT_LINKED]: {
    label: "Botga kirmagan",
    short: "Kirmagan",
    tone: "warning",
    icon: UserX,
    hint: "Telegram xabarlari yetib bormaydi. Botga kirish havolasini bering.",
  },
};

export const botStatusMeta = (status) =>
  BOT_STATUS_META[status] || BOT_STATUS_META[BOT_STATUS.NOT_LINKED];

/** Telegram orqali xabar yetadimi. */
export const isBotDeliverable = (status) => status === BOT_STATUS.LINKED;

/**
 * Eski javob shakllari uchun moslashtiruvchi.
 *
 * Server endi `botStatus` qaytaradi, lekin ba'zi ro'yxatlarda hali faqat
 * `telegram` obyekti bor. Ikkalasini ham qabul qilamiz - shunda bitta
 * komponent hamma joyda ishlaydi.
 */
export const resolveBotStatus = (entity) => {
  if (!entity) return BOT_STATUS.NOT_LINKED;
  if (entity.botStatus) return entity.botStatus;
  const tg = entity.telegram;
  if (!tg) return BOT_STATUS.NOT_LINKED;
  if (tg.status) return tg.status;
  return tg.isBlocked ? BOT_STATUS.BLOCKED : BOT_STATUS.LINKED;
};
