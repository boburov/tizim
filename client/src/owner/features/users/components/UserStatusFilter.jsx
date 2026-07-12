import { cn } from "@/shared/utils/cn";

const OPTIONS = [
  { value: "all", label: "Hammasi" },
  { value: "active", label: "Faol" },
  { value: "frozen", label: "Muzlatilgan" },
  { value: "archived", label: "Arxiv" },
];

// Foydalanuvchi holati filtri: Hammasi / Faol / Muzlatilgan / Arxiv.
const UserStatusFilter = ({ value = "active", onChange, className }) => (
  <div className={cn("inline-flex rounded-md border bg-white p-0.5", className)}>
    {OPTIONS.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={cn(
          "rounded px-3 py-1 text-sm font-medium transition",
          value === o.value
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export default UserStatusFilter;
