import { Outlet, useLocation } from "react-router-dom";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import usePermissions from "@/shared/hooks/usePermissions";

const BASE = "/owner/finance/teacher-salaries";

// Layout: tab kontenti route darajasida (Outlet). Sahifa sarlavhasi aktiv tabga
// mos ravishda o'zgaradi (tab nomi = sarlavha).
const TeacherSalariesPage = () => {
  const { has } = usePermissions();
  const { pathname } = useLocation();

  const items = [
    { to: BASE, label: "To'lovlar", exact: true },
    { to: `${BASE}/qoldiqlar`, label: "Qoldiqlar" },
  ];
  // Maosh belgilash - davrlar (TeacherGroupPeriod) orqali, groups.update huquqi borlarga.
  if (has("groups.update")) {
    items.push({ to: `${BASE}/maosh-belgilash`, label: "Maosh belgilash" });
  }

  const title = (items.find((it) => pathname === it.to) || items[0]).label;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <TabsLinks items={items} />
      <Outlet />
    </div>
  );
};

export default TeacherSalariesPage;
