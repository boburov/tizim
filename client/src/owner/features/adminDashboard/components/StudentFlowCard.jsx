import { MONTH_LABELS } from "@/shared/constants/calendar";

// O'quvchilar oqimi - oxirgi oylar bo'yicha yangi/ketgan (kichik gorizontal bar).
const StudentFlowCard = ({ items = [] }) => {
  const max = Math.max(1, ...items.flatMap((it) => [it.joined || 0, it.left || 0]));

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-900">O'quvchilar oqimi</h2>
        <div className="flex gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-primary" /> Yangi
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-rose-400" /> Ketgan
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-400">Ma'lumot yo'q</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((it) => (
            <div key={`${it.year}-${it.month}`} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700">{MONTH_LABELS[it.month - 1]}</span>
                <span
                  className={
                    it.netGrowth > 0
                      ? "font-semibold text-emerald-600"
                      : it.netGrowth < 0
                        ? "font-semibold text-rose-600"
                        : "font-medium text-zinc-500"
                  }
                >
                  {it.netGrowth > 0 ? "+" : ""}
                  {it.netGrowth}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${((it.joined || 0) / max) * 100}%` }}
                  />
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-rose-400 transition-all"
                    style={{ width: `${((it.left || 0) / max) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentFlowCard;
