import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import { formatMoney } from "@/shared/utils/formatMoney";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { SALARY_TYPE_LABEL } from "../utils/status";

const headerCls = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
const headerRightCls = "px-4 py-2.5 text-right text-xs font-medium text-muted-foreground";

// Maosh bo'yicha hisob-kitob (progress, qoldiq, status rangi).
const calc = (s) => {
  const expected = s.expectedAmount || 0;
  const paid = s.paidAmount || 0;
  const remaining = Math.max(0, expected - paid);
  const pct =
    expected > 0 ? Math.min(100, Math.round((paid / expected) * 100)) : paid > 0 ? 100 : 0;
  const barColor =
    s.status === "paid" ? "bg-emerald-500" : s.status === "partial" ? "bg-amber-500" : "bg-rose-400";
  return { expected, paid, remaining, pct, barColor };
};

const ProgressBar = ({ pct, barColor }) => (
  <div className="flex min-w-[100px] items-center gap-2">
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
    <span className="w-9 shrink-0 text-right text-xs font-medium text-muted-foreground">{pct}%</span>
  </div>
);

const NameLink = ({ salary }) => (
  <div className="min-w-0">
    <Link
      to={`/owner/finance/teacher-salaries/teacher/${salary.teacher?._id}`}
      className="font-medium text-gray-900 hover:underline"
    >
      {salary.teacher?.firstName} {salary.teacher?.lastName}
    </Link>
    {SALARY_TYPE_LABEL[salary.salaryType] && (
      <p className="text-xs text-muted-foreground">{SALARY_TYPE_LABEL[salary.salaryType]}</p>
    )}
  </div>
);

const TeacherSalariesTable = ({ rows = [], isLoading }) => {
  const { openModal } = useModal();

  const Actions = ({ salary }) => (
    <div className="flex justify-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => openModal(MODAL.SALARY_ADD_PAYOUT, { salary })}
      >
        <Plus className="size-4" />
        To'lov
      </Button>
    </div>
  );

  const columns = [
    {
      key: "name",
      header: "Ism familiya",
      headerClassName: headerCls,
      cell: (r) => <NameLink salary={r} />,
    },
    {
      key: "group",
      header: "Guruh",
      headerClassName: headerCls,
      cell: (r) => r.group?.name || "-",
    },
    {
      key: "progress",
      header: "Progress",
      headerClassName: headerCls,
      cell: (r) => {
        const { pct, barColor } = calc(r);
        return <ProgressBar pct={pct} barColor={barColor} />;
      },
    },
    {
      key: "expected",
      header: "To'lanishi kerak",
      headerClassName: headerCls,
      cell: (r) => formatMoney(calc(r).expected),
    },
    {
      key: "paid",
      header: "To'langan",
      headerClassName: headerCls,
      cell: (r) => <span className="text-emerald-600">{formatMoney(calc(r).paid)}</span>,
    },
    {
      key: "remaining",
      header: "To'lanmagan",
      headerClassName: headerCls,
      cell: (r) => {
        const { remaining } = calc(r);
        return (
          <span className={remaining > 0 ? "font-semibold text-rose-600" : "text-muted-foreground"}>
            {formatMoney(remaining)}
          </span>
        );
      },
    },
    {
      key: "action",
      header: "To'lov",
      headerClassName: headerRightCls,
      className: "text-right",
      cell: (r) => <Actions salary={r} />,
    },
  ];

  const renderCard = (r) => {
    const { expected, paid, remaining, pct, barColor } = calc(r);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <NameLink salary={r} />
          <Actions salary={r} />
        </div>
        <p className="text-xs text-muted-foreground">{r.group?.name}</p>
        <ProgressBar pct={pct} barColor={barColor} />
        <div className="flex flex-wrap justify-between gap-x-3 text-xs">
          <span className="text-muted-foreground">Kerak: {formatMoney(expected)}</span>
          <span className="text-emerald-600">To'langan: {formatMoney(paid)}</span>
          <span className={remaining > 0 ? "text-rose-600" : "text-muted-foreground"}>
            To'lanmagan: {formatMoney(remaining)}
          </span>
        </div>
      </div>
    );
  };

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

export default TeacherSalariesTable;
