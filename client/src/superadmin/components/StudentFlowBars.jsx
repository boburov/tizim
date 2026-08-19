// Utils
import { cn } from "@/shared/utils/cn";

const MONTH_SHORT = [
  "Yan", "Fev", "Mar", "Apr", "May", "Iyn",
  "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek",
];

/**
 * O'QUVCHILAR OQIMI - SOF PREZENTATSION.
 *
 * `items` shakli serverdan (`getStudentFlow`):
 *   { year, month, joined, left, netGrowth }
 *
 * `netGrowth` SERVERDAN OLINADI, `joined - left` bilan qayta
 * hisoblanmaydi. Hozir ta'rif bir xil, lekin u serverda o'zgarsa
 * (masalan muzlatilganlar chiqarib tashlansa) ikki joyda ikki xil
 * raqam paydo bo'lardi - va qaysi biri to'g'ri ekani bilinmasdi.
 *
 * ─────────────────────────────────────────────────────────────────
 * `Number(x) || 0` BU YERDA NEGA MUMKIN
 *
 * Yuqorida `|| 0` ni "yolg'on raqam" deb atadik. Farq shunda:
 *
 *   • YOMONI - YO'Q ko'rsatkich o'rniga 0 qo'yish. So'rov yiqilgan,
 *     ekranda esa "0 so'm tushum". Bu YANGI da'vo yaratadi.
 *
 *   • MUMKINI - MAVJUD ro'yxatning ichidagi maydonni songa keltirish.
 *     Bu yerga ma'lumot faqat `status === "ready"` bo'lganda yetadi,
 *     ya'ni massiv BOR va server uni yubordi. Server shakli har
 *     bandda ikkala maydonni ham kafolatlaydi; `|| 0` shunchaki
 *     `undefined` arifmetikaga tushib `NaN` chiqarmasligi uchun.
 *
 * Ya'ni bu yerda 0 "o'lchanmadi" degani emas, "shu bandda harakat
 * bo'lmagan" degani - va nolinchi ustun ATAYLAB chizilmaydi.
 */
const StudentFlowBars = ({ items = [] }) => {
  const max = Math.max(
    1,
    ...items.flatMap((i) => [Number(i.joined) || 0, Number(i.left) || 0]),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-end gap-2 sm:gap-3">
        {items.map((it) => {
          const joined = Number(it.joined) || 0;
          const left = Number(it.left) || 0;
          const net = typeof it.netGrowth === "number" ? it.netGrowth : null;

          return (
            <div
              key={`${it.year}-${it.month}`}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 shadow transition group-hover:opacity-100">
                <span className="text-primary">+{joined}</span>
                {" / "}
                <span className="text-rose-600 dark:text-rose-400">-{left}</span>
                {net !== null && (
                  <span
                    className={cn(
                      "ml-1 font-medium",
                      net >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400",
                    )}
                  >
                    ({net > 0 ? "+" : ""}
                    {net})
                  </span>
                )}
              </div>

              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <Bar value={joined} max={max} className="bg-primary" />
                <Bar value={left} max={max} className="bg-chart-2" />
              </div>

              <span className="mt-1.5 w-full truncate text-center text-[10px] text-muted-foreground">
                {MONTH_SHORT[(it.month || 1) - 1]}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" /> Qo'shilgan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-chart-2" /> Ketgan
        </span>
      </div>
    </div>
  );
};

/** Nolinchi ustun chizilmaydi - yo'q narsa ko'rinmasligi kerak. */
const Bar = ({ value, max, className }) => {
  if (!value) return <span className="w-1/2 max-w-3" />;
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <div
      className={cn("w-1/2 max-w-3 rounded-t transition-all duration-500", className)}
      style={{ height: `${pct}%` }}
    />
  );
};

export default StudentFlowBars;
