import { Link } from "react-router-dom";
import { ChevronRight, UserMinus } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";

// XAVF OSTIDAGI O'QUVCHILAR - ikkita reyting BITTA ro'yxatda.
//
// NEGA BIRLASHTIRILDI: ilgari "eng ko'p to'lovni kechiktirganlar" va
// "eng ko'p dars qoldirganlar" yonma-yon ikki ustun edi. Lekin owner
// uchun bu bitta savol: "kimni yo'qotishim mumkin?". Va eng yomon
// holat aynan IKKALA ro'yxatda ham turgan o'quvchi - alohida
// ustunlarda u ikki marta ko'rinardi va hech kim ularni bog'lamasdi.
//
// SHUNING UCHUN: bitta ro'yxat, sabab teglari bilan. Ikkala sababi
// bor o'quvchi tepaga chiqadi - u haqiqatan ham eng yaqin xavf.

const metricValue = (row, key) =>
  (row.metrics || []).find((m) => m.key === key)?.value || 0;

const debtOf = (row) => metricValue(row, "debtAmount");
const missedOf = (row) => metricValue(row, "missed");

/** Ikki reytingni bitta ro'yxatga qo'shadi va sabablarni yig'adi. */
const mergeRisk = (payment, absence, limit) => {
  const map = new Map();

  const put = (row, reason) => {
    const id = String(row.subjectId);
    const prev = map.get(id);
    if (prev) {
      prev.reasons.push(reason);
      // Ball - ikki sababdan KATTAROG'I. O'rtacha olish ikkala
      // ro'yxatda turgan o'quvchini pastga tushirardi.
      prev.score = Math.max(prev.score, row.score);
      prev.confidence = Math.max(prev.confidence, row.confidence || 0);
      if (reason === "debt") prev.debt = debtOf(row);
      if (reason === "absence") prev.missed = missedOf(row);
      return;
    }
    map.set(id, {
      id,
      label: row.label,
      href: row.href,
      score: row.score,
      confidence: row.confidence || 0,
      note: row.note,
      reasons: [reason],
      debt: reason === "debt" ? debtOf(row) : 0,
      missed: reason === "absence" ? missedOf(row) : 0,
    });
  };

  (payment?.rows || []).forEach((r) => put(r, "debt"));
  (absence?.rows || []).forEach((r) => put(r, "absence"));

  return [...map.values()]
    .sort((a, b) => b.reasons.length - a.reasons.length || b.score - a.score)
    .slice(0, limit);
};

const REASON_LABELS = { debt: "qarz", absence: "davomat" };

const RiskRow = ({ item }) => {
  const content = (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-foreground">{item.label}</span>
        {/* Ball FAQAT ishonch yetarli bo'lganda. Ikki oylik ma'lumot
            asosida "87%" ko'rsatish yolg'on aniqlik. */}
        {item.confidence >= 0.4 && (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400">
            {Math.round(item.score * 100)}%
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {item.reasons.map((r) => (
          <span
            key={r}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              r === "debt"
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
            )}
          >
            {REASON_LABELS[r]}
          </span>
        ))}
        <span className="truncate text-xs text-muted-foreground">
          {[
            item.debt > 0 ? formatMoneyShort(item.debt) : null,
            item.missed > 0 ? `${item.missed} dars qoldirgan` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    </div>
  );

  if (!item.href) {
    return <li className="flex gap-2.5 px-4 py-2.5">{content}</li>;
  }

  return (
    <li>
      <Link
        to={item.href}
        className="group flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-accent/50"
      >
        {content}
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
};

const AiStudentsAtRisk = ({ rankings, limit = 5 }) => {
  const items = mergeRisk(rankings?.payment_delay, rankings?.absence, limit);
  const debtTotal = rankings?.payment_delay?.totals?.debtAmount || 0;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <UserMinus className="size-4 text-rose-600 dark:text-rose-400" />
        <h3 className="text-sm font-semibold text-foreground">Xavf ostidagi o'quvchilar</h3>
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Qarz yoki davomat muammosi topilmadi.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <RiskRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {debtTotal > 0 && (
        <p className="mt-auto border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          Jami qarz: {formatMoneyShort(debtTotal)} ·{" "}
          {rankings.payment_delay.totals.affected} o'quvchi
        </p>
      )}
    </div>
  );
};

export default AiStudentsAtRisk;
