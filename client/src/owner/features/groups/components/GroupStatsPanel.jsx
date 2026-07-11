// Icons
import { CalendarCheck, Star } from "lucide-react";

// Components
import StatCard from "@/shared/components/ui/card/StatCard";

// Hooks (mavjud davomat va baho statistikasi qayta ishlatiladi)
import { useGroupAttendanceSummaryQuery } from "@/owner/features/attendance";
import { useGroupGradeSummaryQuery } from "@/owner/features/grades";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";

// Guruh detalining ustki qismidagi qisqa statistika paneli: Davomat, Baho.
// Joriy oy bo'yicha. Mavjud StatCard + davomat/baho query'lari qayta ishlatiladi.
const GroupStatsPanel = ({ groupId }) => {
  const now = new Date();
  const period = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const fromDate = toDateInput(new Date(period.year, period.month - 1, 1));
  const toDate = toDateInput(new Date(period.year, period.month, 0));

  // Davomat - umumiy foiz (groupRate)
  const { data: attData } = useGroupAttendanceSummaryQuery(groupId, {
    fromDate,
    toDate,
  });
  const rate = attData?.aggregate?.groupRate;

  // Baho - joriy oy o'rtacha balli
  const { data: gradeData } = useGroupGradeSummaryQuery(groupId, { fromDate, toDate });
  const avgGrade = gradeData?.average ?? null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <StatCard
        icon={CalendarCheck}
        tone={
          rate == null ? "default" : rate >= 75 ? "positive" : rate >= 50 ? "warn" : "negative"
        }
        label="Davomat (joriy oy)"
        value={rate == null ? null : rate}
        suffix="%"
        hint={rate == null ? "Ma'lumot yo'q" : "Umumiy davomat foizi"}
      />
      <StatCard
        icon={Star}
        tone={
          avgGrade == null ? "default" : avgGrade >= 4 ? "positive" : avgGrade >= 3 ? "warn" : "negative"
        }
        label="O'rtacha baho (joriy oy)"
        value={avgGrade}
        suffix=" / 5"
        hint={avgGrade == null ? "Baho qo'yilmagan" : `${gradeData?.total || 0} ta baho`}
      />
    </div>
  );
};

export default GroupStatsPanel;
