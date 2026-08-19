// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";

/**
 * PUL OQIMI USTUNLARI - SOF PREZENTATSION.
 *
 * ═══════════════════════════════════════════════════════════════════
 * `owner/.../CashflowChart.jsx` DAN FARQI
 *
 * U komponent o'z ma'lumotini O'ZI oladi (`useCashflowQuery` ichida)
 * va shu sababli:
 *   • boshqa manba bilan qayta ishlatib bo'lmaydi;
 *   • so'rov YIQILGANDA `data` `undefined` bo'lib, `buckets` bo'sh
 *     massivga aylanadi va ekranda "Ma'lumot yo'q" chiqadi - ya'ni
 *     XATO "bo'shlik" bo'lib ko'rsatiladi;
 *   • yuqoridagi xulosa bloki (Kirim/Chiqim/Sof) `isLoading` ni
 *     tekshirmaydi va yuklanish paytida "0 so'm" ko'rsatib turadi.
 *
 * Bu yerda ma'lumot PROP orqali keladi va holat qobiqda (`ChartCard`
 * -> `DataState`) hal qilinadi. Ustunlar faqat ma'lumot BOR bo'lganda
 * chiziladi, ya'ni yuqoridagi uchala holat ham mumkin emas.
 * ═══════════════════════════════════════════════════════════════════
 *
 * GRAFIKDA STATUS RANGI ISHLATILMAYDI (kodbazadagi mavjud qoida -
 * `ai/utils/dashboard.utils.js` izohi): qizil ustun "yomon oy" degan
 * ma'no berardi, holbuki u shunchaki kichikroq son. Kirim `primary`,
 * chiqim esa `chart-2` tokeni bilan chiziladi.
 *
 * @param {Array<{label: string, income: number, expense: number}>} buckets
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
const CashflowBars = ({ buckets = [] }) => {
  // Maxraj: eng katta ustun. `1` - nolga bo'lishdan himoya, ma'lumot
  // emas: hamma qiymat 0 bo'lsa ustunlar shunchaki chizilmaydi.
  const max = Math.max(
    1,
    ...buckets.flatMap((b) => [Number(b.income) || 0, Number(b.expense) || 0]),
  );

  const totals = buckets.reduce(
    (acc, b) => ({
      income: acc.income + (Number(b.income) || 0),
      expense: acc.expense + (Number(b.expense) || 0),
    }),
    { income: 0, expense: 0 },
  );
  const net = totals.income - totals.expense;

  return (
    <div className="flex h-full flex-col">
      {/* Xulosa - ustunlar bilan BIR VAQTDA chiziladi, ya'ni ular
          har doim bir xil ma'lumotdan. */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Summary label="Kirim" value={totals.income} tone="text-primary" />
        <Summary
          label="Chiqim"
          value={totals.expense}
          tone="text-rose-600 dark:text-rose-400"
        />
        <Summary
          label="Sof"
          value={net}
          tone={
            net >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }
          signed
        />
      </div>

      {/* KICHIK EKRAN: 31 kunlik oyda har ustunga 360px da ~4px joy
          qoladi va yorliqlar ustma-ust tushadi. Grafikni siqish
          o'rniga O'Z KONTEYNERIDA suriladi - sahifaning o'zi
          gorizontal scroll bo'lib ketmaydi.
          `min-w` bucket soniga qarab: 12 oylik ko'rinish siqilmaydi. */}
      <div className="hidden-scrollbar mt-4 flex-1 overflow-x-auto">
        <div
          className="flex h-full items-end gap-1.5 sm:gap-2"
          style={{ minWidth: buckets.length > 14 ? `${buckets.length * 18}px` : undefined }}
        >
        {buckets.map((b, i) => {
          const income = Number(b.income) || 0;
          const expense = Number(b.expense) || 0;
          const has = income > 0 || expense > 0;

          return (
            <div
              key={`${b.label}-${i}`}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              {has && (
                // Chekkadagi ustunlarda tooltip markazga QARAB siljiydi -
                // aks holda u konteynerdan chiqib, gorizontal scroll
                // paydo qilardi (birinchi va oxirgi ustunda).
                <div
                  className={cn(
                    "pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 shadow transition group-hover:opacity-100",
                    i === 0
                      ? "left-0"
                      : i === buckets.length - 1
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2",
                  )}
                >
                  <span className="text-primary">{formatMoneyShort(income)}</span>
                  {" / "}
                  <span className="text-rose-600 dark:text-rose-400">
                    {formatMoneyShort(expense)}
                  </span>
                </div>
              )}

              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <Bar value={income} max={max} className="bg-primary" />
                <Bar value={expense} max={max} className="bg-chart-2" />
              </div>

              <span className="mt-1.5 w-full truncate text-center text-[10px] text-muted-foreground">
                {b.label}
              </span>
            </div>
          );
        })}
        </div>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <Legend className="bg-primary" label="Kirim" />
        <Legend className="bg-chart-2" label="Chiqim" />
      </div>
    </div>
  );
};

const Summary = ({ label, value, tone, signed = false }) => (
  <div>
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className={`text-sm font-semibold tabular-nums ${tone}`}>
      {signed && value > 0 ? "+" : ""}
      {formatMoneyShort(value)}
    </p>
  </div>
);

const Bar = ({ value, max, className }) => {
  // Nolinchi ustun CHIZILMAYDI. Ilgari 4% minimal balandlik berilardi
  // va "0 so'm chiqim" ham ko'zga ko'rinadigan ustun bo'lib turardi -
  // ya'ni yo'q narsa bor bo'lib ko'rinardi.
  if (!value) return <span className="w-1/2 max-w-2.5" />;
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <div
      className={`w-1/2 max-w-2.5 rounded-t transition-all duration-500 ${className}`}
      style={{ height: `${pct}%` }}
    />
  );
};

const Legend = ({ className, label }) => (
  <span className="flex items-center gap-1.5">
    <span className={`size-2.5 rounded-full ${className}`} />
    {label}
  </span>
);

export default CashflowBars;
