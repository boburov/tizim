import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import {
  BOT_STATUS,
  botStatusMeta,
  resolveBotStatus,
} from "@/shared/constants/botStatus";

/**
 * Foydalanuvchining bot holati nishoni.
 *
 * `user` (profil yoki ro'yxat qatori) yoki to'g'ridan-to'g'ri `status`
 * qabul qiladi. Standart holatda "ulangan" ko'rsatilMAYDI: normal holat
 * uchun nishon shovqin - ro'yxatda faqat MUAMMO ko'zga tashlanishi kerak.
 * Profil sahifasida `showLinked` bilan yoqiladi.
 */
const BotStatusBadge = ({ user, status, showLinked = false, className = "" }) => {
  const resolved = status || resolveBotStatus(user);
  if (!showLinked && resolved === BOT_STATUS.LINKED) return null;

  const meta = botStatusMeta(resolved);
  return (
    <StatusBadge tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </StatusBadge>
  );
};

export default BotStatusBadge;
