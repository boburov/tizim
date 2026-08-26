// React
import { useMemo } from "react";

// Charts
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, LabelList,
} from "recharts";

// Components
import Select from "@/shared/components/ui/select/Select";
import { QueryState } from "@/shared/components/analytics";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";
import {
  METRICS,
  PERIODS,
  MONTH_LABELS,
  ALL_BRANCHES_VALUE,
  findMetric,
  findPeriod,
  periodRangeLabel,
  formatMetric,
  formatMetricShort,
} from "./branchMetrics";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FILIAL KO'RSATKICHLARI — BOSH EKRAN GRAFIGI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── RANGLAR TANLANMAGAN, O'LCHANGAN ──
 * `--chart-1..8` — rang ko'rligi ajratishi (protan/deutan), yorqinlik
 * oralig'i, xroma pol va sirtga nisbatan kontrast bo'yicha tekshirilgan
 * (`styles/index.css` dagi izoh). Ilgari bu yerda qo'lda yozilgan
 * ro'yxat turardi va uning BIRINCHI elementi `--primary` edi —
 * ya'ni BREND rangi. U `.env` dan keladi va hozirgi qiymati qorong'u
 * rejimda `#d9d9d9`: xromasi NOL, kulrang. Birinchi filial chizig'i
 * qorong'u rejimda identifikatorlik vazifasini umuman bajarmasdi.
 *
 * ⚠ TARTIB AYLANTIRILMAYDI. `i % LENGTH` naqshi olib tashlandi:
 * to'qqizinchi filial birinchisining rangini olardi va ikkalasi
 * legendada bir xil ko'rinardi. Endi ro'yxat SAKKIZTA bilan
 * cheklanadi va nechtasi ko'rsatilmagani OCHIQ yoziladi — jimgina
 * kesish "hammasi shu yerda" degan yolg'on taassurot beradi.
 *
 * ── EGRI CHIZIQ `monotone`, `basis` EMAS ──
 * `basis` chiroyliroq oqadi, lekin u nuqtalardan O'TMAYDI va
 * cho'qqilarni haqiqiy qiymatdan yuqoriroq chizadi. Rahbariyat
 * ekranida bu "eng yuqori daromad qancha edi" degan savolga
 * NOTO'G'RI javob berardi. `monotone` silliq, lekin hech qachon
 * ma'lumotdan tashqariga chiqmaydi.
 *
 * ── MANFIY QIYMAT RANG BILAN EMAS, JOY BILAN ──
 * Ilgari manfiy nuqta QIZIL doira bilan belgilanardi. Endi u nol
 * chizig'idan PASTDA turadi va shu bilan ko'rinadi. Ikki sabab:
 * (1) qizil — holat rangi (yomon/xato) va uni seriya belgisi sifatida
 * ishlatish uning ma'nosini yeydi; (2) joylashuv rangdan kuchliroq
 * signal va u rang ko'rligi ostida ham yo'qolmaydi. Nol chizig'i
 * manfiy qiymat bo'lganda avtomatik chiziladi (`hasNegative`).
 *
 * ── NUQTA HAR JOYDA EMAS, CHO'QQIDA ──
 * Har nuqtaga belgi qo'yilsa 12 oy × 8 filial = 96 ta doira bo'lardi
 * va ular chiziqni yeb qo'yardi. Belgi FAQAT har bir chiziqning eng
 * yuqori nuqtasida — "eng yaxshi oy qaysi" degan savol shu bilan
 * javob topadi. Qolgan qiymatlar hover va o'q belgilarida.
 *
 * ── LEGENDA MAJBURIY ──
 * Ikki va undan ko'p chiziq bo'lsa legenda DOIMO chiziladi: rangni
 * yodda tutish talab qilinmasligi kerak. U ayni paytda yorug'
 * rejimdagi och ranglar (akva/sariq/magenta sirtga nisbatan 3:1 dan
 * past) uchun "relief" vazifasini ham bajaradi — chiziqni rangidan
 * emas, nomidan tanib olish mumkin.
 */

