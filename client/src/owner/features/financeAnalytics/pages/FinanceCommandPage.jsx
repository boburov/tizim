import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { cn } from "@/shared/utils/cn";

import useFinanceFilters from "../hooks/useFinanceFilters";
import { useSummary } from "../hooks/useFinanceAnalytics";
import { useIntelligence, useBriefing } from "../hooks/useFinanceIntelligence";
import FinanceFilterBar from "../components/FinanceFilterBar";
import BranchFilter from "../components/BranchFilter";
import FinanceKpiGrid from "../components/FinanceKpiGrid";
import IntelligenceCenter from "../components/IntelligenceCenter";
import BriefingCard from "../components/BriefingCard";
import SignalDetailDrawer from "../components/SignalDetailDrawer";
import QuickActions from "../components/actions/QuickActions";
import { DeniedBlock } from "@/shared/components/analytics";
import { useDrill, useDrillFilters } from "@/shared/drill";

import TransactionsSection from "../components/sections/TransactionsSection";
import RevenueSection from "../components/sections/RevenueSection";
import ExpenseSection from "../components/sections/ExpenseSection";
import ProfitabilitySection from "../components/sections/ProfitabilitySection";
import CashFlowSection from "../components/sections/CashFlowSection";
import ReceivablesSection from "../components/sections/ReceivablesSection";
import BudgetSection from "../components/sections/BudgetSection";

/**
 * MOLIYA BOSHQARUV MARKAZI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SAHIFA TUZILISHI TO'RT SAVOLGA JAVOB BERADI (talab 18)
 *
 *   PUL QAYERDA?      → KPI kartalar + kassa qoldig'i
 *   FOYDA QAYERDA?    → hissa foydasi + foydalilik bo'limi
 *   QAYERDA YO'QOTYAPMIZ? → qarzdorlik, chiqim o'sishi, byudjet
 *   NIMAGA E'TIBOR?   → harakat markazi (eng tepada)
 *
 * Shuning uchun ogohlantirishlar KPI dan KEYIN, lekin barcha
 * bo'limlardan OLDIN turadi: raqamni ko'rgan odam darhol "nima
 * qilishim kerak" javobini oladi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ── SO'ROVLAR KETMA-KETLIGI (talab 17) ──
 * Sahifa ochilganda FAQAT ikkita so'rov ketadi: xulosa va
 * ogohlantirishlar. Qolgan bo'limlar o'z tabi tanlanganda yuklanadi
 * (`enabled`). 22 endpoint'ni birdan chaqirish taqiqlangan.
 */

const TABS = [
  { key: "overview", label: "Umumiy" },
  // TRANZAKSIYALAR — "Umumiy" dan KEYIN, qolgan hamma tahlildan
  // OLDIN. KPI kartadagi raqamni ko'rgan odamning keyingi savoli
  // deyarli har doim "shu davrda nima bo'ldi?" bo'ladi; javob
  // diagrammalar ostida turmasligi kerak.
  { key: "transactions", label: "Tranzaksiyalar" },
  { key: "revenue", label: "Daromad" },
  { key: "expenses", label: "Chiqim" },
  { key: "profitability", label: "Foydalilik", permission: PERMISSIONS.FINANCE_VIEW_PROFITABILITY },
  { key: "cash", label: "Pul oqimi", permission: PERMISSIONS.FINANCE_VIEW_CASHFLOW },
  { key: "receivables", label: "Qarzdorlik", permission: PERMISSIONS.FINANCE_VIEW_RECEIVABLES },
  { key: "budget", label: "Byudjet" },
];

