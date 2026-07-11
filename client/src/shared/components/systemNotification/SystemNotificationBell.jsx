// React
import { useState } from "react";

// Icons
import { Bell } from "lucide-react";

// Components
import {
  Sheet,
  SheetTitle,
  SheetHeader,
  SheetContent,
} from "@/shared/components/shadcn/sheet";
import SystemNotificationPanel from "./SystemNotificationPanel";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import { useSystemUnreadCountQuery } from "@/owner/features/systemNotifications";

// Constants
import { ROLES } from "@/shared/constants/roles";

const SystemNotificationBell = ({ className = "" }) => {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);

  // Tizim bildirishnomalari faqat owner uchun
  const isOwner = role === ROLES.OWNER;
  const { data } = useSystemUnreadCountQuery({ enabled: !!user && isOwner });

  if (!isOwner) return null;

  const count = data?.count || 0;
  const display = count > 99 ? "99+" : String(count);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        title="Bildirishnomalar"
        onClick={() => setOpen(true)}
        aria-label={`Bildirishnomalar (${count} o'qilmagan)`}
        className={`relative bg-white inline-flex items-center justify-center size-10 rounded-full border transition hover:bg-background ${className}`}
      >
        <Bell strokeWidth={1.5} className="size-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-medium leading-none">
            {display}
          </span>
        )}
      </button>

      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 w-full sm:max-w-md"
      >
        <SheetHeader className="p-4 border-b text-left">
          <SheetTitle>Bildirishnomalar</SheetTitle>
        </SheetHeader>
        <SystemNotificationPanel onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
};

export default SystemNotificationBell;
