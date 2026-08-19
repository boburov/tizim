import { ArrowDownLeft, ArrowUpRight, Repeat, Landmark, Info } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { MetricValue, TrendChart, AnalyticsTable, LoadingBlock, ErrorBlock, QueryState } from "@/shared/components/analytics";
import { useDrill, DRILL_TYPES } from "@/shared/drill";
// Hisob nomlari BUTUN ILOVA uchun bitta joyda (shared/constants/finance.js):
// ilgari bu xarita shu faylda edi va tranzaksiya panelidagisidan
// farq qilardi.
import { accountKindLabel } from "@/shared/constants/finance";
import { useCashFlow, useCashTrend, useAccounts } from "../../hooks/useFinanceAnalytics";


/**
 * PUL OQIMI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * BU SAHIFANING BUTUN MAQSADI — "FOYDA ≠ PUL" FARQINI KO'RSATISH
 *
 * Shuning uchun tepada ochiq izoh turadi va uch bo'lim ATAYLAB
 * ajratilgan:
 *   OPERATSION      — biznesning o'zi ishlab topgani
 *   MOLIYALASHTIRISH — egasining puli (daromad EMAS)
 *   ICHKI           — hisoblar orasidagi ko'chirish (nettosi nol)
 *
 * Ular qo'shib yuborilsa, egasi 20 mln kiritgan oy "juda muvaffaqiyatli"
 * bo'lib ko'rinardi.
 * ═══════════════════════════════════════════════════════════════════
 */
const KIND_LABEL = {
  payment: "O'quvchi to'lovi",
  deposit_in: "Depozitga to'ldirish",
  deposit_out: "Depozitdan qaytarish",
  expense: "Chiqim",
  salary: "Maosh",
  refund: "Qaytarim",
  payment_fee: "To'lov komissiyasi",
  shift_close: "Smena farqi",
  owner_investment: "Egasi kiritdi",
  owner_withdrawal: "Egasi yechdi",
  account_transfer: "Hisoblar orasida",
  transfer_send: "Inkassatsiya (jo'natildi)",
  transfer_receive: "Inkassatsiya (qabul)",
  inter_branch: "Filiallararo",
  adjustment: "Tuzatish",
  opening: "Boshlang'ich qoldiq",
};

const FlowGroup = ({ title, icon: Icon, data, note, tone }) => (
  <div className="rounded-xl border border-border p-3">
    <div className="flex items-center gap-2">
      <Icon className={cn("size-4", tone)} />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
      <div>
        <p className="text-[11px] text-muted-foreground">Kirim</p>
        <p className="font-medium text-success">
          <MetricValue value={data?.inflow} kind="moneyShort" />
        </p>
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">Chiqim</p>
        <p className="font-medium text-destructive">
          <MetricValue value={data?.outflow} kind="moneyShort" />
        </p>
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">Sof</p>
        <p className="font-semibold text-foreground">
          <MetricValue value={data?.net} kind="moneyShort" />
        </p>
      </div>
    </div>
    {note && <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>}
    {data?.byKind?.length > 0 && (
      <ul className="mt-2 space-y-1 border-t border-border pt-2">
        {data.byKind.map((k) => (
          <li key={k.kind} className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{KIND_LABEL[k.kind] || k.kind}</span>
            <span className="tabular-nums text-foreground">
              <MetricValue value={k.net} kind="moneyShort" />
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const CashFlowSection = ({ filters }) => {
  const { openRoot } = useDrill();
  const flow = useCashFlow(filters);
  const trend = useCashTrend(filters);
  const accounts = useAccounts(filters);

  if (flow.isLoading) return <LoadingBlock rows={3} />;
  if (flow.isError) return <ErrorBlock error={flow.error} onRetry={flow.refetch} />;
  const d = flow.data;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Pul oqimi <b className="text-foreground">foyda emas</b>. Qarzga o'qiyotgan
          o'quvchi foyda beradi, pul bermaydi; egasining investitsiyasi pul beradi,
          foyda bermaydi.
        </span>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Ochilish qoldig'i</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              <MetricValue value={d?.openingBalance} kind="moneyShort" />
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Yopilish qoldig'i</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              <MetricValue value={d?.closingBalance} kind="moneyShort" />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              O'zgarish: <MetricValue value={d?.netChange} kind="moneyShort" />
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <FlowGroup title="Operatsion" icon={ArrowDownLeft} data={d?.operating} tone="text-primary" />
          <FlowGroup
            title="Moliyalashtirish" icon={ArrowUpRight} data={d?.financing}
            tone="text-warning" note={d?.financing?.note}
          />
          <FlowGroup
            title="Ichki ko'chirish" icon={Repeat} data={d?.internal}
            tone="text-muted-foreground" note={d?.internal?.note}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold text-foreground">Qoldiq dinamikasi</h2>
        <TrendChart
          query={trend}
          series={[{ key: "balance", label: "Kassa qoldig'i", type: "line", color: "hsl(var(--primary))" }]}
          emptyTitle="Bu davrda pul harakati yo'q"
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
          <Landmark className="size-4 text-muted-foreground" />
          Hisoblar
        </h2>
        <QueryState
          query={accounts}
          empty={!accounts.data?.length}
          emptyTitle="Hisob harakati yo'q"
          emptyHint="Tanlangan davrda hech qaysi hisobga pul kirmagan va chiqmagan."
        >
          {(rows) => (
            <AnalyticsTable
              rows={rows.map((r) => ({ ...r, label: accountKindLabel(r.accountKind) }))}
              rowKey={(r, i) => `${r.accountKind}-${r.branchId}-${i}`}
              defaultSort={{ key: "balance", dir: "desc" }}
              /* HISOBNI BOSISH — talab 9. Panel o'sha hisobga tegib
                 o'tgan barcha yozuvni ko'rsatadi va ulardan
                 tranzaksiya hujjatiga o'tiladi. */
              onRowClick={(r) =>
                openRoot({
                  type: DRILL_TYPES.ACCOUNT,
                  id: r.accountKind,
                  name: `${r.label}${r.branchName ? ` · ${r.branchName}` : ""}`,
                })
              }
              columns={[
                { key: "label", label: "Hisob" },
                { key: "branchName", label: "Filial" },
                { key: "inflow", label: "Kirim", align: "right", kind: "moneyShort" },
                { key: "outflow", label: "Chiqim", align: "right", kind: "moneyShort" },
                { key: "periodChange", label: "Davr o'zgarishi", align: "right", kind: "moneyShort" },
                { key: "balance", label: "Qoldiq", align: "right", kind: "moneyShort" },
              ]}
            />
          )}
        </QueryState>
      </section>
    </div>
  );
};

export default CashFlowSection;
