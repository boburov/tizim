// Icons
import { Building2, CircleDollarSign, Receipt, Wallet } from "lucide-react";

// Dashboard components
import KpiTile from "@/shared/components/dashboard/KpiTile";
import ChartCard from "@/shared/components/dashboard/ChartCard";
import DataState from "@/shared/components/dashboard/DataState";
import DashboardSection, {
  KpiGrid,
} from "@/shared/components/dashboard/SectionGrid";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import {
  useOverviewData,
  useCashflowData,
  useBranchPnlData,
} from "../../../hooks/useExecutiveData";

// Local components
import ExecutivePageHeader from "../../../components/ExecutivePageHeader";
import CashflowBars from "../../../components/CashflowBars";
import BranchPnlTable from "../components/BranchPnlTable";

// Navigation
import { DRILLDOWN } from "../../../navigation/drilldown";

/**
 * MOLIYA KESIMI.
 *
 * Bu sahifa MOLIYA HISOBOTI EMAS - u `/owner/finance/accounting` da.
 * Bu yerda faqat "pul qayerga ketyapti" degan savolga darhol javob
 * beradigan uchta narsa bor: hajm, oqim va filiallar bo'yicha kesim.
 * Tafsilotga drill-down orqali tushiladi.
 */
const FinancePage = () => {
  const now = new Date();
  const period = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    range: "month",
  });

  const params = { year: period.year, month: period.month };

  const overview = useOverviewData(params);
  // Uchala manba ham AYNI davrni oladi - sahifadagi oy tanlagichi
  // endi hamma blokka ta'sir qiladi.
  const cashflow = useCashflowData({
    range: period.range,
    year: period.year,
    month: period.month,
  });
  // P&L `from`/`to` sanalarini kutadi - o'girish hookda (u yerdagi izoh).
  const pnl = useBranchPnlData(params);

  const o = overview.data;

  return (
    <div className="space-y-6">
      <ExecutivePageHeader
        title="Moliya"
        hint="Tushum, pul oqimi va filiallar bo'yicha kesim."
        period={period}
      />

      <KpiGrid cols={3}>
        <KpiTile
          label="Bu oy tushum"
          icon={CircleDollarSign}
          isMoney
          value={o?.revenueThisMonth}
          delta={o?.revenueDelta}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to={DRILLDOWN.studentPayments}
          hint="O'tgan oyga nisbatan"
        />
        <KpiTile
          label="O'tgan oy tushum"
          icon={Wallet}
          isMoney
          value={o?.revenueLastMonth}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          hint="Solishtirish uchun"
        />
        <KpiTile
          label="To'lovlar soni"
          icon={Receipt}
          value={o?.paymentsCount}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to={DRILLDOWN.studentPayments}
          hint="Bu oy qabul qilingan"
        />
      </KpiGrid>

      <ChartCard
        title="Pul oqimi"
        hint="Kirim va chiqim solishtiruvi"
        status={cashflow.status}
        data={cashflow.data}
        error={cashflow.error}
        onRetry={cashflow.refetch}
        ranges={[
          { value: "week", label: "Hafta" },
          { value: "month", label: "Oy" },
          { value: "year", label: "Yil" },
        ]}
        range={period.range}
        onRangeChange={(v) => period.setField("range", v)}
        to={DRILLDOWN.financeReport}
        height="h-64"
        emptyHint="Tanlangan davrda pul harakati qayd etilmagan."
      >
        {(d) => <CashflowBars buckets={d.buckets} />}
      </ChartCard>

      <DashboardSection
        title="Filiallar kesimi"
        hint="Qaysi filial qancha keltirdi"
        to={DRILLDOWN.branchAnalytics}
        toLabel="Filial tahlili"
      >
        <DataState
          status={pnl.status}
          data={pnl.data}
          error={pnl.error}
          onRetry={pnl.refetch}
          emptyIcon={Building2}
          emptyHint="Tanlangan davr uchun filial kesimi hisoblanmagan."
          notConnectedHint="Filial tahlili moduli ma'lumot manbai ulangach chiqadi."
          skeletonClassName="h-48"
        >
          {(rows) => <BranchPnlTable rows={rows} />}
        </DataState>
      </DashboardSection>
    </div>
  );
};

export default FinancePage;
