// Icons
import { Snowflake, Users, ChevronRight, Lock, Loader2 } from "lucide-react";

// Components
import Tooltip from "@/shared/components/ui/tooltip/Tooltip";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";

// Utils
import { cn } from "@/shared/utils/cn.js";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";
import { ROLE_TYPE_LABELS } from "@/shared/constants/roles";

// Muzlatish tugmasi kartochkaning o'zida: rolni muzlatish uchun tahrirlash
// sahifasiga kirish shart emas, bitta bosish yetadi.
// Server cheklovlari (roles.service.js): tizim rolini va o'z rolini
// muzlatib bo'lmaydi - shuning uchun bu holatlarda tugma o'chirilgan
// holatda, sababi tooltipda ko'rsatiladi.
const FreezeToggle = ({ role, reason, isPending, onToggle }) => {
  const isFrozen = Boolean(role.isFrozen);
  const isDisabled = Boolean(reason) || isPending;
  const action = isFrozen ? "Muzdan chiqarish" : "Muzlatish";

  return (
    <Tooltip content={reason || action}>
      <button
        type="button"
        aria-label={`${role.label} - ${action}`}
        aria-disabled={isDisabled}
        onClick={(e) => {
          // Kartochka bosilishi (tahrirlash sahifasi) ishga tushmasin.
          e.stopPropagation();
          if (isDisabled) return;
          onToggle(role);
        }}
        className={cn(
          "ml-auto flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
          isFrozen
            ? "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"
            : "border-transparent bg-muted text-muted-foreground",
          isDisabled
            ? "cursor-not-allowed opacity-50"
            : isFrozen
              ? "hover:bg-sky-200 dark:hover:bg-sky-900"
              : "hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:hover:border-sky-900 dark:hover:bg-sky-950 dark:hover:text-sky-300",
        )}
      >
        {isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Snowflake className="size-3" />
        )}
        {isFrozen ? "Muzlatilgan" : "Muzlatish"}
      </button>
    </Tooltip>
  );
};

// Rol kartochkalari - tizim va custom rollar bitta ro'yxatda.
// Bosilganda tahrirlash sahifasi ochiladi.
const RolesList = ({ roles = [], onSelect, onToggleFreeze, pendingValue }) => {
  const { role: currentRole } = useAuth();
  const { has } = usePermissions();

  const canFreeze = has(PERMISSIONS.ROLES_UPDATE);

  if (!roles.length) {
    return (
      <p className="rounded-xl border px-1 py-10 text-center text-sm text-muted-foreground">
        Hozircha rol yo'q
      </p>
    );
  }

  // Muzlatish nega mumkin emasligi - tugmaning tooltipida ko'rsatiladi.
  const freezeBlockReason = (role) => {
    if (!canFreeze) return "Bu amal uchun ruxsatingiz yo'q";
    if (role.isSystem) return "Tizim rolini muzlatib bo'lmaydi";
    if (role.value === currentRole) return "O'z rolingizni muzlata olmaysiz";
    return "";
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {roles.map((role) => (
        <div
          key={role.value}
          className={cn(
            "group relative rounded-xl border px-4 py-3.5 transition-colors hover:bg-muted/50",
            role.isFrozen &&
              "border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20",
          )}
        >
          {/* Kartochkaning butun yuzasi tahrirlash havolasi. Muzlatish tugmasi
              uning ustida turadi - shunda ichma-ich <button> hosil bo'lmaydi. */}
          <button
            type="button"
            aria-label={`${role.label} rolini ochish`}
            onClick={() => onSelect?.(role.value)}
            className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div className="pointer-events-none relative">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{role.label}</span>
                  {role.isSystem && (
                    <Lock
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-label="Tizim roli"
                    />
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {role.description || ROLE_TYPE_LABELS[role.roleType] || "—"}
                </p>
              </div>

              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {role.userCount} ta
              </span>
              <span>{role.permissionKeys?.length || 0} ta ruxsat</span>

              <div className="pointer-events-auto ml-auto">
                <FreezeToggle
                  role={role}
                  reason={freezeBlockReason(role)}
                  isPending={pendingValue === role.value}
                  onToggle={onToggleFreeze}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RolesList;