/** ⚠ AYLANTIRILMAYDI — modul izohiga qarang. */
const SERIES_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
];
const MAX_SERIES = SERIES_COLORS.length;

const ChartTooltip = ({ active, payload, metric, isSingle }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="min-w-[168px] rounded-2xl border border-border bg-popover px-3.5 py-2.5 text-xs shadow-lg">
      <p className="mb-2 font-medium text-popover-foreground">{row.fullLabel}</p>

      {isSingle ? (
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ background: SERIES_COLORS[0] }}
          />
          <span className="flex-1 text-muted-foreground">Qiymat</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatMetric(row.value, metric.kind)}
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Eng kattasi tepada — ko'z ro'yxatni yuqoridan o'qiydi. */}
          {[...payload]
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .map((entry) => {
              const val = entry.value;
              if (val === null || val === undefined) return null;
              const share =
                metric.additive && typeof val === "number" && row.total > 0
                  ? Math.round((val / row.total) * 1000) / 10
                  : null;
              return (
                <div key={entry.dataKey} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="max-w-[128px] truncate text-muted-foreground">
                    {entry.name}
                  </span>
                  <span className="ml-auto font-medium tabular-nums text-foreground">
                    {formatMetric(val, metric.kind)}
                    {share !== null && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        ({share}%)
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
        </div>
      )}

      {isSingle && row.value === null && metric.kind === "percent" && (
        <p className="mt-2 text-muted-foreground">
          Daromad yo&apos;q — marja hisoblanmaydi
        </p>
      )}
    </div>
  );
};

/**
 * CHO'QQI BELGISI.
 *
 * ⚠ HALQA SIRT RANGIDA, chegara emas. Belgi chiziqni kesib o'tganda
 * yoki ikki chiziq bir joyda uchrashganda u shu halqa tufayli
 * o'qiladi — atrofiga chegara chizish esa ma'lumot bo'lmagan siyoh
 * qo'shardi.
 */
const peakDot = (color, peakIndex) => (props) => {
  const { cx, cy, index, value, key } = props;
  if (index !== peakIndex || value === null || cx == null || cy == null) return null;
  return (
    <circle
      key={key}
      cx={cx}
      cy={cy}
      r={5}
      fill={color}
      stroke="hsl(var(--card))"
      strokeWidth={2}
    />
  );
};

/**
 * KARTOCHKA QIYMATI — QISQA SHAKL.
 *
 * ⚠ TO'LIQ SHAKL BU YERGA SIG'MAYDI. Oltita kartochka bir qatorda
 * turadi (1440px ekranda ~196px), ichida ikonka ham bor. "19 300 000
 * so'm" o'sha kenglikka sig'may, `truncate` uni "19 300 000 s…" qilib
 * KESIB tashlaydi — rahbariyat ekranida yarim o'qilgan summa eng
 * yomon natija: u xato o'qilishi mumkin va buni hech narsa
 * ko'rsatmaydi.
 *
 * Shuning uchun kartochkada "19,3 mln so'm" — bir qarashda o'qiladi
 * va hech qachon kesilmaydi. TO'LIQ qiymat yo'qolmaydi: tanlangan
 * ko'rsatkich sarlavhada to'liq holda turadi va hover tooltipida
 * ham aniq raqam bor.
 */
const tileValue = (value, kind) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (kind === "money") return formatMoneyShort(value);
  return formatMetric(value, kind);
};

