import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useUnreadCountQuery } from "@/owner/features/notifications/hooks/useInboxQuery";
import useAuth from "@/shared/hooks/useAuth";
import { ROLES } from "@/shared/constants/roles";

const ROLE_INBOX_PATH = {
  [ROLES.OWNER]: "/owner/inbox",
  [ROLES.TEACHER]: "/teacher/inbox",
  [ROLES.STUDENT]: "/student/inbox",
};

const NotificationBell = ({ className = "" }) => {
  const { user, role } = useAuth();
  const inboxPath = ROLE_INBOX_PATH[role] || "/";

  // Yagona unread-count hook (optimistik yangilanishlar shu kesh bilan ishlaydi)
  const { data } = useUnreadCountQuery({ enabled: !!user });

  const count = data?.count || 0;
  const display = count > 99 ? "99+" : String(count);

  return (
    <Link
      to={inboxPath}
      className={`relative inline-flex items-center justify-center size-8 rounded-full hover:bg-muted transition ${className}`}
      title="Bildirishnomalar"
      aria-label={`Bildirishnomalar (${count} o'qilmagan)`}
    >
      <Bell strokeWidth={1.5} className="size-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-medium leading-none">
          {display}
        </span>
      )}
    </Link>
  );
};

export default NotificationBell;
