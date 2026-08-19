import { Link } from "react-router-dom";
import { Wallet, TrendingDown, Users, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatDateUz } from "@/shared/utils/formatDate";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import {
  AnalyticsTable, MetricValue, QueryState, DeniedBlock,
} from "@/shared/components/analytics";
import {
  useSummary, useRevenueBy, useExpenseBy, useReceivablesBy,
  useEntryList, useStudentFinance,
} from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";

import { DRILL_TYPES as T } from "./drillNodes";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PANEL ICHIDAGI BO'LIMLAR — tugun turiga qarab
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── QAT'IY QOIDA: PANEL HISOBLAMAYDI ──
 * Har bo'lim MAVJUD endpoint'ni chaqiradi, faqat tugun filtri
 * qo'shilgan holda. Ya'ni "IELTS ichidagi guruhlar" jamisi tashqi
 * jadvaldagi IELTS raqami bilan MOS keladi — ikkalasi ham bir xil
 * SQL dan chiqadi. Frontendda `reduce` bilan yig'ish taqiqlanadi:
 * u ikkinchi haqiqat manbai bo'lardi (talab 28).
 *
 * ── RUXSAT ──
 * Ruxsati yo'q bo'lim SO'RALMAYDI (`enabled: false`) va o'rniga
 * tushuntiruvchi blok chiqadi. Bu qulaylik: serverning o'zi ham 403
 * qaytaradi, lekin foydalanuvchi "yuklanmoqda → xato" ni emas,
 * darhol sababni ko'rgani yaxshi.
 */

const Section = ({ title, hint, children }) => (
  <section className="space-y-2">
    <div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </section>
);

/** Tugun kesimidagi uchta asosiy raqam — hammasi `/summary` dan. */
const SliceKpi = ({ filters }) => {
  const q = useSummary(filters);
  const d = q.data;

  const items = [
    { label: "Daromad", value: d?.revenue?.current, icon: Wallet },
    { label: "Chiqim", value: d?.operatingExpenses?.current, icon: TrendingDown },
    { label: "Hissa foydasi", value: d?.contributionProfit?.current, icon: ArrowRight },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-3">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Icon className="size-3" />
            {label}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
            {q.isLoading ? (
              <span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" />
            ) : q.isError ? (
              <span className="text-xs font-normal text-muted-foreground">—</span>
            ) : (
              <MetricValue value={value} kind="moneyShort" />
            )}
          </p>
        </div>
      ))}
    </div>
  );
};

