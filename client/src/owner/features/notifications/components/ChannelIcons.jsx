import { Send, Smartphone } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/shared/components/shadcn/tooltip";
import { cn } from "@/shared/utils/cn";

/**
 * ChannelIcons - yetkazish kanalini KICHIK IKONKA bilan ko'rsatadi (badge emas).
 * Telegram (✈) +  ikonkalari yonma-yon, har biri tooltip bilan.
 * Jadval qatorlarini tinch saqlash uchun - eng katta shovqin manbasini yo'qotadi.
 *
 * variant:
 *   "list"   -> yuborilgan xabar (qaysi kanal(lar)ga ketgan) - neytral
 *   "status" -> qabul qiluvchi qatori uchun yetkazish holatiga qarab rang
 *               (delivered: { telegram, inapp } => yashil/qizil/kulrang)
 */
const CHANNEL_META = {
  telegram: { icon: Send, label: "Telegram bot orqali yuborildi" },
  inapp: { icon: Smartphone, label: "Platforma (Ilova ichida) orqali ko'rinadi" },
};

const IconDot = ({ channel, tone = "muted", label }) => {
  const meta = CHANNEL_META[channel];
  if (!meta) return null;
  const Icon = meta.icon;
  const toneClass = {
    muted: "text-muted-foreground",
    telegram: "text-sky-600",
    success: "text-emerald-600",
    danger: "text-red-500",
    off: "text-muted-foreground/40",
  }[tone];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex items-center justify-center", toneClass)}
        >
          <Icon className="size-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label || meta.label}</TooltipContent>
    </Tooltip>
  );
};

const ChannelIcons = ({ channels = [], className = "" }) => {
  const list = channels?.length ? channels : ["inapp", "telegram"];
  return (
    <TooltipProvider delayDuration={150}>
      <span className={cn("inline-flex items-center gap-2", className)}>
        {list.map((c) => (
          <IconDot
            key={c}
            channel={c}
            tone={c === "telegram" ? "telegram" : "muted"}
          />
        ))}
      </span>
    </TooltipProvider>
  );
};

export default ChannelIcons;
