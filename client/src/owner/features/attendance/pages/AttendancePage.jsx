// Router
import { Outlet, useLocation } from "react-router-dom";

// Components
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import PeriodPicker from "../components/PeriodPicker";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import usePermissions from "@/shared/hooks/usePermissions";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

const BASE = "/owner/attendance";

// Davomatning HAMMA qismi bitta sahifada: hisobotlar + belgilash.
//
// Ilgari ikki qavat tab bor edi (tashqarida "Belgilash/Hisobotlar", ichkarida
// "Umumiy/Guruh bo'yicha"). Yassilandi - bitta qator, uchta tab. URL'lar
// o'zgarmadi, ya'ni eski havolalar ishlashda davom etadi.
const AttendancePage = () => {
  const { pathname } = useLocation();
  const { has } = usePermissions();

  const now = new Date();
  const { year, month, setFields } = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const items = [];
  if (has(PERMISSIONS.ATTENDANCE_READ)) {
    items.push(
      { to: BASE, label: "Umumiy", exact: true },
      { to: `${BASE}/guruh-boyicha`, label: "Guruh bo'yicha" },
    );
  }
  if (has(PERMISSIONS.ATTENDANCE_RECORD)) {
    items.push({ to: `${BASE}/mark`, label: "Belgilash" });
  }

  // Davr tanlagich faqat hisobot tablariga tegishli - belgilashda kun
  // darsning o'zidan olinadi.
  const isReport = pathname !== `${BASE}/mark`;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Davomat</h1>
        {isReport && (
          <PeriodPicker
            year={year}
            month={month}
            onChange={({ year: y, month: m }) => setFields({ year: y, month: m })}
          />
        )}
      </header>

      <TabsLinks items={items} />
      <Outlet context={{ year, month }} />
    </div>
  );
};

export default AttendancePage;
