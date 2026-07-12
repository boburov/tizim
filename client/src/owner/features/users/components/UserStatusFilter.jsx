import { cn } from "@/shared/utils/cn";
import {
  STATUS_LABELS,
  allowedStatusesForTab,
} from "../utils/userStatusFilter";

// Foydalanuvchi holati filtri (tabga qarab variantlar moslashadi).
const UserStatusFilter = ({ value = "active", onChange, tab = "all", className }) => {
  const options = allowedStatusesForTab(tab);
  return (
    <div className={cn("inline-flex rounded-md border bg-white p-0.5", className)}>
      {options.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded px-3 py-1 text-sm font-medium transition",
            value === key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {STATUS_LABELS[key]}
        </button>
      ))}
    </div>
  );
};

export default UserStatusFilter;
