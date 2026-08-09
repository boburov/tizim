import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

import Badge from "@/shared/components/ui/badge/Badge";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import { cn } from "@/shared/utils/cn";

import useLedgerQuery from "../hooks/useLedgerQuery";
import { LEDGER_TYPE_LABELS, describeBalance } from "../utils/ledger";

/**
 * MOLIYAVIY TARIX PANELI - "bu balans QAYERDAN chiqdi?".
 *
 * ─── NEGA SHUNCHAKI RAQAM YETARLI EMAS ───
 * "Balans: 3 500 000" ni ko'rgan odam uni tekshira olmaydi va shuning
 * uchun unga ishonmaydi. Har bir qator yonida YUGURIB BORUVCHI BALANS
 * turgani esa hisobni oxirigacha qo'lda tekshirish imkonini beradi -
 * moliyaviy ekranda ishonch aynan shundan tug'iladi.
 *
 * ─── ISHORA KO'RSATISH ───
 * Raqamning ishorasi yolg'iz o'zi noaniq: "+3 500 000" ni "biz olamiz"
 * deb ham o'qish mumkin. Shuning uchun yakuniy balans yonida DOIM so'z
 * bilan izoh turadi ("Markaz qarzdor").
 */

const TONE_CLASSES = {
  credit: "text-emerald-700 dark:text-emerald-300",
  debt: "text-red-600 dark:text-red-300",
  zero: "text-muted-foreground",
};

// Nechta qator darhol ko'rsatiladi. Qolgani "Hammasi" bilan ochiladi -
// bir yillik tarix 40+ qator bo'lib, profil sahifasini bosib ketardi.
const PREVIEW_ROWS = 8;

const amountClass = (amount) =>
  amount > 0
    ? "text-emerald-700 dark:text-emerald-300"
    : amount < 0
      ? "text-red-600 dark:text-red-300"
      : "text-muted-foreground";

const signed = (amount) => `${amount > 0 ? "+" : ""}${formatMoney(amount)}`;

const LedgerPanel = ({ userId, className = "" }) => {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError } = useLedgerQuery(userId);

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border bg-card p-4", className)}>
        <p className="text-sm text-muted-foreground">Moliyaviy tarix yuklanmoqda...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={cn("rounded-lg border bg-card p-4", className)}>
        <p className="text-sm text-muted-foreground">Moliyaviy tarixni ochib bo'lmadi</p>
      </div>
    );
  }

  const { currentBalance, openingBalance, rows = [], summary = {} } = data;
  const balanceMeta = describeBalance(currentBalance);

  // ENG YANGISI YUQORIDA. Server tarixiy tartibda (eskisidan yangisiga)
  // qaytaradi, chunki yugurib boruvchi balans aynan shunday hisoblanadi -
  // lekin ekranda odam avvalo OXIRGI harakatni ko'rmoqchi bo'ladi.
  const ordered = [...rows].reverse();
  const visible = expanded ? ordered : ordered.slice(0, PREVIEW_ROWS);
  const hidden = ordered.length - visible.length;

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {/* ── Sarlavha: joriy balans ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <p className="text-sm text-muted-foreground">Joriy balans</p>
          <p className={cn("text-2xl font-semibold", TONE_CLASSES[balanceMeta.tone])}>
            {signed(currentBalance)}
          </p>
          <p className="text-xs text-muted-foreground">{balanceMeta.text}</p>
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <p>
            Boshlang'ich qoldiq:{" "}
            <span className={cn("font-medium", amountClass(openingBalance))}>
              {openingBalance ? signed(openingBalance) : "yo'q"}
            </span>
          </p>
          <p>Jami {summary.rowCount || 0} ta yozuv</p>
        </div>
      </div>

      {/* KUTAYOTGAN QOLDIQ ogohlantirishi.
          Bu holatda balans TO'G'RI, lekin qarzdorlar ro'yxatida bu odam
          hali ko'rinmaydi - farqni tushuntirmasak, ikki ekran bir-biriga
          zid raqam ko'rsatayotgandek tuyulardi. */}
      {summary.openingPending && (
        <div className="flex items-start gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Boshlang'ich qarz guruhga qo'shilishini kutmoqda. Balansda
            hisobga olingan, lekin qarzdorlar ro'yxatida o'quvchi guruhga
            qo'shilgandan keyin paydo bo'ladi.
          </span>
        </div>
      )}

      {/* ── Tarix ── */}
      {ordered.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Hali moliyaviy harakat yo'q
        </p>
      ) : (
        <>
          <div className="divide-y">
            {visible.map((r) => (
              <div
                key={`${r.type}-${r.refId}-${r.date}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.title}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {LEDGER_TYPE_LABELS[r.type] || r.type}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDateUz(r.date)}
                    {r.period ? ` · ${r.period}` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className={cn("text-sm font-medium", amountClass(r.amount))}>
                    {signed(r.amount)}
                  </p>
                  {/* Yugurib boruvchi balans - hisobni qo'lda tekshirish
                      uchun. Aynan shu ustun panelning bor sababi. */}
                  <p className="text-xs text-muted-foreground">
                    = {formatMoney(r.balanceAfter)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {hidden > 0 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-1 border-t py-2 text-xs text-muted-foreground hover:bg-muted/50"
            >
              <ChevronDown className="size-3.5" />
              Yana {hidden} ta yozuv
            </button>
          )}
          {expanded && ordered.length > PREVIEW_ROWS && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex w-full cursor-pointer items-center justify-center gap-1 border-t py-2 text-xs text-muted-foreground hover:bg-muted/50"
            >
              <ChevronUp className="size-3.5" />
              Yig'ish
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default LedgerPanel;
