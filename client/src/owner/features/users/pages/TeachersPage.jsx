// State
import { useState } from "react";

// Router
import { Outlet, useLocation } from "react-router-dom";

// Icons
import { Plus, UserCog } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ExportButton from "@/shared/components/export/ExportButton";
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

const BASE = "/owner/teachers";

// O'qituvchiga tegishli hamma narsa shu sahifada: ro'yxat, maoshlar, qoldiqlar,
// maosh belgilash, davomat. Ilgari bular sidebarda 3 xil guruhga tarqalgan edi.
const TeachersPage = () => {
  const { pathname } = useLocation();
  const [status, setStatus] = useState("active");
  const { openModal } = useModal();
  const { has } = usePermissions();

  const items = [{ to: BASE, label: "Ro'yxat", exact: true }];

  if (has(PERMISSIONS.SALARY_READ)) {
    items.push(
      { to: `${BASE}/maoshlar`, label: "Maoshlar" },
      { to: `${BASE}/qoldiqlar`, label: "Qoldiqlar" },
    );
  }

  // Maosh belgilash - davrlar (TeacherGroupPeriod) orqali, groups.update huquqi borlarga.
  if (has(PERMISSIONS.GROUPS_UPDATE)) {
    items.push({ to: `${BASE}/maosh-belgilash`, label: "Maosh belgilash" });
  }

  if (has(PERMISSIONS.ATTENDANCE_RECORD)) {
    items.push({ to: `${BASE}/davomat`, label: "Davomat" });
  }

  const isList = pathname === BASE || pathname === `${BASE}/`;

  const effectiveStatus = allowedStatusesForTab("teachers").includes(status)
    ? status
    : "active";

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">O'qituvchilar</h1>
        {isList && (
          <div className="flex items-center gap-2">
            {/* Eksport arxiv holatida ham kerak (yil oxiri hisoboti),
                shuning uchun "archived" shartidan tashqarida. */}
            <ExportButton
              size="default"
              datasetKey="teachers"
              title="O'qituvchilarni Excelga yuklash"
              filters={{ status: effectiveStatus }}
            />
            {effectiveStatus !== "archived" && (
              <>
                {/* Xodim - direktor/administrator (custom rol + filial) */}
                {has(PERMISSIONS.ROLES_UPDATE) && (
                  <Button
                    variant="outline"
                    onClick={() => openModal(MODAL.STAFF_CREATE)}
                  >
                    <UserCog className="size-4" />
                    Xodim qo'shish
                  </Button>
                )}
                <Button
                  onClick={() =>
                    openModal(MODAL.USER_CREATE, { defaultRole: ROLES.TEACHER })
                  }
                >
                  <Plus className="size-4" />
                  Yangi o'qituvchi
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsLinks items={items} />
        {isList && (
          <UserStatusFilter
            value={effectiveStatus}
            onChange={setStatus}
            tab="teachers"
          />
        )}
      </div>

      {/* Tizim tahlili - faqat ro'yxat tabida (maosh/davomat tablarida
          kontekstdan chiqib ketardi). */}
      {isList && (
        <AiDomainInsights domain="teachers" title="O'qituvchilar bo'yicha tizim tahlili" />
      )}

      <Outlet context={{ status: effectiveStatus }} />

      <UserModals />
    </div>
  );
};

export default TeachersPage;
