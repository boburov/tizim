import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoney, formatMoneyShort } from "@/shared/utils/formatMoney";

// BASHORAT - daromad va davomat.
//
// DIAGRAMMA QOIDALARI (ikkalasi uchun ham):
//
//  1. BITTA RANG. Ustunlar `primary` bilan chiziladi, status ranglari
//     (qizil/yashil) ISHLATILMAYDI: qizil ustun "yomon oy" degan ma'no
//     berardi, holbuki u shunchaki kichikroq son. Status rangi faqat
//     holat uchun band.
//  2. NOLDAN BOSHLANADI. Ustun uzunligi qiymatga MUTANOSIB bo'lishi
//     shart - o'qni 70% dan boshlash farqlarni sun'iy kattalashtiradi
//     va bu ko'zga ishonarli ko'rinadigan yolg'on.
//  3. BASHORAT USTUNI FAQTDAN AJRALIB TURADI (uzuq chegara + shaffof
//     to'ldirish). Aks holda o'tgan oylar bilan bir qatorda turgan
//     bashorat "bo'lib o'tgan haqiqat" bo'lib o'qiladi.
//  4. RAQAM HAR USTUNDA EMAS. Faqat bashorat ustuni yozuv bilan
//     belgilanadi, qolganlari hover'da ko'rsatiladi - oltita raqam
//     diagrammani jadvalga aylantirardi.

// --- DAROMAD ----------------------------------------------------------

const RevenueBar = ({ item, max }) => {
  const height = max > 0 ? Math.max(4, Math.round((item.amount / max) * 100)) : 4;

  return (
    <div className="group relative flex min-w-0 flex-1 flex-col items-center gap-1.5">
      {/* Hover oynasi - har bir ustunning aniq qiymati. Ustunlarning
          o'zida raqam YO'Q: oltita yozuv diagrammani jadvalga
          aylantirardi, faqat bashorat ustuni belgilangan. */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm group-hover:block">
        <span className="font-medium text-foreground">{formatMoney(item.amount)}</span>
        {item.isForecast ? (
          <span className="ml-1 text-muted-foreground">— bashorat</span>
        ) : (
          item.transactions > 0 && (
            <span className="ml-1 text-muted-foreground">· {item.transactions} to'lov</span>
          )
        )}
      </div>

      {item.isForecast && (
        <span className="text-xs font-medium tabular-nums text-foreground">
          {formatMoneyShort(item.amount)}
        </span>
      )}

      {/* CHIZISH MAYDONI - ustun balandligi FOIZDA beriladi, shuning
          uchun uning ota-onasida ANIQ balandlik bo'lishi shart.
          `flex-1` + `min-h-0` aynan shuni beradi; ustunni to'g'ridan
          to'g'ri ustun-flex ichiga qo'ysak, foiz `auto` ga aylanib
          diagramma yassilanardi. */}
      <div className="flex w-full min-h-0 flex-1 items-end">
        <div
          className={cn(
            "w-full rounded-t transition-colors",
            item.isForecast
              ? "border-2 border-dashed border-primary bg-primary/15"
              : "bg-primary/70 group-hover:bg-primary",
          )}
          style={{ height: `${height}%` }}
        />
      </div>

      <span
        className={cn(
          "truncate text-[11px]",
          item.isForecast ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {item.label}
      </span>
    </div>
  );
};

const RevenueForecast = ({ revenue }) => {
  const history = revenue?.history || [];
  const next = revenue?.next;
  const bars = next ? [...history, next] : history;
  const max = bars.reduce((m, b) => Math.max(m, b.amount || 0), 0);

  // Bashoratni oxirgi TUGAGAN oy bilan taqqoslaymiz: joriy oy yarim
  // to'lgan va u bilan taqqoslash har doim "pasayish" ko'rsatardi.
  const lastActual = revenue?.lastActual || 0;
  const delta =
    next && lastActual > 0 ? Math.round(((next.amount - lastActual) / lastActual) * 100) : null;
  const DeltaIcon = delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card p-4 xs:p-5">
      <header>
        <h3 className="text-sm font-medium text-muted-foreground">Daromad bashorati</h3>
        {next ? (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {formatMoneyShort(next.amount)}
            </span>
            <span className="text-sm text-muted-foreground">{next.label} oyida</span>
            {delta != null && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs tabular-nums",
                  delta >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
                )}
              >
                <DeltaIcon className="size-3" />
                {delta > 0 ? `+${delta}%` : `${delta}%`}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Bashorat filial ichida hisoblanadi — yuqoridan filial tanlang.
          </p>
        )}
      </header>

      {bars.length > 0 && (
        <div className="mt-5 flex h-40 gap-2">
          {bars.map((b) => (
            <RevenueBar key={b.key} item={b} max={max} />
          ))}
        </div>
      )}

      {/* HISOBI OCHIQ. Yalang'och bashorat ("keyingi oy 42 mln")
          tekshirib bo'lmaydigan va'da; hisobi ko'rsatilgan bashorat
          esa dalil. */}
      {next && (
        <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          {next.activeStudents} faol o'quvchi
          {next.atRisk > 0 && ` · ketish xavfi −${formatMoneyShort(next.atRisk)}`}
          {next.collectionRate != null &&
            ` · tarixiy yig'ish ${next.collectionRate}%`}
          . Ustunlar haqiqatda yig'ilgan pulni ko'rsatadi, shuning uchun
          bashorat ham yig'ish darajasiga ko'paytirilgan (yalpi{" "}
          {formatMoneyShort(next.gross)}).
        </p>
      )}
    </div>
  );
};

// --- DAVOMAT ----------------------------------------------------------
//
// NEGA USTUN DIAGRAMMA EMAS: davomat 75-95% oralig'ida yuradi va
// noldan boshlangan ustunlarda bu farq ko'rinmaydi (hammasi bir xil
// balandlikda). O'qni 70% dan boshlash esa taqiqlangan - u farqlarni
// sun'iy kattalashtiradi. Shuning uchun kun-kartachalari: har biri o'z
// raqami, o'z izohi va kichik shkalasi bilan.

const DayCell = ({ day }) => {
  const rate = day.expectedRate == null ? null : Math.round(day.expectedRate * 100);
  // Ogohlantirish faqat sezilarli pasayishda: har bir past kun uchun
  // qizil chizsak, rang ma'nosini yo'qotadi.
  const weak = rate != null && rate < 75;

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border p-2.5",
        day.isToday ? "border-primary/40 bg-primary/5" : "border-border bg-card",
      )}
    >
      <p className="truncate text-[11px] capitalize text-muted-foreground">
        {day.isToday ? "bugun" : day.weekday.slice(0, 3)}
      </p>
      <p
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          weak ? "text-amber-600 dark:text-amber-400" : "text-foreground",
        )}
      >
        {rate == null ? "—" : `${rate}%`}
      </p>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        {rate != null && (
          <div
            className={cn("h-full rounded-full", weak ? "bg-amber-500" : "bg-primary/70")}
            style={{ width: `${Math.max(2, rate)}%` }}
          />
        )}
      </div>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
        {day.expectedAbsent ? `~${day.expectedAbsent} kelmaydi` : `${day.scheduledGroups} guruh`}
      </p>
    </div>
  );
};

