import { cn } from "@/shared/utils/cn";

// Kunda bir nechta dars (sessiya) bo'lsa - sessiyani tanlash tablari.
// Bitta sessiya bo'lsa hech narsa ko'rsatilmaydi.
const SessionTabs = ({ sessions = [], activeSlot, onSelect }) => {
  if (!sessions || sessions.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Sessiya:</span>
      {sessions.map((s) => {
        const active = (activeSlot ?? "") === s.slot;
        return (
          <button
            key={s.slot || s.startTime}
            type="button"
            onClick={() => onSelect(s.slot)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-gray-200 bg-white text-muted-foreground hover:bg-gray-50",
            )}
          >
            {s.startTime}–{s.endTime}
          </button>
        );
      })}
    </div>
  );
};

export default SessionTabs;
