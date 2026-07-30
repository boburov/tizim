import { Cpu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/shared/components/shadcn/avatar";

const ROLE_LABELS = {
  owner: "Egasi",
  teacher: "O'qituvchi",
  student: "Talaba",
  system: "Tizim",
};

const fullName = (u) =>
  u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username || "" : "";

const initials = (name) => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const LogUserCell = ({ user, userRole, actorLabel }) => {
  const name = fullName(user);
  const isSystem = !name && userRole === "system";
  // Tizim tomonidan bajarilgan amal - "Mehmon" emas, "Tizim"
  const displayName = name || actorLabel || (isSystem ? "Tizim" : "Mehmon");
  const isKnown = Boolean(name);

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9 border border-border">
        <AvatarFallback
          className={
            isKnown
              ? "bg-muted text-foreground text-xs font-semibold"
              : "bg-muted text-muted-foreground text-xs font-semibold"
          }
        >
          {isKnown ? (
            initials(name)
          ) : isSystem ? (
            <Cpu className="size-4" strokeWidth={2} />
          ) : (
            "?"
          )}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">
          {displayName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {ROLE_LABELS[userRole] || userRole || "-"}
        </div>
      </div>
    </div>
  );
};

export default LogUserCell;
