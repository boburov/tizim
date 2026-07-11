import { cva } from "class-variance-authority";
import { cn } from "@/shared/utils/cn";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";

/**
 * StatTile - hisobot statistikasi kartasi.
 * Bosilsa ro'yxatni shu status bo'yicha filtrlaydi (onClick).
 * tone semantik rang berib turadi: info|warning|success|danger|neutral.
 */
// Brendning iliq (jigarrang/krem) palitrasiga moslangan ohanglar.
// Statuslar bir-biridan farqlanadi, lekin "kamalak" emas - hammasi tabiiy tuproq tusida.
const accent = cva("text-2xl font-semibold tabular-nums", {
  variants: {
    tone: {
      info: "text-primary/70",
      warning: "text-primary",
      success: "text-primary/85",
      danger: "text-destructive/80",
      neutral: "text-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const activeRing = {
  info: "border-primary/30 ring-2 ring-primary/15",
  warning: "border-primary/40 ring-2 ring-primary/20",
  success: "border-primary/35 ring-2 ring-primary/15",
  danger: "border-destructive/30 ring-2 ring-destructive/15",
  neutral: "border-primary/40 ring-2 ring-primary/20",
};

const StatTile = ({
  label,
  value,
  tone = "neutral",
  onClick,
  active = false,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <Skeleton className="mb-3 h-3 w-16" />
        <Skeleton className="h-7 w-10" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-1 rounded-lg border bg-white p-4 text-left transition-all",
        "hover:border-foreground/20 hover:bg-muted/30",
        active && activeRing[tone],
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={accent({ tone })}>{value}</span>
    </button>
  );
};

export default StatTile;
