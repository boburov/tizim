import { Zap, CalendarClock } from "lucide-react";
import { cn } from "@/shared/utils/cn";

// HTML datetime-local uchun minimal qiymat (hozir + 5 daqiqa), local TZ
const minDateTimeLocal = () => {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

/**
 * ScheduleField - "Hozir yuborish" yoki "Belgilangan vaqtga".
 * value: { mode: "now"|"schedule", scheduleAt: string(datetime-local) }
 * onChange(patch)
 */
const ScheduleField = ({ value, onChange, disabled = false }) => {
  const { mode = "now", scheduleAt = "" } = value;

  const options = [
    { key: "now", label: "Hozir yuborish", icon: Zap },
    { key: "schedule", label: "Rejalashtirish", icon: CalendarClock },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const Icon = o.icon;
          const active = mode === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ mode: o.key })}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition disabled:opacity-50",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-white hover:border-primary/40",
              )}
            >
              <Icon
                className={cn(
                  "size-4",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              {o.label}
            </button>
          );
        })}
      </div>

      {mode === "schedule" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Yuborish vaqti <span className="text-primary">*</span>
          </label>
          <input
            type="datetime-local"
            min={minDateTimeLocal()}
            value={scheduleAt}
            disabled={disabled}
            onChange={(e) => onChange({ scheduleAt: e.target.value })}
            className="h-10 w-full rounded-[2px] border border-input bg-white px-3 text-sm outline-2 outline-primary disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Xabar belgilangan vaqtda avtomatik yuboriladi.
          </p>
        </div>
      )}
    </div>
  );
};

export default ScheduleField;
