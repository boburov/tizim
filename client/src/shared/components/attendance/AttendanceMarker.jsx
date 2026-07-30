import { STATUS_DOT_CLASS } from "@/shared/constants/attendance";
import {
  Select as SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/shared/components/shadcn/select";
import { cn } from "@/shared/utils/cn";

// Holat dropdown: Keldi (present) / Kelmadi (absent)
const HOLAT_OPTIONS = [
  { value: "present", label: "Keldi" },
  { value: "absent", label: "Kelmadi" },
];
// Sabab dropdown: Sababli (excused) / Sababsiz (absent)
const SABAB_OPTIONS = [
  { value: "excused", label: "Sababli" },
  { value: "absent", label: "Sababsiz" },
];

const HOLAT_TRIGGER_CLASS = {
  present: "border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/15",
  absent: "border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/15",
};
const SABAB_TRIGGER_CLASS = {
  excused: "border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/15",
  absent: "border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/15",
};

const TRIGGER_BASE =
  "h-auto shrink-0 py-2 text-xs font-medium transition-colors";

// Rangli nuqta (dropdown ichida va triggerda status ko'rsatkichi)
const StatusDot = ({ status }) => (
  <span
    className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT_CLASS[status])}
  />
);

const labelOf = (options, val) =>
  options.find((o) => o.value === val)?.label || "";

// Bitta o'quvchi qatori uchun: Holat (Keldi/Kelmadi) + Sabab (Sababli/Sababsiz)
// dropdownlari va yonida izoh maydoni.
// - Keldi tanlansa: Sabab dropdown DISABLE.
// - Kelmadi tanlansa: Sabab ENABLE (Sababli/Sababsiz).
// Izoh har qanday statusда kiritilishi mumkin (ixtiyoriy).
const AttendanceMarker = ({ value = {}, onChange, disabled = false }) => {
  const { status = "", reason = "" } = value;

  // "Kelmadi" oilasi: absent (sababsiz) yoki excused (sababli)
  const kelmadiFamily = status === "absent" || status === "excused";
  const holatValue = status === "present" ? "present" : kelmadiFamily ? "absent" : "";
  const sababValue = kelmadiFamily ? status : "";
  const sababDisabled = disabled || !kelmadiFamily;

  const pickStatus = (s) =>
    onChange({ ...value, status: s, reason: "", lateMinutes: 0 });
  const setReason = (e) => onChange({ ...value, reason: e.target.value });

  return (
    <div className="flex flex-wrap items-center gap-1.5 w-full">
      {/* Holat: Keldi / Kelmadi */}
      <SelectRoot value={holatValue} onValueChange={pickStatus} disabled={disabled}>
        <SelectTrigger
          className={cn(
            TRIGGER_BASE,
            "w-[130px]",
            holatValue
              ? cn(HOLAT_TRIGGER_CLASS[holatValue], "font-semibold")
              : "border-border bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {holatValue ? (
            <span className="flex items-center gap-2">
              <StatusDot status={holatValue} />
              {labelOf(HOLAT_OPTIONS, holatValue)}
            </span>
          ) : (
            <span>Holat</span>
          )}
        </SelectTrigger>
        <SelectContent>
          {HOLAT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              <span className="flex items-center gap-2">
                <StatusDot status={o.value} />
                {o.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>

      {/* Sabab: Sababli / Sababsiz - faqat Kelmadi holatida enable */}
      <SelectRoot
        value={sababValue}
        onValueChange={pickStatus}
        disabled={sababDisabled}
      >
        <SelectTrigger
          className={cn(
            TRIGGER_BASE,
            "w-[150px]",
            sababValue
              ? cn(SABAB_TRIGGER_CLASS[sababValue], "font-semibold")
              : "border-border bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {sababValue ? (
            <span className="flex items-center gap-2">
              <StatusDot status={sababValue} />
              {labelOf(SABAB_OPTIONS, sababValue)}
            </span>
          ) : (
            <span>Sababli / Sababsiz</span>
          )}
        </SelectTrigger>
        <SelectContent>
          {SABAB_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              <span className="flex items-center gap-2">
                <StatusDot status={o.value} />
                {o.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>

      {/* Izoh - yon tomonda, har qanday status uchun (ixtiyoriy) */}
      <input
        type="text"
        value={reason}
        disabled={disabled || !status}
        maxLength={300}
        onChange={setReason}
        placeholder="Izoh (ixtiyoriy)"
        className="min-w-[140px] flex-1 rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-input focus:outline-none focus:ring-1 focus:ring-border disabled:bg-muted disabled:opacity-60"
      />
    </div>
  );
};

export default AttendanceMarker;