const AttendanceForecast = ({ attendance }) => {
  const insufficient = !attendance || attendance.insufficient;
  const days = attendance?.projection || [];
  const rate = attendance?.expectedRate == null ? null : Math.round(attendance.expectedRate * 100);

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card p-4 xs:p-5">
      <header>
        <h3 className="text-sm font-medium text-muted-foreground">Davomat bashorati</h3>
        {insufficient ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Naqsh uchun davomat yozuvlari yetarli emas
            {attendance?.sample ? ` (${attendance.sample} yozuv)` : ""}.
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {rate == null ? "—" : `${rate}%`}
            </span>
            <span className="text-sm text-muted-foreground">
              keyingi 7 kunda · ~{attendance.expectedAbsent} o'quvchi kelmasligi mumkin
            </span>
          </div>
        )}
      </header>

      {!insufficient && days.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2 xs:grid-cols-4 lg:grid-cols-7">
          {days.map((d) => (
            <DayCell key={d.dateKey} day={d} />
          ))}
        </div>
      )}

      {!insufficient && attendance.worstDay && (
        <p className="mt-4 flex items-start gap-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Eng zaif kun — <span className="capitalize">{attendance.worstDay.weekday}</span> (
            {Math.round(attendance.worstDay.expectedRate * 100)}%). Oxirgi 4 hafta naqshi
            asosida: o'sha kunga eslatma yuborish eng foydali.
          </span>
        </p>
      )}
    </div>
  );
};

const AiForecast = ({ forecast }) => (
  <div className="grid gap-3 lg:grid-cols-2">
    <RevenueForecast revenue={forecast?.revenue} />
    <AttendanceForecast attendance={forecast?.attendance} />
  </div>
);

export default AiForecast;
