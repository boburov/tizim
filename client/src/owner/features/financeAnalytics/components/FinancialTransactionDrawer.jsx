import { Link } from "react-router-dom";
import {
  ArrowUpRight, Lock, FileX, Clock, User, Building2, Users, BookOpen,
  DoorOpen, CreditCard, Tag, CalendarDays, Hash,
} from "lucide-react";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/shared/components/shadcn/sheet";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateTimeUz, formatDateUz } from "@/shared/utils/formatDate";
import MetricValue from "./MetricValue";
import { LoadingBlock } from "./StateBlock";
import { useEntryDetail } from "../hooks/useFinanceAnalytics";

/**
 * ══════════════════════════════════════════════════════════════════════
 * MOLIYAVIY TRANZAKSIYA PANELI — kuzatuvning oxirgi bo'g'ini
 * ══════════════════════════════════════════════════════════════════════
 *
 * Tahlildagi istalgan summa shu yerda JURNAL YOZUVIGA aylanadi:
 * debet/kredit qatorlari, o'lchovlar, audit va manba hujjat.
 *
 * ── HAMMA RAQAM SERVERDAN ──
 * Panel HECH NARSA hisoblamaydi. Brutto/komissiya/netto uchligi ham
 * serverdan tayyor keladi — aks holda frontend o'z hisobini qilib,
 * jurnal bilan ajralib ketishi mumkin edi.
 *
 * ── BO'SH YORLIQ CHIZILMAYDI ──
 * Server faqat MAVJUD o'lchovlarni qaytaradi. Ijara chiqimida
 * "O'quvchi: —" degan qator umuman bo'lmaydi.
 */

const DIM_META = {
  student: { icon: User, label: "O'quvchi" },
  teacher: { icon: User, label: "O'qituvchi" },
  staff: { icon: User, label: "Xodim" },
  group: { icon: Users, label: "Guruh" },
  course: { icon: BookOpen, label: "Yo'nalish" },
  room: { icon: DoorOpen, label: "Xona" },
  expenseCategory: { icon: Tag, label: "Kategoriya" },
};

const METHOD_LABEL = {
  cash: "Naqd", card: "Karta", click: "Click", payme: "Payme",
  uzcard: "Uzcard", humo: "Humo", bank: "Bank", transfer: "O'tkazma",
};

