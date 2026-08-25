// React
import { useState } from "react";

// Charts
import {
  ResponsiveContainer, ComposedChart, Bar, BarChart, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, LabelList, Cell,
} from "recharts";

// Icons
import { Coins, TableProperties, ChartColumnBig } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import EmptyState from "@/shared/components/page/EmptyState";

// Hooks
import useCoinConfig from "@/shared/hooks/useCoinConfig";

// Utils
import { cn } from "@/shared/utils/cn";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TANGA IQTISODIYOTI — SHAKL MA'LUMOTNING ISHIDAN KELIB CHIQADI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Uchta savol, uchta BOSHQA shakl. Ilgari uchalasi ham bir xil edi —
 * to'rtta raqam kartasi — va shuning uchun hech biriga javob bermasdi.
 *
 *   "Qancha sarflanmagan?"  → BITTA raqam    → sarlavha raqami
 *   "Iqtisodiyot qayoqqa?"  → vaqt qatori    → ikki tomonlama ustun
 *   "Qaysi manba chiqardi?" → kesim          → yotiq ustunlar
 *
 * ── NEGA "MUOMALADAGI" GRAFIK EMAS ──
 * U bitta joriy qiymat. Bitta ustunli grafik — grafik emas, u
 * raqamni bo'yalgan to'rtburchak bilan takrorlaydi va o'qishni
 * QIYINLASHTIRADI. Bitta raqamning to'g'ri shakli — katta raqamning
 * o'zi.
 *
 * ── NEGA OQIM IKKI TOMONLAMA (diverging) ──
 * Chiqarilgan va sarflangan — BIR narsaning ikki yo'nalishi. Ular
 * nol chizig'idan yuqori va pastga chizilsa, "iqtisodiyot shishyaptimi
 * yoki qisqaryaptimi" degan savol BIR QARASHDA javob topadi. Yonma-yon
 * ustunlarda esa buni ko'z bilan ayirish kerak bo'lardi.
 *
 * ⚠ BITTA O'Q. Ikkinchi o'q (masalan o'ngda "balans") QO'SHILMAYDI:
 * ikki shkalaning bir-biriga nisbatan joylashuvi IXTIYORIY bo'ladi va
 * grafik ma'lumotda yo'q bog'liqlikni "ko'rsatib" qo'yadi.
 *
 * ── NEGA MANBA KESIMIDA HAMMA USTUN BIR XIL RANGDA ──
 * "Davomat", "Baho", "Qo'lda" — ular orasida TABIIY TARTIB YO'Q va
 * har biriga alohida rang berish identifikatsiya kanalini ustun
 * UZUNLIGI allaqachon aytgan narsaga sarflardi. Nomni o'q yozuvi
 * aytadi, miqdorni uzunlik. Rang bu yerda ishsiz — shuning uchun u
 * bitta.
 *
 * ── RANGLAR TANLANMAGAN, O'LCHANGAN ──
 * `--chart-1` / `--chart-2` — rang ko'rligi ajratishi, yorqinlik
 * oralig'i va kontrast bo'yicha tekshirilgan (`styles/index.css`
 * dagi izoh). Brend rangi (`--primary`) ATAYLAB ishlatilmaydi: u
 * `.env` dan keladi va qorong'u rejimda hozir kulrang (`#d9d9d9`).
 *
 * ── JADVAL KO'RINISHI MAJBURIY ──
 * Grafik yagona yo'l bo'lmasligi kerak: skrinreader, chop etish va
 * "aniq raqam kerak" holati uchun AYNI ma'lumot jadval sifatida ham
 * ochiladi.
 */

const RANGES = [
  { key: 14, label: "14 kun" },
  { key: 30, label: "30 kun" },
  { key: 90, label: "90 kun" },
];

const SOURCE_LABELS = {
  attendance: "Davomat",
  grade: "Baho",
  manual: "Qo'lda berilgan",
  refund: "Qaytarilgan",
  purchase: "Xarid",
};

const SERIES = {
  issued: { key: "issued", label: "Chiqarildi", color: "hsl(var(--chart-1))" },
  spent: { key: "spent", label: "Sarflandi", color: "hsl(var(--chart-2))" },
};

const nf = (n) => Number(n || 0).toLocaleString("uz-UZ");

/** "2026-08-25" → "25-avg" (haftalik oynada ham AYNI shakl). */
const UZ_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const tickLabel = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d}-${UZ_SHORT[m - 1]}`;
};

/**
 * TOOLTIP — o'z komponentimiz.
 *
 * Standart recharts tooltipi `spent` ni MANFIY ko'rsatardi (u shunday
 * saqlanadi — nol chizig'idan pastga chizilishi uchun). Foydalanuvchi
 * uchun "−40 sarflandi" noto'g'ri o'qiladi: sarflangan miqdor manfiy
 * emas, u shunchaki boshqa yo'nalish.
 */
const FlowTooltip = ({ active, payload, label, coinLabel }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ background: p.color }}
          />
          {p.name}:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {nf(Math.abs(p.value))}
          </span>
          {coinLabel}
        </p>
      ))}
    </div>
  );
};

const RangePills = ({ value, onChange }) => (
  <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Davr">
    {RANGES.map((r) => (
      <button
        key={r.key}
        type="button"
        onClick={() => onChange(r.key)}
        aria-pressed={value === r.key}
        className={cn(
          "rounded-md px-2.5 py-1 text-xs font-medium transition",
          value === r.key
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {r.label}
      </button>
    ))}
  </div>
);

const CoinEconomySection = ({ stats, isLoading, isError, onRetry, range, onRangeChange }) => {
  const { coinLabel } = useCoinConfig();
  const [asTable, setAsTable] = useState(false);

  if (isError) return <ErrorState onRetry={onRetry} />;
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-md" />
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-64 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      </div>
    );
  }

  const flow = stats?.flow || [];
  const bySource = (stats?.bySource || []).filter((s) => s.kind !== "purchase");

  // ⚠ `spent` MANFIY saqlanadi — nol chizig'idan PASTGA chizilishi
  // uchun. Ko'rsatishda hamma joyda `Math.abs` qo'llanadi.
  const rows = flow.map((p) => ({
    label: tickLabel(p.date),
    date: p.date,
    issued: p.issued,
    spent: -p.spent,
  }));

  const hasFlow = flow.some((p) => p.issued > 0 || p.spent > 0);
  const sourceRows = bySource.map((s) => ({
    ...s,
    label: SOURCE_LABELS[s.kind] || s.kind,
  }));

  const axis = {
    tickLine: false,
    axisLine: false,
    tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  };

  return (
    <section className="space-y-3">
      {/* ══ SARLAVHA RAQAMI — bitta joriy qiymat ══ */}
      <Card className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Coins className="size-3.5 text-amber-500" />
            Muomaladagi {coinLabel}
          </p>
          <p className="mt-1 text-5xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {nf(stats?.circulating)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Sarflanmagan — bu kutilayotgan talab. Ko'p bo'lsa arzon mahsulot
            e'lon qilingan kuniyoq supurib ketiladi.
          </p>
        </div>

        {/* Kontekst raqamlari — sarlavha raqamiga NISBATAN kichik: ular
            javob emas, javobning fonini beradi. */}
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Jami chiqarilgan</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums">
              {nf(stats?.totalIssued)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sarflangan</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums">
              {nf(stats?.totalSpent)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Buyurtmalar</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums">
              {nf(stats?.orderCount)}
            </dd>
          </div>
        </dl>
      </Card>

      {/* ══ BOSHQARUV QATORI — grafiklardan YUQORIDA, bitta qatorda ══ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RangePills value={range} onChange={onRangeChange} />
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          {asTable ? <ChartColumnBig className="size-3.5" /> : <TableProperties className="size-3.5" />}
          {asTable ? "Grafik" : "Jadval"}
        </button>
      </div>

      {!hasFlow ? (
        <EmptyState
          icon={Coins}
          title="Bu davrda tanga harakati bo'lmagan"
          hint="Davomat belgilanganda va baho qo'yilganda tanga avtomatik hisoblanadi. Boshqa davrni tanlab ko'ring."
        />
      ) : asTable ? (
        /* ══ JADVAL KO'RINISHI — AYNI ma'lumot, aniq raqamlar bilan ══ */
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm">
              <caption className="sr-only">
                Davr bo'yicha chiqarilgan va sarflangan {coinLabel}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Davr</th>
                  <th scope="col" className="text-right">Chiqarildi</th>
                  <th scope="col" className="text-right">Sarflandi</th>
                </tr>
              </thead>
              <tbody>
                {flow.map((p) => (
                  <tr key={p.date}>
                    <td className="px-6 py-2">{tickLabel(p.date)}</td>
                    <td className="px-6 py-2 text-right tabular-nums">{nf(p.issued)}</td>
                    <td className="px-6 py-2 text-right tabular-nums">{nf(p.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          {/* ══ OQIM — IKKI TOMONLAMA USTUN ══ */}
          <Card>
            <h3 className="text-sm font-medium text-foreground">Tanga oqimi</h3>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
              Nol chizig'idan yuqorisi — chiqarilgan, pasti — sarflangan
              {stats?.window?.granularity === "week" ? " (haftalik)" : " (kunlik)"}
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={rows}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                // Tasmaning qolgani — HAVO, ustun emas: ustun butun
                // katakni to'ldirmasligi kerak, aks holda qo'shni
                // kunlar bir-biriga yopishib ketardi.
                barCategoryGap="12%"
                // ⚠ IKKI USTUN ORASIDA 2px — SIRT RANGIDAGI BO'SHLIQ.
                // Ular chegara (border) bilan emas, aynan bo'shliq
                // bilan ajratiladi: chegara ma'lumot bo'lmagan siyoh
                // qo'shadi va ustunni og'irlashtiradi.
                barGap={2}
              >
                {/* To'r — sochma emas, YAKRANG va bir piksel: u ma'lumot
                    emas, orqa fon. Sochma chiziq ustunlar bilan
                    raqobatlashadi. */}
                <CartesianGrid
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                  vertical={false}
                />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...axis} width={44} tickFormatter={(v) => nf(Math.abs(v))} />
                {/* Nol chizig'i — NEYTRAL kulrang, rang emas: u ikki
                    qutbning O'RTASI va u yerda "hech narsa" turishi kerak. */}
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.45 }}
                  content={<FlowTooltip coinLabel={` ${coinLabel}`} />}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  iconType="circle"
                  iconSize={8}
                />
                {/* Yumaloq uchi FAQAT ma'lumot tomonida; nol chizig'ida
                    to'g'ri burchak — ustun poydevordan "uzilib"
                    ko'rinmasligi uchun. */}
                {/* ⚠⚠ `stackId` QO'SHMANG — SINAB KO'RILDI VA U GRAFIKNI
                    YOLG'ON QILADI.

                    "Ular nol chizig'ining ikki tomonida, demak
                    ustma-ust tushmaydi" degan fikr MANTIQAN to'g'ri,
                    lekin recharts unday ishlamaydi: `stackId` bilan u
                    qiymatlarni YIG'INDI qilib joylashtiradi
                    (`stackOffset="none"`). Musbat va manfiy aralashsa
                    natija ikki qutbli grafik EMAS, kumulyativ ustun
                    bo'ladi.

                    Bu 30 kunlik oynada SEZILMADI — u yerda ko'p
                    kunlarda `spent = 0` va farq ko'rinmaydi. 90 kunlik
                    (haftalik) oynada esa har bir tasmada ikkala qiymat
                    ham noldan katta bo'ldi va to'q sariq ustun ko'k
                    ustunning USTIGA chiqdi: o'q manfiy tomonni
                    umuman yo'qotdi va grafik "hamma hafta faqat
                    o'sgan" deb ko'rsatdi.

                    Stacksiz recharts musbat va manfiyni to'g'ri
                    joylashtiradi. Ustunlar ingichkaroq bo'ladi — buni
                    `barCategoryGap` va `barGap` hal qiladi, yolg'on
                    joylashtirish emas. */}
                <Bar
                  dataKey={SERIES.issued.key}
                  name={SERIES.issued.label}
                  fill={SERIES.issued.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
                <Bar
                  dataKey={SERIES.spent.key}
                  name={SERIES.spent.label}
                  fill={SERIES.spent.color}
                  radius={[0, 0, 4, 4]}
                  maxBarSize={24}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* ══ MANBA KESIMI — YOTIQ USTUN, BITTA RANG ══ */}
          <Card>
            <h3 className="text-sm font-medium text-foreground">Qaysi manba chiqardi</h3>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
              Shu davrda chiqarilgan {coinLabel}
            </p>

            {!sourceRows.length ? (
              <p className="py-10 text-center text-xs text-muted-foreground">
                Bu davrda tanga chiqarilmagan
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={sourceRows}
                  layout="vertical"
                  margin={{ top: 4, right: 44, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                    horizontal={false}
                  />
                  <XAxis type="number" {...axis} tickFormatter={nf} />
                  <YAxis type="category" dataKey="label" {...axis} width={104} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.45 }}
                    formatter={(v) => [`${nf(v)} ${coinLabel}`, "Chiqarildi"]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      fontSize: 12,
                    }}
                  />
                  {/* BITTA seriya → LEGENDA YO'Q. Bitta kataklik
                      legenda sarlavhani takrorlaydi va joy yeydi. */}
                  <Bar dataKey="coins" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {sourceRows.map((r) => (
                      // ⚠ Rang QIYMATGA qarab O'ZGARMAYDI. Qiymat
                      // ustun uzunligida allaqachon bor; uni rangda
                      // takrorlash identifikatsiya kanalini bekorga
                      // sarflardi.
                      <Cell key={r.kind} fill="hsl(var(--chart-1))" />
                    ))}
                    {/* To'g'ridan-to'g'ri yozuv — ustun UCHIDA. O'q
                        belgilari o'qilmaganda ham raqam ko'rinadi. */}
                    <LabelList
                      dataKey="coins"
                      position="right"
                      formatter={nf}
                      style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}
    </section>
  );
};

export default CoinEconomySection;
