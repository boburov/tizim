// Utils
import { cn } from "@/shared/utils/cn.js";

// Uch holatli switch: o'chiq / qisman / yoqiq.
//
// Nega shadcn Switch emas: qator va ustun sarlavhalari QISMAN holatni
// ko'rsatishi kerak (ba'zi kataklar tanlangan), Radix Switch esa faqat
// ikki holatni biladi. Qisman holatda tugmacha o'rtada turadi.
export const SWITCH_STATE = Object.freeze({
  OFF: "off",
  PARTIAL: "partial",
  ON: "on",
});

const PermissionSwitch = ({
  state = SWITCH_STATE.OFF,
  onToggle,
  disabled = false,
  label,
  ariaLabel,
}) => {
  const isOn = state === SWITCH_STATE.ON;
  const isPartial = state === SWITCH_STATE.PARTIAL;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isPartial ? "mixed" : isOn}
      aria-label={ariaLabel || label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-2.5 text-left",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "relative flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors",
          // Tokenlar ikkala temada ham to'g'ri ishlaydi, shuning uchun
          // alohida `dark:` qoidalari kerak emas.
          isOn
            ? "bg-foreground"
            : isPartial
              ? "bg-muted-foreground/50"
              : "bg-accent",
          !disabled && !isOn && "hover:bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block size-[18px] rounded-full bg-card shadow-sm transition-transform",
            isOn
              ? "translate-x-[18px]"
              : isPartial
                ? "translate-x-[10px]"
                : "translate-x-0.5",
          )}
        />
      </span>
      {label && <span className="truncate text-sm">{label}</span>}
    </button>
  );
};

export default PermissionSwitch;
