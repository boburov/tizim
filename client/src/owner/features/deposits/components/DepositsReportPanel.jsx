import { Wallet, ArrowDownCircle, ArrowUpCircle, CheckCircle2 } from "lucide-react";
import StatCard from "@/shared/components/ui/card/StatCard";
import InputField from "@/shared/components/ui/input/InputField";
import DataTable from "@/shared/components/ui/table/DataTable";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useObjectState from "@/shared/hooks/useObjectState";
import { formatMoney } from "@/shared/utils/formatMoney";
import { useDepositReportQuery } from "../hooks/useDepositQueries";

const th = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
const fullName = (s) => `${s?.firstName || ""} ${s?.lastName || ""}`.trim() || "-";

const DepositsReportPanel = () => {
  const filters = useObjectState({ from: "", to: "" });
  const { data, isLoading } = useDepositReportQuery({
    from: filters.from || undefined,
    to: filters.to || undefined,
  });

  const balances = data?.balances || [];

  const columns = [
    {
      key: "student",
      header: "O'quvchi",
      headerClassName: th,
      cell: (r) => <span className="font-medium">{fullName(r.student)}</span>,
    },
    {
      key: "balance",
      header: "Balans",
      headerClassName: th,
      cell: (r) => <span className="tabular-nums">{formatMoney(r.balance)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:max-w-md sm:grid-cols-2">
        <InputField
          name="from"
          type="date"
          label="Boshlanish"
          value={filters.from}
          onChange={(e) => filters.setField("from", e.target.value)}
        />
        <InputField
          name="to"
          type="date"
          label="Tugash"
          value={filters.to}
          onChange={(e) => filters.setField("to", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Ushlangan balans"
          value={data?.heldTotal ?? 0}
          icon={Wallet}
          isMoney
          hint="Hozir depozitda"
        />
        <StatCard
          label="Jami kirim"
          value={data?.totalTopup ?? 0}
          icon={ArrowDownCircle}
          isMoney
          tone="positive"
        />
        <StatCard
          label="Jami chiqim"
          value={data?.totalWithdraw ?? 0}
          icon={ArrowUpCircle}
          isMoney
        />
        <StatCard
          label="Qoplangan (daromad)"
          value={data?.totalApplied ?? 0}
          icon={CheckCircle2}
          isMoney
          tone="positive"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Balansi bor o'quvchilar</p>
        <DataTable
          columns={columns}
          rows={balances}
          isLoading={isLoading}
          rowKey={(r) => r.student?._id || Math.random()}
          empty={<EmptyState title="Balansli o'quvchi yo'q" />}
        />
      </div>
    </div>
  );
};

export default DepositsReportPanel;
