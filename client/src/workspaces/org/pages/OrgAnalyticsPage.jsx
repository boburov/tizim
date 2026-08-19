import { BarChart3, GraduationCap, Users, Lightbulb } from "lucide-react";

import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useDrill, useDrillFilters } from "@/shared/drill";
import useFinanceFilters from "@/owner/features/financeAnalytics/hooks/useFinanceFilters";
import FinanceFilterBar from "@/owner/features/financeAnalytics/components/FinanceFilterBar";
import ProfitabilitySection from "@/owner/features/financeAnalytics/components/sections/ProfitabilitySection";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";
import TabNav from "@/workspaces/shared/TabNav";
import { useActiveTab } from "@/workspaces/shared/tabState";

import AcademicSection from "../sections/AcademicSection";
import TeamSection from "../sections/TeamSection";
import InsightsSection from "../sections/InsightsSection";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TAHLIL — «NEGA SHUNDAY?» DEGAN SAVOLNING YAGONA JOYI
 * ══════════════════════════════════════════════════════════════════════
 *
 * To'rt kesim, bitta manzil:
 *
 *   Foydalilik     — daromad − bevosita xarajat, beshta o'lchovda
 *   O'quv jarayoni — o'quvchilar oqimi, guruhlar, davomat
 *   Jamoa          — o'qituvchi va xodimlarning joriy holati
 *   Tavsiyalar     — tahlil aniqlagan xavf va imkoniyatlar
 *
 * ── NEGA BITTA MANZIL ──
 * Bu to'rttasi ilgari IKKINCHI QOBIQDA (`/admin/*`) yashardi:
 * sidebarsiz, boshqa sarlavha bilan, boshqa navigatsiya bilan.
 * Ya'ni ilovada ikkita axborot arxitekturasi bor edi va foydalanuvchi
 * qaysi biridaligini yo'qotardi. Endi qobiq bitta.
 *
 * ── NEGA SIDEBAR'DA 9-YOZUV EMAS ──
 * Talab 20 Super Admin uchun aniq sakkizta bo'lim beradi. To'rt
 * kesimni sidebar'ga chiqarish uni o'n bir yozuvga aylantirardi va
 * «chuqur menyu yo'q» qoidasini buzardi. Ular bitta savolning
 * («nega?») to'rt qirrasi — shuning uchun tab.
 *
 * ── FOYDALILIK NEGA ALOHIDA RUXSAT TALAB QILADI ──
 * U o'qituvchi, guruh va yo'nalish TANNARXINI, ya'ni MAOSHNI
 * ko'rsatadi. Qolgan uch kesim buni ochmaydi, shuning uchun ular
 * `finance.view_profitability` siz ham ishlaydi.
 */
const OrgAnalyticsPage = () => {
  const { has } = usePermissions();
  const { filters, set, reset, activeCount } = useFinanceFilters();
  const { openRoot } = useDrill();
  useDrillFilters(filters);

  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const canDashboard = has(PERMISSIONS.ADMIN_DASHBOARD_READ);
  const canInsights = has(PERMISSIONS.AI_READ);

  const TABS = [
    { key: "profit", label: "Foydalilik", icon: BarChart3, visible: canProfit },
    { key: "academic", label: "O'quv jarayoni", icon: GraduationCap, visible: canDashboard },
    { key: "team", label: "Jamoa", icon: Users, visible: canDashboard },
    { key: "insights", label: "Tavsiyalar", icon: Lightbulb, visible: canInsights },
  ];
  const tab = useActiveTab(TABS);

  if (!TABS.some((t) => t.visible)) {
    return (
      <WorkspacePage title="Tahlil">
        <EmptyState
          icon={BarChart3}
          title="Tahlil bo'limlari yopiq"
          hint="Bu ekran markazning ko'rsatkichlarini ko'rsatadi. Uni ochish uchun boshqaruv paneli yoki foydalilik ruxsati kerak."
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage
      title="Tahlil"
      subtitle="«Nega shunday?» — foyda, o'quv jarayoni, jamoa va tavsiyalar"
    >
      <TabNav tabs={TABS} />

      {/* FILTR PANELI FAQAT FOYDALILIKDA.
          Qolgan kesimlar o'z davr tanlagichiga ega (SectionHeader) va
          ikkita tanlagich bir ekranda turishi — qaysi biri ishlayotgani
          noaniq bo'lardi. */}
      {tab === "profit" && (
        <>
          <FinanceFilterBar
            filters={filters}
            onChange={set}
            onReset={reset}
            activeCount={activeCount}
          />
          <p className="text-xs text-muted-foreground">
            Hissa foydasi — daromaddan bevosita xarajatlar (maosh, komissiya)
            ayirilgandan keyingi foyda.
          </p>
          <ProfitabilitySection filters={filters} onDrill={openRoot} />
        </>
      )}

      {tab === "academic" && <AcademicSection />}
      {tab === "team" && <TeamSection />}
      {tab === "insights" && <InsightsSection />}
    </WorkspacePage>
  );
};

export default OrgAnalyticsPage;
