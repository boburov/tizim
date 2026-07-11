import Card from "@/shared/components/ui/card/Card";

// Chiqib ketgan o'quvchilar chiqishdan OLDIN qancha o'qigani - kohortalar.
// "Ko'pchilik 1-3 oy o'qib chiqib ketyapti" degan xulosa shu yerdan ko'rinadi.
const DurationBeforeLeavingChart = ({ buckets = [] }) => {
  const total = buckets.reduce((s, b) => s + (b.count || 0), 0);
  const max = buckets.reduce((m, b) => Math.max(m, b.count || 0), 0) || 1;

  return (
    <Card title="Chiqishdan oldin qancha o'qigan">
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ma'lumot yo'q
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {buckets.map((b) => {
            const pct = total ? Math.round((b.count / total) * 100) : 0;
            const barPct = (b.count / max) * 100;
            return (
              <div key={b.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground/90">
                    {b.label}
                  </span>
                  <span className="text-muted-foreground">
                    {b.count} ta
                    <span className="ml-1.5 text-xs text-zinc-400">{pct}%</span>
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded bg-zinc-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-amber-500"
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

export default DurationBeforeLeavingChart;
