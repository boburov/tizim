// Router
import { Link } from "react-router-dom";

// Icons
import { Award, UserCog, Users } from "lucide-react";

// Dashboard components
import KpiTile from "@/shared/components/dashboard/KpiTile";
import DataState from "@/shared/components/dashboard/DataState";
import DashboardSection, {
  KpiGrid,
} from "@/shared/components/dashboard/SectionGrid";
import { narrow } from "@/shared/components/dashboard/dataStatus";

// Hooks
import { useOverviewData } from "../hooks/useExecutiveData";

// Local components
import SectionHeader from "../components/SectionHeader";

// Navigation
import { useDrilldown, useUserHref } from "../navigation/drilldown";

/**
 * JAMOA KESIMI.
 *
 * HOZIRCHA CHEKLANGAN va bu ATAYLAB ochiq ko'rsatilgan: maosh va
 * o'qituvchi davomati modullari `overview`
 * javobiga kirmaydi. Ular uchun "ulanmagan" emas, DRILL-DOWN
 * havolasi berilgan - modullar ishlaydi, shunchaki bu yerda
 * jamlanma ko'rsatkich yo'q.
 *
 * Yolg'on plita qo'yishdan (masalan "Maosh fondi: 0 so'm") ko'ra
 * havola berish to'g'ri: birinchisi noto'g'ri raqam, ikkinchisi
 * halol yo'nalish.
 */
const TeamPage = () => {
  const DRILLDOWN = useDrilldown();
  const userHref = useUserHref();
  // DAVR TANLAGICHI YO'Q va bu ATAYLAB.
  //
  // Bu sahifadagi ikkala ko'rsatkich ham (o'qituvchilar soni, guruhlar
  // soni) JORIY holat - ular davrga bog'liq emas. Tanlagich qo'yilsa
  // u hech narsani o'zgartirmasdi, lekin foydalanuvchi raqamlarni
  // tanlangan oyga tegishli deb o'qirdi: "martda 12 o'qituvchi bo'lgan"
  // degan yolg'on xulosa.
  //
  // Maosh kesimi qo'shilganda (u DAVRGA bog'liq) tanlagich qaytadi.
  const overview = useOverviewData({});
  const o = overview.data;

  const topTeachers = narrow(overview, (d) => d?.topTeachers);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Jamoa"
        hint="O'qituvchilar va xodimlarning joriy holati."
      />

      <KpiGrid cols={2}>
        <KpiTile
          label="O'qituvchilar"
          icon={Users}
          value={o?.teachersCount}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to={DRILLDOWN.teachers}
          hint="Faol o'qituvchilar"
        />
        <KpiTile
          label="Guruhlar"
          icon={UserCog}
          value={o?.activeGroupsCount}
          status={overview.status}
          error={overview.error}
          onRetry={overview.refetch}
          to={DRILLDOWN.groups}
          hint="O'qituvchilarga taqsimlangan"
        />
      </KpiGrid>

      <DashboardSection
        title="Eng faol o'qituvchilar"
        hint="Guruh va o'quvchi soni bo'yicha"
        to={DRILLDOWN.teachers}
        toLabel="Barcha o'qituvchilar"
      >
        <DataState
          status={topTeachers.status}
          data={topTeachers.data}
          error={topTeachers.error}
          onRetry={overview.refetch}
          emptyIcon={Award}
          emptyHint="Reyting hisoblash uchun yetarli ma'lumot yo'q."
          skeletonClassName="h-48"
        >
          {(items) => (
            <ul className="divide-y rounded-md border">
              {items.map((t, i) => (
                <li key={t.id || t._id || i}>
                  {/* HAVOLA BO'LMASA — oddiy qator.
                      Super Adminda operatsion sahifalar yopiq, ya'ni
                      `<Link to={null}>` yozib bo'lmaydi (React Router
                      yiqiladi) va bosiladigan qator ko'rsatish ham
                      noto'g'ri bo'lardi. */}
                  <Row
                    to={userHref(t.id || t._id)}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {t.name || t.fullName || "—"}
                    </span>
                    {/* Faqat SERVER bergan sanoqlar. Yo'q bo'lsa
                        umuman chiqmaydi - "0 guruh" yozilmaydi. */}
                    {typeof t.groupsCount === "number" && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t.groupsCount} guruh
                      </span>
                    )}
                    {typeof t.studentsCount === "number" && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t.studentsCount} o'quvchi
                      </span>
                    )}
                  </Row>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </DashboardSection>

      {/* MAOSH - jamlanma ko'rsatkich YO'Q, havola BOR. */}
      <DashboardSection
        title="Maosh va KPI"
        hint="Bu yerda jamlanma ko'rsatkich hali yo'q - modul o'z sahifasida ishlaydi"
      >
        <div className="flex flex-wrap gap-2">
          <QuickLink to={DRILLDOWN.teacherSalaries} label="O'qituvchi maoshlari" />
          <QuickLink to={DRILLDOWN.staffPayroll} label="Xodimlar oyligi" />
          <QuickLink to={DRILLDOWN.teacherAttendance} label="O'qituvchi davomati" />
        </div>
      </DashboardSection>
    </div>
  );
};

// `to` bo'lmasa UMUMAN chizilmaydi: Super Adminda operatsion
// havolalar yo'q (qarang `navigation/drilldown.js`).
/**
 * Havola BO'LSA `<Link>`, bo'lmasa oddiy `<div>`.
 *
 * Super Admin panelida operatsion sahifalar yopiq (`AdminPanelGuard`),
 * ya'ni o'sha yerda bu qatorlar bosilmaydi — lekin MA'LUMOT baribir
 * ko'rinishi kerak.
 */
const Row = ({ to, className, children }) =>
  (to ? (
    <Link to={to} className={className}>{children}</Link>
  ) : (
    <div className={className}>{children}</div>
  ));

const QuickLink = ({ to, label }) => (!to ? null : (
  <Link
    to={to}
    className="rounded-md border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
  >
    {label}
  </Link>
));

export default TeamPage;
