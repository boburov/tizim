// Utils
import { cn } from "@/shared/utils/cn";
import { getGradeToken, MAX_GRADE } from "@/shared/helpers/grade.helpers";

// 1–5 ball tanlagich. Tanlangan ball aniq highlight (token rangi + outline),
// passiv tugmalarda aniq hover/active holatlari.
//
// Props:
//  value: number|null
//  onChange: (n|null) => void   (yana bosilsa null - tanlovni olib tashlaydi)
//  disabled
//  size: "sm" | "md"
//  labels: { [n]: string }      (tooltip uchun ixtiyoriy nomlar)
const SCALE = Array.from({ length: MAX_GRADE }, (_, i) => i + 1);

const ScoreButtons = ({
  value,
  onChange,
  disabled = false,
  size = "md",
  labels = {},
}) => {
  return (
    <div
      className="flex items-center gap-1.5"
      role="radiogroup"
      aria-label="Ball tanlash"
    >
      {SCALE.map((n) => {
        const active = value === n;
        const token = getGradeToken(n);
        const title = labels[n] ? `${n} - ${labels[n]}` : `Ball ${n}`;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={title}
            title={title}
            disabled={disabled}
            onClick={() => onChange(active ? null : n)}
            className={cn(
              "grid place-items-center rounded-md border font-semibold transition-all",
              size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              token.ring,
              active
                ? cn(token.solid, "scale-105 shadow-sm ring-2", token.ring)
                : cn(
                    "border-gray-200 bg-white text-gray-400",
                    "hover:-translate-y-0.5 hover:border-gray-300 hover:text-gray-600 hover:shadow-sm",
                    "active:translate-y-0 active:scale-95",
                  ),
              disabled && "cursor-not-allowed opacity-50 hover:transform-none",
            )}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
};

export default ScoreButtons;
