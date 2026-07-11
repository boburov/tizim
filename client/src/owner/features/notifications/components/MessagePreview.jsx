import { Send, Smartphone } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  CATEGORY_EMOJI,
  fillSampleVariables,
} from "@/shared/constants/notification";

/**
 * MessagePreview - xabar qanday ko'rinishini jonli ko'rsatadi.
 * O'zgaruvchilar ({ism} kabi) namuna qiymatlar bilan to'ldiriladi.
 *
 * variant: "telegram" (chat bubble) | "inapp" (notification kartasi)
 */
const MessagePreview = ({
  title = "",
  body = "",
  category = "other",
  variant = "telegram",
}) => {
  const emoji = CATEGORY_EMOJI[category] || "📨";
  const filledTitle = fillSampleVariables(title);
  const filledBody = fillSampleVariables(body);
  const empty = !filledBody.trim();

  if (variant === "inapp") {
    return (
      <div className="rounded-lg border bg-white p-3">
        <div className="flex items-start gap-2">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-violet-500" />
          <div className="min-w-0">
            {filledTitle && (
              <p className="truncate text-sm font-semibold">{filledTitle}</p>
            )}
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-sm",
                empty && "italic text-muted-foreground",
              )}
            >
              {empty ? "Xabar matni shu yerda ko'rinadi..." : filledBody}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Telegram chat ko'rinishi
  return (
    <div className="rounded-lg bg-[#e7ebf0] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <Send className="size-3" />
        Telegram bot
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
        {filledTitle && (
          <p className="mb-0.5 text-sm font-semibold text-slate-900">
            {emoji} {filledTitle}
          </p>
        )}
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm text-slate-800",
            empty && "italic text-slate-400",
          )}
        >
          {empty
            ? "Xabar matni shu yerda ko'rinadi..."
            : (!filledTitle ? `${emoji} ` : "") + filledBody}
        </p>
        <p className="mt-1 text-right text-[10px] text-slate-400">
          {new Date().toLocaleTimeString("uz", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
};

export default MessagePreview;
