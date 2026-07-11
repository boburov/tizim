// Router
import { Link } from "react-router-dom";

// Icons
import { Banknote, CreditCard, ArrowUpRight } from "lucide-react";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";

// Reference: o'ng tarafdagi "Project" ro'yxati - bu yerda so'nggi to'lovlar.
const RecentPaymentsList = ({ items = [] }) => (
  <div className="flex h-full flex-col rounded-2xl border border-zinc-200/80 bg-white p-5">
    <div className="flex items-center justify-between">
      <h2 className="font-semibold text-zinc-900">So'nggi to'lovlar</h2>
      <Link
        to="/owner/finance/student-payments"
        className="flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition hover:border-primary/40 hover:text-primary"
      >
        Barchasi <ArrowUpRight className="size-3" />
      </Link>
    </div>

    {items.length === 0 ? (
      <p className="mt-6 text-sm text-zinc-400">To'lovlar yo'q</p>
    ) : (
      <ul className="mt-4 space-y-1">
        {items.map((p) => {
          const Icon = p.method === "card" ? CreditCard : Banknote;
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-zinc-50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{p.studentName}</p>
                <p className="truncate text-xs text-zinc-500">
                  {p.groupName} · {formatDateUz(p.paidAt)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
                {formatMoney(p.amount)}
              </span>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

export default RecentPaymentsList;
