import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { levelStyle } from "../../utils/dashboard.utils";
import ScoreRing from "./ScoreRing";

// AI KUNLIK XULOSA - sahifaning birinchi va eng muhim bloki.
//
// BESH SONIYA QOIDASI: owner sahifani ochgach beshinchi soniyada
// uchta narsani bilishi kerak — biznes qanday (halqa), bugun nima
// muhim (matn), va nimadan boshlash kerak (tugma). Boshqa hamma narsa
// shu uchtasining tafsiloti.
//
// BITTA TO'Q TUGMA. Ikkita teng ko'rinishdagi tugma "qaysi birini
// bosay" degan pauza yaratadi va o'sha pauza owner'ning sahifadan
// chiqib ketishiga yetadi. Ikkinchi havola ATAYLAB oddiy matn
// ko'rinishida - u tanlov emas, chiqish yo'li.
//
// MATN UZUNLIGI BACKEND'DA CHEKLANGAN (uch jumla). Bu yerda uni
// qisqartirmaymiz: kesilgan jumla o'qilmagan jumladan yomonroq.

// `tasksHref` PROP: bu komponent ikki qobiqda ko'rsatiladi
// (/owner/ai va /admin/tahlil), vazifalar sahifasining manzili esa
// har birida boshqacha. Qattiq yozilganda rahbariyat qobig'idan
// bosilgan havola operatsion panelga otib yuborardi (useAiPaths).
const AiDailySummary = ({ summary, health, lastRunLabel, tasksHref = "/owner/ai/tasks" }) => {
  if (!summary) return null;

  const style = levelStyle(summary.level);
  const overall = health?.overall;

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                style.chip,
              )}
            >
              <span className={cn("size-1.5 rounded-full", style.solid)} />
              {style.label}
            </span>

            {/* "Tahlil oxirgi marta qachon yangilandi" - bu qator bo'lmasa
                xulosa statik matnga aylanadi va owner uning bugungi
                ekaniga ishonmaydi. */}
            {lastRunLabel && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" />
                Tizim tahlili: {lastRunLabel}
              </span>
            )}
          </div>

          <p className="mt-3.5 text-pretty text-lg font-medium leading-relaxed text-foreground sm:text-xl sm:leading-relaxed">
            {summary.text}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            {summary.primaryAction?.href && (
              <Link
                to={summary.primaryAction.href}
                className="group inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {summary.primaryAction.label}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
            <Link
              to={tasksHref}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Barcha vazifalar
            </Link>
          </div>
        </div>

        {/* SALOMATLIK HALQASI - xulosa matnining raqamli tasdig'i.
            Beshta yo'nalish tafsiloti pastdagi bo'limda: bu yerda
            faqat "umumiy holat" kerak. */}
        {overall && (
          <div className="flex items-center gap-4 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <ScoreRing score={overall.score} label="ball" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Biznes salomatligi</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {overall.covered < overall.total
                  ? `${overall.total} yo'nalishdan ${overall.covered} tasi hisoblandi`
                  : "Moliya, o'quvchilar, o'qituvchilar, marketing va sotuv"}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default AiDailySummary;
