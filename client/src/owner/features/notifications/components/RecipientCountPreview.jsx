import { Users, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/shared/utils/cn";
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
 * RecipientCountPreview - "Bu xabar N ta foydalanuvchiga boradi" jonli hisob.
 * Auditoriya to'liq bo'lmaguncha neytral ko'rsatkich chiqaradi.
 */
const RecipientCountPreview = ({ audience }) => {
  const ready = isAudienceReady(audience);
  const { data: count, isFetching, isError } = useAudiencePreviewQuery(
    audience,
    ready,
  );

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
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
        <AlertCircle className="size-4" />
        Hisobni olishda xatolik.
      </div>
    );
  }

  const empty = count === 0 && !isFetching;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
        empty
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
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
          Bu xabar <strong>{count}</strong> ta foydalanuvchiga boradi.
        </span>
      )}
    </div>
  );
};

export default RecipientCountPreview;
