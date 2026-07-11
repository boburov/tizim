import Card from "@/shared/components/ui/card/Card";
import { MONTH_LABELS } from "@/shared/constants/calendar";

// Oylar bo'yicha yangi ro'yxatga olishlar - CSS ustun diagrammasi
// (mavjud DailyIncomeChart / StudentFlowChart uslubiga mos, recharts'siz).
const EnrollmentTrendChart = ({ items = [] }) => {
  const hasData = items.some((it) => (it.count || 0) > 0);
  const max = items.reduce((m, it) => Math.max(m, it.count || 0), 0) || 1;

  return (
    <Card title="Yangi o'quvchilar oqimi (oylar bo'yicha)">
      {!hasData ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ma'lumot yo'q
        </p>
      ) : (
        <div className="mt-5 flex h-48 items-end gap-1.5 overflow-x-auto">
          {items.map((it) => {
            const h = it.count ? Math.max(6, Math.round((it.count / max) * 100)) : 0;
            return (
              <div
                key={`${it.year}-${it.month}`}
                className="group flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1.5"
                title={`${MONTH_LABELS[it.month - 1]} ${it.year}: ${it.count} ta`}
              >
                <span className="text-xs font-medium text-zinc-600">
                  {it.count || ""}
                </span>
                <div
                  className="w-full rounded-t bg-primary/70 transition group-hover:bg-primary"
                  style={{ height: `${h}%` }}
                />
                <span className="text-[10px] uppercase text-muted-foreground">
                  {MONTH_LABELS[it.month - 1].slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default EnrollmentTrendChart;
