// Icons
import { Snowflake, Users, ChevronRight, Lock } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn.js";

// Constants
import { ROLE_TYPE_LABELS } from "@/shared/constants/roles";

// Rol kartochkalari. Bosilganda tahrirlash sahifasi ochiladi.
// Muzlatilgan rol aniq ko'rinib turadi - uning egalari panelga kira olmaydi.
const RolesList = ({ roles = [], onSelect }) => {
  if (!roles.length) {
    return (
      <p className="rounded-xl border px-1 py-10 text-center text-sm text-muted-foreground">
        Bu bo'limda rol yo'q
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {roles.map((role) => (
        <button
          key={role.value}
          type="button"
          onClick={() => onSelect(role.value)}
          className={cn(
            "group rounded-xl border px-4 py-3.5 text-left transition-colors hover:bg-muted/50",
            role.isFrozen && "opacity-70",
          )}
        >
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

            {role.isFrozen && (
              <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                <Snowflake className="size-3" />
                Muzlatilgan
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
};

export default RolesList;
