import { cva } from "class-variance-authority";
import { cn } from "@/shared/utils/cn";

/**
 * StatusBadge - loyiha bo'ylab yagona status badge.
 *
 * - Fixed balandlik (h-6), bir qatorda, hech qachon sinmaydi (whitespace-nowrap).
 * - Uzun matn truncate bo'ladi (max-w + truncate), to'liqligi title atributida.
 * - Rang faqat semantik `tone` orqali beriladi (inline rang yo'q).
 *
 * tone: "info" | "warning" | "success" | "danger" | "neutral"
 */
const badge = cva(
  "inline-flex h-6 max-w-[140px] items-center gap-1 truncate whitespace-nowrap rounded-md border px-2 text-xs font-medium leading-none",
  {
    variants: {
      tone: {
        info: "border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
        warning: "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
        success: "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        danger: "border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300",
        neutral: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const StatusBadge = ({ tone, icon: Icon, children, className }) => (
  <span
    className={cn(badge({ tone }), className)}
    title={typeof children === "string" ? children : undefined}
  >
    {Icon && <Icon className="size-3 shrink-0" />}
    <span className="truncate">{children}</span>
  </span>
);

export default StatusBadge;
