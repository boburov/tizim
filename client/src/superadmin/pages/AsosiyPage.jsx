import { useMemo, useState } from "react";
import { Wallet, Building2 } from "lucide-react";

import { DashboardSection } from "@/shared/components/dashboard/SectionGrid";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import usePermissions from "@/shared/hooks/usePermissions";
import useObjectState from "@/shared/hooks/useObjectState";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useDrill, DRILL_TYPES as T } from "@/shared/drill";
import {
  useBranchOverview, useBranchProfit, useDirectionProfit, useTeacherProfit,
} from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import BranchMetricChart from "../components/BranchMetricChart";
import {
  ALL_BRANCHES_VALUE,
  DEFAULT_PERIOD,
  periodRange,
} from "../components/branchMetrics";
import { useIntelligence } from "@/owner/features/financeAnalytics/hooks/useFinanceIntelligence";
import IntelligenceCenter from "@/owner/features/financeAnalytics/components/IntelligenceCenter";
import SignalDetailDrawer from "@/owner/features/financeAnalytics/components/SignalDetailDrawer";
import PageShell from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TASHKILOT — BOSH EKRAN (talab 18)
 * ══════════════════════════════════════════════════════════════════════
 *
 * BITTA EKRANDA BITTA SAVOL: "biznes qanday ketyapti?"
 *
 * ── OLTI KARTA O'RNIGA BITTA GRAFIK ──
 *
 * Ekranning tepasida oltita KPI kartasi turardi. Ular to'g'ri son
 * ko'rsatardi, lekin savolni TUGATARDI: "chiqim 19.3 mln" dan keyin
 * beriladigan yagona foydali savol — "qaysi filialda?" — va karta
 * unga javob bermasdi. Rahbar har safar Filiallar sahifasiga o'tib,
 * u yerdan taqqoslash jadvalini qidirardi.
 *
 * Endi o'sha oltita ko'rsatkich FILIAL KESIMIDA, bitta grafikda:
 * ustunlar yonma-yon turadi va "kim ko'proq keltirdi" bir qarashda
 * ko'rinadi. Ko'rsatkichlar YO'QOLMADI — ular grafik ostidagi
 * qatorda qoldi va o'sha qator ayni paytda tanlagich vazifasini
 * bajaradi (`BranchMetricChart`).
 *
 * ── HAR RAQAM BOSILADI ──
 * Talab 35: har muhim ko'rsatkich "nega?" degan savolga javob
 * berishi kerak. Jadval qatori bosilganda universal drill paneli
 * ochiladi, grafik ustuni esa ulush foizini ko'rsatadi.
 *
 * ── SO'ROVLAR (talab 29) ──
 * Sahifa ochilganda TO'RTTA so'rov ketadi: filial kesimi, intellekt,
 * foydalilik va yo'nalish kesimi. O'qituvchi kesimi eng "og'ir" va
 * eng sezgir — u ALOHIDA ruxsat bilan va faqat ruxsat bo'lsa.
 *
 * ⚠ `useSummary` OLIB TASHLANDI: uning bergan oltita soni endi
 * `branch-overview` javobining `totals` maydonida. Ikkalasini birga
 * so'rash bir xil raqamni ikki marta olib kelardi — va ular
 * ajralib qolsa qaysi biri to'g'ri ekani noma'lum bo'lardi.
 */

