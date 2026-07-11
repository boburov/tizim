import { cn } from "@/shared/utils/cn";

const OPTIONS = [
  { value: false, label: "Faol" },
  { value: true, label: "Arxiv" },
];

// Faol / Arxiv segmentli toggle - ro'yxatlarda arxivlangan yozuvlarni ko'rsatish uchun
const ArchiveToggle = ({ value = false, onChange, className }) => (
  <div className={cn("inline-flex rounded-md border bg-white p-0.5", className)}>
    {OPTIONS.map((o) => (
      <button
        key={String(o.value)}
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

export default ArchiveToggle;
