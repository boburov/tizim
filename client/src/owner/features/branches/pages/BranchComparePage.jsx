// Router
import { Link } from "react-router-dom";

// Icons
import { Star } from "lucide-react";

// Components
import DataTable from "@/shared/components/ui/table/DataTable";

// Hooks
import useBranchCompareQuery from "../hooks/useBranchCompareQuery";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";

const Num = ({ value }) => (
  <span className="tabular-nums">{value ?? 0}</span>
);

/**
 * Filiallarni yonma-yon taqqoslash.
 *
 * Global BranchPicker butun ilovani BITTA filialga qisadi - ya'ni
 * "qaysi filial qanday ishlayapti" degan savolga javob berolmaydi.
 * Bu sahifa aynan shuning uchun bor.
 */
const BranchComparePage = () => {
  const { data, isLoading } = useBranchCompareQuery();
  const rows = data || [];

  const columns = [
    {
      key: "name",
      header: "Filial",
      headerClassName: "px-4 py-2.5 text-left font-medium text-zinc-600",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          {row.isMain && (
            <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.name}</p>
            {row.code && (
              <p className="truncate text-xs text-zinc-500">{row.code}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "studentCount",
      header: "O'quvchilar",
      headerClassName: "px-4 py-2.5 text-left font-medium text-zinc-600",
      cell: (row) => <Num value={row.studentCount} />,
    },
    {
      key: "groupCount",
      header: "Guruhlar",
      headerClassName: "px-4 py-2.5 text-left font-medium text-zinc-600",
      cell: (row) => (
        <span className="tabular-nums">
          {row.activeGroupCount}
          <span className="text-zinc-400"> / {row.groupCount}</span>
        </span>
      ),
    },
    {
      key: "staffCount",
      header: "Xodimlar",
      headerClassName: "px-4 py-2.5 text-left font-medium text-zinc-600",
      cell: (row) => <Num value={row.staffCount} />,
    },
    {
      key: "threshold",
      header: "Tasdiq limiti",
      headerClassName: "px-4 py-2.5 text-left font-medium text-zinc-600",
      cell: (row) =>
        row.expenseApprovalThreshold > 0 ? (
          <span className="whitespace-nowrap text-sm tabular-nums">
            {formatMoney(row.expenseApprovalThreshold)}
          </span>
        ) : (
          <span className="text-sm text-zinc-400">Yo'q</span>
        ),
    },
    {
      key: "pendingApprovals",
      header: "Kutilayotgan",
      headerClassName: "px-4 py-2.5 text-left font-medium text-zinc-600",
      cell: (row) =>
        row.pendingApprovals > 0 ? (
          <Link
            to="/owner/expense-approvals"
            className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
          >
            {row.pendingApprovals}
          </Link>
        ) : (
          <span className="text-sm text-zinc-400">—</span>
        ),
    },
  ];

  const renderCard = (row) => (
    <div className="space-y-1">
      <p className="text-sm font-medium">{row.name}</p>
      <p className="text-xs text-zinc-500">
        {row.studentCount} o'quvchi · {row.activeGroupCount} guruh ·{" "}
        {row.staffCount} xodim
      </p>
      {row.pendingApprovals > 0 && (
        <p className="text-xs text-amber-600">
          {row.pendingApprovals} ta tasdiq kutmoqda
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Taqqoslash</h1>

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        renderCard={renderCard}
        empty={
          <p className="py-8 text-center text-sm opacity-60">
            Filiallar topilmadi
          </p>
        }
      />
    </div>
  );
};

export default BranchComparePage;
