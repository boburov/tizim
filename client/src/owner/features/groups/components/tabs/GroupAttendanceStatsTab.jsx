// State
import { useState } from "react";

// Components
import Card from "@/shared/components/ui/card/Card";
import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";
import {
  GroupMonthlyMatrix,
  useGroupAttendanceSummaryQuery,
} from "@/owner/features/attendance";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";

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

// Bugungi davomat kartalari (kelmadi = sababsiz kelmagan)
const TODAY_CARDS = [
  { key: "present", label: "Keldi", dot: "bg-emerald-500" },
  { key: "absent", label: "Kelmadi (sababsiz)", dot: "bg-rose-500" },
  { key: "excused", label: "Sababli", dot: "bg-amber-500" },
  { key: "exempt", label: "Ozod", dot: "bg-slate-400" },
  { key: "unmarked", label: "Belgilanmagan", dot: "bg-gray-300" },
];

const GroupAttendanceStatsTab = ({ groupId }) => {
  const now = new Date();
  const [period, setPeriod] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  // Bugungi kun uchun davomat statistikasi (oy filtridan mustaqil)
  const today = toDateInput(new Date());
  const [dd, mm, yyyy] = [today.slice(8), today.slice(5, 7), today.slice(0, 4)];
  const { data: todayData } = useGroupAttendanceSummaryQuery(groupId, {
    fromDate: today,
    toDate: today,
  });
  const todayAgg = todayData?.aggregate;

  return (
    <div className="space-y-4 pt-3">
      {/* Bugungi davomat - kartalar */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Bugungi davomat · {dd}.{mm}.{yyyy}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TODAY_CARDS.map((c) => (
            <Card key={c.key} className="flex flex-col justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className={`block h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums text-gray-800">
                {todayAgg?.[c.key] ?? 0}
              </p>
            </Card>
          ))}
        </div>
      </div>

      {/* Oylik jadval sarlavhasi va Yil > Oy tanlagichlar yonma-yon */}
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
