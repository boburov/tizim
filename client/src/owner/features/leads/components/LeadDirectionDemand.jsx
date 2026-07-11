import Card from "@/shared/components/ui/card/Card";

const LeadDirectionDemand = ({ rows = [] }) => {
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <Card title="Yo'nalishlar bo'yicha talab" className="space-y-3">
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Ma'lumot yo'q</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.id || "none"} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">
                  {r.total} · {r.enrolled} to'lov
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded bg-zinc-100">
                <div
                  className="h-full rounded bg-indigo-500"
                  style={{ width: `${(r.total / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default LeadDirectionDemand;
