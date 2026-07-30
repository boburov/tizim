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
          isIncome ? "bg-primary/10 text-primary" : "bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400",
        )}
      >
        {isIncome ? (
          <ArrowDownLeft className="size-4" />
        ) : (
          <ArrowUpRight className="size-4" />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{row.name}</p>
        <p className="truncate text-xs text-muted-foreground">{row.category}</p>
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
        isIncome ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300",
      )}
    >
      {isIncome ? "+" : "−"}
      {formatMoney(row.amount)}
    </span>
  );
};

const StatusBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-300">
    <span className="size-1.5 rounded-full bg-emerald-500" />
    Bajarildi
  </span>
);

const columns = [
  { key: "name", header: "Nomi", headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground", cell: (row) => <TypeCell row={row} /> },
  {
    key: "group",
    header: "Guruh",
    headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
    cell: (row) => <span className="text-muted-foreground">{row.groupName}</span>,
  },
  {
    key: "method",
    header: "Usul",
    headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
    cell: (row) => (
      <span className="text-muted-foreground">{METHOD_LABEL[row.method] || row.method}</span>
    ),
  },
  {
    key: "date",
    header: "Sana",
    headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
    cell: (row) => <span className="text-muted-foreground">{formatDateUz(row.paidAt)}</span>,
  },
  {
    key: "status",
    header: "Holat",
    headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
    cell: () => <StatusBadge />,
  },
  {
    key: "amount",
    header: "Summa",
    headerClassName: "px-4 py-2.5 text-right text-xs font-medium text-muted-foreground",
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
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {row.groupName} · {METHOD_LABEL[row.method] || row.method}
      </span>
      <span>{formatDateUz(row.paidAt)}</span>
    </div>
  </div>
);

const LedgerTable = ({ items = [], isLoading = false }) => (
  <div className="rounded-2xl border border-border bg-card p-5">
    <h2 className="font-semibold text-foreground">So'nggi tranzaksiyalar</h2>
    <p className="mt-0.5 text-xs text-muted-foreground">Bu oygi kirim va chiqimlar</p>
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
