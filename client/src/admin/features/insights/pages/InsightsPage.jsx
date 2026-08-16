// Router
import { Link } from "react-router-dom";

// Icons
import { Lightbulb, TriangleAlert } from "lucide-react";

// Dashboard components
import InsightCard from "@/shared/components/dashboard/InsightCard";
import DataState from "@/shared/components/dashboard/DataState";
import DashboardSection from "@/shared/components/dashboard/SectionGrid";
import { narrow, DATA_STATUS } from "@/shared/components/dashboard/dataStatus";

// Hooks
import { useInsightsData } from "../../../hooks/useExecutiveData";

// Local components
import ExecutivePageHeader from "../../../components/ExecutivePageHeader";

// Navigation
import { DRILLDOWN } from "../../../navigation/drilldown";

/**
 * TAVSIYALAR OQIMI.
 *
 * XAVF va IMKONIYAT ATAYLAB AJRATILGAN (bu qoida kodbazada allaqachon
 * bor - `ai/components/dashboard/AiRecommendations.jsx` izohi):
 * aralashtirilgan ro'yxatda owner imkoniyatni "yana bir muammo" deb
 * o'qiydi va ikkalasiga ham e'tibor bermay qo'yadi. Xavf -
 * "yo'qotmaslik uchun", imkoniyat - "ko'proq olish uchun"; ular turli
 * kayfiyatda o'qiladi.
 *
 * DAVR TANLAGICHI YO'Q: tavsiya har doim "hozir" holatiga tegishli.
 * O'tgan oyning tavsiyasi allaqachon eskirgan bo'ladi.
 */
const InsightsPage = () => {
  const insights = useInsightsData({ status: "open", limit: 50 });

  // Bitta so'rov, ikkita ro'yxat. Har biri O'Z holatiga ega bo'lishi
  // kerak: xavf bor, imkoniyat yo'q holati mutlaqo normal va u
  // "ma'lumot yo'q" emas, "hozircha imkoniyat topilmadi" degani.
  const risks = narrow(insights, (items) =>
    (items || []).filter((i) => i.stance !== "opportunity"),
  );
  const opportunities = narrow(insights, (items) =>
    (items || []).filter((i) => i.stance === "opportunity"),
  );

  return (
    <div className="space-y-6">
      <ExecutivePageHeader
        title="Tavsiyalar"
        hint="Tahlil aniqlagan xavflar va imkoniyatlar. Har biri aniq amalga olib boradi."
        actions={
          <Link
            to={DRILLDOWN.aiReports}
            className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Hisobotlar
          </Link>
        }
      />

      <DashboardSection
        title="Xavflar"
        hint="Yo'qotmaslik uchun hozir qilinadigan ishlar"
        count={
          risks.status === DATA_STATUS.READY ? risks.data.length : undefined
        }
        to={DRILLDOWN.ai}
      >
        <DataState
          status={risks.status}
          data={risks.data}
          error={risks.error}
          onRetry={insights.refetch}
          emptyIcon={TriangleAlert}
          emptyTitle="Xavf aniqlanmadi"
          emptyHint="Tahlil hozircha e'tibor talab qiladigan holat topmadi."
          notConnectedHint="Tahlil markazi ma'lumot manbai ulangach chiqadi."
          skeletonClassName="h-64"
        >
          {(items) => (
            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((i) => (
                <InsightCard key={i.id} insight={i} />
              ))}
            </div>
          )}
        </DataState>
      </DashboardSection>

      <DashboardSection
        title="Imkoniyatlar"
        hint="Ko'proq olish uchun taklif qilinayotgan qadamlar"
        count={
          opportunities.status === DATA_STATUS.READY
            ? opportunities.data.length
            : undefined
        }
      >
        <DataState
          status={opportunities.status}
          data={opportunities.data}
          error={opportunities.error}
          onRetry={insights.refetch}
          emptyIcon={Lightbulb}
          emptyTitle="Imkoniyat topilmadi"
          emptyHint="Tahlil hozircha yangi taklif bermadi."
          notConnectedHint="Tahlil markazi ma'lumot manbai ulangach chiqadi."
          skeletonClassName="h-40"
        >
          {(items) => (
            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((i) => (
                <InsightCard key={i.id} insight={i} />
              ))}
            </div>
          )}
        </DataState>
      </DashboardSection>
    </div>
  );
};

export default InsightsPage;
