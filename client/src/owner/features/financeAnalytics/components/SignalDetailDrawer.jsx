import { useState } from "react";
import { Sparkles, ArrowRight, ShieldAlert, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/shared/components/shadcn/sheet";
import Button from "@/shared/components/ui/button/Button";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { MetricValue, LoadingBlock } from "@/shared/components/analytics";
import { useSignalDetail } from "../hooks/useFinanceIntelligence";

/**
 * SIGNAL TAFSILOTI — "nega bunday?" javobining to'liq shakli.
 *
 * ═══════════════════════════════════════════════════════════════════
 * DALIL BIRINCHI, MATN KEYIN (talab G)
 *
 * Panel avval RAQAMLARNI ko'rsatadi (dalil jadvali), matn esa
 * ularning ostida turadi. Sabab: matnni model yozgan bo'lishi
 * mumkin, raqamlar esa HAR DOIM serverdan keladi va tekshirilgan.
 *
 * Foydalanuvchi xulosaga ishonmasa, aynan qaysi raqamdan
 * kelib chiqqanini KO'RIB tekshira oladi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * AI izohi FAQAT tugma bosilganda so'raladi — panel ochilishida
 * emas. Bu ham tezlik, ham xarajat masalasi (talab O).
 */

const SEV = {
  urgent: { icon: ShieldAlert, cls: "text-destructive", bg: "border-destructive/30 bg-destructive/5", label: "Shoshilinch" },
  watch: { icon: AlertTriangle, cls: "text-warning", bg: "border-warning/30 bg-warning/5", label: "Kuzatuv" },
  positive: { icon: CheckCircle2, cls: "text-success", bg: "border-success/30 bg-success/5", label: "Ijobiy" },
};

const fmtValue = (v, unit) => {
  if (v === null || v === undefined) return "—";
  if (unit === "%") return `${v}%`;
  if (unit && unit !== "so'm") return `${v} ${unit}`;
  return formatMoney(v);
};

const EvidenceRow = ({ e }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
    <span className="text-xs text-muted-foreground">{e.label}</span>
    <span className="text-right">
      <span className="font-medium tabular-nums text-foreground">{fmtValue(e.current, e.unit)}</span>
      {e.previous !== null && e.previous !== undefined && (
        <span className="ml-2 text-[11px] text-muted-foreground">
          oldingi: {fmtValue(e.previous, e.unit)}
        </span>
      )}
      {e.changePercent !== null && e.changePercent !== undefined && (
        <span
          className={cn(
            "ml-2 rounded px-1 py-0.5 text-[11px] font-medium",
            e.changePercent > 0 ? "bg-muted text-foreground" : "bg-muted text-foreground",
          )}
        >
          {e.changePercent > 0 ? "+" : ""}
          {e.changePercent}%
        </span>
      )}
    </span>
  </div>
);

const SignalDetailDrawer = ({ signalId, filters, onOpenChange, onAction }) => {
  const [wantAi, setWantAi] = useState(false);
  const open = Boolean(signalId);
  const query = useSignalDetail(signalId, filters, { explain: wantAi });
  const d = query.data;
  const sev = SEV[d?.severity] || SEV.watch;
  const Icon = sev.icon;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) { onOpenChange(null); setWantAi(false); }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-6">{d?.title || "Signal"}</SheetTitle>
          <SheetDescription>
            {d?.comparison?.label ? `Taqqoslash: ${d.comparison.label}` : "Yuklanmoqda"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {query.isLoading && <LoadingBlock rows={3} />}
          {query.isError && (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Bu signal joriy davrda faol emas.
            </p>
          )}

          {d && (
            <>
              <div className={cn("flex items-start gap-2 rounded-xl border p-3", sev.bg)}>
                <Icon className={cn("mt-0.5 size-4 shrink-0", sev.cls)} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{sev.label}</p>
                  {d.entityName && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{d.entityName}</p>
                  )}
                </div>
              </div>

              {/* ── DALIL: raqamlar BIRINCHI ── */}
              <section>
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">Dalil</h3>
                <div className="rounded-xl border border-border px-3">
                  {(d.evidence || []).map((e, i) => (
                    <EvidenceRow key={`${e.label}-${i}`} e={e} />
                  ))}
                </div>
              </section>

              {/* ── IZOH ── */}
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-xs font-medium text-muted-foreground">Izoh</h3>
                  {d.explanation?.source === "deterministic" && (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setWantAi(true)}
                      disabled={query.isFetching}
                    >
                      {query.isFetching ? (
                        <Loader2 className="mr-1 size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 size-3.5" />
                      )}
                      Nega bunday?
                    </Button>
                  )}
                </div>
                <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground">
                  {d.explanation?.text}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {d.explanation?.source === "ai" || d.explanation?.source === "ai_cached"
                    ? "Matn AI tomonidan yozilgan. Raqamlar yuqoridagi dalildan — ular o'zgartirilmaydi."
                    : "Matn tayyor raqamlardan avtomatik yig'ilgan."}
                  {d.explanation?.note ? ` ${d.explanation.note}.` : ""}
                </p>
              </section>

              {/* ── MA'LUMOT SIFATI ── */}
              {d.confidence && (
                <section>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Ma'lumot sifati</h3>
                  <div
                    className={cn(
                      "rounded-xl border p-3 text-xs",
                      d.confidence.level === "high"
                        ? "border-success/30 bg-success/5"
                        : "border-warning/40 bg-warning/5",
                    )}
                  >
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      <Info className="size-3.5" />
                      {d.confidence.level === "high" ? "Ishonchli" : "Cheklangan ishonch"}
                    </p>
                    {d.confidence.reasons?.length > 0 && (
                      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-muted-foreground">
                        {d.confidence.reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                </section>
              )}

              {/* ── TAVSIYA (bajarilmaydi — foydalanuvchi tanlaydi) ── */}
              {d.recommendedAction?.label && (
                <section>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Tavsiya</h3>
                  <Button
                    className="w-full"
                    onClick={() => {
                      onAction?.(d.recommendedAction.target, d);
                      onOpenChange(null);
                    }}
                  >
                    {d.recommendedAction.label}
                    <ArrowRight className="ml-1.5 size-4" />
                  </Button>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Tizim hech qanday moliyaviy amalni o'zi bajarmaydi — bu faqat havola.
                  </p>
                </section>
              )}

              {/* ── AUDIT IZI ── */}
              {d.source && (
                <p className="text-[11px] text-muted-foreground">
                  Qoida: <b>{d.source.rule}</b> · davr{" "}
                  {new Date(d.source.period.from).toLocaleDateString("uz-UZ")} —{" "}
                  {new Date(d.source.period.to).toLocaleDateString("uz-UZ")} · taqqoslandi{" "}
                  {new Date(d.source.comparedWith.from).toLocaleDateString("uz-UZ")} bilan
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SignalDetailDrawer;
