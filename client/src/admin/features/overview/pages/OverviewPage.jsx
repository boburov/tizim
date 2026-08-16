// Icons
import {
  CalendarCheck,
  CircleDollarSign,
  UserPlus,
  Users,
} from "lucide-react";

// Dashboard components
import KpiTile from "@/shared/components/dashboard/KpiTile";
import ChartCard from "@/shared/components/dashboard/ChartCard";
import InsightCard from "@/shared/components/dashboard/InsightCard";
import DataState from "@/shared/components/dashboard/DataState";
import DashboardSection, {
  KpiGrid,
  SplitRow,
} from "@/shared/components/dashboard/SectionGrid";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import {
  useOverviewData,
  useCashflowData,
  useInsightsData,
} from "../../../hooks/useExecutiveData";

// Local components
import ExecutivePageHeader from "../../../components/ExecutivePageHeader";
import CashflowBars from "../../../components/CashflowBars";

/**
 * UMUMIY KO'RINISH - ertalabki birinchi ekran.
 *
 * TUZILISH PROMT.MD DAGI TO'RT SAVOLGA MOS:
 *   1) "hozir qanday?"      -> KPI qatori
 *   2) "nima bo'lyapti?"    -> pul oqimi grafigi
 *   3) "nima qilay?"        -> tavsiyalar oqimi
 *
 * HAR BLOK O'Z HOLATINI O'ZI KO'RSATADI. Sahifa darajasida bitta
 * umumiy "yuklanmoqda" YO'Q: bitta ko'chirilmagan endpoint butun
 * ekranni bo'sh qoldirardi, holbuki qolgan ko'rsatkichlar tayyor.
 */
const OverviewPage = () => {
  const now = new Date();
  const period = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    range: "month",
  });

  const params = { year: period.year, month: period.month };

  const overview = useOverviewData(params);
  const cashflow = useCashflowData({ range: period.range });
  const insights = useInsightsData({ limit: 4, status: "open" });

  // `overview.data` FAQAT `ready` da mavjud. `?.` ATAYLAB: qolgan
  // holatlarda `undefined` bo'ladi va KpiTile uni ko'rsatmaydi -
  // `|| 0` YOZILMAYDI, aks holda so'rov yiqilganda ekranda ishonchli
  // "0 so'm" turardi.
  const o = overview.data;

  return (
    <div className="space-y-6">
      <ExecutivePageHeader
        title="Umumiy holat"
        hint="Markazning bugungi kesimi. Har karta operatsion sahifaga olib boradi."
        period={period}
      />

      {/* ── 1. KPI QATORI ──
          MAYDON NOMLARI SERVERDAN OLINGAN
          (server/src/modules/adminDashboard/services/adminDashboard.service.js,
          `getOverview`). O'ylab topilgan maydon YO'Q.

          DIQQAT: javobda QARZDORLIK maydoni yo'q. "Qarzdorlik" plitasi
          shu sababli QO'YILMADI - `o?.debt?.total` yozish oson edi,
          lekin u har doim `undefined` bo'lib, plita abadiy "Ma'lumot
          yo'q" ko'rsatib turardi va bu buzuq ekran taassurotini
          berardi. Qarzdorlik `/owner/students/qarzdorlar` da bor;
          bu yerga u endpoint kengaytirilgach qo'shiladi. */}
      <KpiGrid cols={4}>
        <KpiTile
          label="Bu oy tushum"
          icon={CircleDollarSign}
          isMoney
          value={o?.revenueThisMonth}
          // `revenueDelta` o'tgan oy nolga teng bo'lsa serverda `null`
          // bo'ladi - KpiTile uni ko'rsatmaydi (0% deb yozmaydi).
          delta={o?.revenueDelta}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to="/owner/students/tolovlar"
          hint="O'tgan oyga nisbatan"
        />
        <KpiTile
          label="O'quvchilar"
          icon={Users}
          value={o?.studentsCount}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to="/owner/students"
          hint={
            typeof o?.activeGroupsCount === "number"
              ? `${o.activeGroupsCount} faol guruh`
              : undefined
          }
        />
        <KpiTile
          label="Bu oy o'sish"
          icon={UserPlus}
          value={o?.netGrowth}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to="/owner/students"
          hint={
            typeof o?.newStudentsThisMonth === "number"
              ? `${o.newStudentsThisMonth} yangi, ${o.lostStudentsThisMonth ?? 0} ketgan`
              : undefined
          }
        />
        <KpiTile
          label="Bugungi davomat"
          icon={CalendarCheck}
          suffix="%"
          // Server bugun dars belgilanmagan bo'lsa `null` qaytaradi -
          // "0%" EMAS. KpiTile buni "Ma'lumot yo'q" deb ko'rsatadi.
          value={o?.todayAttendanceRate}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to="/owner/attendance"
        />
      </KpiGrid>

      {/* ── 2. OQIM + TAVSIYALAR ── */}
      <SplitRow
        main={
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
            to="/owner/finance-report"
            emptyHint="Tanlangan davrda pul harakati qayd etilmagan."
          >
            {(d) => <CashflowBars buckets={d.buckets} />}
          </ChartCard>
        }
        side={
          <DashboardSection
            title="Tavsiyalar"
            hint="Hozir e'tibor talab qiladigan holatlar"
            to="/owner/ai"
          >
            <DataState
              status={insights.status}
              data={insights.data}
              error={insights.error}
              onRetry={insights.refetch}
              compact
              emptyTitle="Yangi tavsiya yo'q"
              emptyHint="Tahlil hech qanday muammo aniqlamadi."
              notConnectedHint="Tahlil markazi ma'lumot manbai ulangach chiqadi."
              skeletonClassName="h-56"
            >
              {(items) => (
                <div className="space-y-3">
                  {items.slice(0, 4).map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </div>
              )}
            </DataState>
          </DashboardSection>
        }
      />
    </div>
  );
};

export default OverviewPage;
