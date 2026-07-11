// State
import { useState } from "react";

// Components
import Card from "@/shared/components/ui/card/Card";
import {
  PeriodPicker,
  GroupMonthlyMatrix,
  useGroupAttendanceSummaryQuery,
} from "@/owner/features/attendance";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";

const GroupAttendanceStatsTab = ({ groupId }) => {
  const now = new Date();
  const [period, setPeriod] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  // Oyning birinchi va oxirgi kuni
  const fromDate = toDateInput(new Date(period.year, period.month - 1, 1));
  const toDate = toDateInput(new Date(period.year, period.month, 0));

  const { data, isLoading } = useGroupAttendanceSummaryQuery(groupId, {
    fromDate,
    toDate,
  });
  const agg = data?.aggregate;

  return (
    <div className="space-y-4 pt-3">
      <PeriodPicker
        year={period.year}
        month={period.month}
        onChange={setPeriod}
      />

      {isLoading ? (
        <Card>
          <p className="py-6 text-center text-muted-foreground">
            Yuklanmoqda...
          </p>
        </Card>
      ) : !agg ? (
        <Card>
          <p className="py-6 text-center text-muted-foreground">
            Ma'lumot yo'q
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Jami darslar", value: agg.totalClasses },
            { label: "Keldi", value: agg.present, dot: "bg-emerald-500" },
            { label: "Kelmadi", value: agg.absent, dot: "bg-rose-500" },
            { label: "Sababli", value: agg.excused, dot: "bg-amber-500" },
            { label: "Ozod", value: agg.exempt, dot: "bg-slate-400" },
            {
              label: "Belgilanmagan",
              value: agg.unmarked || 0,
              dot: "bg-gray-200",
            },
          ].map((stat) => (
            <Card
              key={stat.label}
              className="flex flex-col justify-between gap-2"
            >
              <div className="flex items-center gap-1.5">
                {stat.dot && (
                  <span className={`block h-2 w-2 shrink-0 rounded-full ${stat.dot}`} />
                )}
                <p className="text-xs font-medium text-gray-500">{stat.label}</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums text-gray-800">
                {stat.value}
              </p>
            </Card>
          ))}
        </div>
      )}

      <GroupMonthlyMatrix
        groupId={groupId}
        year={period.year}
        month={period.month}
      />
    </div>
  );
};

export default GroupAttendanceStatsTab;
