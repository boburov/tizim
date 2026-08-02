import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

// REYTING TAXTASI - "eng ko'p kechiktirganlar / qoldirganlar / o'qituvchilar".
//
// NEGA BU INSIGHT KARTASIDAN BOSHQA KO'RINISHDA:
//
// Insight kartasi BITTA holatni chuqur tushuntiradi (sabablar, ulush
// chiziqlari, manba havolalari, tavsiyalar). Reyting esa O'NTA holatni
// TAQQOSLAB ko'rsatadi. O'nta to'liq kartani yonma-yon qo'ysak sahifa
// ikki ekran uzunlikda bo'lib ketardi va aynan taqqoslash - reytingning
// yagona maqsadi - yo'qolardi. Shuning uchun bu yerda zich qator:
// o'rin → ism → ikki-uch raqam → bitta jumla.
//
// HAR BIR QATOR BOSILADIGAN. Owner "Aziz Karimov 7 oy to'lamagan" ni
// o'qigach darhol "kim bu?" deydi. Ismni qidiruvga qo'lda kiritish har
// kuni takrorlanadigan ishqalanish - va aynan shu ishqalanish tufayli
// owner AI sahifasini ochishni to'xtatadi.

/** Qiymatni birligiga qarab formatlaydi (pul alohida - u uzun son). */
const formatMetric = (m) => {
  // `so'm` ni formatMoney() O'ZI qo'shadi - takrorlash "so'm so'm" berardi.
  if (m.unit === "so'm") return formatMoney(m.value);
  return `${m.value}${m.unit ? ` ${m.unit}` : ""}`;
};

/**
 * O'rin belgisi.
 *
 * Xavf reytinglarida 1-o'rin ENG YOMON, o'qituvchilarda esa ENG YAXSHI.
 * Bir xil rangda ko'rsatish ikkalasini chalkashtirardi: yashil "1" ni
 * owner "yaxshi" deb o'qiydi, holbuki qarzdorlar ro'yxatida u eng katta
 * muammo.
 */
const RankBadge = ({ rank, positive }) => (
  <span
    className={cn(
      "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
      rank <= 3
        ? positive
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
        : "bg-muted text-muted-foreground",
    )}
  >
    {rank}
  </span>
);

const RankingRow = ({ row, positive }) => {
  const content = (
    <>
      <RankBadge rank={row.rank} positive={positive} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-foreground">{row.label}</span>
          {/* Ball FAQAT ishonch yetarli bo'lganda. Ikki oylik ma'lumot
              asosida "87%" ko'rsatish yolg'on aniqlik - owner uni
              haqiqat deb qabul qiladi va bir marta aldangandan keyin
              butun reytingga ishonmay qo'yadi. */}
          {row.confidence >= 0.4 && (
            <span
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                positive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              {Math.round(row.score * 100)}%
            </span>
          )}
        </div>

        {row.metrics?.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.metrics.map(formatMetric).join(" · ")}
          </p>
        )}

        {row.note && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {row.note}
          </p>
        )}
      </div>

      {row.href && (
        <ChevronRight className="mt-0.5 size-4 shrink-0 self-start text-muted-foreground" />
      )}
    </>
  );

  // Havolasiz subyekt (mas. kurs) uchun qator bosilmaydigan bo'lib
  // qoladi - ishlamaydigan havola berish umuman havola bermaslikdan
  // yomonroq, chunki 404 butun sahifaga ishonchni yo'qotadi.
  if (!row.href) {
    return <li className="flex gap-2.5 px-3 py-2.5">{content}</li>;
  }

  return (
    <li>
      <Link
        to={row.href}
        className="flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent"
      >
        {content}
      </Link>
    </li>
  );
};

/**
 * Bitta reyting ustuni.
 *
 * @param {object} ranking - {rows, scanned, totals} yoki null
 * @param {boolean} positive - true bo'lsa 1-o'rin ENG YAXSHI (o'qituvchilar)
 */
const RankingColumn = ({ title, subtitle, ranking, positive = false, empty }) => {
  const rows = ranking?.rows || [];

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b border-border px-3 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {/* Kontekst qatori: "738 o'quvchidan" bo'lmasa, "10 ta" soni
            hech narsa anglatmaydi - 10 ta 12 tadanmi yoki 800 tadanmi? */}
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <RankingRow key={String(row.subjectId)} row={row} positive={positive} />
          ))}
        </ul>
      )}
    </div>
  );
};

const AiRankingBoard = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  // "Barcha filiallar" rejimida reyting hisoblanmaydi - sabab backend'da
  // izohlangan (turli narx/hudud aralashadi, o'qituvchi bahosi filial
  // o'rtachasiga nisbatan quriladi). Bo'sh ustunlar o'rniga aniq sabab.
  if (data.branchRequired) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Reytinglar filial ichida hisoblanadi — yuqoridan filial tanlang.
        </p>
      </div>
    );
  }

  const payment = data.payment_delay;
  const absence = data.absence;
  const teacher = data.teacher;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <RankingColumn
        title="Eng ko'p to'lovni kechiktirganlar"
        subtitle={
          payment?.totals?.debtAmount > 0
            ? `Jami qarz: ${formatMoney(payment.totals.debtAmount)} · ${payment.totals.affected} o'quvchi`
            : payment
              ? `${payment.scanned} o'quvchi tekshirildi`
              : null
        }
        ranking={payment}
        empty="Kechikkan to'lov topilmadi."
      />

      <RankingColumn
        title="Eng ko'p dars qoldirganlar"
        subtitle={
          absence?.totals?.missedLessons > 0
            ? `Oxirgi 4 haftada ${absence.totals.missedLessons} dars qoldirilgan`
            : absence
              ? `${absence.scanned} o'quvchi tekshirildi`
              : null
        }
        ranking={absence}
        empty="Davomat muammosi topilmadi."
      />

      <RankingColumn
        title="O'qituvchilar reytingi"
        subtitle={
          teacher?.totals?.raiseCandidates > 0
            ? `${teacher.totals.raiseCandidates} ta o'qituvchi rag'batga nomzod`
            : teacher
              ? `${teacher.totals.ranked} o'qituvchi baholandi`
              : null
        }
        ranking={teacher}
        // Bu ustunda 1-o'rin ENG YAXSHI - rang yashil bo'ladi.
        positive
        empty="Baholash uchun yetarli ma'lumot yo'q."
      />
    </div>
  );
};

export default AiRankingBoard;
