import { Link } from "react-router-dom";
import { ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/shared/utils/cn";

// ENG YAXSHI O'QITUVCHILAR - "kimni rag'batlantirish kerak".
//
// NEGA DASHBOARDDA XAVFLAR YONIDA: kun bo'yi faqat muammo ko'rgan
// owner jamoasini muammo deb ko'ra boshlaydi. Ijobiy ro'yxat qimmat
// joy egallamaydi (besh qator), lekin sahifaning kayfiyatini
// o'zgartiradi - va eng muhimi, HARAKATGA undaydi: rag'bat berish ham
// qaror.
//
// BALL FAQAT ISHONCH YETARLI BO'LGANDA. Ikki oylik ma'lumot asosida
// "87%" ko'rsatish yolg'on aniqlik - owner uni haqiqat deb qabul
// qiladi va bir marta aldangandan keyin butun reytingga ishonmaydi.

const TeacherRow = ({ row }) => {
  const content = (
    <>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
          row.rank <= 3
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-muted text-muted-foreground",
        )}
      >
        {row.rank}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-foreground">{row.label}</span>
          {row.confidence >= 0.4 && (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {Math.round(row.score * 100)}%
            </span>
          )}
        </div>
        {row.note && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {row.note}
          </p>
        )}
      </div>
    </>
  );

  if (!row.href) {
    return <li className="flex gap-2.5 px-4 py-2.5">{content}</li>;
  }

  return (
    <li>
      <Link
        to={row.href}
        className="group flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-accent/50"
      >
        {content}
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
};

const AiTopTeachers = ({ ranking, limit = 5 }) => {
  const rows = (ranking?.rows || []).slice(0, limit);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Trophy className="size-4 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-semibold text-foreground">Eng yaxshi o'qituvchilar</h3>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Baholash uchun yetarli ma'lumot yo'q.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <TeacherRow key={String(row.subjectId)} row={row} />
          ))}
        </ul>
      )}

      {/* Kontekst qatori: "12 o'qituvchi baholandi" bo'lmasa, beshta
          ism qayerdan tanlanganini hech kim bilmaydi. */}
      {ranking?.totals?.ranked > 0 && (
        <p className="mt-auto border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {ranking.totals.ranked} o'qituvchi baholandi
          {ranking.totals.raiseCandidates > 0 &&
            ` · ${ranking.totals.raiseCandidates} tasi rag'batga nomzod`}
        </p>
      )}
    </div>
  );
};

export default AiTopTeachers;
