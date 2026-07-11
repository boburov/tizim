import { Outlet } from "react-router-dom";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";

const BASE = "/owner/finance/student-payments";

// Layout: tab kontenti route darajasida (Outlet). Tablar - TabsLinks (NavLink).
const StudentPaymentsPage = () => {
  const items = [
    { to: BASE, label: "To'lovlar", exact: true },
    { to: `${BASE}/debtors`, label: "Qarzdorlar" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">O'quvchi to'lovlari</h1>
      <TabsLinks items={items} />
      <Outlet />
    </div>
  );
};

export default StudentPaymentsPage;
