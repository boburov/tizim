// Utils
import { cn } from "@/shared/utils/cn";

/**
 * BUGUNGI DAVOMAT TAQSIMOTI - SOF PREZENTATSION.
 *
 * `gauge` shakli serverdan (`computeAttendanceGauge`):
 *   { rate, present, late, absent, total }
 *
 * `rate` MAXRAJI = present + late + absent (exempt va excused
 * TASHQARIDA - qarang serverdagi izoh). Shu sababli bu yerda foiz
 * qayta hisoblanmaydi: mijozda `present / total` yozilsa, ozod
 * qilinganlar maxrajga tushib, foiz serverdagidan past chiqardi va
 * ikki ekranda ikki xil davomat ko'rinardi.
 */
const AttendanceBreakdown = ({ gauge }) => {
  const rate = gauge?.rate;
  const rows = [
    { label: "Kelgan", value: gauge?.present, className: "bg-primary" },
    { label: "Kechikkan", value: gauge?.late, className: "bg-chart-3" },
    { label: "Kelmagan", value: gauge?.absent, className: "bg-chart-2" },
  ];

  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="text-center">
        <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
          {rate}
          <span className="text-2xl text-muted-foreground">%</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {total} ta yozuv bo'yicha
        </p>
      </div>

      {/* Yagona gorizontal chiziq - uchta segment. Aylana diagramma
          o'rniga: uchta qiymatni solishtirishda uzunlik burchakdan
          aniqroq o'qiladi. */}
      {total > 0 && (
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {rows.map((r) => {
            const v = Number(r.value) || 0;
            if (!v) return null;
            return (
              <div
                key={r.label}
                className={r.className}
                style={{ width: `${(v / total) * 100}%` }}
              />
            );
          })}
        </div>
      )}

      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-sm">
            <span className={cn("size-2.5 shrink-0 rounded-full", r.className)} />
            <span className="flex-1 text-muted-foreground">{r.label}</span>
            <span className="tabular-nums font-medium text-foreground">
              {typeof r.value === "number" ? r.value : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AttendanceBreakdown;
