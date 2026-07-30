import { AlertTriangle, Lightbulb, RefreshCw, TrendingUp } from "lucide-react";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import AiInsightCard from "@/shared/components/ai/AiInsightCard";
import useActionCenterQuery from "../hooks/useActionCenterQuery";
import {
  useAckInsightMutation,
  useResolveInsightMutation,
  useRecomputeMutation,
} from "../hooks/useInsightMutations";
import InsightDismissModal from "../components/modals/InsightDismissModal";

// AI ACTION CENTER - ertalabki prioritetli vazifalar ro'yxati.
//
// Uch bo'limga ajratilgan, chunki owner "nima qilishim kerak" va "nimani
// bilsam bo'ladi" ni ajratishi shart. Aralashtirilgan ro'yxat o'qilmaydi
// va bir hafta ichida e'tiborsiz qoladi.

const fmtMoney = (n) =>
  new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n || 0);

const Section = ({ title, icon: Icon, tone, items, ...handlers }) => {
  if (!items?.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={`size-4 ${tone}`} />
        {title}
        <span className="tabular-nums font-normal">({items.length})</span>
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((it) => (
          <AiInsightCard key={it._id} insight={it} {...handlers} />
        ))}
      </div>
    </section>
  );
};

const SummaryTile = ({ label, value, tone = "text-foreground" }) => (
  <div className="rounded-xl border bg-card p-4">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
  </div>
);

const ActionCenterPage = () => {
  const { data, isLoading } = useActionCenterQuery();
  const { openModal } = useModal(MODAL.AI_INSIGHT_DISMISS);

  const ack = useAckInsightMutation();
  const resolve = useResolveInsightMutation();
  const recompute = useRecomputeMutation();

  const handlers = {
    onAck: (i) => ack.mutate(i._id),
    onResolve: (i) => resolve.mutate(i._id),
    onDismiss: (i) => openModal(MODAL.AI_INSIGHT_DISMISS, i),
  };

  const summary = data?.summary;
  const isEmpty =
    !isLoading &&
    !data?.high?.length &&
    !data?.medium?.length &&
    !data?.opportunities?.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">AI vazifalar markazi</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Bugun nimaga e'tibor qaratish kerak — biznes ta'siri bo'yicha tartiblangan
          </p>
        </div>
        <button
          type="button"
          onClick={() => recompute.mutate(undefined)}
          disabled={recompute.isPending}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={`size-4 ${recompute.isPending ? "animate-spin" : ""}`}
          />
          Qayta hisoblash
        </button>
      </header>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label="Yuqori"
            value={summary.high}
            tone="text-rose-600 dark:text-rose-400"
          />
          <SummaryTile
            label="O'rta"
            value={summary.medium}
            tone="text-amber-600 dark:text-amber-400"
          />
          <SummaryTile label="Xavf ostidagi summa" value={fmtMoney(summary.impactAtRisk)} />
          <SummaryTile label="Jami vazifa" value={summary.high + summary.medium} />
        </div>
      )}

      {isLoading && (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="font-medium text-foreground">Hozircha vazifa yo'q</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Xavf signali topilmadi. Tungi hisob-kitobdan keyin ro'yxat yangilanadi.
          </p>
        </div>
      )}

      <Section
        title="Yuqori ustuvorlik"
        icon={AlertTriangle}
        tone="text-rose-600 dark:text-rose-400"
        items={data?.high}
        {...handlers}
      />
      <Section
        title="O'rta ustuvorlik"
        icon={TrendingUp}
        tone="text-amber-600 dark:text-amber-400"
        items={data?.medium}
        {...handlers}
      />
      <Section
        title="Imkoniyatlar"
        icon={Lightbulb}
        tone="text-emerald-600 dark:text-emerald-400"
        items={data?.opportunities}
        {...handlers}
      />

      <ModalWrapper name={MODAL.AI_INSIGHT_DISMISS} title="Baho noto'g'rimi?">
        <InsightDismissModal />
      </ModalWrapper>
    </div>
  );
};

export default ActionCenterPage;
