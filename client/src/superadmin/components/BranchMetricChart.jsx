// React
import { useMemo } from "react";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, LabelList,
} from "recharts";

// Components
import Select from "@/shared/components/ui/select/Select";
import { QueryState } from "@/shared/components/analytics";

// Utils
import { cn } from "@/shared/utils/cn";
import {
  METRICS,
  MONTH_LABELS,
  ALL_BRANCHES_VALUE,
  findMetric,
  formatMetric,
  formatMetricShort,
} from "./branchMetrics";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FILIAL KESIMIDAGI GRAFIK — BOSH EKRANNING MARKAZI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NIMA O'RNIGA KELDI VA NEGA ──
 *
 * Ilgari bu yerda OLTITA KARTA turardi: "Daromad 6 900 000 so'm",
 * "Chiqim 19 322 000 so'm"... Har biri to'g'ri son edi, lekin ularning
 * hech biri QARORGA olib bormasdi. Rahbar "chiqim daromaddan uch
 * barobar ko'p" ekanini ko'rardi-yu, KEYINGI savolga — "qaysi
 * filialda?" — javob berish uchun boshqa sahifaga o'tishi kerak edi.
 *
 * Oltita ko'rsatkichning O'ZI qoldi, lekin endi ular FILIAL KESIMIDA
 * ko'rsatiladi. "6.9 mln daromad" o'rniga "DEMO 4.2 mln · Chilonzor
 * 2.1 mln · Yunusobod 0.6 mln" — bu allaqachon qaror uchun yetarli.
 *
 * ── IKKI TANLOV, IKKI SAVOL ──
 *
 *   Filial  = "kimni ko'rsatay?"   → hammasi (taqqoslash) yoki bittasi
 *   Ko'rsatkich = "nimani?"        → oltitadan biri
 *
 * ⚠ IKKI REJIM, BITTA GRAFIK. "Barcha filiallar" da ustunlar —
 * FILIALLAR (kim ko'proq keltirdi). Bitta filial tanlanganda esa
 * ustunlar — OYLAR (u qanday o'zgaryapti). Bu shunchaki filtr emas:
 * bitta filial tanlanganda "taqqoslash" degan savol yo'qoladi va uning
 * o'rniga "dinamika" savoli paydo bo'ladi. Bitta ustunli grafik
 * chizish esa hech kimga hech narsa bermasdi.
 *
 * ── HOLAT TASHQARIDA ──
 * Tanlov `AsosiyPage` da turadi va so'rov filtriga tushadi. Shu sababli
 * "tanlov o'zgarsa grafik yangilanadi" uchun alohida effekt YO'Q:
 * `branchId` TanStack kalitining bir qismi, ya'ni yangi tanlov = yangi
 * kalit = yangi so'rov (va eskisi keshda qoladi — orqaga qaytish oniy).
 *
 * ── RANG BITTA ──
 * Har ko'rsatkichga alohida rang berish mumkin edi, lekin "chiqim
 * qizil" degan tanlov ustunni YOMON deb belgilardi — holbuki u
 * shunchaki son (kodbazadagi mavjud qoida: `CashflowBars` izohi).
 * Shuning uchun hamma ustun `primary`, MANFIY qiymat esa `destructive`:
 * bu baho emas, ISHORA — minus kassa haqiqatan boshqa holat.
 */

/**
 * TOOLTIP — o'z komponenti, `contentStyle` emas.
 *
 * Sabab: ulush foizi ("bu filial jamining 62%") tooltipda ko'rinishi
 * kerak, standart tooltip esa faqat `dataKey` qiymatini biladi.
 * Ulush AYNAN shu yerda hisoblanadi va boshqa hech qayerda
 * saqlanmaydi — ya'ni ikkinchi "haqiqat manbai" paydo bo'lmaydi.
 */
const ChartTooltip = ({ active, payload, metric, total }) => {
  // ⚠ `total` BITTA FILIAL rejimida ATAYLAB `null` uzatiladi: u yerda
  // ustunlar — OYLAR, va bir oyni butun tashkilot yig'indisiga nisbatan
  // "ulush" deb ko'rsatish ma'nosiz son bo'lardi.
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const value = row.value;
  const share =
    metric.additive && typeof value === "number" && total > 0
      ? Math.round((value / total) * 1000) / 10
      : null;

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-popover-foreground">{row.fullLabel}</p>
      <p className="mt-1 tabular-nums text-popover-foreground">
        {formatMetric(value, metric.kind)}
      </p>
      {share !== null && (
        <p className="mt-0.5 text-muted-foreground">Jamidagi ulushi: {share}%</p>
      )}
      {value === null && metric.kind === "percent" && (
        <p className="mt-0.5 text-muted-foreground">
          Daromad yo&apos;q — marja hisoblanmaydi
        </p>
      )}
    </div>
  );
};

const BranchMetricChart = ({
  query,
  metricKey,
  onMetricChange,
  branchId,
  onBranchChange,
  /**
   * Ustun bosilganda — FAQAT taqqoslash rejimida (ustun = filial).
   * Oy ustuni bosilmaydi: "2026-avgust" uchun ochiladigan filial yo'q,
   * bosilib hech narsa qilmaydigan element esa buzuq tuyuladi.
   */
  onBranchOpen,
}) => {
  const metric = findMetric(metricKey);
  const data = query.data;
  const isSingle = branchId !== ALL_BRANCHES_VALUE;

  const branchOptions = useMemo(
    () => [
      { value: ALL_BRANCHES_VALUE, label: "Barcha filiallar" },
      ...(data?.items || []).map((b) => ({ value: b.branchId, label: b.name })),
    ],
    [data],
  );

  /**
   * GRAFIK QATORLARI — ikki rejim, bitta shakl.
   *
   * Ikkalasi ham `{ id, label, fullLabel, value }` beradi, ya'ni
   * quyidagi JSX rejimni umuman bilmaydi. Aks holda `BarChart` ikki
   * marta, ikki xil prop bilan yozilardi va ular vaqt o'tib ajralib
   * ketardi.
   *
   * ⚠ `null` SAQLANADI, `0` GA AYLANTIRILMAYDI. Daromadsiz filialning
   * marjasi — "hisoblab bo'lmaydi", "0%" EMAS. Recharts `null` ustunni
   * chizmaydi va bu aynan kerakli xatti-harakat.
   */
  const rows = useMemo(() => {
    if (!data) return [];

    if (isSingle) {
      return (data.trend || []).map((t) => ({
        id: t.key,
        label: MONTH_LABELS[t.month - 1],
        fullLabel: `${MONTH_LABELS[t.month - 1]} ${t.year}`,
        value: t[metric.key],
      }));
    }

    const items = [...(data.items || [])].map((b) => ({
      id: b.branchId,
      label: b.name,
      fullLabel: b.name,
      value: b[metric.key],
    }));

    // KATTADAN KICHIKKA. "Qaysi filial ko'proq keltirdi" degan savolga
    // javob birinchi ustun bo'lishi kerak — alifbo tartibida turgan
    // ro'yxatda uni ko'z bilan qidirishga to'g'ri kelardi.
    // `null` (o'lchanmagan) HAR DOIM oxirida.
    return items.sort((a, b) => {
      const av = a.value;
      const bv = b.value;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return bv - av;
    });
  }, [data, isSingle, metric.key]);

  const total = data?.totals?.[metric.key];
  const selectedBranch = (data?.items || []).find((b) => b.branchId === branchId);

  // SARLAVHADAGI RAQAM: tanlovga qarab tashkilot yoki filial qiymati.
  const headline = isSingle ? selectedBranch?.[metric.key] : total;

  /**
   * "ENG KATTASI" — grafikning bir jumlalik xulosasi.
   *
   * Foydali qism aynan shu: grafikka qarab eng baland ustunni topish
   * bir soniya oladi, lekin uning ULUSHI ko'rinmaydi. "62%" va "31%"
   * butunlay boshqa xulosalar — birinchisi bitta filialga bog'liqlik,
   * ikkinchisi sog'lom taqsimot.
   */
  const leader = useMemo(() => {
    if (isSingle || !rows.length) return null;
    const top = rows[0];
    if (top.value === null || top.value === undefined) return null;
    if (metric.additive && total > 0) {
      return { name: top.fullLabel, note: `${Math.round((top.value / total) * 100)}% ulush` };
    }
    return { name: top.fullLabel, note: formatMetric(top.value, metric.kind) };
  }, [rows, isSingle, metric, total]);

  // Ustunlar siqilib ketmasin: ko'p filialda grafik O'Z konteynerida
  // suriladi, sahifaning o'zi gorizontal scroll bo'lmaydi.
  const minWidth = Math.max(480, rows.length * 84);
  const hasNegative = rows.some((r) => typeof r.value === "number" && r.value < 0);
  const canOpen = !isSingle && typeof onBranchOpen === "function";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* ── SARLAVHA: raqam chapda, boshqaruv o'ngda ── */}
      <header className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <metric.icon className="size-4" />
            <span>{metric.label}</span>
            {isSingle && selectedBranch && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{selectedBranch.name}</span>
              </>
            )}
          </div>

          <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
            {formatMetric(headline, metric.kind)}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {metric.hint}
            {canOpen && " · ustunni bosing"}
            {leader && (
              <>
                {" · "}
                <span className="text-foreground">Eng kattasi: {leader.name}</span>
                {` (${leader.note})`}
              </>
            )}
          </p>
        </div>

        {/* TANLAGICHLAR — YORLIQ BILAN.
            Yorliqsiz ikkita bir xil ko'rinishdagi tanlagich yonma-yon
            turardi va "Daromad" yozuvi ko'rsatkich nomimi yoki
            filialning turimi — faqat ochib ko'rgandan keyin ma'lum
            bo'lardi. Ikki so'zlik yorliq bu ikkilanishni butunlay
            yo'q qiladi. */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <label className="min-w-[9.5rem] flex-1 sm:flex-none">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Filial
            </span>
            <Select
              name="branch"
              value={branchId}
              onChange={onBranchChange}
              options={branchOptions}
              triggerClassName="h-9 text-sm"
            />
          </label>
          <label className="min-w-[9.5rem] flex-1 sm:flex-none">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Ko&apos;rsatkich
            </span>
            <Select
              name="metric"
              value={metric.key}
              onChange={onMetricChange}
              options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
              triggerClassName="h-9 text-sm"
            />
          </label>
        </div>
      </header>

      {/* ── GRAFIK ── */}
      <div className="p-2 sm:p-4">
        <QueryState
          query={query}
          empty={!rows.length}
          emptyTitle={
            isSingle ? "Bu filialda yozuv yo'q" : "Filial ma'lumoti yo'q"
          }
          emptyHint="Tanlangan davrda moliyaviy harakat qayd etilmagan."
          loadingRows={4}
        >
          {() => (
            <div className="hidden-scrollbar overflow-x-auto">
              <div style={{ minWidth: isSingle ? 560 : minWidth }}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={rows}
                    margin={{ top: 32, right: 16, bottom: 4, left: 4 }}
                  >
                    {/* Faqat gorizontal chiziqlar */}
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      height={38}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) =>
                        String(v).length > 12 ? `${String(v).slice(0, 11)}…` : v
                      }
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      // O'quvchi soni BUTUN son: "2,5 o'quvchi" degan
                      // o'q belgisi hech narsani anglatmaydi.
                      allowDecimals={metric.kind !== "count"}
                      width={metric.kind === "money" ? 68 : 44}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => formatMetricShort(v, metric.kind)}
                    />
                    <Tooltip
                      cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 4" }}
                      content={
                        <ChartTooltip metric={metric} total={isSingle ? null : total} />
                      }
                    />
                    {/* Nol chizig'i FAQAT manfiy qiymat bo'lganda: aks
                        holda u X o'qi bilan ustma-ust tushib, grafikni
                        qalinlashtirardi. */}
                    {hasNegative && (
                      <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      activeDot={{ 
                        r: 6, 
                        cursor: canOpen ? "pointer" : undefined,
                        onClick: canOpen ? (_, payload) => onBranchOpen(payload?.payload) : undefined
                      }}
                      dot={(props) => {
                        const { cx, cy, payload, key, value } = props;
                        if (value === null || cx == null || cy == null) return null;
                        const isNegative = typeof value === "number" && value < 0;
                        return (
                          <circle
                            key={key}
                            cx={cx}
                            cy={cy}
                            r={4.5}
                            strokeWidth={2.5}
                            stroke={isNegative ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                            fill="hsl(var(--background))"
                            cursor={canOpen ? "pointer" : undefined}
                            onClick={canOpen ? () => onBranchOpen(payload) : undefined}
                          />
                        );
                      }}
                    >
                      {/* Yorliq faqat ma'lumot KAM bo'lganda: 12 ta nuqtada
                          ular ustma-ust tushib o'qilmay qolardi. */}
                      {rows.length <= 8 && (
                        <LabelList
                          dataKey="value"
                          position="top"
                          offset={12}
                          formatter={(v) => formatMetricShort(v, metric.kind)}
                          style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                        />
                      )}
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </QueryState>
      </div>

      {/* ── KO'RSATKICHLAR QATORI ──
          Oltita karta YO'QOLMADI — ular shu yerga yig'ildi. Ikki ish
          bajaradi: (1) qolgan beshta ko'rsatkich ko'z oldida turadi,
          (2) tanlagichning ikkinchi, tezroq yo'li. Tanlangan yozuv
          yuqoridagi `Select` bilan BIR XIL holatni ko'rsatadi, ya'ni
          ikki boshqaruv bir-biriga qarama-qarshi tusha olmaydi. */}
      {/* ⚠ AJRATGICH `gap-px` + fon orqali, `divide-x` BILAN EMAS.
          `divide-x` bolalarga DOM tartibi bo'yicha chap chegara qo'yadi
          va u grid QAYERGA o'ralganini bilmaydi: ikki ustunli ekranda
          har yangi qatorning BIRINCHI yozug'i ham chap chiziq olib,
          panel chetidan tashqariga osilib turardi. `gap-px` esa
          chegarani gridning O'ZI hisoblaydi — 2, 3 va 6 ustunda ham
          to'g'ri. */}
      <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {METRICS.map((m) => {
          const active = m.key === metric.key;
          const value = isSingle ? selectedBranch?.[m.key] : data?.totals?.[m.key];
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onMetricChange(m.key)}
              aria-pressed={active}
              className={cn(
                "group relative min-w-0 px-3 py-3 text-left transition-colors sm:px-4",
                active ? "bg-muted" : "bg-card hover:bg-muted/40",
              )}
            >
              {/* Faol yozuv tepasida ingichka chiziq — rang bilan emas,
                  SHAKL bilan ajratiladi: rangni ko'rmaydigan odam ham
                  qaysi ko'rsatkich chizilayotganini biladi. */}
              <span
                className={cn(
                  "absolute inset-x-0 top-0 h-0.5 transition-opacity",
                  active ? "bg-primary opacity-100" : "opacity-0",
                )}
              />
              <span
                className={cn(
                  "flex items-center gap-1.5 text-[11px] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <m.icon className="size-3.5 shrink-0" />
                <span className="truncate">{m.label}</span>
              </span>
              <span className="mt-1 block truncate text-sm font-semibold tabular-nums text-foreground">
                {query.isLoading ? "…" : formatMetric(value, m.kind)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default BranchMetricChart;
