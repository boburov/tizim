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
        info: "border-sky-200 bg-sky-50 text-sky-700",
        warning: "border-amber-200 bg-amber-50 text-amber-700",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        danger: "border-red-200 bg-red-50 text-red-700",
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
