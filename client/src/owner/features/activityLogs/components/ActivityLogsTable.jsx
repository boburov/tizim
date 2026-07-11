import { Eye } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { cn } from "@/shared/utils/cn";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import MethodBadge from "./MethodBadge";

const formatTime = (d) => formatDateTimeUz(d, { withSeconds: true });

const fullName = (u) =>
  u
    ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username || "-"
    : "-";

const statusClass = (status) => {
  if (!status) return "text-zinc-500";
  if (status >= 500) return "text-rose-600 font-semibold";
  if (status >= 400) return "text-amber-600 font-semibold";
  if (status >= 200 && status < 300) return "text-green-600";
  return "text-zinc-600";
};

const ActivityLogsTable = ({ items = [] }) => {
  const { openModal } = useModal();

  if (items.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        Loglar topilmadi
      </div>
    );
  }

  return (
    <div className="border rounded-sm overflow-x-auto bg-white">
      <table className="w-full text-sm">
        <thead className=" text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Vaqt</th>
            <th className="px-3 py-2 font-medium">Metod</th>
            <th className="px-3 py-2 font-medium">Yo'l</th>
            <th className="px-3 py-2 font-medium">Foydalanuvchi</th>
            <th className="px-3 py-2 font-medium">Holat</th>
            <th className="px-3 py-2 font-medium">Davomiyligi</th>
            <th className="px-3 py-2 font-medium text-right">Amallar</th>
          </tr>
        </thead>
        <tbody>
          {items.map((log) => (
            <tr key={log._id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">
                {formatTime(log.createdAt)}
              </td>
              <td className="px-3 py-2">
                <MethodBadge method={log.method} />
              </td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-700 max-w-[280px] truncate">
                {log.path}
              </td>
              <td className="px-3 py-2">
                <div className="text-sm">{fullName(log.user)}</div>
                <div className="text-xs text-muted-foreground">
                  {log.userRole}
                </div>
              </td>
              <td className={cn("px-3 py-2 font-mono", statusClass(log.status))}>
                {log.status || "-"}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {log.durationMs}ms
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      openModal(MODAL.ACTIVITY_LOG_DETAIL, { logId: log._id })
                    }
                    
                  >
                    <Eye className="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ActivityLogsTable;
