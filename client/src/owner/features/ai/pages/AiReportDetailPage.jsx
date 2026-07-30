import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { formatDateUz } from "@/shared/utils/formatDate";
import AiMetricTile from "../components/AiMetricTile";
import { useReportQuery } from "../hooks/useReportsQuery";

// BITTA HISOBOT - bo'limlar tartibi MA'NOGA EGA.
//
// Bo'limlar backend'da massiv sifatida saqlanadi (obyekt emas) aynan
// shuning uchun: owner yuqoridan pastga o'qiydi va moliya davomatdan
// oldin turishi kerak. Bu yerda ularni qayta saralash MUMKIN EMAS.

const AiReportDetailPage = () => {
  const { id } = useParams();
  const { data, isLoading, isError } = useReportQuery(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted/50" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="font-medium text-foreground">Hisobot topilmadi</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <header>
        <h1 className="text-xl font-semibold text-foreground">{data.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatDateUz(data.periodStart)} — {formatDateUz(data.periodEnd)}
        </p>
      </header>

      {/* XULOSA - ko'p owner faqat shuni o'qiydi. */}
      {data.summary && (
        <div className="rounded-xl border bg-muted/40 p-5">
          <p className="text-sm leading-relaxed text-foreground">{data.summary}</p>
        </div>
      )}

      <div className="space-y-8">
        {(data.sections || []).map((s) => (
          <section key={s.key} className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">{s.title}</h2>
              {s.headline && (
                <p className="mt-0.5 text-sm text-muted-foreground">{s.headline}</p>
              )}
            </div>

            {s.metrics?.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {s.metrics.map((m) => (
                  <AiMetricTile key={m.key} metric={m} />
                ))}
              </div>
            )}

            {/* Har bir bo'lim raqamlaridan KEYIN AI izohi - "hech qachon
                faqat xom statistika ko'rsatilmasin" qoidasi. */}
            {s.narration && (
              <div className="rounded-xl border border-l-2 border-l-primary bg-card p-4">
                <p className="text-sm leading-relaxed text-foreground">{s.narration}</p>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};

const BackLink = () => (
  <Link
    to="/owner/ai/reports"
    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    <ArrowLeft className="size-4" />
    Hisobotlar
  </Link>
);

export default AiReportDetailPage;
