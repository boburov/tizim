import {
  BarChart3, GraduationCap, Users, Lightbulb, DoorOpen, Compass,
} from "lucide-react";

import EmptyState from "@/shared/components/page/EmptyState";
import TabNav from "@/shared/components/page/TabNav";
import { useActiveTab } from "@/shared/components/page/tabState";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useDrill, useDrillFilters } from "@/shared/drill";
import useFinanceFilters from "@/owner/features/financeAnalytics/hooks/useFinanceFilters";
import FinanceFilterBar from "@/owner/features/financeAnalytics/components/FinanceFilterBar";
import ProfitabilitySection from "@/owner/features/financeAnalytics/components/sections/ProfitabilitySection";
import { RoomUtilizationSection } from "@/owner/features/rooms";

import AcademicSection from "../sections/AcademicSection";
import TeamSection from "../sections/TeamSection";
import InsightsSection from "../sections/InsightsSection";
import DirectionDemandSection from "../sections/DirectionDemandSection";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TIZIM TAHLILI — IKKI PANELDA AYNI KESIMLAR (talab 28, 31)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu komponent IKKI joyda ishlatiladi:
 *
 *   Super Admin  `/org/tahlil`    — tashkilot ko'lamida
 *   Admin        `/owner/tahlil`  — o'z filiali ko'lamida
 *
 * ── NEGA NUSXA EMAS ──
 * Talab 31 administratorga "AYNI tizim tahlilini, faqat filial
 * ko'lamida" beradi. Agar Admin paneli uchun qisqartirilgan ikkinchi
 * versiya yozilsa, ikkita tahlil ekrani bo'lardi va ular vaqt o'tishi
 * bilan boshqacha javob bera boshlardi — moliyada bu ishonchni
 * butunlay yo'q qiladi.
 *
 * KO'LAMNI SERVER HAL QILADI: har so'rov `branchFilter()` ostida
 * kesiladi. Ya'ni bu yerda "admin uchun" degan shart YO'Q va
 * bo'lmasligi ham kerak — u xavfsizlik chegarasini UI ga ko'chirardi.
 *
 * ── TAB TARTIBI TASODIFIY EMAS ──
 * Yuqoridan pastga: "nima qilish kerak" → "qayerda pul" → "resurs" →
 * "o'quv jarayoni" → "odamlar". Tavsiyalar birinchi, chunki ekranning
 * savoli — "nimaga e'tibor beray?".
 */
const SystemAnalysisTabs = () => {
  const { has } = usePermissions();
  const { filters, set, reset, activeCount } = useFinanceFilters();
  const { openRoot } = useDrill();
  useDrillFilters(filters);

  const canInsights = has(PERMISSIONS.AI_READ);
  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const canRooms = has(PERMISSIONS.CLASSES_READ);
  const canLeads = has(PERMISSIONS.LEADS_READ);
  const canDashboard = has(PERMISSIONS.ADMIN_DASHBOARD_READ);

  const TABS = [
    { key: "insights", label: "Tavsiyalar", icon: Lightbulb, visible: canInsights },
    { key: "profit", label: "Foydalilik", icon: BarChart3, visible: canProfit },
    { key: "directions", label: "Yo'nalishlar", icon: Compass, visible: canLeads || canProfit },
    { key: "rooms", label: "Xonalar", icon: DoorOpen, visible: canRooms },
    { key: "academic", label: "O'quv jarayoni", icon: GraduationCap, visible: canDashboard },
    { key: "team", label: "Jamoa", icon: Users, visible: canDashboard },
  ];
  const tab = useActiveTab(TABS);

  if (!TABS.some((t) => t.visible)) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Tahlil bo'limlari yopiq"
        hint="Bu ekran markazning ko'rsatkichlarini ko'rsatadi. Uni ochish uchun boshqaruv paneli, tahlil yoki foydalilik ruxsati kerak."
      />
    );
  }

  return (
    <>
      <TabNav tabs={TABS} />

      {tab === "insights" && <InsightsSection />}

      {/* FILTR PANELI FAQAT FOYDALILIKDA.
          Qolgan kesimlar o'z davr tanlagichiga ega (`SectionHeader`) va
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

      {tab === "directions" && <DirectionDemandSection filters={filters} />}

      {tab === "rooms" && canRooms && (
        <RoomUtilizationSection enabled={tab === "rooms"} />
      )}

      {tab === "academic" && <AcademicSection />}
      {tab === "team" && <TeamSection />}
    </>
  );
};

export default SystemAnalysisTabs;
