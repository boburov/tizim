import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { useActivityLogsQuery } from "@/owner/features/activityLogs";
import { relativeUz } from "../../utils/dashboard.utils";

// SO'NGGI HARAKATLAR - "jamoam nima qilyapti".
//
// NEGA AI SAHIFASIDA: AI kecha tunda o'ylagan, lekin bugun ertalab
// administrator allaqachon uchta to'lov kiritgan bo'lishi mumkin.
// Bu qator bo'lmasa owner ogohlantirishning hali ham dolzarbligini
// bilmaydi - "buni kimdir hal qildimi?" degan savol javobsiz qoladi.
//
// RUXSAT TEKSHIRILADI: jurnal alohida huquq ostida. Ruxsat bo'lmasa
// panel UMUMAN chizilmaydi - 403 xatosini "yuklanmadi" deb ko'rsatish
// sahifani buzilgan qilib ko'rsatardi.

const ACTION_TONE = {
  CREATE: "bg-emerald-500",
  UPDATE: "bg-sky-500",
  DELETE: "bg-rose-500",
  LOGIN: "bg-violet-500",
  LOGOUT: "bg-border",
  SYSTEM: "bg-border",
};

const AiRecentActivity = ({ limit = 6 }) => {
  const { has } = usePermissions();
  // Panel RUXSAT BO'LGANDAGINA o'rnatiladi. So'rovni shu komponentda
  // yozib, natijasini yashirish yetarli emas edi: hook shartsiz
  // ishlaydi va ruxsatsiz foydalanuvchi uchun har ochilishda 403
  // generatsiya qilardi.
  if (!has(PERMISSIONS.ACTIVITY_LOGS_READ)) return null;
  return <ActivityPanel limit={limit} />;
};

const ActivityPanel = ({ limit }) => {
  const { data, isLoading } = useActivityLogsQuery({ limit, page: 1 });
  const items = data?.data || [];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">So'nggi harakatlar</h3>
        </div>
        <Link
          to="/owner/activity-logs"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Jurnal
        </Link>
      </header>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Hozircha yozuv yo'q.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, limit).map((log) => (
            <li key={log._id} className="flex items-start gap-2.5 px-4 py-2.5">
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  log.failed ? "bg-rose-500" : ACTION_TONE[log.action] || ACTION_TONE.SYSTEM,
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {log.description || log.path}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {log.user
                    ? `${log.user.firstName || ""} ${log.user.lastName || ""}`.trim() ||
                      log.actorLabel
                    : log.actorLabel || "Tizim"}
                  {" · "}
                  {relativeUz(log.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AiRecentActivity;
