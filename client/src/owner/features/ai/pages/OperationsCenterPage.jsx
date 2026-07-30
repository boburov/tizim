import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Sunrise,
  TrendingUp,
} from "lucide-react";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { formatMoney } from "@/shared/utils/formatMoney";
import AiInsightCard from "@/shared/components/ai/AiInsightCard";
import useBriefingQuery from "../hooks/useBriefingQuery";
import { useLatestReportQuery } from "../hooks/useReportsQuery";
import {
  useAckInsightMutation,
  useResolveInsightMutation,
  useRecomputeMutation,
} from "../hooks/useInsightMutations";
import InsightDismissModal from "../components/modals/InsightDismissModal";
import BriefingSection from "../components/BriefingSection";

// AI OPERATSIYALAR MARKAZI - tajribali COO kabi ishlaydigan sahifa.
//
// Sahifa DOIM to'rtta savolga shu tartibda javob beradi:
//   1. Kecha nima bo'ldi?           → o'lchangan fakt
//   2. Bugun nima bo'layapti?       → holat
//   3. Keyin nima bo'lishi mumkin?  → bashorat
//   4. Hozir nima qilishim kerak?   → ustuvorlangan harakatlar
//
// TARTIB TASODIFIY EMAS (backend'dagi briefing.service.js izohiga qarang):
// fakt → holat → bashorat → harakat. Owner bashoratga faktni ko'rmasdan
// ishonmaydi, harakatga esa bashoratni ko'rmasdan kirishmaydi.
//
// Bu sahifa "vazifalar ro'yxati" EMAS - u kunning hikoyasi. To'liq
// insight ro'yxati /owner/ai/tasks da qoladi.

/** "2 soat oldin" - AI qachon o'ylagani. Owner uchun aniq soatdan muhimroq. */
const relativeUz = (dateLike) => {
  if (!dateLike) return null;
  const diff = Date.now() - new Date(dateLike).getTime();
  if (Number.isNaN(diff)) return null;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "hozirgina";
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.round(hours / 24);
  return `${days} kun oldin`;
};

const SectionSkeleton = () => (
  <div className="space-y-3">
    <div className="h-6 w-64 animate-pulse rounded bg-muted" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
      ))}
    </div>
    <div className="h-16 animate-pulse rounded-xl bg-muted/40" />
  </div>
);

const OperationsCenterPage = () => {
  const { data, isLoading, isError } = useBriefingQuery();
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

  const lastRunAt = relativeUz(data?.lastRun?.at);
  const counts = data?.now?.counts;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">
            AI operatsiyalar markazi
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            {data?.branch?.name && <span>{data.branch.name}</span>}
            {/* "AI oxirgi marta qachon o'yladi" - bu qator bo'lmasa sahifa
                yana bir statik dashboard bo'lib qoladi. */}
            {lastRunAt && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3.5" />
                Oxirgi tahlil: {lastRunAt}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/owner/ai/reports"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FileText className="size-4" />
            Hisobotlar
          </Link>
          <Link
            to="/owner/ai/tasks"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <AlertTriangle className="size-4" />
            Barcha vazifalar
          </Link>
          <button
            type="button"
            onClick={() => recompute.mutate(undefined)}
            disabled={recompute.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${recompute.isPending ? "animate-spin" : ""}`} />
            Qayta hisoblash
          </button>
        </div>
      </header>

      {/* `data.headline` ATAYLAB KO'RSATILMAYDI.
          U backend'da now + yesterday + today narration'larini BIRLASHTIRIB
          quriladi (briefing.service.js), ya'ni quyidagi uchta bo'limning
          matnini SO'ZMA-SO'Z takrorlaydi. Ekranda bir xil jumla ikki marta
          turishi sahifani "ko'p gapiradigan" qilib ko'rsatadi va owner
          ikkalasini ham o'qimay qo'yadi. Xulosa kerak bo'lsa - u
          bo'limlardan farq qiladigan matn bo'lishi kerak. */}

      {isError && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="font-medium text-foreground">Brifing yuklanmadi</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ma'lumotni olishda xatolik yuz berdi. Sahifani yangilab ko'ring.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-8">
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      )}

      {data && (
        <>
          {/* `hint` FAQAT ma'lumot tashiganda beriladi.
              Ilgari har bo'limda uslubiy izoh turardi ("O'lchangan fakt —
              oldingi kun bilan taqqoslangan"). U owner'ga emas, kod
              o'qiyotgan dasturchiga qaratilgan edi: owner raqamni
              qanday hisoblaganimizni emas, RAQAMNI ko'rgani keladi. */}
          <BriefingSection
            step="01"
            question="Kecha nima bo'ldi?"
            icon={CalendarDays}
            metrics={data.yesterday?.metrics}
            narration={data.yesterday?.narration}
          />

          <BriefingSection
            step="02"
            question="Bugun nima bo'layapti?"
            icon={Sunrise}
            metrics={data.today?.metrics}
            narration={data.today?.narration}
          >
            <TodayDetails today={data.today} />
          </BriefingSection>

          <BriefingSection
            step="03"
            question="Keyin nima bo'lishi mumkin?"
            icon={TrendingUp}
            metrics={data.next?.metrics}
            // Fallback FAQAT bashorat umuman yo'q bo'lganda ("barcha
            // filiallar" rejimi). Bashorat bor, lekin aytadigan gap yo'q
            // bo'lsa - izoh chizilmaydi, `||` esa bu ikki holatni
            // ajratmay, bekordan-bekor matn ko'rsatardi.
            narration={data.next ? data.next.narration : "Bashorat uchun filial tanlang."}
          />

          <BriefingSection
            step="04"
            question="Hozir nima qilishim kerak?"
            // Bu hint SAQLANADI - u uslubiy izoh emas, sanoq.
            hint={
              counts
                ? `${counts.high} yuqori · ${counts.medium} o'rta · ${counts.opportunities} imkoniyat`
                : undefined
            }
            icon={AlertTriangle}
            tone="text-rose-600 dark:text-rose-400"
            narration={data.now?.narration}
          >
            <ActionLists now={data.now} handlers={handlers} />
          </BriefingSection>
        </>
      )}

      {/* So'nggi kunlik hisobot - halqani yopadi: "AI kecha nima dedi". */}
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
              to={`/owner/ai/reports/${latestReport._id}`}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              To'liq hisobot
            </Link>
          </div>
        </section>
      )}

      <ModalWrapper name={MODAL.AI_INSIGHT_DISMISS} title="Baho noto'g'rimi?">
        <InsightDismissModal />
      </ModalWrapper>
    </div>
  );
};