const Row = ({ icon: Icon, label, children }) =>
  children ? (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      {Icon && <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-foreground">{children}</span>
    </div>
  ) : null;

/** Xato holatlari — server xabari EMAS, foydalanuvchi tili. */
const ErrorState = ({ error }) => {
  const status = error?.response?.status;
  const map = {
    404: { icon: FileX, title: "Moliyaviy yozuv topilmadi", hint: "U o'chirilgan yoki boshqa filialga tegishli bo'lishi mumkin." },
    403: { icon: Lock, title: "Bu tafsilotni ko'rish uchun ruxsat yo'q", hint: "Maosh ma'lumotini ko'rish uchun `salary.read` yoki `payroll.read` kerak." },
  };
  const s = map[status] || {
    icon: FileX,
    title: "Ma'lumotni yuklab bo'lmadi",
    // XOM SERVER XATOSI KO'RSATILMAYDI (talab 15).
    hint: status >= 500 ? "Serverda xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring."
      : "Ulanishni tekshirib, qayta urinib ko'ring.",
  };
  const Icon = s.icon;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{s.title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{s.hint}</p>
    </div>
  );
};

const LineTable = ({ title, rows, tone }) =>
  rows?.length ? (
    <div>
      <p className={cn("mb-1 text-xs font-medium", tone)}>{title}</p>
      <div className="overflow-hidden rounded-lg border border-border">
        {rows.map((l, i) => (
          <div
            key={`${l.accountKind}-${i}`}
            className={cn(
              "flex items-center justify-between gap-2 px-3 py-2 text-sm",
              i > 0 && "border-t border-border/60",
            )}
          >
            <span className="text-foreground">{l.accountLabel}</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatMoney(l.debit > 0 ? l.debit : l.credit)}
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : null;

const AUDIT_ACTION = {
  create: "yaratildi", update: "o'zgartirildi", delete: "o'chirildi",
  restore: "tiklandi", approve: "tasdiqlandi", reject: "rad etildi",
  execute: "bajarildi", cancel: "bekor qilindi",
};

const FinancialTransactionDrawer = ({ entryId, onOpenChange }) => {
  const open = Boolean(entryId);
  const query = useEntryDetail(entryId);
  const d = query.data;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onOpenChange(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{d?.kindLabel || "Moliyaviy yozuv"}</SheetTitle>
          <SheetDescription>
            {d ? formatDateUz(d.date) : "Tafsilot yuklanmoqda"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {query.isLoading && <LoadingBlock rows={3} />}
          {query.isError && <ErrorState error={query.error} />}

          {d && (
            <>
              {/* ── SARLAVHA: summa ── */}
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Summa</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  <MetricValue value={d.amount} kind="money" />
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {d.branch?.name && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="size-3" />
                      {d.branch.name}
                    </span>
                  )}
                  {d.isInternal && (
                    <span className="rounded bg-muted px-1.5 py-0.5">Ichki aylanma</span>
                  )}
                  {!d.accounting.balanced && (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                      Muvozanat buzilgan
                    </span>
                  )}
                </div>
                {d.memo && <p className="mt-2 text-xs text-foreground">{d.memo}</p>}
              </div>

              {/* ── KONTEKST: faqat MAVJUD o'lchovlar ── */}
              {Object.keys(d.dimensions || {}).length > 0 && (
                <section>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Kontekst</h3>
                  <div className="rounded-xl border border-border px-3 py-1">
                    {Object.entries(DIM_META).map(([key, meta]) => {
                      const v = d.dimensions[key];
                      return v ? (
                        <Row key={key} icon={meta.icon} label={meta.label}>
                          {v.name || v.id}
                        </Row>
                      ) : null;
                    })}
                    <Row icon={CreditCard} label="Kanal">
                      {d.dimensions.paymentMethod
                        ? METHOD_LABEL[d.dimensions.paymentMethod] || d.dimensions.paymentMethod
                        : null}
                    </Row>
                    <Row icon={Tag} label="Xarajat turi">
                      {d.dimensions.costType === "fixed" ? "Doimiy"
                        : d.dimensions.costType === "variable" ? "O'zgaruvchan" : null}
                    </Row>
                    <Row icon={CalendarDays} label="Davr">
                      {d.dimensions.period
                        ? `${d.dimensions.period.year}-${String(d.dimensions.period.month).padStart(2, "0")}`
                        : null}
                    </Row>
                  </div>
                </section>
              )}

              {/* ── BUXGALTERIYA: debet / kredit ── */}
              <section>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                  Qo'sh yozuv
                </h3>
                <div className="space-y-3">
                  <LineTable title="Debet" rows={d.accounting.debits} tone="text-primary" />
                  <LineTable title="Kredit" rows={d.accounting.credits} tone="text-warning" />
                </div>
                <div className="mt-2 flex justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Jami</span>
                  <span className="tabular-nums text-foreground">
                    {formatMoney(d.accounting.totalDebit)} = {formatMoney(d.accounting.totalCredit)}
                  </span>
                </div>
              </section>

              {/* ── MANBA HUJJAT ── */}
              {d.source && (
                <section>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Manba hujjat</h3>
                  <div className="rounded-xl border border-border px-3 py-1">
                    <Row icon={Hash} label="Hujjat">
                      {d.source.model}
                    </Row>
                    {d.source.exists === false && !d.source.selfContained && (
                      <p className="py-2 text-xs text-muted-foreground">
                        Manba hujjat topilmadi (o'chirilgan bo'lishi mumkin).
                      </p>
                    )}
                    {d.source.selfContained && (
                      <p className="py-2 text-xs text-muted-foreground">
                        Bu amal uchun alohida hujjat yo'q — jurnal yozuvining o'zi manba.
                      </p>
                    )}
                    {d.source.data?.gross !== undefined && (
                      <>
                        <Row label="Brutto">{formatMoney(d.source.data.gross)}</Row>
                        {d.source.data.fee > 0 && <Row label="Komissiya">{formatMoney(d.source.data.fee)}</Row>}
                        <Row label="Netto">{formatMoney(d.source.data.net)}</Row>
                      </>
                    )}
                    {d.source.data?.title && <Row label="Nomi">{d.source.data.title}</Row>}
                    {d.source.data?.vendor && <Row label="Yetkazuvchi">{d.source.data.vendor}</Row>}
                    {d.source.data?.reason && <Row label="Sabab">{d.source.data.reason}</Row>}
                    {d.source.data?.canceled && (
                      <p className="py-2 text-xs text-destructive">Manba hujjat bekor qilingan.</p>
                    )}
                    {d.source.exists && d.source.route && (
                      <Link
                        to={d.source.route}
                        className="my-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {d.source.label}
                        <ArrowUpRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </section>
              )}

              {/* ── AUDIT ── */}
              <section>
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">Audit</h3>
                <div className="rounded-xl border border-border px-3 py-1">
                  <Row icon={User} label="Kim yozdi">{d.audit?.createdBy?.name}</Row>
                  <Row icon={Clock} label="Qachon">
                    {d.audit?.createdAt ? formatDateTimeUz(d.audit.createdAt) : null}
                  </Row>
                  {d.postingKey && <Row icon={Hash} label="Kalit">{d.postingKey}</Row>}
                </div>

                {d.audit?.logs?.length > 0 && (
                  <ol className="mt-2 space-y-2 border-l border-border pl-3">
                    {d.audit.logs.map((l) => (
                      <li key={l.id} className="relative text-xs">
                        <span className="absolute -left-[17px] top-1.5 size-1.5 rounded-full bg-muted-foreground" />
                        <p className="text-foreground">
                          {l.entityType} {AUDIT_ACTION[l.action] || l.action}
                          {l.actorLabel ? ` · ${l.actorLabel}` : ""}
                        </p>
                        {(l.amountBefore !== null || l.amountAfter !== null) && (
                          <p className="text-muted-foreground">
                            {l.amountBefore !== null && `${formatMoney(l.amountBefore)} → `}
                            {l.amountAfter !== null && formatMoney(l.amountAfter)}
                          </p>
                        )}
                        {l.reason && <p className="text-muted-foreground">{l.reason}</p>}
                        <p className="text-muted-foreground">{formatDateTimeUz(l.createdAt)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default FinancialTransactionDrawer;
