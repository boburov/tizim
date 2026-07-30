// State
import { useState } from "react";

// Router
import { Outlet, useLocation } from "react-router-dom";

// Icons
import { Plus } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";
import UserStatusFilter from "../components/UserStatusFilter";
import UserModals from "../components/UserModals";
import { AiDomainInsights } from "@/owner/features/ai";

// Utils
import { allowedStatusesForTab } from "../utils/userStatusFilter";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

const BASE = "/owner/students";

// O'quvchiga tegishli HAMMA narsa shu sahifada: ro'yxat, to'lovlar, qarzdorlar,
// chegirmalar, statistika. Ilgari bular sidebarda 6 ta alohida link edi.
//
// Tab ruxsat bo'yicha kesiladi: `finance.read` yo'q odam "To'lovlar"ni ko'rmaydi.
// Route darajasida ham PermissionGuard bor (routes/index.jsx) - to'g'ridan-to'g'ri
// URL yozib kirishning oldini oladi.
const StudentsPage = () => {
  const { pathname } = useLocation();
  const [status, setStatus] = useState("active");
  const { openModal } = useModal();
  const { has } = usePermissions();

  const items = [{ to: BASE, label: "Ro'yxat", exact: true }];

  if (has(PERMISSIONS.FINANCE_READ)) {
    items.push(
      { to: `${BASE}/tolovlar`, label: "To'lovlar" },
      { to: `${BASE}/qarzdorlar`, label: "Qarzdorlar" },
      { to: `${BASE}/chegirmalar`, label: "Chegirmalar" },
    );
  }

  if (has(PERMISSIONS.ADMIN_DASHBOARD_READ)) {
    items.push(
      { to: `${BASE}/statistika`, label: "Statistika" },
      { to: `${BASE}/chiqib-ketish`, label: "Chiqib ketish", exact: false },
    );
  }

  // Ro'yxat tabimi? Holat filtri va "Yangi o'quvchi" tugmasi faqat shu yerda
  // ma'noga ega - to'lovlar/statistika tablariga aloqasi yo'q.
  const isList = pathname === BASE || pathname === `${BASE}/`;

  // Status shu tabga mos kelmasa render vaqtida "Faol"ga tushiramiz.
  const effectiveStatus = allowedStatusesForTab("students").includes(status)
    ? status
    : "active";

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">O'quvchilar</h1>
        {isList && effectiveStatus !== "archived" && (
          <Button
            onClick={() =>
              openModal(MODAL.USER_CREATE, { defaultRole: ROLES.STUDENT })
            }
          >
            <Plus className="size-4" />
            Yangi o'quvchi
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsLinks items={items} />
        {isList && (
          <UserStatusFilter
            value={effectiveStatus}
            onChange={setStatus}
            tab="students"
          />
        )}
      </div>

      {/* AI tahlili - FAQAT ro'yxat tabida. To'lovlar/statistika tablarida
          o'quvchi insight'lari kontekstdan chiqib ketardi (u yerda owner
          boshqa savolga javob qidiradi). Ochiq insight bo'lmasa panel
          o'zini o'zi yashiradi. */}
      {isList && (
        <AiDomainInsights domain="students" title="O'quvchilar bo'yicha AI tahlili" />
      )}

      <Outlet context={{ status: effectiveStatus }} />

      <UserModals />
    </div>
  );
};

export default StudentsPage;
