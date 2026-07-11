import MethodBadge from "./MethodBadge";
import useActivityLogDetailQuery from "../hooks/useActivityLogDetailQuery";
import { formatDateTimeUz } from "@/shared/utils/formatDate";

const fullName = (u) =>
  u
    ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username || "-"
    : "Tizim";

const Row = ({ label, value, mono = false }) => (
  <div className="grid grid-cols-3 gap-2 text-sm py-1.5 border-b border-zinc-100">
    <div className="text-zinc-500">{label}</div>
    <div className={`col-span-2 ${mono ? "font-mono text-xs" : ""}`}>
      {value}
    </div>
  </div>
);

const LogDetailModal = ({ logId }) => {
  const { data: log, isLoading } = useActivityLogDetailQuery(logId);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Yuklanmoqda...
      </div>
    );
  }
  if (!log) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Log topilmadi
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-0">
        <Row
          label="Vaqt"
          value={formatDateTimeUz(log.createdAt, { withSeconds: true })}
        />
        <Row
          label="Metod"
          value={<MethodBadge method={log.method} />}
        />
        <Row label="Yo'l" value={log.path} mono />
        <Row label="Foydalanuvchi" value={fullName(log.user)} />
        <Row label="Roli" value={log.userRole || "-"} />
        <Row label="Holat" value={log.status || "-"} mono />
        <Row label="Davomiyligi" value={`${log.durationMs} ms`} mono />
        <Row label="IP" value={log.ip || "-"} mono />
        <Row label="Resurs turi" value={log.resourceType || "-"} />
        <Row label="Resurs ID" value={log.resourceId || "-"} mono />
      </div>

      {log.userAgent && (
        <div>
          <div className="text-sm text-zinc-500 mb-1">User-Agent</div>
          <div className="font-mono text-xs bg-zinc-50 border rounded p-2 break-all">
            {log.userAgent}
          </div>
        </div>
      )}

      <div>
        <div className="text-sm text-zinc-500 mb-1">So'rov tanasi (body)</div>
        <pre className="font-mono text-xs bg-zinc-50 border rounded p-2 max-h-[300px] overflow-auto">
          {log.body ? JSON.stringify(log.body, null, 2) : "-"}
        </pre>
      </div>
    </div>
  );
};

export default LogDetailModal;
