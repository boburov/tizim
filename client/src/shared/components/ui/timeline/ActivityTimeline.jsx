import {
  UserPlus,
  UserMinus,
  Snowflake,
  Sun,
  Wallet,
  XCircle,
  TrendingDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  Undo2,
  UserCheck,
  UserX,
  FolderPlus,
  FlagOff,
  Archive,
  RotateCcw,
  History,
  Circle,
} from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";

// Hodisa turi -> ikon + rang (tone). Tailwind klasslari to'liq literal (purge uchun).
const TONE = {
  emerald: "bg-emerald-100 text-emerald-600",
  rose: "bg-rose-100 text-rose-600",
  sky: "bg-sky-100 text-sky-600",
  amber: "bg-amber-100 text-amber-600",
  indigo: "bg-indigo-100 text-indigo-600",
  zinc: "bg-zinc-100 text-zinc-600",
};

const TYPE_CONFIG = {
  student_joined_group: { icon: UserPlus, tone: "emerald" },
  student_left_group: { icon: UserMinus, tone: "rose" },
  student_frozen: { icon: Snowflake, tone: "sky" },
  student_unfrozen: { icon: Sun, tone: "amber" },
  payment_received: { icon: Wallet, tone: "emerald" },
  payment_cancelled: { icon: XCircle, tone: "rose" },
  debt_written_off: { icon: TrendingDown, tone: "rose" },
  deposit_topup: { icon: ArrowDownToLine, tone: "emerald" },
  deposit_withdraw: { icon: ArrowUpFromLine, tone: "amber" },
  deposit_refund: { icon: Undo2, tone: "sky" },
  teacher_assigned: { icon: UserCheck, tone: "indigo" },
  teacher_unassigned: { icon: UserX, tone: "zinc" },
  group_created: { icon: FolderPlus, tone: "indigo" },
  group_ended: { icon: FlagOff, tone: "zinc" },
  user_archived: { icon: Archive, tone: "zinc" },
  user_restored: { icon: RotateCcw, tone: "emerald" },
};

const DEFAULT_CONFIG = { icon: Circle, tone: "zinc" };

const fullName = (u) =>
  u ? (u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.name || "") : "";

/**
 * ActivityTimeline - zamonaviy vertikal faoliyat tarixi (Arxiv).
 * items: backend hodisalari (yangi -> eski tartibda keladi).
 * context: "student" (guruh chipini ko'rsatadi) | "group" (o'quvchi chipini ko'rsatadi).
 */
const ActivityTimeline = ({ items = [], context = "student" }) => {
  if (!items.length) {
    return (
      <EmptyState
        icon={History}
        title="Tarix bo'sh"
        description="Hozircha qayd etilgan hodisa yo'q"
      />
    );
  }

  return (
    <ol className="relative">
      {items.map((e, i) => {
        const cfg = TYPE_CONFIG[e.type] || DEFAULT_CONFIG;
        const Icon = cfg.icon;
        const isLast = i === items.length - 1;

        const chip =
          context === "group"
            ? fullName(e.student)
            : e.group?.name || "";
        const performer = fullName(e.performedBy);

        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && (
              <span className="absolute left-4 top-8 bottom-0 w-px -translate-x-1/2 bg-border" />
            )}
            <span
              className={cn(
                "z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                TONE[cfg.tone] || TONE.zinc,
              )}
            >
              <Icon className="size-4" strokeWidth={2} />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-foreground">
                  {e.title}
                </span>
                {e.amount != null && (
                  <span className="text-sm font-semibold text-foreground">
                    {formatMoney(e.amount)}
                  </span>
                )}
                {chip && (
                  <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {chip}
                  </span>
                )}
              </div>

              {e.description && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {e.description}
                </p>
              )}

              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <time>{formatDateTimeUz(e.date)}</time>
                {performer && (
                  <>
                    <span>·</span>
                    <span>{performer}</span>
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default ActivityTimeline;
