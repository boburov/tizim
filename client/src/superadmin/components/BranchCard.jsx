import { Link } from "react-router-dom";
import { ArrowRight, Building2, KeyRound, TriangleAlert } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import MetricValue from "@/shared/components/analytics/MetricValue";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FILIAL KARTASI (talab 8)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── BESH RAQAM, YIGIRMATA EMAS ──
 * Talab buni ochiq aytadi: kartani yigirma ko'rsatkich bilan
 * to'ldirmang. Tanlangan beshtasi filialning butun konturini beradi:
 *
 *   O'quvchi           — hajm
 *   Daromad            — natija
 *   Hissa foydasi      — natija sifati
 *   Qarzdorlik         — yig'ilmagan pul
 *   Undirish darajasi  — pul yig'ish qanchalik ishlayapti
 *
 * ── DAVOMAT NEGA YO'Q ──
 * Talab uni "bo'lishi mumkin" deb sanaydi, lekin bu kesim
 * `/finance-analytics/branches` javobida YO'Q. Uni ko'rsatish uchun
 * har filialga alohida so'rov yuborish kerak bo'lardi (o'nta filial —
 * o'nta so'rov) yoki raqamni taxmin qilish. Ikkalasi ham noto'g'ri:
 * birinchisi sahifani sekinlashtiradi, ikkinchisi YOLG'ON. Davomat
 * filial ichida, o'z ekranida turibdi.
 *
 * ── "OCHISH" — KARTANING O'ZI ──
 * Butun karta havola. Alohida kichkina tugma qo'yish bosish
 * maydonini kichraytirardi va mobilda tegish qiyin bo'lardi.
 */
const Metric = ({ label, value, kind = "moneyShort" }) => (
  <div className="min-w-0">
    <p className="truncate text-xs text-muted-foreground">{label}</p>
    <p className="truncate text-sm font-medium text-foreground">
      <MetricValue value={value} kind={kind} />
    </p>
  </div>
);

const BranchCard = ({ branch, stats }) => {
  const managers = branch.managers;
  return (
  <Link
    to={`/org/filiallar/${branch.id}`}
    className={cn(
      "group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition",
      "hover:border-foreground/20",
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Building2 className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{branch.name}</p>
          {branch.code && (
            <p className="truncate text-xs text-muted-foreground">{branch.code}</p>
          )}
        </div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </div>

    {/* RAQAMLAR FAQAT KELGAN BO'LSA.
        `|| 0` YOZILMAYDI: so'rov yiqilganda "0 so'm daromad" ishonchli
        ko'rinadigan YOLG'ON bo'lardi. Ma'lumot yo'q bo'lsa —
        `MetricValue` "—" chizadi. */}
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      <Metric label="O'quvchi" value={stats?.students} kind="number" />
      <Metric label="Daromad" value={stats?.revenue} />
      <Metric label="Hissa foydasi" value={stats?.contributionProfit} />
      <Metric label="Qarzdorlik" value={stats?.outstanding} />
      <Metric
        label="Undirish"
        value={stats?.collectionRatePercent}
        kind="percent"
      />
    </div>

    {/* ══════════════════════════════════════════════════════════════
        BU FILIALGA KIM KIRADI
        ══════════════════════════════════════════════════════════════

        ── NEGA KARTADA ──
        Filial ochilgandan keyingi BIRINCHI savol — "direktor qaysi
        login bilan kiradi?". Uni faqat filial ichiga qo'yish o'sha
        savolni bir bosish orqasiga yashirardi.

        PAROL BU YERDA YO'Q va bo'lmasligi ham kerak: ro'yxat ekrani
        yelka ustidan o'qishga eng ochiq joy. Parol filial ichida,
        "Ko'rsatish" bosilgandan keyin va alohida so'rov bilan keladi.

        ── DIREKTOR YO'Q BO'LSA ──
        Bu JIM qolmaydi. Direktorsiz filialga hech kim kira olmaydi —
        ya'ni bu "ma'lumot yo'q" emas, TUGALLANMAGAN ish. */}
    {managers !== undefined && (
      <div className="flex items-center gap-1.5 border-t border-border pt-2.5 text-xs">
        {managers.length > 0 ? (
          <>
            <KeyRound className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-foreground">
              {managers[0].username}
            </span>
            {managers.length > 1 && (
              <span className="shrink-0 text-muted-foreground">
                +{managers.length - 1}
              </span>
            )}
          </>
        ) : (
          <>
            <TriangleAlert className="size-3 shrink-0 text-warning" />
            <span className="text-muted-foreground">Direktor biriktirilmagan</span>
          </>
        )}
      </div>
    )}
  </Link>
  );
};

export default BranchCard;
