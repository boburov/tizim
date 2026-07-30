// Icons
import {
  Building2,
  MapPin,
  Phone,
  Pencil,
  Trash2,
  Star,
  ShieldCheck,
  Snowflake,
  Play,
  KeyRound,
} from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useBranchStatsQuery from "../hooks/useBranchStatsQuery";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

const Stat = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-lg font-semibold">{value ?? "—"}</span>
    <span className="text-xs opacity-60">{label}</span>
  </div>
);

const BranchCard = ({ branch }) => {
  const { openModal } = useModal();
  const { hasAll } = usePermissions();
  const { data: stats } = useBranchStatsQuery(branch._id);

  // Server yozish amallarida SYSTEM_ADMIN_ACCESS ni HAM talab qiladi
  // (branches.routes.js: requirePermission ikki marta). Faqat branches.*
  // ni tekshirsak tugma ko'rinardi-yu, bosilganda doim 403 qaytardi.
  const canUpdate = hasAll([PERMISSIONS.SYSTEM_ADMIN_ACCESS, PERMISSIONS.BRANCHES_UPDATE]);
  const canDelete = hasAll([PERMISSIONS.SYSTEM_ADMIN_ACCESS, PERMISSIONS.BRANCHES_DELETE]);

  const isFrozen = branch.isActive === false;
  const managers = stats?.managers || [];

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3",
        isFrozen && "border-dashed opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center size-10 shrink-0 rounded-md bg-primary/10 text-primary">
            <Building2 size={20} strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-medium truncate">{branch.name}</h3>
            {branch.isMain && (
              <span
                title="Asosiy filial"
                className="flex items-center gap-1 shrink-0 text-xs text-amber-600 dark:text-amber-300"
              >
                <Star size={12} strokeWidth={2} />
                Asosiy
              </span>
            )}
            {isFrozen && (
              <span className="flex items-center gap-1 shrink-0 text-xs text-sky-600 dark:text-sky-300">
                <Snowflake size={12} strokeWidth={2} />
                Muzlatilgan
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canUpdate && (
            <button
              type="button"
              title="Tahrirlash"
              className="p-2 rounded-md hover:bg-muted"
              onClick={() => openModal(MODAL.BRANCH_EDIT, { branch })}
            >
              <Pencil size={16} strokeWidth={1.5} />
            </button>
          )}
          {/* Muzlatish - asosiy filialda yo'q: serverda ham taqiqlangan
              (barcha eski ma'lumot shunga biriktirilgan). */}
          {canUpdate && !branch.isMain && (
            <button
              type="button"
              title={isFrozen ? "Faollashtirish" : "Muzlatish"}
              className="p-2 rounded-md hover:bg-muted"
              onClick={() => openModal(MODAL.BRANCH_FREEZE, { branch })}
            >
              {isFrozen ? (
                <Play size={16} strokeWidth={1.5} />
              ) : (
                <Snowflake size={16} strokeWidth={1.5} />
              )}
            </button>
          )}
          {/* Asosiy filialni o'chirib bo'lmaydi - tugma ham ko'rsatilmaydi */}
          {canDelete && !branch.isMain && (
            <button
              type="button"
              title="O'chirish"
              className="p-2 rounded-md hover:bg-muted text-destructive"
              onClick={() => openModal(MODAL.BRANCH_DELETE, { branch })}
            >
              <Trash2 size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {(branch.address || branch.phone) && (
        <div className="space-y-1 text-sm opacity-70">
          {branch.address && (
            <div className="flex items-center gap-2">
              <MapPin size={14} strokeWidth={1.5} />
              <span className="truncate">{branch.address}</span>
            </div>
          )}
          {branch.phone && (
            <div className="flex items-center gap-2">
              <Phone size={14} strokeWidth={1.5} />
              <span>{branch.phone}</span>
            </div>
          )}
        </div>
      )}

      {/* FILIAL RAHBARIYATI - "bu filialni kim boshqaradi va u qanday
          kiradi" degan savolga shu yerda javob beriladi. Parol ro'yxat
          bilan kelmaydi: kalit tugmasi alohida so'rov yuboradi. */}
      {managers.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t">
          {managers.map((m) => (
            <div key={m._id} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {m.firstName} {m.lastName}
                </p>
                <p className="truncate text-xs opacity-60">
                  {m.role} · {m.username}
                </p>
              </div>
              {canUpdate && (
                <button
                  type="button"
                  title="Login va parol"
                  className="p-1.5 rounded-md hover:bg-muted shrink-0"
                  onClick={() => openModal(MODAL.USER_PASSWORD, { user: m })}
                >
                  <KeyRound size={15} strokeWidth={1.5} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 pt-2 border-t">
        <Stat label="Guruh" value={stats?.groupCount} />
        <Stat label="Faol" value={stats?.activeGroupCount} />
        <Stat label="Xodim" value={stats?.staffCount} />
        <Stat label="O'quvchi" value={stats?.studentCount} />
      </div>

      {branch.expenseApprovalThreshold > 0 && (
        <div className="flex items-center gap-2 text-xs pt-2 border-t">
          <ShieldCheck size={14} strokeWidth={1.5} className="opacity-60" />
          <span className="opacity-60">Limit</span>
          <span className="font-medium">
            {formatMoney(branch.expenseApprovalThreshold)}
          </span>
        </div>
      )}
    </div>
  );
};

export default BranchCard;
