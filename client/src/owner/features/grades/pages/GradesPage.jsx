// Router
import { Outlet } from "react-router-dom";

// Components
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";

// Hooks
import usePermissions from "@/shared/hooks/usePermissions";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

const BASE = "/owner/grades";

// Baho qo'yish va reyting bitta sahifada - ikkalasi ham "o'quvchini baholash"
// ishining bo'lagi, sidebarda alohida turishga arzimaydi.
const GradesPage = () => {
  const { has } = usePermissions();

  const items = [];
  if (has(PERMISSIONS.GRADES_RECORD)) {
    items.push({ to: BASE, label: "Baholash", exact: true });
  }
  if (has(PERMISSIONS.RATING_READ)) {
    // exact: false - reyting ichida o'z tablari bor (markaz / guruh).
    items.push({ to: `${BASE}/reyting`, label: "Reyting", exact: false });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Baholash</h1>
      <TabsLinks items={items} />
      <Outlet />
    </div>
  );
};

export default GradesPage;
