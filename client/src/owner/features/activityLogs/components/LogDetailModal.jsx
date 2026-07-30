import { useState } from "react";
import { ChevronDown, Clock, MapPin, Monitor } from "lucide-react";
import ActionBadge from "./ActionBadge";
import LogUserCell from "./LogUserCell";
import LogChangesList from "./LogChangesList";
import useActivityLogDetailQuery from "../hooks/useActivityLogDetailQuery";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import { cn } from "@/shared/utils/cn";

const Meta = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2">
    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm text-foreground">{value || "—"}</div>
    </div>
  </div>
);

const TechRow = ({ label, value, className = "" }) => (
  <div className="grid grid-cols-3 gap-3 py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn("col-span-2 break-all font-mono text-xs", className)}>
      {value || "—"}
    </span>
  </div>
);

const statusClass = (status) => {
  if (!status) return "text-muted-foreground";
  if (status >= 500) return "text-rose-600 dark:text-rose-300 font-semibold";
  if (status >= 400) return "text-amber-600 dark:text-amber-300 font-semibold";
  if (status >= 200 && status < 300) return "text-emerald-600 dark:text-emerald-300";
  return "text-muted-foreground";
};

// "Mozilla/5.0 (Macintosh; Intel Mac OS X ...) ... Safari/605" -> "Safari · macOS"
const readableDevice = (ua = "") => {
  if (!ua) return "";
  const os = /Macintosh|Mac OS/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return [browser, os].filter(Boolean).join(" · ") || "Noma'lum qurilma";
};

const LogDetailModal = ({ logId }) => {
  const { data: log, isLoading } = useActivityLogDetailQuery(logId);
  const [showTech, setShowTech] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Yuklanmoqda...
      </div>
    );
  }
  if (!log) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Log topilmadi
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. KIM va NIMA QILDI - eng muhim ma'lumot tepada */}
      <div
        className={cn(
          "rounded-lg border p-4",
          log.failed
            ? "border-rose-200 dark:border-rose-500/30 bg-rose-50/50"
            : "border-border bg-muted/80",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <LogUserCell
            user={log.user}
            userRole={log.userRole}
            actorLabel={log.actorLabel}
          />
          <ActionBadge action={log.action} failed={log.failed} />
        </div>

        <p className="mt-3 text-[15px] font-medium text-foreground">
          {log.description}
        </p>

        {log.failed && (
          <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">
            Amal bajarilmadi — so'rov xatolik bilan yakunlandi
          </p>
        )}
      </div>

      {/* 2. QACHON, QAYERDAN, QAYSI QURILMADAN */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Meta
          icon={Clock}
          label="Vaqti"
          value={formatDateTimeUz(log.createdAt, { withSeconds: true })}
        />
        <Meta icon={MapPin} label="IP manzil" value={log.ip} />
        <Meta
          icon={Monitor}
          label="Qurilma"
          value={readableDevice(log.userAgent)}
        />
      </div>

      {/* 3. NIMA O'ZGARDI - JSON emas, o'qiladigan jadval */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          O'zgartirilgan ma'lumotlar
        </div>
        <LogChangesList body={log.body} />
      </div>

      {/* 4. Texnik ma'lumotlar - yopiq, faqat kerak bo'lganda ochiladi */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          <span>Texnik ma'lumotlar</span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              showTech && "rotate-180",
            )}
          />
        </button>

        {showTech && (
          <div className="border-t border-border px-3 py-2">
            <TechRow label="Metod" value={log.method} />
            <TechRow label="Yo'l" value={log.path} />
            <TechRow
              label="Holat kodi"
              value={log.status || "—"}
              className={statusClass(log.status)}
            />
            <TechRow label="Davomiyligi" value={`${log.durationMs} ms`} />
            <TechRow label="Resurs turi" value={log.resourceType} />
            <TechRow label="Resurs ID" value={log.resourceId} />
            <TechRow label="User-Agent" value={log.userAgent} />
          </div>
        )}
      </div>
    </div>
  );
};

export default LogDetailModal;
