import { Send, Smartphone, Check } from "lucide-react";
import { cn } from "@/shared/utils/cn";

const CHANNELS = [
  {
    key: "telegram",
    title: "Telegram bot",
    description: "Har bir foydalanuvchiga bot orqali shaxsiy (DM) xabar yuboriladi.",
    icon: Send,
  },
  {
    key: "inapp",
    title: "Platforma (Ilova ichida)",
    description: "Xabar foydalanuvchining platforma ichidagi inbox'ida ko'rinadi.",
    icon: Smartphone,
  },
];

/**
 * ChannelSelector - yetkazish kanallarini tanlash (ikkalasini ham bo'lishi mumkin).
 * value: string[] ("telegram" | "inapp"), onChange: (string[]) => void
 */
const ChannelSelector = ({ value = [], onChange, disabled = false }) => {
  const toggle = (key) => {
    const set = new Set(value);
    set.has(key) ? set.delete(key) : set.add(key);
    onChange([...set]);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CHANNELS.map((ch) => {
        const active = value.includes(ch.key);
        const Icon = ch.icon;
        return (
          <button
            key={ch.key}
            type="button"
            disabled={disabled}
            onClick={() => toggle(ch.key)}
            aria-pressed={active}
            className={cn(
              "relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-white hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-md",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4.5" />
            </span>
            <span className="font-medium">{ch.title}</span>
            <span className="text-xs text-muted-foreground">
              {ch.description}
            </span>
            {active && (
              <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ChannelSelector;
