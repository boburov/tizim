// State
import { useState } from "react";

// Components
import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";
import { GroupMonthlyMatrix } from "@/owner/features/attendance";

const UZ_MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

const MONTH_OPTIONS = UZ_MONTHS.map((label, i) => ({
  value: String(i + 1),
  label,
}));

const GroupAttendanceStatsTab = ({ groupId }) => {
  const now = new Date();
  const [period, setPeriod] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  return (
    <div className="space-y-4 pt-3">
      {/* Sarlavha va Yil > Oy tanlagichlar yonma-yon */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800">
          {period.year} yil, {UZ_MONTHS[period.month - 1]} oyi davomati
        </h2>

        <div className="flex items-end gap-2">
          <SelectYear
            value={period.year}
            onChange={(v) =>
              setPeriod((p) => ({ ...p, year: Number(v) || p.year }))
            }
            className="!gap-1 w-28"
          />
          <SelectField
            label="Oy"
            value={String(period.month)}
            onChange={(v) => setPeriod((p) => ({ ...p, month: Number(v) }))}
            options={MONTH_OPTIONS}
            className="!gap-1 w-40"
          />
        </div>
      </div>

      <GroupMonthlyMatrix
        groupId={groupId}
        year={period.year}
        month={period.month}
      />
    </div>
  );
};

export default GroupAttendanceStatsTab;
