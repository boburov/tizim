// Icons
import { CalendarCheck, GraduationCap, Layers, UserMinus } from "lucide-react";

// Dashboard components
import KpiTile from "@/shared/components/dashboard/KpiTile";
import ChartCard from "@/shared/components/dashboard/ChartCard";
import { KpiGrid, SplitRow } from "@/shared/components/dashboard/SectionGrid";
import { narrow } from "@/shared/components/dashboard/dataStatus";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import {
  useOverviewData,
  useStudentFlowData,
} from "../../../hooks/useExecutiveData";

// Local components
import ExecutivePageHeader from "../../../components/ExecutivePageHeader";
import StudentFlowBars from "../components/StudentFlowBars";
import AttendanceBreakdown from "../components/AttendanceBreakdown";

/**
 * O'QUV JARAYONI KESIMI.
 *
 * Savol: "o'quvchilar qolyaptimi va darslar o'tyaptimi?"
 * Kirim/chiqim bu yerda ATAYLAB yo'q - u moliya bo'limida. Bir
 * ekranda ikkalasi aralashsa, o'quv sifati muammosi moliyaviy
 * muammo bo'lib ko'rinardi (yoki aksincha).
 */
const AcademicPage = () => {
  const now = new Date();
  const period = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const params = { year: period.year, month: period.month };

  const overview = useOverviewData(params);
  const flow = useStudentFlowData({ months: 6 });

  const o = overview.data;

  // Davomat qismi umumiy javob ichida, lekin o'z holatiga ega.
  const gauge = narrow(overview, (d) => d?.attendanceGauge, {
    emptyWhen: (g) => g?.rate === null || g?.rate === undefined,
  });

  return (
    <div className="space-y-6">
      <ExecutivePageHeader
        title="O'quv jarayoni"
        hint="O'quvchilar oqimi, guruhlar va davomat."
        period={period}
      />

      <KpiGrid cols={4}>
        <KpiTile
          label="O'quvchilar"
          icon={GraduationCap}
          value={o?.studentsCount}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to="/owner/students"
        />
        <KpiTile
          label="Faol guruhlar"
          icon={Layers}
          value={o?.activeGroupsCount}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to="/owner/groups"
          hint={
            typeof o?.teachersCount === "number"
              ? `${o.teachersCount} o'qituvchi`
              : undefined
          }
        />
        <KpiTile
          label="Bu oy ketganlar"
          icon={UserMinus}
          value={o?.lostStudentsThisMonth}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to="/owner/students/chiqib-ketish"
          hint="Chiqib ketish tahlili"
        />
        <KpiTile
          label="Bugungi davomat"
          icon={CalendarCheck}
          suffix="%"
          value={o?.todayAttendanceRate}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to="/owner/attendance"
        />
      </KpiGrid>

      <SplitRow
        main={
          <ChartCard
            title="O'quvchilar oqimi"
            hint="So'nggi 6 oy: qo'shilgan va ketgan"
            status={flow.status}
            data={flow.data}
            error={flow.error}
            onRetry={flow.refetch}
            to="/owner/students/chiqib-ketish"
            height="h-64"
            emptyHint="Oqim hisoblash uchun yetarli tarix yo'q."
          >
            {(items) => <StudentFlowBars items={items} />}
          </ChartCard>
        }
        side={
          <ChartCard
            title="Bugungi davomat"
            hint="Kelgan / kechikkan / kelmagan"
            // `narrow`: so'rov MUVAFFAQIYATLI bo'lsa ham davomat
            // o'lchanmagan bo'lishi mumkin (bugun dars yo'q -> `rate`
            // serverda `null`). Busiz diagramma nolinchi qiymatlar
            // bilan chizilib, "bugun hech kim kelmadi" degan yolg'on
            // xulosa berardi.
            {...gauge}
            onRetry={overview.refetch}
            to="/owner/attendance"
            height="h-64"
            emptyHint="Bugun dars belgilanmagan."
          >
            {(gauge) => <AttendanceBreakdown gauge={gauge} />}
          </ChartCard>
        }
      />
    </div>
  );
};

export default AcademicPage;
