import Card from "@/shared/components/ui/card/Card";
import { cn } from "@/shared/utils/cn";
import {
  BOT_STATUS,
  botStatusMeta,
  resolveBotStatus,
} from "@/shared/constants/botStatus";
import useFeatures from "@/shared/hooks/useFeatures";

// Har bir holat uchun ikonka foni. Status ranglari MA'NO tashiydi
// (qizil = yetmaydi), shuning uchun token emas - `dark:` variantli aniq
// ranglar ishlatiladi.
const ICON_TONE = {
  [BOT_STATUS.LINKED]: "bg-sky-50 dark:bg-sky-500/10 text-sky-500 dark:text-sky-400",
  [BOT_STATUS.BLOCKED]: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300",
  [BOT_STATUS.NOT_LINKED]: "bg-muted/60 text-muted-foreground",
};

const HINT_TONE = {
  [BOT_STATUS.LINKED]: "text-muted-foreground",
  [BOT_STATUS.BLOCKED]: "text-red-600 dark:text-red-300",
  [BOT_STATUS.NOT_LINKED]: "text-amber-600 dark:text-amber-400",
};

/**
 * Telegram kartasi.
 *
 * MUHIM: bog'lanish MA'LUMOTI (kim) va yetkazish HOLATI (yetadimi) -
 * ikki xil narsa. Ilgari karta faqat birinchisini ko'rsatardi va botni
 * BLOKLAGAN o'quvchi "@username" bilan bog'langan ko'rinib turardi,
 * xabar esa aslida yetmasdi.
 */
const UserTelegramCard = ({ telegram }) => {
  // ── ⚠ BOT O'CHIQ BO'LSA KARTA UMUMAN CHIZILMAYDI ──
  //
  // Karta "botga bog'lanmagan" holatida foydalanuvchini bog'lanishga
  // undaydi. Bot yoqilmagan tenantda bog'lanadigan bot yo'q, ya'ni bu
  // bajarilmaydigan ko'rsatma bo'lardi. Bitta joyda yashiramiz — karta
  // uch sahifada ishlatiladi (ega, o'qituvchi, o'quvchi profillari).
  const { botEnabled } = useFeatures();
  if (!botEnabled) return null;

  const status = resolveBotStatus({ telegram });
  const meta = botStatusMeta(status);
  const Icon = meta.icon;

  const display = [telegram?.firstName, telegram?.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            ICON_TONE[status],
          )}
        >
          <Icon className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="text-sm font-medium text-foreground">Telegram</p>
            <span className={cn("text-xs font-medium", HINT_TONE[status])}>
              {meta.label}
            </span>
          </div>

          {telegram ? (
            <>
              <p className="text-sm text-muted-foreground">
                {display || "-"}
                {telegram.username && (
                  <span className="ml-1">@{telegram.username}</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ID: {telegram.telegramId}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Hali bog'lanmagan</p>
          )}

          {/* Nima qilish kerakligi - faqat muammoli holatlarda ko'rinadi */}
          {status !== BOT_STATUS.LINKED && (
            <p className={cn("mt-1.5 text-xs", HINT_TONE[status])}>{meta.hint}</p>
          )}
        </div>
      </div>
    </Card>
  );
};

export default UserTelegramCard;