/** Bugungi holatning tafsilotlari - ro'yxatlar, raqam emas. */
const TodayDetails = ({ today }) => {
  if (!today) return null;
  const unmarked = today.lessons?.unmarkedGroups || [];
  const absent = today.likelyAbsent || [];
  const followUps = today.followUps || [];
  if (!unmarked.length && !absent.length && !followUps.length) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <DetailList
        title="Davomat belgilanmagan"
        empty="Hammasi belgilangan"
        items={unmarked.map((g) => ({
          id: g._id,
          label: g.name,
          // Dars vaqti - o'qituvchini qaysi guruh bo'yicha chaqirishni
          // aytadi. Faqat guruh nomi bilan owner jadvalni ochishi kerak edi.
          hint: g.slots?.length ? g.slots.join(", ") : null,
        }))}
      />
      <DetailList
        title="Bugun kelmasligi mumkin"
        empty="Naqsh topilmadi"
        items={absent.map((s) => ({
          id: s.studentId,
          label: s.name,
          hint: s.hint || null,
        }))}
      />
      <DetailList
        title="Bog'lanish kerak"
        empty="Navbatda lid yo'q"
        items={followUps.map((f) => ({
          id: f._id,
          label: f.name,
          hint: f.overdue ? "muddati o'tgan" : null,
        }))}
      />
    </div>
  );
};

const DetailList = ({ title, items, empty }) => (
  <div className="rounded-xl border bg-card p-4">
    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {title}
      <span className="ml-1 tabular-nums">({items.length})</span>
    </h3>
    {items.length === 0 ? (
      <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 6).map((it) => (
          <li key={it.id} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-foreground">{it.label}</span>
            {it.hint && (
              <span className="shrink-0 text-xs text-muted-foreground">{it.hint}</span>
            )}
          </li>
        ))}
        {items.length > 6 && (
          <li className="text-xs text-muted-foreground">
            va yana {items.length - 6} ta
          </li>
        )}
      </ul>
    )}
  </div>
);

/**
 * Xavf va imkoniyat ALOHIDA ro'yxatda.
 *
 * Aralashtirilgan ro'yxatda owner imkoniyatni "yana bir muammo" deb
 * o'qiydi va ikkalasiga ham e'tibor bermay qo'yadi.
 */
const ActionLists = ({ now, handlers }) => {
  if (!now) return null;
  const risks = now.risks || [];
  const opportunities = now.opportunities || [];

  if (!risks.length && !opportunities.length) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="font-medium text-foreground">Shoshilinch vazifa yo'q</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Barcha ko'rsatkichlar normal doirada. Keyingi tahlildan so'ng ro'yxat yangilanadi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {risks.length > 0 && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400" />
            E'tibor talab qiladi
            <span className="font-normal tabular-nums">({risks.length})</span>
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {risks.map((it) => (
              <AiInsightCard key={it._id} insight={it} {...handlers} />
            ))}
          </div>
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="size-4 text-emerald-600 dark:text-emerald-400" />
            O'sish imkoniyatlari
            <span className="font-normal tabular-nums">({opportunities.length})</span>
            {now.counts?.upside > 0 && (
              <span className="font-normal text-emerald-600 dark:text-emerald-400">
                ~{formatMoney(now.counts.upside)} so'm
              </span>
            )}
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {opportunities.map((it) => (
              <AiInsightCard key={it._id} insight={it} {...handlers} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationsCenterPage;
