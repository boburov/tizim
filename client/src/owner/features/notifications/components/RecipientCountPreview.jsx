import { Users, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import BlockedWarning from "@/shared/components/communication/BlockedWarning";
import useAudiencePreviewQuery from "../hooks/useAudiencePreviewQuery";

// Auditoriya to'liq tanlanganmi (preview so'rovini yoqish uchun)
export const isAudienceReady = (audience) => {
  if (!audience?.type) return false;
  if (audience.type === "groups") return (audience.groupIds || []).length > 0;
  if (audience.type === "users" || audience.type === "individual")
    return (audience.userIds || []).length > 0;
  return true; // all_students / all_teachers
};

/**
 * RecipientCountPreview - "Bu xabar N ta foydalanuvchiga boradi" jonli hisob
 * VA "kimga yetib bormaydi" ogohlantirishi.
 *
 * Raqamning o'zi yetarli emas edi: xodim "30 kishiga boradi" deb yuborardi,
 * lekin botni bloklaganlarga xabar UMUMAN yetmasdi va buni faqat keyin,
 * oluvchilar jadvalidan bilib olardi.
 *
 * `channels` - tanlangan yetkazish kanallari. Telegram tanlanmagan bo'lsa
 * bot holati hech narsani o'zgartirmaydi, shuning uchun ogohlantirish
 * chiqmaydi (aks holda u shunchaki shovqin bo'lardi).
 */
const RecipientCountPreview = ({ audience, channels = ["inapp", "telegram"] }) => {
  const ready = isAudienceReady(audience);
  const { data, isFetching, isError } = useAudiencePreviewQuery(audience, ready);
  const count = data?.count ?? 0;
  const telegramOn = channels.includes("telegram");

  if (!ready) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
        <Users className="size-4" />
        Auditoriyani tanlang - qabul qiluvchilar soni shu yerda ko'rinadi.
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
        <AlertCircle className="size-4" />
        Hisobni olishda xatolik.
      </div>
    );
  }

  const empty = count === 0 && !isFetching;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
          empty
            ? "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
            : "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
        )}
      >
        {isFetching ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Users className="size-4" />
        )}
        {isFetching ? (
          <span>Hisoblanmoqda...</span>
        ) : empty ? (
          <span>Bu auditoriyada hech kim yo'q.</span>
        ) : (
          <span>
            Bu xabar <strong>{count}</strong> ta foydalanuvchiga boradi
            {telegramOn && data?.deliverable !== undefined && (
              <>
                {" — Telegram orqali "}
                <strong>{data.deliverable}</strong> tasiga
              </>
            )}
            .
          </span>
        )}
      </div>

      <BlockedWarning preview={data} channelActive={telegramOn} />
    </div>
  );
};

export default RecipientCountPreview;
