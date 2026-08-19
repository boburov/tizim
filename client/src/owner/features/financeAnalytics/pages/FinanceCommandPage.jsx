import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { cn } from "@/shared/utils/cn";

import useFinanceFilters from "../hooks/useFinanceFilters";
import { useSummary, useAlerts } from "../hooks/useFinanceAnalytics";
import FinanceFilterBar from "../components/FinanceFilterBar";
import FinanceKpiGrid from "../components/FinanceKpiGrid";
import AlertCenter from "../components/AlertCenter";
import QuickActions from "../components/actions/QuickActions";
import DrillDownDrawer from "../components/DrillDownDrawer";
import FinancialTransactionDrawer from "../components/FinancialTransactionDrawer";
import { DeniedBlock } from "../components/StateBlock";

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
  const [drill, setDrill] = useState(null);
  // Tranzaksiya paneli drill-down panelining USTIGA ochiladi —
  // yopilganda foydalanuvchi aynan o'sha ro'yxatga qaytadi.
  const [entryId, setEntryId] = useState(null);

  // Tab ham URL da — havola bo'lishilganda o'sha bo'lim ochiladi.
  const tab = params.get("tab") || "overview";
  const setTab = (key) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  const summary = useSummary(filters);
  // Ogohlantirishlar server tomonda 8 ta hisobotni birlashtiradi —
  // shuning uchun faqat "Umumiy" tabda so'raladi.
  const alerts = useAlerts(filters, { enabled: tab === "overview" });

  if (!has(PERMISSIONS.FINANCE_READ)) {
    return <DeniedBlock permission="finance.read" className="mt-6" />;
  }

  // Ruxsati yo'q tab KO'RSATILMAYDI — bu qulaylik, xavfsizlik emas
  // (server baribir 403 qaytaradi).
  const visibleTabs = TABS.filter((t) => !t.permission || has(t.permission));

  const openDrill = (target) => setDrill(target);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Moliya</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Barcha raqam serverdagi qo'sh yozuv jurnalidan
          </p>
        </div>
        <QuickActions />
      </header>

      <FinanceFilterBar
        filters={filters}
        onChange={set}
        onReset={reset}
        activeCount={activeCount}
        showGranularity={["revenue", "expenses", "cash"].includes(tab)}
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
        <AlertCenter query={alerts} onAction={(target) => setTab(target)} />
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

      <DrillDownDrawer
        target={drill}
        filters={filters}
        onOpenChange={setDrill}
        onDrill={openDrill}
        onOpenEntry={setEntryId}
      />

      <FinancialTransactionDrawer entryId={entryId} onOpenChange={setEntryId} />
    </div>
  );
};

export default FinanceCommandPage;
