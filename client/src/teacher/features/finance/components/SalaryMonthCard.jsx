// Components
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import { MONTH_LABELS } from "@/shared/constants/calendar";
import { statusMeta, methodLabel } from "../utils/status";

const monthLabel = (m) => MONTH_LABELS[m - 1] || m;

// Bir oylik maosh yozuvi: kutilgan/to'langan/qoldiq va to'lovlar tarixi.
const SalaryMonthCard = ({ salary }) => {
  const meta = statusMeta(salary.status);
  const expected = salary.expectedAmount || 0;
  const paid = salary.paidAmount || 0;
  const remaining = Math.max(0, expected - paid);
  const txs = salary.transactions || [];

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {monthLabel(salary.month)} {salary.year}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {salary.group?.name || "-"}
          </p>
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>

      {/* Yakuniy: kutilgan / to'langan / qoldiq */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground">Hisoblangan</p>
          <p className="font-semibold tabular-nums">{formatMoney(expected)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Olingan</p>
          <p className="font-semibold tabular-nums text-emerald-600">
            {formatMoney(paid)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Qoldiq</p>
          <p className="font-semibold tabular-nums text-rose-600">
            {formatMoney(remaining)}
          </p>
        </div>
      </div>

      {txs.length > 0 && (
        <ul className="mt-3 space-y-1 border-t pt-3">
          {txs.map((t) => (
            <li
              key={t._id}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="font-medium tabular-nums text-emerald-600">
                {formatMoney(t.amount)}
              </span>
              <span className="text-xs text-muted-foreground">
                {methodLabel(t.method)} · {formatDateUz(t.paidAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SalaryMonthCard;
