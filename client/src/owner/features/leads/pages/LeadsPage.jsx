// Router
import { Outlet } from "react-router-dom";

// Components
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";

const BASE = "/owner/leads";

// Lid ro'yxati + statistika. Sozlamalar (manba/yo'nalish/rad etish sabablari)
// umumiy Sozlamalar sahifasiga ko'chdi.
const LeadsPage = () => {
  const items = [
    { to: BASE, label: "Ro'yxat", exact: true },
    { to: `${BASE}/statistika`, label: "Statistika" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Lidlar</h1>
      <TabsLinks items={items} />
      <Outlet />
    </div>
  );
};

export default LeadsPage;
