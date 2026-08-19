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
  "h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground " +
  "transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * ══════════════════════════════════════════════════════════════════════
 * BO'LIM SARLAVHASI — davr tanlagichi bilan
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA `ExecutivePageHeader` NING O'RNIGA ──
 * Eski komponent SAHIFA sarlavhasi edi va `<h1>` chizardi. Endi bu
 * ekranlar sahifa emas, tab MAZMUNI: `/org/analytics` va
 * `/org/branches` ichida yashaydi va ularning o'z `<h1>` i bor.
 * Ikkita `<h1>` bitta sahifada — hujjat tuzilishini buzadi va ekran
 * o'quvchi uchun "bu qaysi sahifa?" degan savolni javobsiz qoldiradi.
 *
 * Shuning uchun bu yerda `<h2>`.
 *
 * ── DAVR SAHIFA DARAJASIDA, KOMPONENT DARAJASIDA EMAS ──
 * Har karta o'z davrini tanlasa, ekranda yonma-yon turgan ikki raqam
 * turli oyga tegishli bo'lib qolardi — lekin ko'z ularni baribir
 * solishtiradi va xulosa noto'g'ri chiqardi. (Bu qoida eski
 * komponentdan ko'chib keldi va o'z kuchida qoladi.)
 *
 * ── NEGA `SelectField` EMAS ──
 * U yorliq (`label`) bilan keladi va tanlagich ustida matn qatori
 * paydo bo'ladi. Sarlavha qatorida bu balandlikni buzadi va ikkita
 * tanlagich bir-biriga nisbatan siljib qoladi. Bu yerda ikkalasi ham
 * bir xil balandlikdagi oddiy `select`, yorliq esa `aria-label` da.
 */
const SectionHeader = ({ title, hint, period, actions, className = "" }) => (
  <header
    className={cn(
      "flex flex-wrap items-end justify-between gap-x-4 gap-y-3",
      className,
    )}
  >
    <div className="min-w-0">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {hint && (
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{hint}</p>
      )}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {actions}

      {period && (
        <>
          <select
            aria-label="Oy"
            className={CONTROL}
            value={period.month}
            onChange={(e) => period.setField("month", Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            aria-label="Yil"
            className={CONTROL}
            value={period.year}
            onChange={(e) => period.setField("year", Number(e.target.value))}
          >
            {yearOptions().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </>
      )}
    </div>
  </header>
);

export default SectionHeader;
