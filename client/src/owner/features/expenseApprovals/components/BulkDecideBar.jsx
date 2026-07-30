// Icons
import { Check, X } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";

/**
 * Tanlangan qatorlar ustidagi amal paneli.
 *
 * Tanlangan CHIQIM so'rovlarining jami summasi ataylab ko'rsatiladi -
 * ommaviy tasdiqlash haqiqiy pul harakati, foydalanuvchi "qancha pul
 * ketyapti" ni tugmani bosishdan OLDIN ko'rishi kerak.
 */
const BulkDecideBar = ({ selected = [], onApprove, onReject, onClear, busy }) => {
  if (!selected.length) return null;

  const total = selected.reduce(
    (sum, a) => sum + (a.category === "financial" ? a.amount || 0 : 0),
    0,
  );

  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-lg">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{selected.length} ta tanlandi</p>
        {total > 0 && (
          <p className="text-xs text-muted-foreground">Jami chiqim: {formatMoney(total)}</p>
        )}
      </div>

      <Button type="button" variant="ghost" onClick={onClear} disabled={busy}>
        Bekor qilish
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={onReject}
        className="gap-1.5"
      >
        <X size={16} strokeWidth={2} />
        Rad etish
      </Button>
      <Button
        type="button"
        disabled={busy}
        onClick={onApprove}
        className="gap-1.5"
      >
        <Check size={16} strokeWidth={2} />
        Tasdiqlash
      </Button>
    </div>
  );
};

export default BulkDecideBar;