const AsosiyPage = () => {
  const { has } = usePermissions();
  const { openRoot } = useDrill();
  // Signal paneli — "nega bu ogohlantirish chiqdi" savolining javobi.
  const [signalId, setSignalId] = useState(null);

  const canFinance = has(PERMISSIONS.FINANCE_READ);
  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const canTeacherProfit =
    canProfit && (has(PERMISSIONS.SALARY_READ) || has(PERMISSIONS.PAYROLL_READ));

  // GRAFIK TANLOVI. `useState` EMAS: bog'liq qiymatlar bitta
  // boshqaruvga tegishli (kodbaza qoidasi — `useObjectState`).
  const chart = useObjectState({
    branchId: ALL_BRANCHES_VALUE,
    metric: "revenue",
    period: DEFAULT_PERIOD,
  });

  /**
   * DAVR — BUTUN SAHIFA UCHUN, faqat grafik uchun emas.
   *
   * ⚠ ATAYLAB HAMMASIGA BERILADI. Tanlagich grafik sarlavhasida
   * tursa-da, u pastdagi jadvallarga ham tegishli: bitta ekranda
   * grafik "o'tgan oy", jadval esa "bu oy" bo'lib turishi —
   * raqamlar bir-biriga mos kelmasligining eng jimgina sababi.
   * Tanlangan davr grafik sarlavhasida ochiq yoziladi.
   */
  const periodFilters = useMemo(() => periodRange(chart.period), [chart.period]);

  // ⚠ `branchId` va davr FILTRDA — ya'ni TanStack kalitida. Tanlov
  // o'zgarsa kalit o'zgaradi va so'rov o'zi qaytadan ketadi;
  // "grafikni yangilash" uchun alohida effekt yozilmagan.
  const overview = useBranchOverview(
    chart.branchId === ALL_BRANCHES_VALUE
      ? periodFilters
      : { ...periodFilters, branchId: chart.branchId },
    { enabled: canFinance },
  );

  const intelligence = useIntelligence(periodFilters, { enabled: canFinance });
  const branches = useBranchProfit(periodFilters, { enabled: canProfit });
  const directions = useDirectionProfit(
    { ...periodFilters, limit: 5 },
    { enabled: canProfit },
  );
  const teachers = useTeacherProfit(
    { ...periodFilters, limit: 5 },
    { enabled: canTeacherProfit },
  );

  return (
    <PageShell title="Umumiy holat">
      {!canFinance ? (
        <EmptyState
          icon={Wallet}
          title="Moliyaviy manzara yopiq"
          hint="Bu ekran markazning pul holatini ko'rsatadi. Uni ochish uchun moliyani ko'rish ruxsati kerak."
        />
      ) : (
        <BranchMetricChart
          query={overview}
          metricKey={chart.metric}
          onMetricChange={(v) => chart.setField("metric", v)}
          periodKey={chart.period}
          onPeriodChange={(v) => chart.setField("period", v)}
          branchId={chart.branchId}
          onBranchChange={(v) => chart.setField("branchId", v)}
          // "NEGA?" ZANJIRI SAQLANDI. Ilgari har KPI kartasi drill
          // panelini ochardi; endi o'sha rolni ustun bajaradi va u
          // AYNAN o'sha panelga (`T.BRANCH`) olib boradi — pastdagi
          // jadval qatori bilan bir xil joyga.
          onBranchOpen={(row) =>
            openRoot({ type: T.BRANCH, id: row.id, name: row.fullLabel })
          }
        />
      )}

      {/* ── NIMAGA E'TIBOR BERISH KERAK ── */}
      {canFinance && (
        <IntelligenceCenter
          query={intelligence}
          onOpenSignal={setSignalId}
          showHint={false}
        />
      )}

      {/* ── FILIALLAR: eng qisqa taqqoslash (talab 3) ── */}
      {canProfit && (
        <DashboardSection
          title="Filiallar"
          to="/org/filiallar"
          toLabel="To'liq taqqoslash"
        >
          <QueryState
            query={branches}
            empty={!branches.data?.items?.length}
            emptyTitle="Filial ma'lumoti yo'q"
            emptyHint="Tanlangan davrda hech bir filialda moliyaviy harakat bo'lmagan."
            loadingRows={3}
          >
            {(data) => (
              <AnalyticsTable
                rows={data.items}
                rowKey={(r) => r.branchId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) =>
                  openRoot({ type: T.BRANCH, id: r.branchId, name: r.name })
                }
                columns={[
                  { key: "name", label: "Filial" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Foyda", align: "right", kind: "moneyShort" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  { key: "collectionRatePercent", label: "Undirish", align: "right", kind: "percent" },
                ]}
              />
            )}
          </QueryState>
        </DashboardSection>
      )}

      {/* ── ENG FOYDALI YO'NALISHLAR ── */}
      {canProfit && (
        <DashboardSection
          title="Eng foydali yo'nalishlar"
          to="/org/tahlil"
          toLabel="Barcha kesimlar"
        >
          <QueryState
            query={directions}
            empty={!directions.data?.items?.length}
            emptyTitle="Yo'nalish bo'yicha daromad yo'q"
            emptyHint="Guruhlarga kurs biriktirilmagan bo'lishi mumkin."
            loadingRows={3}
          >
            {(data) => (
              <AnalyticsTable
                rows={data.items.slice(0, 5)}
                rowKey={(r) => r.courseId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) => openRoot({ type: T.COURSE, id: r.courseId, name: r.name })}
                columns={[
                  { key: "name", label: "Yo'nalish" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Foyda", align: "right", kind: "moneyShort" },
                  { key: "contributionMarginPercent", label: "Marja", align: "right", kind: "percent" },
                ]}
              />
            )}
          </QueryState>
        </DashboardSection>
      )}

      {/* ── ENG FOYDALI O'QITUVCHILAR ── */}
      {canTeacherProfit && (
        <DashboardSection title="Eng foydali o'qituvchilar">
          <QueryState
            query={teachers}
            empty={!teachers.data?.items?.length}
            emptyTitle="O'qituvchi kesimi bo'sh"
            emptyHint="Daromad o'qituvchiga faqat guruhda bitta o'qituvchi bo'lganda bog'lanadi."
            loadingRows={3}
          >
            {(data) => (
              <AnalyticsTable
                rows={data.items.slice(0, 5)}
                rowKey={(r) => r.teacherId}
                defaultSort={{ key: "contributionProfit", dir: "desc" }}
                onRowClick={(r) => openRoot({ type: T.TEACHER, id: r.teacherId, name: r.name })}
                columns={[
                  { key: "name", label: "O'qituvchi" },
                  { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                  { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                  { key: "contributionProfit", label: "Foyda", align: "right", kind: "moneyShort" },
                ]}
              />
            )}
          </QueryState>
        </DashboardSection>
      )}

      {!canProfit && canFinance && (
        <EmptyState
          icon={Building2}
          title="Foydalilik kesimlari yopiq"
          hint="Filial, yo'nalish va o'qituvchi bo'yicha foyda tahlili maosh tannarxini ochadi — shuning uchun alohida ruxsat talab qiladi."
        />
      )}
      {/* ⚠ Panel AYNAN o'sha davrni oladi: signal "o'tgan oy" uchun
          chiqqan bo'lsa, uning tafsiloti joriy oydan hisoblanmasligi
          kerak — aks holda "nega bu ogohlantirish chiqdi?" savoliga
          boshqa davrning raqamlari javob berardi. */}
      <SignalDetailDrawer
        signalId={signalId}
        filters={periodFilters}
        onOpenChange={setSignalId}
      />
    </PageShell>
  );
};

export default AsosiyPage;
