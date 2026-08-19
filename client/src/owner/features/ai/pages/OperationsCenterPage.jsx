import { Link } from "react-router-dom";
import { FileText, ListTodo, PlugZap, RefreshCw } from "lucide-react";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import useBriefingQuery from "../hooks/useBriefingQuery";
import useRankingsQuery from "../hooks/useRankingsQuery";
import { useLatestReportQuery } from "../hooks/useReportsQuery";
import {
  useAckInsightMutation,
  useResolveInsightMutation,
  useRecomputeMutation,
} from "../hooks/useInsightMutations";
import InsightDismissModal from "../components/modals/InsightDismissModal";
import DashboardSection, {
  SectionEmpty,
} from "../components/dashboard/DashboardSection";
import AiDailySummary from "../components/dashboard/AiDailySummary";
import AiKpiGrid from "../components/dashboard/AiKpiGrid";
import AiCriticalAlerts from "../components/dashboard/AiCriticalAlerts";
import AiRecommendations from "../components/dashboard/AiRecommendations";
import AiHealthScore from "../components/dashboard/AiHealthScore";
import AiForecast from "../components/dashboard/AiForecast";
import AiTopTeachers from "../components/dashboard/AiTopTeachers";
import AiStudentsAtRisk from "../components/dashboard/AiStudentsAtRisk";
import AiRecentActivity from "../components/dashboard/AiRecentActivity";
import { relativeUz } from "../utils/dashboard.utils";
import useAiPaths from "../hooks/useAiPaths";
import { MISSING_ENDPOINT_CODES } from "@/shared/components/dashboard/dataStatus";

// AI DASHBOARD - owner uchun ijroiya paneli.
//
// SAHIFANING YAGONA SAVOLI: "men hozir nima qilishim kerak?"
//
// TARTIB TASODIFIY EMAS - u qaror qabul qilish tartibi:
//
//   1. Xulosa       → holat va birinchi qadam        (5 soniya)
//   2. KPI          → qaror uchun oltita raqam       (15 soniya)
//   3. Ogohlantirish→ nima buzilgan, nima qilinadi   (1 daqiqa)
//   4. Tavsiya      → nima qilsam o'saman
//   5. Salomatlik   → qaysi yo'nalish zaif
//   6. Bashorat     → qayoqqa ketyapmiz
//   7. Jamoa        → kim yaxshi, kimni yo'qotamiz, kim nima qildi
//
// Yuqoridan pastga qarab SHOSHILINCHLIK kamayadi va CHUQURLIK ortadi.
// Owner istalgan joyda to'xtashi mumkin va shu joygacha o'qigani
// o'zicha to'liq javob bo'ladi - progressiv ochilishning asosiy
// ma'nosi shu.
//
// ESKI SAHIFA NEGA QAYTA ISHLANDI: u to'rtta bo'limda 16 ta ko'rsatkich
// katakchasi va har bo'lim tepasida uslubiy izoh ko'rsatardi. O'n
// oltita raqam - bu nol raqam: owner qaysi biri muhimligini ajrata
// olmagach, hech biriga qaramaydi. Endi birinchi ekranda oltita raqam
// va bitta tugma bor.

const DashboardSkeleton = () => (
  <div className="space-y-10">
    <div className="h-44 animate-pulse rounded-2xl bg-muted/60" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/50" />
      ))}
    </div>
    <div className="space-y-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />
      ))}
    </div>
  </div>
);

const HeaderLink = ({ to, icon: Icon, children }) => (
  <Link
    to={to}
    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
  >
    <Icon className="size-4" />
    {children}
  </Link>
);

/**
 * @param {object} props
 * @param {boolean} [props.embedded] — sahifa BOSHQA sarlavha ostida
 *   turibdi (masalan "Tizim tahlili" tabi ichida). Bunda o'z
 *   sarlavhasi chizilmaydi: ikkita `<h1>` bir ekranda — ekran
 *   o'quvchi uchun ikkita "sahifa boshi" degani va ko'rish jihatidan
 *   ham qaysi biri asosiy ekani noaniq bo'lardi.
 *
 *   Yordamchi havolalar (hisobotlar, vazifalar, qayta hisoblash)
 *   YO'QOLMAYDI — ular sarlavhasiz qatorda qoladi.
 */
