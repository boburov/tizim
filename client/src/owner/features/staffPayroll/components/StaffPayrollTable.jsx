// Icons
import { Wallet } from "lucide-react";

// Router
import { Link } from "react-router-dom";

// Components
import Badge from "@/shared/components/ui/badge/Badge";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";

const STATUS_TONE = {
  paid: "success",
  partial: "warning",
  unpaid: "neutral",
};
const STATUS_LABEL = {
  paid: "To'langan",
  partial: "Qisman",
  unpaid: "To'lanmagan",
};

const fullName = (u) =>
  u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "Noma'lum";

/**
 * XODIMLAR MAOSHI jadvali.
 *
 * Ustunlar ATAYLAB formulaning o'zi: Oylik + KPI + Bonus - Jarima = Jami.
 * Egasi qatorni o'qib, raqam qayerdan chiqqanini jadvalning o'zidan
 * tushunishi kerak - tafsilotga kirish shart bo'lmasin.
 */
const StaffPayrollTable = ({ rows = [], isLoading = false, onRowClick }) => {
  const money = (v) => (v ? formatMoney(v) : <span className="text-muted-foreground/50">-</span>);

  const columns = [
    {
      key: "employee",
      header: "Xodim",
      headerClassName: th,
      cell: (p) => (
        <div className="min-w-0">
          <Link
            to={`/owner/users/${p.employee?._id}`}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fullName(p.employee)}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{p.roleLabel}</p>
        </div>
      ),
    },
    {
      key: "period",
      header: "Davr",
      headerClassName: th,
      cell: (p) => (
        <span className="tabular-nums">
          {String(p.month).padStart(2, "0")}.{p.year}
        </span>
      ),
    },
    {
      key: "fixed",
      header: "Oylik",
      headerClassName: `${th} text-right`,
      className: "text-right tabular-nums",
      cell: (p) => money(p.fixedAmount),
    },
    {
      key: "kpi",
      header: "KPI",
      headerClassName: `${th} text-right`,
      className: "text-right tabular-nums text-emerald-600 dark:text-emerald-300",
      cell: (p) => money(p.autoKpiTotal),
    },
    {
      key: "bonus",
      header: "Bonus",
      headerClassName: `${th} text-right`,
      className: "text-right tabular-nums text-emerald-600 dark:text-emerald-300",
      cell: (p) => money(p.manualBonusTotal),
    },
    {
      key: "penalty",
      header: "Jarima",
      headerClassName: `${th} text-right`,
      className: "text-right tabular-nums text-red-600 dark:text-red-300",
      cell: (p) =>
        p.penaltyTotal ? (
          `-${formatMoney(p.penaltyTotal)}`
        ) : (
          <span className="text-muted-foreground/50">-</span>
        ),
    },
    {
      key: "final",
      header: "Jami",
      headerClassName: `${th} text-right`,
      className: "text-right font-semibold tabular-nums",
      cell: (p) => formatMoney(p.finalAmount),
    },
    {
      key: "status",
      header: "Holat",
      headerClassName: th,
      cell: (p) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={STATUS_TONE[p.status]}>
            {STATUS_LABEL[p.status]}
          </StatusBadge>
          {p.lifecycle === "finalized" && (
            <Badge className="bg-accent text-foreground">Yopilgan</Badge>
          )}
        </div>
      ),
    },
  ];

  const renderCard = (p) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{fullName(p.employee)}</p>
          <p className="text-xs text-muted-foreground">
            {String(p.month).padStart(2, "0")}.{p.year} · {p.roleLabel}
          </p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums">
          {formatMoney(p.finalAmount)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Oylik: {formatMoney(p.fixedAmount)}</span>
        <span>KPI: {formatMoney(p.autoKpiTotal)}</span>
        {p.manualBonusTotal > 0 && <span>Bonus: {formatMoney(p.manualBonusTotal)}</span>}
        {p.penaltyTotal > 0 && <span>Jarima: -{formatMoney(p.penaltyTotal)}</span>}
      </div>
      <StatusBadge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</StatusBadge>
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      rowKey={(p) => p._id}
      onRowClick={onRowClick}
      renderCard={renderCard}
      empty={
        <EmptyState
          icon={Wallet}
          title="Maosh qatori yo'q"
          description="Tanlangan oy uchun hisob yuritilmagan. Xodimga maosh shartnomasi ochilganini tekshiring va 'Hisoblash' tugmasini bosing."
        />
      }
    />
  );
};

export default StaffPayrollTable;
