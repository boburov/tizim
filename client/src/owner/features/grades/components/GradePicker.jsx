// Utils
import { cn } from "@/shared/utils/cn";
import { getGradeColor } from "@/shared/helpers/grade.helpers";

// 1–5 ball tanlagich: tanlangan ball rangi bilan (5=yashil … 1=qizil).
// value: number|null, onChange: (n) => void
const GradePicker = ({ value, onChange, disabled = false }) => {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : n)}
            className={cn(
              "size-9 rounded-md border text-sm font-semibold transition",
              active
                ? getGradeColor(n)
                : "border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-50",
              disabled && "cursor-not-allowed opacity-60",
            )}
            aria-label={`Ball ${n}`}
            title={`Ball ${n}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
};

export default GradePicker;