const FinanceCommandPage = () => {
  const { has } = usePermissions();
  const { filters, set, reset, activeCount } = useFinanceFilters();
  const [params, setParams] = useSearchParams();
  const [signalId, setSignalId] = useState(null);

  // DRILL-DOWN — ILOVA BO'YLAB YAGONA MEXANIZM.
  //
  // Ilgari bu sahifada O'Z paneli bor edi (`DrillDownDrawer`) va u
  // faqat moliya ekranida ishlardi: filial kartasidan yoki bosh
  // sahifadan bosilgan raqam boshqacha (yoki umuman hech qanday)
  // panel ochardi. Endi mexanizm bitta — `shared/drill`.
  const { openRoot } = useDrill();
  // Davr va filtrlar panelga MEROS bo'ladi (aks holda panel joriy
  // oyni ko'rsatardi, foydalanuvchi esa boshqa oyni tanlagan bo'lardi).
  useDrillFilters(filters);

  // Tab ham URL da — havola bo'lishilganda o'sha bo'lim ochiladi.
  const tab = params.get("tab") || "overview";
  const setTab = (key) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  const summary = useSummary(filters);
  // INTELLEKT server tomonda 12 ta hisobotni birlashtiradi — shuning
  // uchun faqat "Umumiy" tabda so'raladi. LLM bu yerda ISHLAMAYDI:
  // qoidalar deterministik, AI izohi faqat signal panelida.
  const intelligence = useIntelligence(filters, { enabled: tab === "overview" });
  const briefing = useBriefing(filters, { enabled: tab === "overview" });

  if (!has(PERMISSIONS.FINANCE_READ)) {
    return <DeniedBlock permission="finance.read" className="mt-6" />;
  }

  // Ruxsati yo'q tab KO'RSATILMAYDI — bu qulaylik, xavfsizlik emas
  // (server baribir 403 qaytaradi).
  const visibleTabs = TABS.filter((t) => !t.permission || has(t.permission));

  const openDrill = (target) => openRoot(target);

  /**
   * Tavsiya bosilganda — TEGISHLI BO'LIMGA o'tamiz va filtrni
   * qo'llaymiz. Tizim moliyaviy amalni O'ZI bajarmaydi (talab S):
   * bu faqat navigatsiya.
   */
  const handleSignalAction = (target) => {
    if (!target) return;
    if (target.filters) set(target.filters);
    if (target.tab) setTab(target.tab);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Moliya</h1>
        <QuickActions />
      </header>

      <FinanceFilterBar
        filters={filters}
        onChange={set}
        onReset={reset}
        activeCount={activeCount}
        showGranularity={["revenue", "expenses", "cash"].includes(tab)}
        // FILIAL — faqat Super Admin qobig'ida (izoh: BranchFilter).
        slots={<BranchFilter value={filters.branchId} onChange={set} />}
      />

      {/* KPI — HAR DOIM ko'rinadi: bo'lim almashganda ham kontekst qoladi */}
      <FinanceKpiGrid query={summary} onDrill={(key) => setTab(key)} />

      <nav className="flex flex-wrap gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition",
              tab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <BriefingCard query={briefing} onOpenSignal={setSignalId} />
          <IntelligenceCenter
            query={intelligence}
            onOpenSignal={setSignalId}
            onAction={handleSignalAction}
          />
        </>
      )}
      {tab === "transactions" && (
        <TransactionsSection filters={filters} onFilter={set} />
      )}
      {tab === "revenue" && (
        <RevenueSection filters={filters} onFilter={set} onDrill={openDrill} />
      )}
      {tab === "expenses" && <ExpenseSection filters={filters} onDrill={openDrill} />}
      {tab === "profitability" && (
        <ProfitabilitySection filters={filters} onDrill={openDrill} />
      )}
      {tab === "cash" && (
        has(PERMISSIONS.FINANCE_VIEW_CASHFLOW)
          ? <CashFlowSection filters={filters} />
          : <DeniedBlock permission="finance.view_cashflow" />
      )}
      {tab === "receivables" && (
        has(PERMISSIONS.FINANCE_VIEW_RECEIVABLES)
          ? <ReceivablesSection filters={filters} onDrill={openDrill} />
          : <DeniedBlock permission="finance.view_receivables" />
      )}
      {tab === "budget" && <BudgetSection filters={filters} />}

      <SignalDetailDrawer
        signalId={signalId}
        filters={filters}
        onOpenChange={setSignalId}
        onAction={handleSignalAction}
      />
    </div>
  );
};

export default FinanceCommandPage;
