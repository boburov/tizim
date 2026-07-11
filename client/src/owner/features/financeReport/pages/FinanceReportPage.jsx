import useObjectState from "@/shared/hooks/useObjectState";

import PeriodPicker from "../components/PeriodPicker";
import FinanceKpiCards from "../components/FinanceKpiCards";
import IncomeExpenseTrendChart from "../components/IncomeExpenseTrendChart";
import PaymentMethodCard from "../components/PaymentMethodCard";
import OutstandingCard from "../components/OutstandingCard";
import GroupBreakdownChart from "../components/GroupBreakdownChart";
import LedgerTable from "../components/LedgerTable";

import useFinanceSummaryQuery from "../hooks/useFinanceSummaryQuery";
import useFinanceGroupBreakdownQuery from "../hooks/useFinanceGroupBreakdownQuery";
import useFinanceLedgerQuery from "../hooks/useFinanceLedgerQuery";

const SkeletonBlock = ({ className = "" }) => (
  <div className={`animate-pulse rounded-2xl bg-zinc-100 ${className}`} />
);

const now = new Date();

const FinanceReportPage = () => {
  const period = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const params = { year: period.year, month: period.month };

  const { data: summary, isLoading: summaryLoading } =
    useFinanceSummaryQuery(params);
  const { data: groups, isLoading: groupsLoading } =
    useFinanceGroupBreakdownQuery({ ...params, limit: 8 });
  const { data: ledger, isLoading: ledgerLoading } = useFinanceLedgerQuery({
    ...params,
    limit: 12,
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Moliyaviy hisob-kitob
        </h1>
        <PeriodPicker
          year={period.year}
          month={period.month}
          onChange={({ year, month }) => period.setFields({ year, month })}
        />
      </header>

      {/* KPI kartalar */}
      {summaryLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-36" />
          ))}
        </div>
      ) : (
        <FinanceKpiCards data={summary} />
      )}

      {/* Asosiy qator: dinamika grafigi + to'lov usullari */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <IncomeExpenseTrendChart />
        </div>
        {summaryLoading ? (
          <SkeletonBlock className="h-64" />
        ) : (
          <PaymentMethodCard methods={summary?.paymentMethods} />
        )}
      </div>

      {/* Ikkinchi qator: guruhlar kesimi + qoldiqlar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GroupBreakdownChart items={groups || []} isLoading={groupsLoading} />
        </div>
        {summaryLoading ? (
          <SkeletonBlock className="h-64" />
        ) : (
          <OutstandingCard
            income={summary?.income}
            expense={summary?.expense}
          />
        )}
      </div>

      {/* So'nggi tranzaksiyalar */}
      <LedgerTable items={ledger || []} isLoading={ledgerLoading} />
    </div>
  );
};

export default FinanceReportPage;
