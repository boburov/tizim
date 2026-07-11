import { Outlet } from "react-router-dom";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import useObjectState from "@/shared/hooks/useObjectState";
import PeriodPicker from "../components/PeriodPicker";

const BASE = "/owner/attendance";

// Layout: tablar (Umumiy / Guruh bo'yicha) route darajasida. Davr (year/month)
// header'da - Outlet context orqali panellarga uzatiladi.
const AttendanceDashboardPage = () => {
  const now = new Date();
  const { year, month, setFields } = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const items = [
    { to: BASE, label: "Umumiy", exact: true },
    { to: `${BASE}/guruh-boyicha`, label: "Guruh bo'yicha" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Davomat hisoboti</h1>
        <PeriodPicker
          year={year}
          month={month}
          onChange={({ year: y, month: m }) => setFields({ year: y, month: m })}
        />
      </header>

      <TabsLinks items={items} />
      <Outlet context={{ year, month }} />
    </div>
  );
};

export default AttendanceDashboardPage;
