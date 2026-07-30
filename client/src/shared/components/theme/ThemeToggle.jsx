// Hooks
import useTheme, { THEME_OPTIONS } from "@/shared/hooks/useTheme";

// Utils
import { cn } from "@/shared/utils/cn";

// Icons
import { Sun, Moon, Monitor, Check } from "lucide-react";

// Components
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/shared/components/shadcn/dropdown-menu";

const OPTIONS = [
  { value: THEME_OPTIONS.LIGHT, label: "Yorug'", Icon: Sun },
  { value: THEME_OPTIONS.DARK, label: "Qorong'i", Icon: Moon },
  { value: THEME_OPTIONS.SYSTEM, label: "Tizim bo'yicha", Icon: Monitor },
];

/**
 * Tema almashtirgich.
 *
 * @param {"menu"|"switch"} variant
 *   - "menu"   - Yorug'/Qorong'i/Tizim tanlovi (default)
 *   - "switch" - bitta tugma, light <-> dark
 */
const ThemeToggle = ({ variant = "menu", className }) => {
  const { theme, isDark, setTheme, toggleTheme, ready } = useTheme();

  // Tema hali aniqlanmagan bo'lsa (nazariy holat) - joyni band qilib
  // turamiz, aks holda tugma "sakrab" paydo bo'ladi.
  if (!ready) {
    return (
      <span
        aria-hidden
        className={cn("size-9 shrink-0 rounded-md", className)}
      />
    );
  }

  if (variant === "switch") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish"}
        title={isDark ? "Yorug' rejim" : "Qorong'i rejim"}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground/80",
          "transition-colors hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
          className,
        )}
      >
        {isDark ? (
          <Moon className="size-[18px]" strokeWidth={1.75} />
        ) : (
          <Sun className="size-[18px]" strokeWidth={1.75} />
        )}
      </button>
    );
  }

  const Current = OPTIONS.find((option) => option.value === theme)?.Icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Mavzu (tema) tanlash"
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground/80",
          "transition-colors hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
          className,
        )}
      >
        <Current className="size-[18px]" strokeWidth={1.75} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-44">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="gap-2"
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1">{label}</span>
            {theme === value && <Check className="size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
