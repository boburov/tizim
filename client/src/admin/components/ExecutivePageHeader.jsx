// Utils
import { cn } from "@/shared/utils/cn";

const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

const YEAR_FROM = 2020;

const yearOptions = () => {
  const now = new Date().getFullYear();
  const arr = [];
  for (let y = now; y >= YEAR_FROM; y -= 1) arr.push(y);
  return arr;
};

const CONTROL =
  "h-9 rounded-md border bg-card px-2 text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * EXECUTIVE SAHIFA SARLAVHASI - sarlavha, izoh va DAVR TANLAGICH.
 *
 * DAVR SAHIFA DARAJASIDA, komponent darajasida emas. Har karta o'z
 * davrini o'zi tanlasa, ekranda yonma-yon turgan ikki raqam turli
 * oyga tegishli bo'lib qolardi - lekin ko'z ularni baribir
 * solishtiradi va xulosa noto'g'ri chiqardi.
 *
 * `period` - `useObjectState` natijasi (`{ year, month, setField }`).
 * Berilmasa tanlagich umuman chiqmaydi: hamma sahifa ham davrga
 * bog'liq emas (tavsiyalar oqimi har doim "hozir" holatini beradi).
 *
 * NEGA `SelectYear` / `SelectField` EMAS: ular yorliq (`label`) bilan
 * keladi va tanlagich ustida "Yil" degan matn qatori paydo bo'ladi.
 * Sarlavha qatorida bu balandlikni buzadi va ikkita tanlagich
 * bir-biriga nisbatan siljib qoladi. Bu yerda ikkalasi ham bir xil
 * balandlikdagi oddiy `select` - yorliq `aria-label` da.
 */
const ExecutivePageHeader = ({ title, hint, period, actions, className = "" }) => (
  <header
    className={cn(
      "flex flex-wrap items-end justify-between gap-x-4 gap-y-3",
      className,
    )}
  >
    <div className="min-w-0">
      <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h1>
      {hint && (
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{hint}</p>
      )}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {actions}

      {period && (
        <>
          <select
            aria-label="Oy"
            value={period.month}
            onChange={(e) => period.setField("month", Number(e.target.value))}
            className={CONTROL}
          >
            {MONTHS.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>

          <select
            aria-label="Yil"
            value={period.year}
            onChange={(e) => period.setField("year", Number(e.target.value))}
            className={CONTROL}
          >
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  </header>
);

export default ExecutivePageHeader;
