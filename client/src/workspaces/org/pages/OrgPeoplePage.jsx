import { Link } from "react-router-dom";
import { ShieldCheck, ArrowRight } from "lucide-react";

import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import StaffListTab from "@/owner/features/users/components/StaffListTab";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";

/**
 * ODAMLAR — TASHKILOT DARAJASIDA (talab 13).
 *
 * ── NEGA MAVJUD RO'YXAT QAYTA YOZILMADI ──
 * `StaffListTab` allaqachon hamma narsani qiladi: qidiruv, rol
 * o'zgartirish, filialga biriktirish, arxivlash, parol. Uni qayta
 * yozish nusxa yaratardi va ikkalasi vaqt o'tishi bilan ajralib
 * ketardi.
 *
 * Yangisi — KONTEKST: bu ekran endi "Vakolatlar" bilan bitta
 * fikrlash zanjirida turadi. Odam yaratish va unga NIMA QILISH
 * huquqini berish — ketma-ket ikki qadam, shuning uchun ikkinchisiga
 * havola aynan shu yerda.
 */
const OrgPeoplePage = () => {
  const { has } = usePermissions();

  if (!has(PERMISSIONS.USERS_READ)) {
    return (
      <WorkspacePage title="Odamlar">
        <EmptyState
          title="Foydalanuvchilar ro'yxati yopiq"
          hint="Bu bo'limni ochish uchun foydalanuvchilarni ko'rish ruxsati kerak."
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage
      title="Odamlar"
      subtitle="Markazda ishlaydigan hamma: ega, direktorlar, o'qituvchilar, xodimlar"
      actions={
        has(PERMISSIONS.ROLES_READ) && (
          <Link
            to="/org/permissions"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            <ShieldCheck className="size-4" />
            Kim nima qila oladi
            <ArrowRight className="size-3.5" />
          </Link>
        )
      }
    >
      <StaffListTab />
    </WorkspacePage>
  );
};

export default OrgPeoplePage;
