import { useState } from "react";
import { CreditCard, Undo2, Tag } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import MetricValue from "../MetricValue";
import ComparisonBadge from "../ComparisonBadge";
import TrendChart from "../TrendChart";
import AnalyticsTable from "../AnalyticsTable";
import { QueryState } from "../StateBlock";
import {
  useRevenueTrend, useRevenueBy, usePaymentMethods,
  useRefundAnalytics, useDiscountAnalytics,
} from "../../hooks/useFinanceAnalytics";

/**
 * DAROMAD BO'LIMI.
 *
 * Barcha raqam serverdan — bu yerda birorta yig'indi hisoblanmaydi.
 * Ilgari shunday sahifalar `items.reduce(...)` bilan o'z "jami"sini
 * chiqarardi va u backend jamisidan farq qilardi (chunki backend
 * qaytarim va ichki o'tkazmani boshqacha hisoblaydi). Endi jami ham
 * serverdan keladi.
 */
const BREAKDOWNS = [
  { key: "course", label: "Yo'nalish" },
  { key: "teacher", label: "O'qituvchi" },
  { key: "group", label: "Guruh" },
  { key: "branch", label: "Filial" },
];

const RevenueSection = ({ filters, onFilter, onDrill }) => {
  const [by, setBy] = useState("course");

  const trend = useRevenueTrend(filters);
  const breakdown = useRevenueBy(by, filters);
  const methods = usePaymentMethods(filters);
  const refunds = useRefundAnalytics(filters);
  const discounts = useDiscountAnalytics(filters);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold text-foreground">Daromad dinamikasi</h2>
        <TrendChart
          query={trend}
          series={[
            { key: "revenue", label: "Daromad (netto)", color: "hsl(var(--primary))" },
            { key: "refunds", label: "Qaytarim", type: "line", color: "hsl(var(--destructive))" },
          ]}
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground">Daromad kesimi</h2>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {BREAKDOWNS.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBy(b.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  by === b.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        </header>

        <QueryState
          query={breakdown}
          empty={!breakdown.data?.length}
          emptyTitle="Bu davrda daromad yozuvi yo'q"
        >
          {(rows) => (
            <AnalyticsTable
              rows={rows}
              defaultSort={{ key: "revenue", dir: "desc" }}
              onRowClick={
                by === "course" || by === "teacher" || by === "group"
                  ? (r) => onDrill?.({ type: by, id: r.id, name: r.name })
                  : undefined
              }
              columns={[
                { key: "name", label: "Nomi", render: (r) => r.name || <span className="text-muted-foreground">Aniqlanmagan</span> },
                { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                { key: "gross", label: "Brutto", align: "right", kind: "moneyShort" },
                { key: "refunds", label: "Qaytarim", align: "right", kind: "moneyShort" },
                { key: "sharePercent", label: "Ulush", align: "right", kind: "percent" },
              ]}
            />
          )}
        </QueryState>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <CreditCard className="size-4 text-muted-foreground" />
            To'lov kanallari
          </h2>
          <QueryState
            query={methods}
            empty={!methods.data?.length}
            emptyTitle="Bu davrda to'lov yo'q"
          >
            {(rows) => (
              <AnalyticsTable
                rows={rows}
                rowKey={(r) => r.method}
                defaultSort={{ key: "gross", dir: "desc" }}
                onRowClick={(r) => onDrill?.({ type: "paymentMethod", id: r.method, name: r.method })}
                columns={[
                  { key: "method", label: "Kanal" },
                  { key: "count", label: "Soni", align: "right", kind: "number" },
                  { key: "gross", label: "Brutto", align: "right", kind: "moneyShort" },
                  { key: "fees", label: "Komissiya", align: "right", kind: "moneyShort" },
                  { key: "net", label: "Netto", align: "right", kind: "moneyShort" },
                ]}
              />
            )}
          </QueryState>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <Undo2 className="size-4 text-muted-foreground" />
              Qaytarimlar
            </h2>
            {refunds.data && (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Summa</p>
                  <p className="mt-1 font-semibold">
                    <MetricValue value={refunds.data.amount?.current} kind="moneyShort" />
                  </p>
                  <ComparisonBadge compare={refunds.data.amount} invert className="mt-1" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Soni</p>
                  <p className="mt-1 font-semibold">
                    <MetricValue value={refunds.data.count?.current} kind="number" />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground" title={refunds.data.refundRatePercent?.formula}>
                    Daraja
                  </p>
                  <p className="mt-1 font-semibold">
                    <MetricValue
                      value={refunds.data.refundRatePercent?.current}
                      kind="percent"
                      emptyTitle="Brutto daromad nol"
                    />
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <Tag className="size-4 text-muted-foreground" />
              Chegirmalar
            </h2>
            {discounts.data && (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Summa</p>
                  <p className="mt-1 font-semibold">
                    <MetricValue value={discounts.data.total?.current} kind="moneyShort" />
                  </p>
                  <ComparisonBadge compare={discounts.data.total} invert className="mt-1" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground" title={discounts.data.discountRatePercent?.formula}>
                    Daraja
                  </p>
                  <p className="mt-1 font-semibold">
                    <MetricValue value={discounts.data.discountRatePercent?.current} kind="percent" />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">O'quvchilar</p>
                  <p className="mt-1 font-semibold">
                    <MetricValue value={discounts.data.discountedStudents} kind="number" />
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default RevenueSection;