const OperationsCenterPage = ({ embedded = false }) => {
  const paths = useAiPaths();
  const { data, isLoading, isError, error } = useBriefingQuery();

  // 501 = "MODULE_NOT_MIGRATED" - SERVER NOSOZLIGI EMAS.
  //
  // Bu modul hali MongoDB'da va PostgreSQL'ga ko'chirilmagan
  // (server: config/legacyMongoose.js). Uni "xatolik yuz berdi,
  // sahifani yangilab ko'ring" deb ko'rsatish IKKI marta noto'g'ri:
  //   • sabab noto'g'ri - tizim buzilgandek ko'rinadi;
  //   • maslahat foydasiz - yangilash hech qachon yordam bermaydi.
  // Modul ko'chgach bu shox o'z-o'zidan ishlamay qoladi.
  const notConnected = MISSING_ENDPOINT_CODES.includes(error?.response?.status);
  const { data: rankings } = useRankingsQuery();
  const { data: latestReport } = useLatestReportQuery("daily");
  const { openModal } = useModal(MODAL.AI_INSIGHT_DISMISS);

  const ack = useAckInsightMutation();
  const resolve = useResolveInsightMutation();
  const recompute = useRecomputeMutation();

  const handlers = {
    onAck: (i) => ack.mutate(i._id),
    onResolve: (i) => resolve.mutate(i._id),
    onDismiss: (i) => openModal(MODAL.AI_INSIGHT_DISMISS, i),
  };

  const risks = data?.now?.risks || [];
  const opportunities = data?.now?.opportunities || [];
  const counts = data?.now?.counts;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        {!embedded && (
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">Tahlil markazi</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data?.branch?.name || "Barcha filiallar"}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <HeaderLink to={paths.reports} icon={FileText}>
            Hisobotlar
          </HeaderLink>
          <HeaderLink to={paths.tasks} icon={ListTodo}>
            Barcha vazifalar
          </HeaderLink>
          <button
            type="button"
            onClick={() => recompute.mutate(undefined)}
            disabled={recompute.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${recompute.isPending ? "animate-spin" : ""}`} />
            Qayta hisoblash
          </button>
        </div>
      </header>

      {isError &&
        (notConnected ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center">
            <PlugZap className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="font-medium text-foreground">Manba ulanmagan</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Tahlil moduli hali PostgreSQL&apos;ga ko&apos;chirilmagan. U
              ko&apos;chgach bu sahifa o&apos;zi jonlanadi — bu yerda hech
              narsa sozlash kerak emas.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="font-medium text-foreground">Ma&apos;lumot yuklanmadi</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tahlilni olishda xatolik yuz berdi. Sahifani yangilab ko&apos;ring.
            </p>
          </div>
        ))}

      {isLoading && <DashboardSkeleton />}

      {data && (
        <>
          {/* 1. XULOSA - besh soniyalik javob. */}
          <AiDailySummary
            summary={data.summary}
            health={data.health}
            lastRunLabel={relativeUz(data.lastRun?.at)}
            tasksHref={paths.tasks}
          />

          {/* 2. KPI - qaror uchun oltita raqam, har biri izohi bilan. */}
          <DashboardSection
            title="Asosiy ko'rsatkichlar"
            hint="Har bir raqam ostida sababi va oqibati"
          >
            <AiKpiGrid kpis={data.kpis} />
          </DashboardSection>

          {/* 3. OGOHLANTIRISHLAR - shoshilinchlik bo'yicha (backend
                tartibi: ta'sir × ehtimol × shoshilinchlik). */}
          <DashboardSection
            title="Kritik ogohlantirishlar"
            hint="Eng shoshilinchidan boshlab — har birida tayyor harakat"
            count={counts ? counts.high + counts.medium : null}
            to={risks.length ? paths.tasks : undefined}
          >
            {risks.length > 0 ? (
              <AiCriticalAlerts items={risks} {...handlers} />
            ) : (
              <SectionEmpty
                title="Shoshilinch vazifa yo'q"
                hint="Barcha ko'rsatkichlar normal doirada. Keyingi tahlildan so'ng ro'yxat yangilanadi."
              />
            )}
          </DashboardSection>

          {/* 4. TAVSIYALAR - xavfdan ALOHIDA. Aralashtirilgan ro'yxatda
                owner imkoniyatni "yana bir muammo" deb o'qiydi. */}
          <DashboardSection
            title="Tavsiyalar"
            hint="O'sish qadamlari — bir bosishda kerakli ekranga o'tadi"
            count={counts?.opportunities}
          >
            {opportunities.length > 0 ? (
              <AiRecommendations items={opportunities} onResolve={handlers.onResolve} />
            ) : (
              <SectionEmpty
                title="Hozircha yangi imkoniyat topilmadi"
                hint="Tizim o'sish signallarini har tungi hisoblashda qaytadan qidiradi."
              />
            )}
          </DashboardSection>

          {/* 5. SALOMATLIK - "qaysi yo'nalish zaif". */}
          <DashboardSection
            title="Biznes salomatligi"
            hint="Beshta yo'nalish, 100 ballik shkala — ball ostida sababi"
          >
            <AiHealthScore health={data.health} />
          </DashboardSection>

          {/* 6. BASHORAT - "qayoqqa ketyapmiz". */}
          <DashboardSection
            title="Bashorat"
            hint="Keyingi oy daromadi va keyingi 7 kun davomati"
          >
            <AiForecast forecast={data.forecast} />
          </DashboardSection>

          {/* 7. JAMOA VA O'QUVCHILAR - ismlar. Bashorat "nima bo'ladi"
                ni aytadi, bu bo'lim esa "u KIMDAN keladi" ni. */}
          <DashboardSection title="Jamoa va o'quvchilar">
            {rankings?.branchRequired ? (
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-xl border bg-card p-6 text-center lg:col-span-2">
                  <p className="text-sm text-muted-foreground">
                    Reytinglar filial ichida hisoblanadi — yuqoridan filial tanlang.
                  </p>
                </div>
                <AiRecentActivity />
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                <AiTopTeachers ranking={rankings?.teacher} />
                <AiStudentsAtRisk rankings={rankings} />
                <AiRecentActivity />
              </div>
            )}
          </DashboardSection>

          {/* So'nggi kunlik hisobot - halqani yopadi: "kecha nima aniqlangan edi". */}
          {latestReport && (
            <section className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-foreground">{latestReport.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {latestReport.summary}
                  </p>
                </div>
                <Link
                  to={paths.report(latestReport._id)}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  To'liq hisobot
                </Link>
              </div>
            </section>
          )}
        </>
      )}

      <ModalWrapper name={MODAL.AI_INSIGHT_DISMISS} title="Baho noto'g'rimi?">
        <InsightDismissModal />
      </ModalWrapper>
    </div>
  );
};

export default OperationsCenterPage;
