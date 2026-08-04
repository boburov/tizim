import { Link } from "react-router-dom";
import { ChevronRight, FileText } from "lucide-react";
import useObjectState from "@/shared/hooks/useObjectState";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { useReportsQuery } from "../hooks/useReportsQuery";

// AI HISOBOTLAR - kunlik / haftalik / oylik.
//
// Hisobot O'ZGARMAYDI: u tuzilgan paytdagi snapshot (aiReport.model.js
// dagi izohga qarang). Shuning uchun bu sahifa arxiv - "o'sha kuni AI
// nima deganini" o'qish joyi, jonli dashboard emas.

const PERIODS = [
  { key: "daily", label: "Kunlik" },
  { key: "weekly", label: "Haftalik" },
  { key: "monthly", label: "Oylik" },
];

const AiReportsPage = () => {
  const { period, page, setField, setFields } = useObjectState({
    period: "daily",
    page: 1,
  });

  const { data, isLoading } = useReportsQuery({ period, page, limit: 20 });
  const items = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Hisobotlar</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Har kuni, hafta va oy oxirida avtomatik tuziladi
        </p>
      </header>

      {/* Davr tanlash - sahifa 1 ga QAYTADI, aks holda 3-sahifada turgan
          owner boshqa davrga o'tganda bo'sh ro'yxat ko'rardi. */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setFields({ period: p.key, page: 1 })}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              period === p.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">Hisobot hali tuzilmagan</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Kunlik hisobot har kuni ertalab 07:00 da avtomatik tayyorlanadi.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((r) => (
          <Link
            key={r._id}
            to={`/owner/ai/reports/${r._id}`}
            className="block rounded-xl border bg-card p-5 transition-colors hover:bg-accent/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground">{r.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {r.summary}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {r.insightSnapshot?.high > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      {r.insightSnapshot.high} yuqori ustuvorlik
                    </span>
                  )}
                  {r.insightSnapshot?.opportunities > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {r.insightSnapshot.opportunities} imkoniyat
                    </span>
                  )}
                  {r.insightSnapshot?.impactAtRisk > 0 && (
                    <span>{formatMoney(r.insightSnapshot.impactAtRisk)} xavf ostida</span>
                  )}
                </div>
              </div>
              <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>

      {meta?.pages > 1 && (
        <Pagination
          currentPage={meta.page}
          totalPages={meta.pages}
          hasNextPage={meta.page < meta.pages}
          hasPrevPage={meta.page > 1}
          onPageChange={(p) => setField("page", p)}
        />
      )}
    </div>
  );
};

export default AiReportsPage;
