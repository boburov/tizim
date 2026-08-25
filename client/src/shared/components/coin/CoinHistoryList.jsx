// Icons
import { CalendarCheck, Star, ShoppingBag, Undo2, Gift, History } from "lucide-react";

// Components
import EmptyState from "@/shared/components/page/EmptyState";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import CoinAmount from "./CoinAmount";

// Utils
import { formatDateUz } from "@/shared/utils/formatDate";

/**
 * TARIX — HAR BIR HARAKAT, O'ZGARMAS.
 *
 * ⚠ KALITLAR SERVER ENUMI BILAN BIR XIL (`CoinTxKind`). Yangi tur
 * qo'shilib bu yerga yozilmasa, qator umumiy ikonka bilan chiqadi —
 * yiqilmaydi, lekin ma'nosi yo'qoladi. Shuning uchun `FALLBACK`
 * ochiq belgilangan.
 */
const KIND_META = Object.freeze({
  attendance: { icon: CalendarCheck, label: "Davomat" },
  grade: { icon: Star, label: "Baho" },
  purchase: { icon: ShoppingBag, label: "Xarid" },
  refund: { icon: Undo2, label: "Qaytarildi" },
  manual: { icon: Gift, label: "Sovg'a" },
});
const FALLBACK = { icon: History, label: "Harakat" };

const CoinHistoryList = ({ items, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={History}
        title="Tarix hozircha bo'sh"
        hint="Birinchi darsingizdan keyin bu yerda birinchi yozuv paydo bo'ladi."
      />
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((tx) => {
        const meta = KIND_META[tx.kind] || FALLBACK;
        return (
          <li key={tx._id} className="flex items-center gap-3 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <meta.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {tx.reason || meta.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateUz(tx.createdAt)}
              </p>
            </div>
            <CoinAmount value={tx.delta} size="sm" signed showLabel={false} />
          </li>
        );
      })}
    </ul>
  );
};

export default CoinHistoryList;
