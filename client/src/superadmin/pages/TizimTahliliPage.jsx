import { BarChart3, GraduationCap, Users, Lightbulb, DoorOpen, Compass } from "lucide-react";

import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useDrill, useDrillFilters } from "@/shared/drill";
import useFinanceFilters from "@/owner/features/financeAnalytics/hooks/useFinanceFilters";
import FinanceFilterBar from "@/owner/features/financeAnalytics/components/FinanceFilterBar";
import ProfitabilitySection from "@/owner/features/financeAnalytics/components/sections/ProfitabilitySection";
import { RoomUtilizationSection } from "@/owner/features/rooms";
import PageShell from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";
import TabNav from "@/shared/components/page/TabNav";
import { useActiveTab } from "@/shared/components/page/tabState";

import AcademicSection from "../sections/AcademicSection";
import DirectionDemandSection from "../sections/DirectionDemandSection";
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
const TizimTahliliPage = () => {
  const { has } = usePermissions();
  const { filters, set, reset, activeCount } = useFinanceFilters();
  const { openRoot } = useDrill();
  useDrillFilters(filters);

  const canProfit = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const canDashboard = has(PERMISSIONS.ADMIN_DASHBOARD_READ);
  const canInsights = has(PERMISSIONS.AI_READ);
  const canRooms = has(PERMISSIONS.CLASSES_READ);
  const canLeads = has(PERMISSIONS.LEADS_READ);

  const TABS = [
    { key: "insights", label: "Tavsiyalar", icon: Lightbulb, visible: canInsights },
    { key: "profit", label: "Foydalilik", icon: BarChart3, visible: canProfit },
    // XONALAR — talab 13/14/27 dagi savollar: qaysi xona bo'sh, qaysi
    // biri to'lib ketgan, qaysi soatlar faol. Ayni komponent Admin
    // panelida ham turadi (`/owner/tahlil`), farqi faqat KO'LAM.
    // YO'NALISHLAR — talab (lid) va natija (daromad) yonma-yon.
    // Ikkalasi BOSHQA ro'yxatdan keladi va ular ataylab
    // birlashtirilmagan (qarang `DirectionDemandSection`).
    {
      key: "directions",
      label: "Yo'nalishlar",
      icon: Compass,
      visible: canLeads || canProfit,
    },
    { key: "rooms", label: "Xonalar", icon: DoorOpen, visible: canRooms },
    { key: "academic", label: "O'quv jarayoni", icon: GraduationCap, visible: canDashboard },
    { key: "team", label: "Jamoa", icon: Users, visible: canDashboard },
  ];
  const tab = useActiveTab(TABS);

  if (!TABS.some((t) => t.visible)) {
    return (
      <PageShell title="Tizim tahlili">
        <EmptyState
          icon={BarChart3}
          title="Tahlil bo'limlari yopiq"
          hint="Bu ekran markazning ko'rsatkichlarini ko'rsatadi. Uni ochish uchun boshqaruv paneli yoki foydalilik ruxsati kerak."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Tizim tahlili"
      subtitle="«Nega shunday?» — tavsiyalar, foyda, xonalar, o'quv jarayoni va jamoa"
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

      {tab === "directions" && <DirectionDemandSection filters={filters} />}

      {tab === "rooms" && canRooms && (
        <RoomUtilizationSection enabled={tab === "rooms"} />
      )}

      {tab === "academic" && <AcademicSection />}
      {tab === "team" && <TeamSection />}
      {tab === "insights" && <InsightsSection />}
    </PageShell>
  );
};

export default TizimTahliliPage;
