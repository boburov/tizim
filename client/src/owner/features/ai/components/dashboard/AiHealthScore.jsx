import { Link } from "react-router-dom";
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";
import { levelStyle, scoreLevel } from "../../utils/dashboard.utils";

// BIZNES SALOMATLIGI - beshta yo'nalish, beshta ball.
//
// NEGA O'LCHAGICH (meter), USTUN DIAGRAMMA EMAS: bu ballar bir-biri
// bilan taqqoslanmaydi — "Moliya 60" va "Marketing 60" butunlay turli
// narsalar. Ular SHKALADAGI o'rni bilan o'qiladi ("100 dan nechta").
// Yonma-yon ustunlar esa "marketing moliyadan yaxshiroq" degan yolg'on
// taqqoslashni tug'dirardi.
//
// RANG YOLG'IZ EMAS: har kartada ball raqami va sabab matni bor —
// rang ajratmaydigan foydalanuvchi ham to'liq ma'lumot oladi.
//
// BALL YONIDA DOIM SABAB TURADI. "Moliya 48" o'zi hech narsa aytmaydi:
// owner "nega 48?" deb so'raydi va javob topilmasa ballga ishonmay
// qo'yadi. Aynan shu sababdan ball ostida bitta jumla va uch-to'rtta
// xom ko'rsatkich turadi.

const DomainCard = ({ domain }) => {
  const level = scoreLevel(domain.score);
  const style = levelStyle(level);

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{domain.label}</span>
        <span className={cn("shrink-0 text-lg font-semibold tabular-nums", style.text)}>
          {domain.score == null ? "—" : domain.score}
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {domain.score != null && (
          <div
            className={cn("h-full rounded-full transition-[width] duration-700", style.solid)}
            style={{ width: `${Math.max(2, domain.score)}%` }}
          />
        )}
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{domain.note}</p>

      {domain.drivers?.length > 0 && (
        <ul className="mt-auto space-y-1 pt-3">
          {domain.drivers.slice(0, 3).map((d) => (
            <li key={d.label} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{d.label}</span>
              <span className="shrink-0 tabular-nums text-foreground">
                {d.unit === "so'm" ? formatMoneyShort(d.value) : d.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const classes = "flex h-full flex-col rounded-xl border bg-card p-4 transition-colors";

  if (!domain.href) return <div className={classes}>{body}</div>;

  return (
    <Link to={domain.href} className={cn(classes, "hover:border-primary/40 hover:bg-accent/40")}>
      {body}
    </Link>
  );
};

const AiHealthScore = ({ health }) => {
  const domains = health?.domains || [];
  if (!domains.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {domains.map((d) => (
        <DomainCard key={d.key} domain={d} />
      ))}
    </div>
  );
};

export default AiHealthScore;
