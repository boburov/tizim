// Router
import { Outlet, useLocation } from "react-router-dom";

// Icons
import { Activity } from "lucide-react";

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
      {/* TO'LIQ KENGLIK, ikki ustun emas. Ikki ustunda panellardan biri
          bo'sh bo'lsa (masalan kurs bo'yicha hech narsa topilmasa) ikkinchisi
          sahifaning yarmida osilib qolardi - qolgan yarmi bo'sh. Panel o'zi
          bo'sh holatda `null` qaytargani uchun ustun ham to'ldirilmasdi.

          Sarlavhada "AI" YO'Q: bu paneldagi guruh/kurs xulosalari qoida va
          statistikadan chiqadi (to'ldirilish foizi, bo'sh dars vaqtlari), til
          modelidan emas. Ikonka ham shunga qarab neytral (Activity). */}
      {isList && (
        <div className="grid gap-3">
          <AiDomainInsights
            domain="groups"
            icon={Activity}
            title="Guruhlar bo'yicha tizim tahlili"
          />
          <AiDomainInsights
            domain="courses"
            icon={Activity}
            title="Kurslar bo'yicha tizim tahlili"
          />
        </div>
      )}

      <Outlet />
    </div>
  );
};

export default GroupsPage;
