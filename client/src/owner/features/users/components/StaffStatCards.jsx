// Icons
import { Crown, GraduationCap, UserCog, Users } from "lucide-react";

// Components
import StatCard from "@/shared/components/ui/card/StatCard";

// Constants
import { ROLE_TYPES } from "@/shared/constants/roles";

const ROLE_ICON = {
  [ROLE_TYPES.OWNER]: Crown,
  [ROLE_TYPES.TEACHER]: GraduationCap,
  [ROLE_TYPES.STAFF]: UserCog,
};

/**
 * XODIMLAR - rol kesimidagi kartochkalar.
 *
 * Kartochka bosilganda ro'yxat o'sha rol bo'yicha filtrlanadi: raqamni
 * ko'rgan odamning keyingi savoli "kimlar ekan?" - javob bir bosishda
 * bo'lishi kerak.
 *
 * Raqamlar ro'yxat bilan BIR XIL predikat va filial sharti asosida
 * hisoblanadi (server: staffStats), shuning uchun "Jami" har doim
 * qatorlar soniga teng.
 */
const StaffStatCards = ({ data, activeRole, onRoleClick }) => {
  if (!data) return null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        icon={Users}
        label="Jami xodimlar"
        value={data.active}
        hint={
          data.archived ? `${data.archived} ta arxivda` : "Hammasi faol"
        }
        tone={activeRole ? "default" : "info"}
        onClick={() => onRoleClick(null)}
      />

      {data.byRole.map((r) => (
        <StatCard
          key={r.role}
          icon={ROLE_ICON[r.roleType] || UserCog}
          label={r.label}
          value={r.active}
          hint={
            r.isFrozen
              ? "Rol muzlatilgan"
              : r.archived
                ? `${r.archived} ta arxivda`
                : "Faol"
          }
          tone={
            r.isFrozen ? "warn" : activeRole === r.role ? "info" : "default"
          }
          onClick={() => onRoleClick(r.role)}
        />
      ))}
    </div>
  );
};

export default StaffStatCards;
