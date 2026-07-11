// React
import { useState } from "react";

// Components
import Button from "@/shared/components/ui/button/Button";
import SystemNotificationItem from "./SystemNotificationItem";

// Hooks
import {
  useSystemNotificationsQuery,
  useMarkAllSystemReadMutation,
} from "@/owner/features/systemNotifications";

const FILTERS = [
  { key: "unread", label: "O'qilmagan" },
  { key: "read", label: "O'qilgan" },
];

const SystemNotificationPanel = ({ onClose }) => {
  const [status, setStatus] = useState("unread");
  const { data, isLoading } = useSystemNotificationsQuery({ status, limit: 100 });
  const { mutate: markAllRead, isPending } = useMarkAllSystemReadMutation();

  const items = data?.data || [];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Filtrlar + hammasini o'qish */}
      <div className="flex items-center justify-between gap-2 p-3 border-b">
        <div className="inline-flex rounded-md bg-muted p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1 text-xs rounded transition ${
                status === f.key
                  ? "bg-white shadow-sm font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => markAllRead()}
        >
          Hammasini o'qish
        </Button>
      </div>

      {/* Ro'yxat */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Yuklanmoqda...
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Bildirishnoma yo'q
          </div>
        )}

        {!isLoading &&
          items.map((n) => (
            <SystemNotificationItem
              key={n._id}
              notification={n}
              onNavigate={onClose}
            />
          ))}
      </div>
    </div>
  );
};

export default SystemNotificationPanel;
