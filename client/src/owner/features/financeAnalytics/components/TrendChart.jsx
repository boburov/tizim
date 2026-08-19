import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";

import { formatMoneyShort } from "@/shared/utils/formatMoney";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateBlock";

/**
 * DINAMIKA GRAFIGI.
 *
 * ── NEGA BITTA UMUMIY KOMPONENT ──
 * Daromad, chiqim va pul oqimi — bir xil shakldagi vaqt qatori
 * (`{ date, ...values }`). Har biriga alohida grafik yozilsa, ular
 * o'q formati, tooltip va sana ko'rinishi bo'yicha asta-sekin
 * ajralib ketardi.
 *
 * ── GRAFIK FAQAT SAVOLGA JAVOB BERSA CHIZILADI ──
 * Talab 18: "Do not add charts just because charts are available".
 * Shuning uchun bu yerda faqat IKKI shakl bor: ustun (davr ichidagi
 * hajm) va chiziq (yig'ilib boruvchi qoldiq). Boshqasi kerak emas.
 */
const dateLabel = (v, granularity) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  if (granularity === "month") {
    return d.toLocaleDateString("uz-UZ", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "short" });
};

const TrendChart = ({
  query, series, granularity, height = 260,
  emptyTitle = "Bu davrda harakat yo'q",
}) => {
  if (query.isLoading) return <LoadingBlock rows={2} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={query.refetch} />;

  const data = query.data;
  const points = data?.points || [];
  const g = data?.granularity || granularity;
  if (!points.length) return <EmptyBlock title={emptyTitle} />;

  const rows = points.map((p) => ({ ...p, label: dateLabel(p.date, g) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="label" tickLine={false} axisLine={false}
          tick={{ fontSize: 11 }} className="fill-muted-foreground"
        />
        <YAxis
          tickLine={false} axisLine={false} width={70}
          tick={{ fontSize: 11 }} className="fill-muted-foreground"
          tickFormatter={(v) => formatMoneyShort(v).replace(" so'm", "")}
        />
        <Tooltip
          formatter={(v, name) => [formatMoneyShort(v), name]}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) =>
          s.type === "line" ? (
            <Line
              key={s.key} dataKey={s.key} name={s.label} stroke={s.color}
              strokeWidth={2} dot={false}
            />
          ) : (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default TrendChart;
