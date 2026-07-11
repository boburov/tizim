import { Outlet } from "react-router-dom";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";

const BASE = "/owner/finance/deposits";

const DepositsPage = () => {
  const items = [
    { to: BASE, label: "Tranzaksiyalar", exact: true },
    { to: `${BASE}/hisobotlar`, label: "Hisobotlar" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Depozitlar</h1>
      <TabsLinks items={items} />
      <Outlet />
    </div>
  );
};

export default DepositsPage;
