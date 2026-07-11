// Utils
import { cn } from "@/shared/utils/cn";

// Sozlamalar bo'limi: ikonka + sarlavha + qisqa tushuntirish (helper text),
// ostida maydonlar. Sozlamalar sahifasidagi har bir karta shu qobiqda.
const SettingsSection = ({
  icon: Icon,
  title,
  description = "",
  children,
  className = "",
}) => {
  return (
    <section
      className={cn(
        "rounded-md border bg-white p-4 xs:p-5",
        className,
      )}
    >
      <header className="flex items-start gap-3">
        {Icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </header>

      <div className="mt-5">{children}</div>
    </section>
  );
};

// Bo'lim ichidagi bitta sozlama qatori: nom + helper text (chap),
// boshqaruv elementi (o'ng). Toggle/select uchun qulay.
export const SettingRow = ({ label, hint = "", control, className = "" }) => (
  <div
    className={cn(
      "flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
      className,
    )}
  >
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
    <div className="shrink-0">{control}</div>
  </div>
);

export default SettingsSection;
