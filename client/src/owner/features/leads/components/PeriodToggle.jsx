import { cn } from "@/shared/utils/cn";

const PRESETS = [
  { value: "week", label: "Haftalik" },
  { value: "month", label: "Oylik" },
  { value: "all", label: "Umumiy" },
];

const PeriodToggle = ({ value = "all", onChange }) => (
  <div className="inline-flex items-center gap-1 rounded-lg border bg-white p-1">
    {PRESETS.map((p) => (
      <button
        key={p.value}
        type="button"
        onClick={() => onChange(p.value)}
        aria-pressed={value === p.value}
        className={cn(
          "h-8 rounded-md px-3 text-xs font-medium transition-colors",
          value === p.value
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        {p.label}
      </button>
    ))}
  </div>
);

export default PeriodToggle;
