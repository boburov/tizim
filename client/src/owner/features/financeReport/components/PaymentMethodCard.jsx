import { formatMoney } from "@/shared/utils/formatMoney";

// Kirimni to'lov usuli bo'yicha ajratuvchi donut (naqd / karta).
// Brend rangi saqlanadi: naqd - primary, karta - primary'ning ochiq tusi.
const R = 42;
const C = 2 * Math.PI * R;

const PaymentMethodCard = ({ methods }) => {
  const cash = methods?.cash || 0;
  const card = methods?.card || 0;
  const total = cash + card;

  const cashFrac = total > 0 ? cash / total : 0;
  const cardFrac = total > 0 ? card / total : 0;
  const cashPct = Math.round(cashFrac * 100);
  const cardPct = total > 0 ? 100 - cashPct : 0;

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5">
      <h2 className="font-semibold text-zinc-900">To'lov usullari</h2>
      <p className="mt-0.5 text-xs text-zinc-500">Bu oygi kirim taqsimoti</p>

      {total === 0 ? (
        <p className="mt-8 text-sm text-zinc-400">Ma'lumot yo'q</p>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          {/* Donut */}
          <div className="relative shrink-0">
            <svg width="118" height="118" viewBox="0 0 118 118" className="-rotate-90">
              <circle
                cx="59"
                cy="59"
                r={R}
                fill="none"
                stroke="hsl(var(--primary) / 0.18)"
                strokeWidth="13"
              />
              <circle
                cx="59"
                cy="59"
                r={R}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray={`${cashFrac * C} ${C}`}
              />
              <circle
                cx="59"
                cy="59"
                r={R}
                fill="none"
                stroke="hsl(var(--primary) / 0.45)"
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray={`${cardFrac * C} ${C}`}
                strokeDashoffset={`${-cashFrac * C}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold tabular-nums text-zinc-900">
                {cashPct}%
              </span>
              <span className="text-[10px] text-zinc-500">naqd</span>
            </div>
          </div>

          {/* Legend */}
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <span className="size-2.5 rounded-full bg-primary" /> Naqd
                </span>
                <span className="text-xs font-medium text-zinc-500">{cashPct}%</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
                {formatMoney(cash)}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <span className="size-2.5 rounded-full bg-primary/45" /> Karta
                </span>
                <span className="text-xs font-medium text-zinc-500">{cardPct}%</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
                {formatMoney(card)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentMethodCard;
