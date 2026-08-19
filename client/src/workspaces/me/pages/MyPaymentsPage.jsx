import { Wallet, ArrowDownLeft, ArrowUpRight, Info } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import { QueryState } from "@/shared/components/analytics";
import { useMyLedgerQuery } from "@/owner/features/ledger";
import WorkspacePage from "@/shared/components/page/PageShell";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TO'LOVLARIM — O'QUVCHI NUQTAI NAZARIDAN (talab 15, 16)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA `/ledger/me` ──
 * O'quvchida `finance.read` YO'Q va bo'lmasligi ham kerak: u markazning
 * moliyasini emas, O'ZINIKINI ko'radi. `/ledger/me` aynan shuning
 * uchun qurilgan — ID `req.user` dan olinadi, ya'ni boshqa odamnikini
 * so'rash mumkin emas.
 *
 * Yangi endpoint YARATILMADI (talab 30, 36): mavjudi to'liq javob
 * beradi.
 *
 * ── TIL ──
 * "Debitorlik", "hisobvaraq", "qoldiq" degan atamalar YO'Q. O'quvchi
 * uchun ikkita savol bor: "qarzim bormi?" va "qachon to'laganman?".
 * Shuning uchun balans MANFIY bo'lsa "Qarzingiz", MUSBAT bo'lsa
 * "Oldindan to'lov" deb yoziladi — belgini o'quvchining o'zi
 * talqin qilishi shart emas.
 */

const ROW_META = {
  payment_in: { label: "To'lov", icon: ArrowDownLeft, tone: "text-success" },
  charge: { label: "Hisoblandi", icon: ArrowUpRight, tone: "text-muted-foreground" },
  deposit_in: { label: "Depozitga", icon: ArrowDownLeft, tone: "text-success" },
  deposit_out: { label: "Depozitdan", icon: ArrowUpRight, tone: "text-muted-foreground" },
  refund: { label: "Qaytarildi", icon: ArrowUpRight, tone: "text-warning" },
  discount: { label: "Chegirma", icon: ArrowDownLeft, tone: "text-success" },
  write_off: { label: "Hisobdan chiqarildi", icon: ArrowDownLeft, tone: "text-muted-foreground" },
  opening: { label: "Boshlang'ich qoldiq", icon: Info, tone: "text-muted-foreground" },
};

const MyPaymentsPage = () => {
  const query = useMyLedgerQuery();
  const d = query.data;
  const balance = d?.currentBalance ?? null;
  const owes = typeof balance === "number" && balance < 0;
  const credit = typeof balance === "number" && balance > 0;

  return (
    <WorkspacePage
      title="To'lovlarim"
      subtitle="To'lovlaringiz tarixi va joriy holatingiz"
    >
      <QueryState
        query={query}
        empty={!d}
        emptyTitle="Moliyaviy yozuv yo'q"
        emptyHint="Hali to'lov qilinmagan va hisob yozilmagan."
        loadingRows={3}
      >
        {(data) => (
          <>
            {/* ── HOLAT ── */}
            <section
              className={cn(
                "rounded-2xl border p-4",
                owes ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
              )}
            >
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="size-3.5" />
                {owes ? "Qarzingiz" : credit ? "Oldindan to'lov" : "Holatingiz"}
              </p>
              <p
                className={cn(
                  "mt-1 text-3xl font-semibold tabular-nums",
                  owes ? "text-destructive" : "text-foreground",
                )}
              >
                {formatMoney(Math.abs(balance ?? 0))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {owes
                  ? "Bu summani to'lashingiz kerak. Savol bo'lsa administratorga murojaat qiling."
                  : credit
                    ? "Bu summa keyingi oyning to'loviga hisobga olinadi."
                    : "Qarzingiz yo'q — hamma to'lov yopilgan."}
              </p>
            </section>

            {/* ── TARIX ── */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">Tarix</h2>
              {!data.rows?.length ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Hali yozuv yo'q
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {[...data.rows].reverse().map((r, i) => {
                    const meta = ROW_META[r.type] || {
                      label: r.title,
                      icon: Info,
                      tone: "text-muted-foreground",
                    };
                    const Icon = meta.icon;
                    return (
                      <li
                        key={`${r.refId}-${i}`}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <span className="flex min-w-0 items-start gap-2">
                          <Icon className={cn("mt-0.5 size-3.5 shrink-0", meta.tone)} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-foreground">
                              {r.title || meta.label}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {formatDateUz(r.date)}
                              {r.period ? ` · ${r.period}` : ""}
                            </span>
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-sm font-medium tabular-nums",
                            r.amount > 0 ? "text-success" : "text-foreground",
                          )}
                        >
                          {r.amount > 0 ? "+" : ""}
                          {formatMoney(r.amount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </QueryState>
    </WorkspacePage>
  );
};

export default MyPaymentsPage;
