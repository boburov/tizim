import { Pencil, Trash2 } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import { formatMoney } from "@/shared/utils/formatMoney";
import { MONTH_LABELS } from "@/shared/constants/calendar";

const discountValue = (d) =>
  d.type === "percent" ? `${d.value}%` : formatMoney(d.value);

const scopeLabel = (d) =>
  d.scope === "permanent" ? "Doimiy" : `${MONTH_LABELS[d.month - 1]} ${d.year}`;

const DiscountsTable = ({ rows = [], isLoading, onEdit, onDelete }) => {
  const columns = [
    {
      key: "student",
      header: "O'quvchi",
      headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
      cell: (r) => (
        <span className="font-medium">
          {r.student?.firstName} {r.student?.lastName}
        </span>
      ),
    },
    {
      key: "group",
      header: "Guruh",
      headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
      cell: (r) => r.group?.name || "-",
    },
    {
      key: "value",
      header: "Chegirma",
      headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
      cell: (r) => <span className="font-medium">{discountValue(r)}</span>,
    },
    {
      key: "scope",
      header: "Davr",
      headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
      cell: (r) => (
        <StatusBadge tone={r.scope === "permanent" ? "info" : "neutral"}>
          {scopeLabel(r)}
        </StatusBadge>
      ),
    },
    {
      key: "reason",
      header: "Sabab",
      headerClassName: "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground",
      cell: (r) => <span className="text-muted-foreground">{r.reason || "-"}</span>,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "px-4 py-2.5",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onEdit?.(r)}
            aria-label="Tahrirlash"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            className="text-rose-500 hover:text-rose-700"
            onClick={() => onDelete?.(r)}
            aria-label="O'chirish"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  const renderCard = (r) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {r.student?.firstName} {r.student?.lastName}
        </span>
        <span className="font-semibold">{discountValue(r)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{r.group?.name}</p>
      <div className="flex items-center justify-between pt-1">
        <StatusBadge tone={r.scope === "permanent" ? "info" : "neutral"}>
          {scopeLabel(r)}
        </StatusBadge>
        <div className="flex gap-3">
          <button type="button" onClick={() => onEdit?.(r)} aria-label="Tahrirlash">
            <Pencil className="size-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => onDelete?.(r)} aria-label="O'chirish">
            <Trash2 className="size-4 text-rose-500" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      renderCard={renderCard}
    />
  );
};

export default DiscountsTable;
