// Router
import { Link } from "react-router-dom";

// Icons
import { Search, ChevronRight } from "lucide-react";

// Components
import SystemNotificationBell from "@/shared/components/systemNotification/SystemNotificationBell";
import { OwnerGlobalSearch } from "@/owner";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Reference dizayndagi yuqori panel - faqat dashboard sahifasida: qidiruv + bildirishnoma + profil.
const DashboardTopbar = () => {
  const { user } = useAuth();

  const displayName =
    user?.firstName || user?.lastName
      ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
      : user?.username || "Foydalanuvchi";
  const initial = (user?.firstName?.[0] || user?.username?.[0] || "?").toUpperCase();

  return (
    <div className="flex items-center gap-3">
      {/* Qidiruv tugmasi - global search dialogini ochadi */}
      <OwnerGlobalSearch
        renderTrigger={({ open, shortcut }) => (
          <button
            type="button"
            onClick={open}
            className="hidden h-10 w-56 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-500 transition hover:border-primary/30 sm:flex lg:w-72"
          >
            <Search className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1 text-left">Qidiruv...</span>
            <kbd className="hidden items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 lg:inline-flex">
              {shortcut}
            </kbd>
          </button>
        )}
      />

      <SystemNotificationBell />

      {/* Profil havolasi */}
      <Link
        to="/owner/profile"
        className="group flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-2 transition hover:border-primary/30 hover:shadow-sm"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initial}
        </span>
        <span className="hidden min-w-0 flex-col leading-tight md:flex">
          <span className="truncate text-sm font-medium text-zinc-900">{displayName}</span>
          <span className="truncate text-[11px] text-zinc-500">@{user?.username}</span>
        </span>
        <ChevronRight className="size-4 text-zinc-400 transition group-hover:text-primary" />
      </Link>
    </div>
  );
};

export default DashboardTopbar;
