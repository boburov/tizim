// Router
import { Outlet } from "react-router-dom";

// Components
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";

// Hooks
import usePermissions from "@/shared/hooks/usePermissions";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

const BASE = "/owner/groups";

// Guruh ro'yxati + guruh to'lovi bitta sahifada. "Guruh to'lovi" ilgari
// Moliya guruhida alohida link edi, lekin u guruhga tegishli ma'lumot.
const GroupsPage = () => {
  const { has } = usePermissions();

  const items = [{ to: BASE, label: "Ro'yxat", exact: true }];

  if (has(PERMISSIONS.FINANCE_READ)) {
    items.push({ to: `${BASE}/tolov`, label: "To'lov" });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Guruhlar</h1>
      <TabsLinks items={items} />
      <Outlet />
    </div>
  );
};

export default GroupsPage;
