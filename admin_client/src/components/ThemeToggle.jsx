import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, THEMES } from '../context/ThemeContext';
import { cn } from '../lib/utils';

const OPTIONS = [
  { value: THEMES.LIGHT, label: "Yorug'", Icon: Sun },
  { value: THEMES.DARK, label: "Qorong'i", Icon: Moon },
  { value: THEMES.SYSTEM, label: 'Tizim bo\'yicha', Icon: Monitor },
];

/**
 * Tema almashtirgich.
 *
 * @param {"segmented"|"icon"} variant
 *   - "segmented" — Yorug'/Qorong'i/Tizim uchta tugma (default)
 *   - "icon"      — bitta tugma, light <-> dark
 */
export default function ThemeToggle({ variant = 'segmented', className }) {
  const { theme, isDark, setTheme, toggleTheme } = useTheme();

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish"}
        title={isDark ? "Yorug' rejim" : "Qorong'i rejim"}
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          'text-muted-foreground transition hover:bg-accent hover:text-accent-foreground',
          'focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2',
          className,
        )}
      >
        {isDark ? <Moon size={18} /> : <Sun size={18} />}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Mavzu (tema)"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex h-7 w-8 items-center justify-center rounded-md transition',
              'focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}
