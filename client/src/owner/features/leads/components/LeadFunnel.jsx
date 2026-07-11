import Card from "@/shared/components/ui/card/Card";
import { LEAD_STATUS_LABEL } from "@/shared/constants/leadStatus";

const LeadFunnel = ({ funnel = [], rates }) => {
  const max = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <Card title="Savdo voronkasi" className="space-y-3">
      <div className="mt-3 space-y-2">
        {funnel.map((f) => (
          <div key={f.stage} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{LEAD_STATUS_LABEL[f.stage]}</span>
              <span className="text-muted-foreground">
                {f.count} · {f.rate}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded bg-zinc-100">
              <div
                className="h-full rounded bg-primary"
                style={{ width: `${(f.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {rates && (
        <div className="flex flex-wrap gap-4 border-t pt-3 text-xs text-muted-foreground">
          <span>
            Lid → Sinov: <b className="text-foreground">{rates.leadToTrial}%</b>
          </span>
          <span>
            Sinov → To'lov:{" "}
            <b className="text-foreground">{rates.trialToEnrolled}%</b>
          </span>
        </div>
      )}
    </Card>
  );
};

export default LeadFunnel;
