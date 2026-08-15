// Router
import { Outlet, useLocation } from "react-router-dom";

// Components
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import { AiDomainInsights } from "@/owner/features/ai";

const BASE = "/owner/leads";

// Lid ro'yxati + statistika. Sozlamalar (manba/yo'nalish/rad etish sabablari)
// umumiy Sozlamalar sahifasiga ko'chdi.
const LeadsPage = () => {
  const { pathname } = useLocation();

  const items = [
    { to: BASE, label: "Ro'yxat", exact: true },
    { to: `${BASE}/doska`, label: "Doska" },
    { to: `${BASE}/statistika`, label: "Statistika" },
  ];

  const isList = pathname === BASE || pathname === `${BASE}/`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Lidlar</h1>
      <TabsLinks items={items} />

      {/* Issiq lidlar, sovib qolganlar, konversiya pasayishi - hammasi
          ro'yxat tabida, chunki harakat (qo'ng'iroq qilish) shu yerda. */}
      {isList && <AiDomainInsights domain="leads" title="Lidlar bo'yicha tizim tahlili" />}

      <Outlet />
    </div>
  );
};

export default LeadsPage;
