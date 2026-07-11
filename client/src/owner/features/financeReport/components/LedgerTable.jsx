import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import DataTable from "@/shared/components/ui/table/DataTable";

const METHOD_LABEL = { cash: "Naqd", card: "Karta" };

const TypeCell = ({ row }) => {
  const isIncome = row.type === "income";
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isIncome ? "bg-primary/10 text-primary" : "bg-rose-50 text-rose-500",
        )}
      >
        {isIncome ? (
          <ArrowDownLeft className="size-4" />
        ) : (
          <ArrowUpRight className="size-4" />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-zinc-800">{row.name}</p>
        <p className="truncate text-xs text-zinc-500">{row.category}</p>
      </div>
    </div>
  );
};

const AmountCell = ({ row }) => {
  const isIncome = row.type === "income";
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        isIncome ? "text-emerald-600" : "text-rose-600",
      )}
    >
      {isIncome ? "+" : "−"}
      {formatMoney(row.amount)}
    </span>
  );
};

const StatusBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
    <span className="size-1.5 rounded-full bg-emerald-500" />
    Bajarildi
  </span>
);

const columns = [
  { key: "name", header: "Nomi", headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-zinc-500", cell: (row) => <TypeCell row={row} /> },
  {
    key: "group",
    header: "Guruh",
    headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-zinc-500",
    cell: (row) => <span className="text-zinc-600">{row.groupName}</span>,
  },
  {
    key: "method",
    header: "Usul",
    headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-zinc-500",
    cell: (row) => (
      <span className="text-zinc-600">{METHOD_LABEL[row.method] || row.method}</span>
    ),
  },
  {
    key: "date",
    header: "Sana",
    headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-zinc-500",
    cell: (row) => <span className="text-zinc-600">{formatDateUz(row.paidAt)}</span>,
  },
  {
    key: "status",
    header: "Holat",
    headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-zinc-500",
    cell: () => <StatusBadge />,
  },
  {
    key: "amount",
    header: "Summa",
    headerClassName: "px-4 py-2.5 text-right text-xs font-medium text-zinc-500",
    className: "text-right",
    cell: (row) => <AmountCell row={row} />,
  },
];

const renderCard = (row) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <TypeCell row={row} />
      <AmountCell row={row} />
    </div>
    <div className="flex items-center justify-between text-xs text-zinc-500">
      <span>
        {row.groupName} · {METHOD_LABEL[row.method] || row.method}
      </span>
      <span>{formatDateUz(row.paidAt)}</span>
    </div>
  </div>
);

const LedgerTable = ({ items = [], isLoading = false }) => (
  <div className="rounded-2xl border border-zinc-200/80 bg-white p-5">
    <h2 className="font-semibold text-zinc-900">So'nggi tranzaksiyalar</h2>
    <p className="mt-0.5 text-xs text-zinc-500">Bu oygi kirim va chiqimlar</p>
    <div className="mt-4">
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        renderCard={renderCard}
        isLoading={isLoading}
        skeletonRows={6}
      />
    </div>
  </div>
);

export default LedgerTable;
