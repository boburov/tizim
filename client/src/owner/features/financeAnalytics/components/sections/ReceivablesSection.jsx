import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/shared/utils/cn";
import MetricValue from "../MetricValue";
import AnalyticsTable from "../AnalyticsTable";
import { LoadingBlock, ErrorBlock, QueryState } from "../StateBlock";
import { useReceivables, useReceivablesBy } from "../../hooks/useFinanceAnalytics";

/**
 * DEBITORLIK (o'quvchi qarzi).
 *
 * ── YOSH GURUHLARI RANGI ──
 * 60+ kun — qizil, chunki bu pul odatda undirilmaydi. Rang shkalasi
 * TAXMIN emas: guruh chegaralari serverda belgilangan va bu yerda
 * faqat ko'rsatiladi.
 *
 * ── DRILL-DOWN ──
 * Filial → yo'nalish → guruh → o'quvchi. Har daraja serverning
 * `/receivables/by/:by` endpoint'idan keladi, ya'ni jami raqamlar
 * darajalar orasida ajralib ketmaydi.
 */
const LEVELS = [
  { key: "branch", label: "Filial" },
  { key: "course", label: "Yo'nalish" },
  { key: "group", label: "Guruh" },
  { key: "student", label: "O'quvchi" },
];

const AGING = [
  { key: "notDue", label: "Muddati kelmagan", cls: "bg-muted-foreground" },
  { key: "d0_7", label: "0–7 kun", cls: "bg-success" },
  { key: "d8_30", label: "8–30 kun", cls: "bg-warning" },
  { key: "d31_60", label: "31–60 kun", cls: "bg-orange-500" },
  { key: "d60plus", label: "60+ kun", cls: "bg-destructive" },
];

const ReceivablesSection = ({ filters, onDrill }) => {
  const [level, setLevel] = useState("group");
  const navigate = useNavigate();

  const totals = useReceivables(filters);
  const rows = useReceivablesBy(level, filters);

  if (totals.isLoading) return <LoadingBlock rows={3} />;
  if (totals.isError) return <ErrorBlock error={totals.error} onRetry={totals.refetch} />;

  const d = totals.data;
  const aging = d?.aging || {};
  const agingTotal = AGING.reduce((s, a) => s + (aging[a.key] || 0), 0);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: "Kutilgan", v: d?.totals?.expected, k: "moneyShort" },
          { l: "Undirilgan", v: d?.totals?.collected, k: "moneyShort" },
          { l: "Qoldiq", v: d?.totals?.outstanding, k: "moneyShort" },
          {
            l: "Undirish darajasi", v: d?.totals?.collectionRate, k: "percent",
            empty: "Bu davrda kutilgan to'lov yo'q",
          },
        ].map((x) => (
          <div key={x.l} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{x.l}</p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              <MetricValue value={x.v} kind={x.k} emptyTitle={x.empty} />
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-foreground">Qarz yoshi</h2>
          <p className="text-xs text-muted-foreground">
            Muddat — oyning oxirgi kuni · qarzdor o'quvchilar:{" "}
            <b className="text-foreground">{d?.totals?.debtorStudents ?? "—"}</b>
          </p>
        </header>

        {agingTotal > 0 ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-full">
              {AGING.map((a) =>
                aging[a.key] ? (
                  <div
                    key={a.key}
                    className={cn("h-full", a.cls)}
                    style={{ width: `${(aging[a.key] / agingTotal) * 100}%` }}
                    title={`${a.label}: ${aging[a.key]}`}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {AGING.map((a) => (
                <div key={a.key}>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", a.cls)} />
                    <span className="text-[11px] text-muted-foreground">{a.label}</span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    <MetricValue value={aging[a.key]} kind="moneyShort" />
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Qarz yo'q</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground">Kesim bo'yicha</h2>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLevel(l.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  level === l.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </header>

        <QueryState query={rows} empty={!rows.data?.length} emptyTitle="Qarzdorlik topilmadi">
          {(list) => (
            <AnalyticsTable
              rows={list}
              defaultSort={{ key: "outstanding", dir: "desc" }}
              // O'QUVCHI darajasida qator bosilsa uning moliyaviy
              // sahifasiga o'tamiz — mavjud ERP imkoniyati.
              // O'QUVCHI: panelda uning yozuvlari ochiladi (kontekst
              // saqlanadi). To'liq moliyaviy sahifaga o'tish uchun
              // qator oxiridagi havola bor.
              onRowClick={(r) => onDrill?.({ type: level, id: r.id, name: r.name })}
              columns={[
                { key: "name", label: "Nomi" },
                { key: "expected", label: "Kutilgan", align: "right", kind: "moneyShort" },
                { key: "collected", label: "Undirilgan", align: "right", kind: "moneyShort" },
                { key: "outstanding", label: "Qoldiq", align: "right", kind: "moneyShort" },
                {
                  key: "overdue60plus", label: "60+ kun", align: "right",
                  render: (r) => (
                    <span className={cn(r.overdue60plus > 0 && "font-medium text-destructive")}>
                      <MetricValue value={r.overdue60plus} kind="moneyShort" />
                    </span>
                  ),
                },
                { key: "collectionRate", label: "Undirish", align: "right", kind: "percent" },
                ...(level === "student"
                  ? [{
                      key: "open", label: "", align: "right", sortable: false,
                      render: (r) => (
                        <button
                          type="button"
                          title="O'quvchining to'lov tarixi"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/owner/finance/student-payments/student/${r.id}`);
                          }}
                          className="ml-auto text-muted-foreground transition hover:text-primary"
                        >
                          <ExternalLink className="size-3.5" />
                        </button>
                      ),
                    }]
                  : []),
              ]}
            />
          )}
        </QueryState>
      </section>
    </div>
  );
};

export default ReceivablesSection;
