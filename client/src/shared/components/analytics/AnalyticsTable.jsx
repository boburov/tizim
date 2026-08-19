import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronRight } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import MetricValue from "./MetricValue";
import ComparisonBadge from "./ComparisonBadge";
import { EmptyBlock } from "./StateBlock";

/**
 * TAHLIL JADVALI — barcha foydalilik/kesim ro'yxatlari uchun.
 *
 * ── SARALASH MIJOZ TOMONIDA, VA BU YETARLI ──
 * Server allaqachon cheklangan (LIMIT 50-200) va tayyor to'plam
 * qaytaradi. Saralash uchun qayta so'rov yuborish keraksiz kechikish
 * bo'lardi. MUHIMI: bu yerda HECH QANDAY HISOB-KITOB yo'q — faqat
 * mavjud qatorlarni qayta tartiblash. Yangi raqam yaratilmaydi.
 *
 * ── `null` QIYMATLAR SARALASHDA OXIRIDA ──
 * "—" qiymat eng past emas: u O'LCHANMAGAN. Uni nol deb saralash
 * marjasi yo'q o'qituvchini "eng yomon" qilib ko'rsatardi.
 */
const AnalyticsTable = ({
  rows = [],
  columns,
  onRowClick,
  defaultSort,
  emptyTitle = "Ma'lumot yo'q",
  emptyHint,
  rowKey = (r, i) => r.id || i,
  className,
}) => {
  const [sort, setSort] = useState(defaultSort || null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const ma = va === null || va === undefined;
      const mb = vb === null || vb === undefined;
      if (ma && mb) return 0;
      if (ma) return 1; // o'lchanmagan — HAR DOIM oxirida
      if (mb) return -1;
      const diff = typeof va === "string" ? String(va).localeCompare(String(vb)) : Number(va) - Number(vb);
      return sort.dir === "asc" ? diff : -diff;
    });
  }, [rows, sort, columns]);

  if (!rows.length) return <EmptyBlock title={emptyTitle} hint={emptyHint} />;

  const toggle = (key) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" },
    );

  return (
    // Gorizontal aylantirish: moliyaviy jadvalda ustun ko'p va ularni
    // tashlab yuborish ma'lumotni yo'qotardi (talab 16: "Do not
    // sacrifice information density unnecessarily").
    <div className={cn("overflow-x-auto rounded-2xl border border-border bg-card", className)}>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2.5 text-xs font-medium text-muted-foreground",
                  c.align === "right" && "text-right",
                )}
              >
                {c.sortable === false ? (
                  c.label
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1 transition hover:text-foreground",
                      sort?.key === c.key && "text-foreground",
                    )}
                  >
                    {c.label}
                    <ArrowUpDown className="size-3" />
                  </button>
                )}
              </th>
            ))}
            {onRowClick && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border/60 last:border-0",
                onRowClick && "cursor-pointer transition hover:bg-muted/50",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-3 py-2.5", c.align === "right" && "text-right")}
                >
                  {c.render ? (
                    c.render(row)
                  ) : c.kind ? (
                    <MetricValue value={row[c.key]} kind={c.kind} />
                  ) : (
                    row[c.key] ?? <span className="text-muted-foreground">—</span>
                  )}
                </td>
              ))}
              {onRowClick && (
                <td className="px-2 text-muted-foreground">
                  <ChevronRight className="size-4" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Ustun uchun tayyor "summa + taqqoslash" yacheykasi. */
export const CompareCell = ({ value, compare, invert, kind = "moneyShort" }) => (
  <span className="inline-flex items-center justify-end gap-1.5">
    <MetricValue value={value} kind={kind} />
    {compare && <ComparisonBadge compare={compare} invert={invert} />}
  </span>
);

export default AnalyticsTable;
