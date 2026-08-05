// Icons
import { UserCog } from "lucide-react";

// Router
import { Outlet, useLocation } from "react-router-dom";

// Components
import Button from "@/shared/components/ui/button/Button";
import TabsLinks from "@/shared/components/ui/tabs/TabsLinks";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

const BASE = "/owner/staff";

/**
 * XODIMLAR - qobiq sahifa.
 *
 * Xodimga tegishli hamma narsa shu yerda: ro'yxat, maoshlar va KPI
 * qoidalari. Tab tuzilmasi O'quvchilar/O'qituvchilar sahifalari bilan
 * bir xil - foydalanuvchi yangi naqsh o'rganmaydi.
 */
const StaffPage = () => {
  const { pathname } = useLocation();
  const { openModal } = useModal();
  const { has } = usePermissions();

  const items = [{ to: BASE, label: "Ro'yxat", exact: true }];

  if (has(PERMISSIONS.PAYROLL_READ)) {
    items.push({ to: `${BASE}/maoshlar`, label: "Maoshlar" });
  }
  if (has(PERMISSIONS.PAYROLL_MANAGE)) {
    items.push({ to: `${BASE}/kpi`, label: "KPI qoidalari" });
  }

  const isList = pathname === BASE || pathname === `${BASE}/`;

  // Xodim yaratish IKKALA ruxsatni talab qiladi (POST /users/staff odam
  // yaratadi VA rol biriktiradi) - bittasi bilan tugma 403 berardi.
  const canCreateStaff =
    has(PERMISSIONS.TEACHERS_CREATE) && has(PERMISSIONS.ROLES_UPDATE);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Xodimlar</h1>
          <p className="text-sm text-muted-foreground">
            Ega, o'qituvchilar va boshqaruv xodimlari - roli, filiali,
            faolligi va maoshi
          </p>
        </div>
        {isList && canCreateStaff && (
          <Button onClick={() => openModal(MODAL.STAFF_CREATE)}>
            <UserCog className="size-4" />
            Xodim qo'shish
          </Button>
        )}
      </header>

      <TabsLinks items={items} />

      <Outlet />
    </div>
  );
};

export default StaffPage;