/** Daromad kesimi — bosilganda keyingi bo'g'inni ochadi. */
const RevenueBreakdown = ({ by, filters, nextType, title, hint, onOpen, nameKey = "name" }) => {
  const q = useRevenueBy(by, { ...filters, limit: 50 });
  return (
    <Section title={title} hint={hint}>
      <QueryState
        query={q}
        empty={!q.data?.length}
        emptyTitle="Bu kesimda daromad yo'q"
        emptyHint="Tanlangan davrda bu bo'lim bo'yicha to'lov yozilmagan."
        loadingRows={3}
      >
        {(rows) => (
          <AnalyticsTable
            rows={rows}
            defaultSort={{ key: "revenue", dir: "desc" }}
            onRowClick={
              nextType
                ? (r) => onOpen({ type: nextType, id: r.id, name: r[nameKey] })
                : undefined
            }
            columns={[
              { key: nameKey, label: title },
              { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
              { key: "sharePercent", label: "Ulush", align: "right", kind: "percent" },
            ]}
          />
        )}
      </QueryState>
    </Section>
  );
};

/** Chiqim kesimi. */
const ExpenseBreakdown = ({ by, filters, nextType, title, hint, onOpen }) => {
  const q = useExpenseBy(by, { ...filters, limit: 50 });
  return (
    <Section title={title} hint={hint}>
      <QueryState
        query={q}
        empty={!q.data?.items?.length}
        emptyTitle="Bu kesimda chiqim yo'q"
        emptyHint="Tanlangan davrda bu bo'lim bo'yicha xarajat yozilmagan."
        loadingRows={3}
      >
        {(d) => (
          <AnalyticsTable
            rows={d.items}
            defaultSort={{ key: "amount", dir: "desc" }}
            onRowClick={
              nextType ? (r) => onOpen({ type: nextType, id: r.id, name: r.name }) : undefined
            }
            columns={[
              { key: "name", label: title },
              { key: "amount", label: "Summa", align: "right", kind: "moneyShort" },
              { key: "sharePercent", label: "Ulush", align: "right", kind: "percent" },
            ]}
          />
        )}
      </QueryState>
    </Section>
  );
};

/** Qarzdorlik kesimi — "kim to'lamadi". */
const DebtBreakdown = ({ by, filters, nextType, onOpen }) => {
  const { has } = usePermissions();
  const allowed = has(PERMISSIONS.FINANCE_VIEW_RECEIVABLES);
  const q = useReceivablesBy(by, { ...filters, limit: 50 }, { enabled: allowed });

  if (!allowed) {
    return (
      <Section title="Qarzdorlik">
        <DeniedBlock permission="finance.view_receivables" />
      </Section>
    );
  }
  return (
    <Section title="Qarzdorlik" hint="Kutilgan summadan to'lanmagan qismi">
      <QueryState
        query={q}
        empty={!q.data?.length}
        emptyTitle="Qarzdor yo'q"
        emptyHint="Bu kesimda hamma to'lovlar yopilgan."
        loadingRows={2}
      >
        {(rows) => (
          <AnalyticsTable
            rows={rows}
            defaultSort={{ key: "outstanding", dir: "desc" }}
            onRowClick={
              nextType ? (r) => onOpen({ type: nextType, id: r.id, name: r.name }) : undefined
            }
            columns={[
              { key: "name", label: "Nomi" },
              { key: "expected", label: "Kutilgan", align: "right", kind: "moneyShort" },
              { key: "outstanding", label: "Qarz", align: "right", kind: "moneyShort" },
              { key: "collectionRate", label: "Undirish", align: "right", kind: "percent" },
            ]}
          />
        )}
      </QueryState>
    </Section>
  );
};

/** Yozuvlar — zanjirning oxirgi bo'g'iniga o'tish nuqtasi. */
const Entries = ({ filters, onOpen, title = "Moliyaviy yozuvlar" }) => {
  const q = useEntryList({ ...filters, limit: 25 });
  return (
    <Section title={title} hint="Har qatordan qo'sh yozuv hujjatiga o'tiladi">
      <QueryState
        query={q}
        empty={!q.data?.length}
        emptyTitle="Yozuv yo'q"
        emptyHint="Tanlangan davrda bu kesimda hech qanday moliyaviy amal bo'lmagan."
        loadingRows={3}
      >
        {(rows) => (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {rows.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpen({ type: T.ENTRY, id: e.id, name: e.kindLabel })}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{e.kindLabel}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateUz(e.date)}
                      {e.memo ? ` · ${e.memo}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    <MetricValue value={e.amount} kind="moneyShort" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Section>
  );
};

/** O'quvchining moliyaviy holati (talab 15). */
const StudentProfile = ({ studentId, filters }) => {
  const q = useStudentFinance(studentId, filters);
  const d = q.data;

  const cards = [
    { label: "To'langan", value: d?.totals?.paid },
    { label: "Qarz", value: d?.totals?.outstanding, tone: d?.totals?.outstanding > 0 ? "text-destructive" : "" },
    { label: "Chegirma", value: d?.totals?.discounts },
    { label: "Qaytarim", value: d?.totals?.refunds },
  ];

  return (
    <Section title="Moliyaviy holat" hint="Butun davr bo'yicha, tanlangan oydan qat'i nazar">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
            <p className={cn("mt-1 text-sm font-semibold tabular-nums text-foreground", c.tone)}>
              {q.isLoading ? (
                <span className="inline-block h-4 w-14 animate-pulse rounded bg-muted" />
              ) : (
                <MetricValue value={c.value} kind="moneyShort" />
              )}
            </p>
          </div>
        ))}
      </div>

      {d?.groups?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {d.groups.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-border px-3 py-2 text-xs"
            >
              <Users className="size-3 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">{g.name}</span>
              {g.course?.name && <span className="text-muted-foreground">· {g.course.name}</span>}
              {g.teachers?.[0]?.name && (
                <span className="text-muted-foreground">· {g.teachers.map((t) => t.name).join(", ")}</span>
              )}
              {!g.active && <span className="text-muted-foreground">· tugatgan</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

/**
 * TUGUN → BO'LIMLAR.
 *
 * Yangi tur qo'shilsa — faqat shu yerga bitta tarmoq. Zanjir
 * `drillNodes.js` da e'lon qilingan, bu yerda esa CHIZILADI.
 */
const DrillSections = ({ node, filters, onOpen }) => {
  const { has } = usePermissions();

  switch (node.type) {
    // ── "BU PUL QAYERDAN KELDI?" (talab 34) ──
    case T.REVENUE:
      return (
        <div className="space-y-6">
          <SliceKpi filters={filters} />
          <RevenueBreakdown
            by="course" filters={filters} nextType={T.COURSE}
            title="Yo'nalishlar" hint="Daromadning eng katta manbalari"
            onOpen={onOpen}
          />
          <RevenueBreakdown
            by="branch" filters={filters} nextType={T.BRANCH}
            title="Filiallar" hint="Qaysi filial qancha keltirdi"
            onOpen={onOpen}
          />
        </div>
      );

    // ── "BU PUL QAYERGA KETDI?" (talab 10) ──
    case T.EXPENSE:
      return (
        <div className="space-y-6">
          <SliceKpi filters={filters} />
          <ExpenseBreakdown
            by="category" filters={filters} nextType={T.EXPENSE_CATEGORY}
            title="Chiqim turlari" hint="Eng katta xarajat yo'nalishlari"
            onOpen={onOpen}
          />
        </div>
      );

    case T.BRANCH:
      return (
        <div className="space-y-6">
          <SliceKpi filters={filters} />
          <RevenueBreakdown
            by="course" filters={filters} nextType={T.COURSE}
            title="Yo'nalishlar" hint="Daromad qaysi yo'nalishdan keldi"
            onOpen={onOpen}
          />
          <ExpenseBreakdown
            by="category" filters={filters} nextType={T.EXPENSE_CATEGORY}
            title="Chiqim turlari" hint="Pul qayerga ketdi"
            onOpen={onOpen}
          />
        </div>
      );

    case T.COURSE:
      return (
        <div className="space-y-6">
          <SliceKpi filters={filters} />
          <RevenueBreakdown
            by="group" filters={filters} nextType={T.GROUP}
            title="Guruhlar" hint="Yo'nalish ichidagi guruhlar"
            onOpen={onOpen}
          />
        </div>
      );

    case T.GROUP:
      return (
        <div className="space-y-6">
          <SliceKpi filters={filters} />
          <RevenueBreakdown
            by="student" filters={filters} nextType={T.STUDENT}
            title="O'quvchilar" hint="Kim qancha to'lagan"
            onOpen={onOpen}
          />
          <DebtBreakdown by="student" filters={filters} nextType={T.STUDENT} onOpen={onOpen} />
          <Entries filters={filters} onOpen={onOpen} />
        </div>
      );

    case T.STUDENT:
      return (
        <div className="space-y-6">
          <StudentProfile studentId={node.id} filters={filters} />
          <Entries filters={filters} onOpen={onOpen} title="To'lov tarixi" />
          {/* ZANJIR BOSHI BERK KO'CHAGA TUSHMASIN.
              Panel — TAHLIL ko'rinishi va u ATAYLAB hech narsa
              yozmaydi (talab 28). Lekin o'quvchining to'lovini
              qabul qilish, chegirma berish yoki muzlatish — o'quvchi
              KARTASIDA. Havolasiz odam raqamni ko'rib, "endi nima
              qilay?" degan savolda qolardi (talab 21). */}
          <Link
            to={`/owner/users/${node.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            O'quvchi kartasini ochish
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      );

    case T.TEACHER:
      return (
        <div className="space-y-6">
          <SliceKpi filters={filters} />
          <RevenueBreakdown
            by="group" filters={filters} nextType={T.GROUP}
            title="Guruhlari" hint="O'qituvchi olib borayotgan guruhlar"
            onOpen={onOpen}
          />
          {has(PERMISSIONS.SALARY_READ) || has(PERMISSIONS.PAYROLL_READ) ? (
            <Entries filters={filters} onOpen={onOpen} title="Maosh va to'lov yozuvlari" />
          ) : (
            <Section title="Maosh yozuvlari">
              <DeniedBlock permission="salary.read" />
            </Section>
          )}
        </div>
      );

    case T.ROOM:
      return (
        <div className="space-y-6">
          <SliceKpi filters={filters} />
          <RevenueBreakdown
            by="group" filters={filters} nextType={T.GROUP}
            title="Guruhlar" hint="Xonada dars o'tayotgan guruhlar"
            onOpen={onOpen}
          />
        </div>
      );

    case T.EXPENSE_CATEGORY:
      return (
        <div className="space-y-6">
          <ExpenseBreakdown
            by="person" filters={filters} nextType={T.PERSON}
            title="Kimga to'landi" hint="Faqat odamga bog'langan yozuvlar"
            onOpen={onOpen}
          />
          <Entries filters={filters} onOpen={onOpen} />
        </div>
      );

    case T.PERSON:
    case T.PAYMENT_METHOD:
    case T.ACCOUNT:
      return (
        <div className="space-y-6">
          <Entries filters={filters} onOpen={onOpen} />
        </div>
      );

    default:
      return <Entries filters={filters} onOpen={onOpen} />;
  }
};

export default DrillSections;
