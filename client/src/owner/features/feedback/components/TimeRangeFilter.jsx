import { cn } from "@/shared/utils/cn";
import DateRangePicker from "@/shared/components/ui/date/DateRangePicker";
import { TIME_PRESETS } from "../utils/timeRange";

const PRESETS = TIME_PRESETS;

/**
 * TimeRangeFilter - vaqt bo'yicha preset tugmalari + ixtiyoriy diapazon.
 * Props: preset, custom {from,to}, onPresetChange, onCustomChange
 */
const TimeRangeFilter = ({
  preset = "all",
  custom = { from: "", to: "" },
  onPresetChange,
  onCustomChange,
}) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border bg-white p-1">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onPresetChange(p.value)}
          aria-pressed={preset === p.value}
          className={cn(
            "h-8 rounded-md px-3 text-xs font-medium transition-colors",
            preset === p.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>

    {preset === "range" && (
      <DateRangePicker
        value={custom}
        onChange={onCustomChange}
        onClear={() => {
          onCustomChange("from", "");
          onCustomChange("to", "");
        }}
        className="w-full sm:w-64"
      />
    )}
  </div>
);

export default TimeRangeFilter;