/** Massivning eng katta (raqamli) qiymati turgan indeks. */
const peakIndexOf = (rows, key) => {
  let best = -1;
  let bestVal = -Infinity;
  rows.forEach((r, i) => {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v) && v > bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return best;
};

const BranchMetricChart = ({
  query,
  metricKey,
  onMetricChange,
  periodKey,
  onPeriodChange,
  branchId,
  onBranchChange,
  onBranchOpen,
}) => {
  const metric = findMetric(metricKey);
  const period = findPeriod(periodKey);
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
   * KO'RSATILADIGAN FILIALLAR — eng kattasidan boshlab, SAKKIZTA.
   *
   * ⚠ Tartib TANLANGAN KO'RSATKICH bo'yicha: ekranda muhimi yuqorida
   * turadi. Rang esa filialga BIRIKTIRILGAN va ro'yxatdagi o'rniga
   * qarab o'zgarmaydi — ya'ni ko'rsatkich almashtirilganda chiziqlar
   * qayta bo'yalmaydi va "Chilonzor ko'k edi" degan xotira buzilmaydi.
   */
  const { series, hiddenCount } = useMemo(() => {
    const items = data?.items || [];
    if (isSingle || !items.length) return { series: [], hiddenCount: 0 };

    // Rang FILIAL identifikatoriga bog'lanadi — ro'yxatdagi o'rniga emas.
    const colorByBranch = new Map(
      [...items]
        .sort((a, b) => String(a.branchId).localeCompare(String(b.branchId)))
        .map((b, i) => [b.branchId, SERIES_COLORS[i % MAX_SERIES]]),
    );

    const ranked = [...items].sort((a, b) => {
      const av = a[metric.key];
      const bv = b[metric.key];
      if (typeof av !== "number") return 1;
      if (typeof bv !== "number") return -1;
      return bv - av;
    });

    return {
      series: ranked.slice(0, MAX_SERIES).map((b) => ({
        ...b,
        color: colorByBranch.get(b.branchId),
      })),
      hiddenCount: Math.max(0, ranked.length - MAX_SERIES),
    };
  }, [data, isSingle, metric.key]);

  const rows = useMemo(() => {
    if (!data?.trend) return [];
    return data.trend.map((t) => {
      const base = {
        id: t.key,
        label: MONTH_LABELS[t.month - 1],
        fullLabel: `${MONTH_LABELS[t.month - 1]} ${t.year}`,
      };
      if (isSingle) {
        base.value = t.branches[branchId]?.[metric.key] ?? null;
      } else {
        series.forEach((b) => {
          base[b.branchId] = t.branches[b.branchId]?.[metric.key] ?? null;
        });
        base.total = t.total?.[metric.key] ?? 0;
      }
      return base;
    });
  }, [data, isSingle, branchId, metric.key, series]);

  const total = data?.totals?.[metric.key];
  const selectedBranch = (data?.items || []).find((b) => b.branchId === branchId);
  const headline = isSingle ? selectedBranch?.[metric.key] : total;

  /**
   * ENG KATTA FILIAL — sarlavhadagi bitta jumla.
   *
   * Legendada filiallar allaqachon ko'rsatkich bo'yicha saralangan,
   * ya'ni birinchisi eng kattasi. Lekin BU BILINMAYDI: legendaning
   * tartibi hech qayerda aytilmagan va uni "shunchaki ro'yxat" deb
   * o'qish mumkin. Bitta ochiq jumla o'sha taxminni yo'q qiladi.
   *
   * ⚠ `additive` YO'Q bo'lganda ULUSH ko'rsatilmaydi: ikki filialning
   * foyda marjasini qo'shib bo'lmaydi, ya'ni "jamidagi ulush" degan
   * son marja uchun ma'nosiz.
   */
  const leader = useMemo(() => {
    if (isSingle || !series.length) return null;
    const top = series[0];
    const value = top[metric.key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (metric.additive && total > 0) {
      return { name: top.name, note: `${Math.round((value / total) * 100)}% ulush` };
    }
    return { name: top.name, note: formatMetric(value, metric.kind) };
  }, [series, isSingle, metric, total]);

  const peaks = useMemo(() => {
    if (isSingle) return { value: peakIndexOf(rows, "value") };
    return Object.fromEntries(series.map((b) => [b.branchId, peakIndexOf(rows, b.branchId)]));
  }, [rows, series, isSingle]);

  const minWidth = Math.max(480, rows.length * 84);
  const hasNegative = isSingle
    ? rows.some((r) => typeof r.value === "number" && r.value < 0)
    : rows.some((r) => series.some((b) => typeof r[b.branchId] === "number" && r[b.branchId] < 0));
  const canOpen = !isSingle && typeof onBranchOpen === "function";

  /** Pilyula shaklidagi tanlagich — sarlavhaning o'ng chetida. */
  const pill = "h-10 rounded-full border-border bg-muted/60 px-4 text-sm font-medium";

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card">
      {/* ══ SARLAVHA ══ */}
      <header className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <metric.icon className="size-4" />
            <span>{metric.label}</span>
            {/* ⚠ DAVR SARLAVHADA YOZILADI. Katta raqam davrsiz
                o'qilmaydi: "69,8 mln" bir oyniki bo'ladimi yoki bir
                yilnikimi — farq o'n barobar. Tanlagichda "Bu yil"
                turibdi, lekin u qaysi oylarni qamragani ko'rinmaydi,
                shuning uchun yonida aniq oraliq ham turadi. */}
            <span aria-hidden="true">·</span>
            <span>{periodRangeLabel(period.key)}</span>
            {isSingle && selectedBranch && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{selectedBranch.name}</span>
              </>
            )}
          </div>

          <p className="mt-1.5 text-4xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {formatMetric(headline, metric.kind)}
          </p>

          {/* ⚠ FAQAT TOPILMA QOLDI. Ilgari shu satrda ko'rsatkich
              ta'rifi (`metric.hint`), davr izohi (`period.hint`) va
              "nuqtani bosing" ko'rsatmasi ham turardi — ular ekrandan
              OLIB TASHLANDI (vizual minimalizm talabi). Ta'riflar
              `branchMetrics.js` da saqlanadi va kerak bo'lsa tooltip
              sifatida qaytariladi. */}
          {leader && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="text-foreground">Eng kattasi: {leader.name}</span>
              {` (${leader.note})`}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Select
            name="branch"
            value={branchId}
            onChange={onBranchChange}
            options={branchOptions}
            triggerClassName={pill}
          />
          {/* ⚠ BU YERDA ILGARI KO'RSATKICH TANLAGICHI TURARDI.
              U grafik ostidagi kartochkalar qatorini AYNAN takrorlardi
              (o'sha qator ham tanlagich, `aria-pressed` bilan), ya'ni
              bitta narsani ikki joydan boshqarardi. Davr esa hech
              qayerdan boshqarilmasdi — endi o'sha bo'sh joyni u
              egallaydi. Tafsilot: `branchMetrics.js` dagi izoh. */}
          <Select
            name="period"
            value={period.key}
            onChange={onPeriodChange}
            options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            triggerClassName={pill}
          />
        </div>
      </header>

      {/* ══ LEGENDA — ikki va undan ko'p chiziqda DOIMO ══ */}
      {!isSingle && series.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pb-1 sm:px-6">
          {series.map((b) => {
            const swatch = (
              <>
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: b.color }}
                />
                <span className="max-w-[10rem] truncate">{b.name}</span>
              </>
            );
            // ⚠ Bosib bo'lmaydigan yozuv TUGMA bo'lmasligi kerak:
            // u fokus oladi, kursorni o'zgartiradi va hech narsa
            // qilmaydi — klaviatura bilan yuradigan odam uchun bu
            // boshi berk ko'cha.
            return canOpen ? (
              <button
                key={b.branchId}
                type="button"
                onClick={() => onBranchOpen(b.branchId)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {swatch}
              </button>
            ) : (
              <span
                key={b.branchId}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                {swatch}
              </span>
            );
          })}
          {/* ⚠ JIMGINA KESILMAYDI — nechtasi ko'rinmagani AYTILADI. */}
          {hiddenCount > 0 && (
            <span className="text-xs text-muted-foreground">
              +{hiddenCount} ta filial ko&apos;rsatilmadi (eng kattalari
              chizilgan)
            </span>
          )}
        </div>
      )}

      {/* ══ GRAFIK ══ */}
      <div className="p-2 sm:px-4 sm:pb-4">
        <QueryState
          query={query}
          empty={!rows.length}
          emptyTitle={isSingle ? "Bu filialda yozuv yo'q" : "Filial ma'lumoti yo'q"}
          emptyHint="Tanlangan davrda moliyaviy harakat qayd etilmagan."
          loadingRows={4}
        >
          {() => (
            <div className="hidden-scrollbar overflow-x-auto">
              <div style={{ minWidth }}>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={rows} margin={{ top: 28, right: 20, bottom: 4, left: 4 }}>
                    {/* To'r — YAKRANG va bir piksel. Sochma chiziq
                        ma'lumot bilan raqobatlashadi va grafikni
                        shovqinli qiladi. */}
                    <CartesianGrid
                      vertical={false}
                      stroke="hsl(var(--border))"
                      strokeWidth={1}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      height={38}
                      tickMargin={12}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={metric.kind !== "count"}
                      width={metric.kind === "money" ? 68 : 44}
                      tickMargin={8}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => formatMetricShort(v, metric.kind)}
                    />
                    <Tooltip
                      cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                      content={<ChartTooltip metric={metric} isSingle={isSingle} />}
                    />
                    {hasNegative && (
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
                    )}

                    {isSingle ? (
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={SERIES_COLORS[0]}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dot={peakDot(SERIES_COLORS[0], peaks.value)}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                      >
                        {/* Bitta chiziqda joy bor — har oyning qiymati
                            o'qiladi. Ko'p chiziqda bu yozuvlar
                            bir-birining ustiga tushardi. */}
                        {rows.length <= 8 && (
                          <LabelList
                            dataKey="value"
                            position="top"
                            offset={14}
                            formatter={(v) => formatMetricShort(v, metric.kind)}
                            style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                          />
                        )}
                      </Line>
                    ) : (
                      series.map((b) => (
                        <Line
                          key={b.branchId}
                          type="monotone"
                          dataKey={b.branchId}
                          name={b.name}
                          stroke={b.color}
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          dot={peakDot(b.color, peaks[b.branchId])}
                          activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                        />
                      ))
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </QueryState>
      </div>

      {/* ══ KO'RSATKICH QATORI — u ayni paytda TAB ══
          Bu qator faqat raqam ko'rsatmaydi: har biri grafikni o'sha
          ko'rsatkichga almashtiradi. Shuning uchun ular tugma va
          `aria-pressed` bilan belgilanadi. */}
      <div className="grid grid-cols-2 border-t border-border sm:grid-cols-3 lg:grid-cols-6">
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
                "group relative min-w-0 border-b border-r border-border px-3 py-3.5 text-left transition-colors last:border-r-0 sm:px-4 sm:py-4",
                active ? "bg-muted/60" : "hover:bg-muted/30",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 top-0 h-0.5 transition-opacity",
                  active ? "bg-foreground opacity-100" : "opacity-0",
                )}
              />
              <span className="flex items-center gap-2">
                {/* ⚠ MOBILDA KICHIKROQ. 390px ekranda ikkita ustun
                    qoladi (~178px) va ikonka + 16px shrift bilan
                    "19,3 mln so'm" o'sha kenglikka SIG'MAY kesilardi.
                    Bir qadam kichikroq shrift butun summani saqlaydi —
                    yarim o'qilgan raqamdan ko'ra kichikroq raqam
                    ancha yaxshi. */}
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-xl transition-colors sm:size-8",
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <m.icon className="size-3.5 sm:size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {m.label}
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-semibold tabular-nums text-foreground sm:text-base">
                    {query.isLoading ? "…" : tileValue(value, m.kind)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default BranchMetricChart;
