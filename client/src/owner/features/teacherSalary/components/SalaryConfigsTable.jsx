import { ChevronRight } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import { formatMoney } from "@/shared/utils/formatMoney";
import { SALARY_TYPE_LABEL } from "../utils/status";

const TYPE_TONE = { fixed: "info", percent: "success", mixed: "warning" };

// Joriy oyning aktiv maoshlari. Qator bosilsa - guruh maosh-davri detali.
const SalaryConfigsTable = ({ rows = [], isLoading, empty, onRowClick }) => {
  const headerCls = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

  const typeBadge = (r) => (
    <StatusBadge tone={TYPE_TONE[r.salaryType] || "info"}>
      {SALARY_TYPE_LABEL[r.salaryType] || "-"}
    </StatusBadge>
  );

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
    {
      key: "amount",
      header: "Maosh",
      headerClassName: headerCls,
      cell: (r) => <span className="font-semibold">{formatMoney(r.expectedAmount || 0)}</span>,
    },
    {
      key: "type",
      header: "Maosh turi",
      headerClassName: headerCls,
      cell: typeBadge,
    },
    {
      key: "chevron",
      header: "",
      headerClassName: headerCls,
      className: "text-right",
      cell: () => <ChevronRight className="ml-auto size-4 text-muted-foreground" />,
    },
  ];

  const renderCard = (r) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {r.teacher?.firstName} {r.teacher?.lastName}
        </span>
        {typeBadge(r)}
      </div>
      <p className="text-xs text-muted-foreground">{r.group?.name}</p>
      <p className="font-semibold">{formatMoney(r.expectedAmount || 0)}</p>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      rowKey={(r) => r._id}
      onRowClick={onRowClick}
      renderCard={renderCard}
      empty={empty}
    />
  );
};

export default SalaryConfigsTable;
