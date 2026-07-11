import { DAY_OPTIONS } from "@/shared/constants/attendance";
import { cn } from "@/shared/utils/cn";

const DaysOfWeekToggle = ({
  value = [],
  onChange,
  disabled = false,
  label = "Hafta kunlari",
  description = "Bo'sh qoldiring - barcha kunlar uchun",
}) => {
  const toggle = (day) => {
    if (disabled) return;
    const exists = value.includes(day);
    onChange(exists ? value.filter((d) => d !== day) : [...value, day]);
  };

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium block">{label}</label>
      <div className="flex flex-wrap gap-2">
        {DAY_OPTIONS.map((d) => {
          const selected = value.includes(d.value);
          return (
            <button
              type="button"
              key={d.value}
              onClick={() => toggle(d.value)}
              disabled={disabled}
              className={cn(
                "px-3 py-1.5 rounded-md border text-sm transition",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white hover:bg-gray-50 text-gray-700",
              )}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
};

export default DaysOfWeekToggle;
