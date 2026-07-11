import DataTable from "@/shared/components/ui/table/DataTable";
import { formatMoney } from "@/shared/utils/formatMoney";
import { MONTH_LABELS } from "@/shared/constants/calendar";

const headerCls = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

// showMonth: "Barcha oylar" rejimida qaysi oyga tegishli ekanini ko'rsatadi.
const ObligationsTable = ({ rows = [], isLoading, showMonth = false }) => {
  const columns = [
    {
      key: "teacher",
      header: "O'qituvchi",
      headerClassName: headerCls,
      cell: (r) => (
        <span className="font-medium">
          {r.teacher?.firstName} {r.teacher?.lastName}
        </span>
      ),
    },
    {
      key: "group",
      header: "Guruh",
      headerClassName: headerCls,
      cell: (r) => r.group?.name || "-",
    },
    ...(showMonth
      ? [
          {
            key: "month",
            header: "Oy",
            headerClassName: headerCls,
            cell: (r) => `${MONTH_LABELS[r.month - 1]} ${r.year}`,
          },
        ]
      : []),
    {
      key: "expected",
      header: "Kutilgan",
      headerClassName: headerCls,
      cell: (r) => formatMoney(r.expectedAmount || 0),
    },
    {
      key: "paid",
      header: "To'langan",
      headerClassName: headerCls,
      cell: (r) => <span className="text-emerald-600">{formatMoney(r.paidAmount || 0)}</span>,
    },
    {
      key: "remaining",
      header: "Qoldiq",
      headerClassName: headerCls,
      cell: (r) => <span className="font-semibold text-rose-600">{formatMoney(r.remaining || 0)}</span>,
    },
  ];

  const renderCard = (r) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {r.teacher?.firstName} {r.teacher?.lastName}
        </span>
        <span className="font-semibold text-rose-600">{formatMoney(r.remaining || 0)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {r.group?.name}
        {showMonth ? ` · ${MONTH_LABELS[r.month - 1]} ${r.year}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {formatMoney(r.paidAmount || 0)} / {formatMoney(r.expectedAmount || 0)}
      </p>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      rowKey={(r) => r._id}
      renderCard={renderCard}
    />
  );
};

export default ObligationsTable;
