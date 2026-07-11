import Card from "@/shared/components/ui/card/Card";
import { LEAD_STATUS_LABEL } from "@/shared/constants/leadStatus";

const LeadDropOff = ({ rows = [] }) => {
  const totalDropped = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Card title="Qaysi bosqichda chiqib ketgan (rad etilgan)" className="space-y-3">
      {totalDropped === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Rad etilgan lidlar yo'q
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.stage} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{LEAD_STATUS_LABEL[r.stage]}</span>
                <span className="text-muted-foreground">{r.count}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded bg-zinc-100">
                <div
                  className="h-full rounded bg-rose-500"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default LeadDropOff;
