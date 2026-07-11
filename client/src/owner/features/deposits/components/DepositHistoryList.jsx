import { Trash2 } from "lucide-react";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import { kindMeta, methodLabel } from "../utils/labels";
import { useDepositTxnRemoveMutation } from "../hooks/useDepositMutations";

const monthLabel = (r) => (r.year && r.month ? `${r.month}-oy ${r.year}` : "");

// Depozit ledgeri: kirim/chiqim/qoplama/qaytarim. Qoplama uchun qaysi guruh/oyga
// ketgani ko'rsatiladi. Faqat kirim/chiqimni o'chirish mumkin (removable).
const DepositHistoryList = ({ rows = [], isLoading }) => {
  const removeMut = useDepositTxnRemoveMutation();

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Yuklanmoqda...</div>;
  }
  if (!rows.length) {
    return <EmptyState title="Tranzaksiyalar yo'q" description="Hali depozit harakati yo'q." />;
  }

  return (
    <ul className="divide-y rounded-lg border bg-white">
      {rows.map((r) => {
        const meta = kindMeta(r.kind);
        return (
          <li key={r._id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">
                <span className={meta.tone}>{meta.label}</span>{" "}
                {r.kind === "apply" && r.group?.name && (
                  <span className="text-muted-foreground">
                    · {r.group.name} {monthLabel(r)}
                  </span>
                )}
                {(r.kind === "topup" || r.kind === "withdraw") && (
                  <span className="text-muted-foreground">· {methodLabel(r.method)}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateUz(r.paidAt)}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`text-sm font-semibold tabular-nums ${meta.tone}`}>
                {meta.sign}
                {formatMoney(r.amount)}
              </span>
              {r.removable && (
                <button
                  type="button"
                  disabled={removeMut.isPending}
                  onClick={() => removeMut.mutate(r._id)}
                  aria-label="O'chirish"
                >
                  <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default DepositHistoryList;
