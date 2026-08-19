import { AlertTriangle, Inbox, Lock, Loader2 } from "lucide-react";
import { cn } from "@/shared/utils/cn";

/**
 * YUKLANISH / BO'SH / XATO / RUXSAT YO'Q holatlari — bitta joyda.
 *
 * Talab 14 aynan shu haqda: har moliyaviy ko'rinishda to'rt holat ham
 * bo'lishi kerak va ularning HECH BIRI raqamga o'xshamasligi kerak.
 *
 * ENG MUHIMI — XATO holati. So'rov yiqilganda "0 so'm" ko'rsatish
 * hech qanday xato belgisi bermaydi va owner uni FAKT deb o'qiydi.
 * Bu qoida loyihada allaqachon yozilgan
 * (`shared/components/dashboard/dataStatus.js`) — bu komponent
 * o'shaning ko'rinadigan tomoni.
 */

const Shell = ({ icon: Icon, tone, title, hint, action, className }) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center",
      className,
    )}
  >
    <span
      className={cn(
        "flex size-10 items-center justify-center rounded-full",
        tone === "error" ? "bg-destructive/10 text-destructive"
          : tone === "locked" ? "bg-muted text-muted-foreground"
            : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
    </span>
    <p className="text-sm font-medium text-foreground">{title}</p>
    {hint && <p className="max-w-md text-xs text-muted-foreground">{hint}</p>}
    {action}
  </div>
);

export const LoadingBlock = ({ className, rows = 3 }) => (
  <div className={cn("space-y-3", className)}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
    ))}
  </div>
);

export const InlineLoading = ({ className }) => (
  <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
    <Loader2 className="size-3 animate-spin" />
    Yuklanmoqda
  </span>
);

export const EmptyBlock = ({ title = "Ma'lumot yo'q", hint, className }) => (
  <Shell icon={Inbox} tone="empty" title={title} hint={hint} className={className} />
);

export const ErrorBlock = ({ error, onRetry, className }) => (
  <Shell
    icon={AlertTriangle}
    tone="error"
    title="Ma'lumotni yuklab bo'lmadi"
    // XATO MATNI KO'RSATILADI: "nimadir xato" degan xabar bilan
    // foydalanuvchi ham, ishlab chiquvchi ham hech narsa qila olmaydi.
    hint={error?.response?.data?.message || error?.message || "Server javob bermadi"}
    action={
      onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          Qayta urinish
        </button>
      ) : null
    }
    className={className}
  />
);

export const DeniedBlock = ({ permission, className }) => (
  <Shell
    icon={Lock}
    tone="locked"
    title="Bu bo'lim uchun ruxsat yo'q"
    hint={
      permission
        ? `Kerakli ruxsat: ${permission}. Uni markaz egasi yoki direktor beradi.`
        : "Bu ma'lumotni ko'rish huquqi berilmagan."
    }
    className={className}
  />
);

/**
 * So'rov holatini bitta joyda hal qiladi.
 *
 * Ishlatilishi:
 *   <QueryState query={q} empty={!q.data?.items?.length}>
 *     {(data) => <Table rows={data.items} />}
 *   </QueryState>
 */
export const QueryState = ({ query, empty, emptyTitle, emptyHint, children, loadingRows }) => {
  if (query.isLoading) return <LoadingBlock rows={loadingRows} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={query.refetch} />;
  if (empty) return <EmptyBlock title={emptyTitle} hint={emptyHint} />;
  return children(query.data);
};

export default QueryState;
