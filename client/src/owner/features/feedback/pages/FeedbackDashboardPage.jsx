import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@/shared/components/ui/card/Card";
import BackLink from "@/shared/components/ui/link/BackLink";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useObjectState from "@/shared/hooks/useObjectState";
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_TONE,
} from "@/shared/constants/feedback";

import StatTile from "../components/StatTile";
import TypeBars from "../components/TypeBars";
import TimeRangeFilter from "../components/TimeRangeFilter";
import { resolveRange, defaultCustomRange } from "../utils/timeRange";
import { useFeedbackStatsQuery } from "../hooks/useFeedbackQueries";

const FeedbackDashboardPage = () => {
  const navigate = useNavigate();
  const range = useObjectState({ preset: "all", from: "", to: "" });

  const { fromDate, toDate } = useMemo(
    () => resolveRange(range.preset, { from: range.from, to: range.to }),
    [range.preset, range.from, range.to],
  );

  const { data, isLoading, isError, refetch } = useFeedbackStatsQuery({
    fromDate,
    toDate,
  });

  // byStatus: [{_id, count}] -> lookup
  const countOf = useMemo(() => {
    const map = {};
    (data?.byStatus || []).forEach((s) => {
      map[s._id] = s.count;
    });
    return map;
  }, [data]);

  const goToStatus = (status) =>
    navigate(status ? `/owner/feedback?status=${status}` : "/owner/feedback");

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <BackLink to="/owner/feedback" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Feedback hisoboti</h1>
          </div>
          <TimeRangeFilter
            preset={range.preset}
            custom={{ from: range.from, to: range.to }}
            onPresetChange={(p) => {
              if (p === "range" && !range.from && !range.to) {
                const d = defaultCustomRange();
                range.setFields({ preset: p, from: d.from, to: d.to });
              } else {
                range.setField("preset", p);
              }
            }}
            onCustomChange={(k, v) => range.setField(k, v)}
          />
        </div>
      </header>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          {/* 5 ta izchil stat-karta (Jami + 4 status). Klik -> ro'yxatni filtrlaydi */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label="Jami"
              tone="neutral"
              value={data?.total || 0}
              onClick={() => goToStatus("")}
              isLoading={isLoading}
            />
            {FEEDBACK_STATUSES.map((s) => (
              <StatTile
                key={s}
                label={FEEDBACK_STATUS_LABEL[s]}
                tone={FEEDBACK_STATUS_TONE[s]}
                value={countOf[s] || 0}
                onClick={() => goToStatus(s)}
                isLoading={isLoading}
              />
            ))}
          </div>

          {/* Tur bo'yicha taqsimot */}
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold">Tur bo'yicha</h2>
            <TypeBars data={data?.byType || []} isLoading={isLoading} />
          </Card>
        </>
      )}
    </div>
  );
};

export default FeedbackDashboardPage;
