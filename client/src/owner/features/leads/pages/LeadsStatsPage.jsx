import { useMemo, useState } from "react";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";
import { MONTH_OPTIONS } from "@/shared/constants/calendar";
import useObjectState from "@/shared/hooks/useObjectState";
import PeriodToggle from "../components/PeriodToggle";
import { resolvePeriod } from "../utils/period";

const monthSelectOptions = MONTH_OPTIONS.map((o) => ({
  value: String(o.value),
  label: o.label,
}));
import LeadKpiCards from "../components/LeadKpiCards";
import LeadFunnel from "../components/LeadFunnel";
import LeadSourcePerformance from "../components/LeadSourcePerformance";
import LeadDirectionDemand from "../components/LeadDirectionDemand";
import LeadDropOff from "../components/LeadDropOff";
import useLeadStatsQuery from "../hooks/useLeadStatsQuery";

const now = new Date();

const LeadsStatsPage = () => {
  const [preset, setPreset] = useState("all");
  const monthSel = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const period = useMemo(
    () => resolvePeriod(preset, { year: monthSel.year, month: monthSel.month }),
    [preset, monthSel.year, monthSel.month],
  );

  const { data, isLoading, isError, refetch } = useLeadStatsQuery({
    from: period.from,
    to: period.to,
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lidlar statistikasi</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {preset === "month" && (
            <>
              <div className="w-32">
                <SelectField
                  value={String(monthSel.month)}
                  onChange={(v) => monthSel.setField("month", Number(v))}
                  options={monthSelectOptions}
                />
              </div>
              <div className="w-28">
                <SelectYear
                  label=""
                  value={monthSel.year}
                  onChange={(v) => monthSel.setField("year", Number(v))}
                />
              </div>
            </>
          )}
          <PeriodToggle value={preset} onChange={setPreset} />
        </div>
      </header>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
      ) : (
        <>
          <LeadKpiCards stats={data} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LeadFunnel funnel={data?.funnel || []} rates={data?.rates} />
            <LeadDropOff rows={data?.dropOffByStage || []} />
            <LeadSourcePerformance rows={data?.bySource || []} />
            <LeadDirectionDemand rows={data?.byDirection || []} />
          </div>
        </>
      )}
    </div>
  );
};

export default LeadsStatsPage;
