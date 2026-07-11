import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

// Bitta qator: hisoblangan (billed) ga nisbatan to'langan ulush + qoldiq.
const Row = ({ label, paidLabel, billed, outstanding, rate, barClass, to }) => {
  const collected = Math.max(0, (billed || 0) - (outstanding || 0));
  const fill = billed > 0 ? Math.round((collected / billed) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        {rate != null && (
          <span className="text-xs font-medium text-zinc-500">{rate}%</span>
        )}
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barClass)}
          style={{ width: `${fill}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-zinc-500">
          {paidLabel}:{" "}
          <span className="font-medium text-zinc-700">{formatMoney(collected)}</span>
        </span>
        <Link
          to={to}
          className="group inline-flex items-center gap-0.5 font-medium text-zinc-700 transition hover:text-primary"
        >
          Qoldiq: {formatMoney(outstanding || 0)}
          <ArrowUpRight className="size-3 text-zinc-400 transition group-hover:text-primary" />
        </Link>
      </div>
    </div>
  );
};

// Qarzdorlik (o'quvchilar) va to'lanmagan maoshlar (o'qituvchilar).
const OutstandingCard = ({ income, expense }) => (
  <div className="rounded-2xl border border-zinc-200/80 bg-white p-5">
    <h2 className="font-semibold text-zinc-900">Qoldiqlar</h2>
    <p className="mt-0.5 text-xs text-zinc-500">Bu oy bo'yicha</p>

    <div className="mt-4 space-y-5">
      <Row
        label="O'quvchilar qarzi"
        paidLabel="Yig'ildi"
        billed={income?.billed}
        outstanding={income?.outstanding}
        rate={income?.rate}
        barClass="bg-primary"
        to="/owner/finance/student-payments/debtors"
      />
      <Row
        label="To'lanmagan maosh"
        paidLabel="To'landi"
        billed={expense?.billed}
        outstanding={expense?.outstanding}
        rate={expense?.rate}
        barClass="bg-rose-500"
        to="/owner/finance/teacher-salaries/qoldiqlar"
      />
    </div>
  </div>
);

export default OutstandingCard;
