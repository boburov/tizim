// Components
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/shadcn/tooltip";

/**
 * Qator tanlash katagi.
 *
 * O'chiq holatda SABAB tooltip'da ko'rinadi ("o'z so'rovingiz" /
 * "huquqingiz yo'q") - aks holda foydalanuvchi bosilmayotgan katakni
 * xato deb o'ylardi.
 *
 * `disabled` katak `<span>` bilan o'raladi: brauzer o'chirilgan
 * elementda hover hodisasini bermaydi, ya'ni tooltip ishlamay qolardi.
 */
const ApprovalCheckbox = ({ checked, onChange, disabled, reason, label }) => {
  const input = (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange?.(e.target.checked)}
      className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
    />
  );

  if (!disabled || !reason) return input;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          {input}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
};

export default ApprovalCheckbox;
