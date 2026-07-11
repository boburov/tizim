// Router
import { useNavigate } from "react-router-dom";

// Hooks
import { useMarkSystemReadMutation } from "@/owner/features/systemNotifications";

// Utils
import { formatDateTimeUz } from "@/shared/utils/formatDate";

const SystemNotificationItem = ({ notification, onNavigate }) => {
  const navigate = useNavigate();
  const { mutate: markRead } = useMarkSystemReadMutation();
  const { _id, message, link, isRead, createdAt } = notification;

  const handleClick = () => {
    if (!isRead) markRead(_id);
    if (link) {
      onNavigate?.();
      navigate(link);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left flex gap-3 px-4 py-3 border-b transition hover:bg-muted/50 ${
        isRead ? "" : "bg-primary/5"
      }`}
    >
      {/* O'qilmaganlik indikatori */}
      <span
        className={`mt-1.5 size-2 shrink-0 rounded-full ${
          isRead ? "bg-transparent" : "bg-primary"
        }`}
      />

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm break-words ${
            isRead ? "text-muted-foreground" : "font-medium text-foreground"
          }`}
        >
          {message}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDateTimeUz(createdAt)}</span>
          {link && <span className="text-primary">Ko'rish →</span>}
        </div>
      </div>
    </button>
  );
};

export default SystemNotificationItem;
