import { cn } from "@/shared/utils/cn";
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_SHORT_LABEL,
  FEEDBACK_STATUS_TONE,
} from "@/shared/constants/feedback";

// Tanlangan chip ranglari (faol holat) - semantik tonega bog'liq
const activeTone = {
  info: "bg-sky-600 text-white border-sky-600",
  warning: "bg-amber-500 text-white border-amber-500",
  success: "bg-emerald-600 text-white border-emerald-600",
  danger: "bg-red-600 text-white border-red-600",
};

const CHIPS = [
  { value: "", label: "Barchasi", tone: null },
  ...FEEDBACK_STATUSES.map((s) => ({
    value: s,
    label: FEEDBACK_STATUS_SHORT_LABEL[s],
    tone: FEEDBACK_STATUS_TONE[s],
  })),
];

/**
 * StatusChips - status bo'yicha tez filtr (segmentli chip qatori).
 */
const StatusChips = ({ value = "", onChange }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {CHIPS.map((chip) => {
      const isActive = value === chip.value;
      return (
        <button
          key={chip.value || "all"}
          type="button"
          onClick={() => onChange(chip.value)}
          aria-pressed={isActive}
          className={cn(
            "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
            isActive
              ? chip.tone
                ? activeTone[chip.tone]
                : "border-primary bg-primary text-primary-foreground"
              : "border-border bg-white text-muted-foreground hover:bg-muted",
          )}
        >
          {chip.label}
        </button>
      );
    })}
  </div>
);

export default StatusChips;
