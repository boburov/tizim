// Router
import { Outlet, useLocation } from "react-router-dom";

// Components
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import { AiDomainInsights } from "@/owner/features/ai";

// Hooks
import usePermissions from "@/shared/hooks/usePermissions";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

const BASE = "/owner/groups";

// Guruh ro'yxati + guruh to'lovi bitta sahifada. "Guruh to'lovi" ilgari
// Moliya guruhida alohida link edi, lekin u guruhga tegishli ma'lumot.
const GroupsPage = () => {
  const { pathname } = useLocation();
  const { has } = usePermissions();

  const items = [{ to: BASE, label: "Ro'yxat", exact: true }];

  if (has(PERMISSIONS.FINANCE_READ)) {
    items.push({ to: `${BASE}/tolov`, label: "To'lov" });
  }

  const isList = pathname === BASE || pathname === `${BASE}/`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Guruhlar</h1>
      <TabsLinks items={items} />

      {/* IKKITA DOMEN shu yerda: guruh VA kurs.
          Kurslarning alohida sahifasi yo'q (kurs - guruhning xossasi), va
          kurs bo'yicha tavsiyalar ("IELTS uchun yana bir kechki guruh
          oching", "CEFR marketingini kuchaytiring") aynan shu sahifadan
          bajariladi. Ularni faqat Action Center'da qoldirish tavsiyani
          harakatdan uzib qo'yardi. */}
      {isList && (
        <div className="grid gap-3 lg:grid-cols-2">
          <AiDomainInsights domain="groups" title="Guruhlar bo'yicha AI tahlili" />
          <AiDomainInsights domain="courses" title="Kurslar bo'yicha AI tahlili" />
        </div>
      )}

      <Outlet />
    </div>
  );
};

export default GroupsPage;
