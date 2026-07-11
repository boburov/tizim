import Card from "@/shared/components/ui/card/Card";
import { formatMonths } from "../utils/formatMonths";

// Chiqib ketish sabablari: har sabab uchun nechta o'quvchi + ular o'rtacha
// qancha o'qib chiqqani. Masalan "Dars zerikarli - 18 ta, o'rtacha 4 oy".
const ChurnReasonsTable = ({ reasons = [] }) => {
  const max = reasons.reduce((m, r) => Math.max(m, r.count || 0), 0) || 1;

  return (
    <Card title="Chiqib ketish sabablari">
      {reasons.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Hali sabab belgilanmagan
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {reasons.map((r) => {
            const barPct = (r.count / max) * 100;
            return (
              <div key={r.reasonId || r.title} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground/90">
                    {r.title}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {r.count} ta
                    <span className="ml-2 text-xs text-zinc-400">
                      o'rtacha {formatMonths(r.avgDurationMonths)}
                    </span>
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded bg-zinc-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-rose-500"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default ChurnReasonsTable;
