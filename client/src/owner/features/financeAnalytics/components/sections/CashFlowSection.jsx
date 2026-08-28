import { ArrowDownLeft, ArrowUpRight, Repeat, Landmark } from "lucide-react";

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
 * TO'RT SAVOLGA JAVOB, SHU TARTIBDA
 *
 *   Qancha kirdi / chiqdi / sof qancha?  → tepadagi uch raqam
 *   Vaqt bo'yicha qanday o'zgardi?        → kirim/chiqim grafigi
 *   Pul qayerdan qayerga ketdi?           → oqim tarkibi
 *   Hozir qaysi hisobda qancha bor?       → hisoblar jadvali
 *
 * ── UCH BO'LIM ATAYLAB AJRATILGAN ──
 *   OPERATSION       — biznesning o'zi ishlab topgani
 *   MOLIYALASHTIRISH — egasining puli (daromad EMAS)
 *   ICHKI            — hisoblar orasidagi ko'chirish (nettosi nol)
 *
 * Ular qo'shib yuborilsa, egasi 20 mln kiritgan oy "juda muvaffaqiyatli"
 * bo'lib ko'rinardi. Aynan shu sababdan tepadagi uchlik ham FAQAT
 * operatsion bo'limdan olinadi.
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
      {/* ── UCH RAQAM, ENG TEPADA ──
          "Qancha kirdi, qancha chiqdi, qancha qoldi" — pul oqimi
          sahifasining butun mazmuni shu. Ular OPERATSION bo'limdan
          olinadi: egasining puli va ichki ko'chirish shu yerga
          qo'shilsa, 20 mln kiritilgan oy "juda muvaffaqiyatli"
          bo'lib ko'rinardi. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Kirim</p>
          <p className="mt-1 text-xl font-semibold text-success">
            <MetricValue value={d?.operating?.inflow} kind="moneyShort" />
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Chiqim</p>
          <p className="mt-1 text-xl font-semibold text-destructive">
            <MetricValue value={d?.operating?.outflow} kind="moneyShort" />
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Sof oqim (operatsion)</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            <MetricValue value={d?.operating?.net} kind="moneyShort" />
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Yopilish qoldig'i</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            <MetricValue value={d?.closingBalance} kind="moneyShort" />
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Ochilish: <MetricValue value={d?.openingBalance} kind="moneyShort" />
          </p>
        </div>
      </section>

      {/* ── KIRIM va CHIQIM DINAMIKASI ──
          Ustunlar — davr ichidagi harakat, chiziq — yig'ilib boruvchi
          qoldiq. Uchalasi BITTA so'rovdan keladi (`/cash-flow/trend`),
          ya'ni ustun bilan chiziq hech qachon bir-biriga zid bo'lmaydi.
          Ichki ko'chirish ustunlarga KIRMAYDI — u ikkala tomonda ham
          ko'rinib, ikkalasini ham shishirardi (server izohiga qarang). */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold text-foreground">Kirim va chiqim</h2>
        <TrendChart
          query={trend}
          series={[
            { key: "inflow", label: "Kirim", type: "bar", color: "hsl(var(--success))" },
            { key: "outflow", label: "Chiqim", type: "bar", color: "hsl(var(--destructive))" },
            { key: "balance", label: "Qoldiq", type: "line", color: "hsl(var(--primary))" },
          ]}
          emptyTitle="Bu davrda pul harakati yo'q"
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-foreground">Oqim tarkibi</h2>
          {/* Bir qatorlik izoh — bu YO'RIQNOMA emas, moliyaviy
              chalkashlikning oldini olish: egasining puli daromad
              emas va u alohida bo'limda turishi shart. */}
          <p className="text-xs text-muted-foreground">
            Pul oqimi foyda emas — egasining puli va ichki ko'chirish alohida
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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
