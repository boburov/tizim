// React
import { useState } from "react";

// Icons
import { AlertTriangle, Info, TriangleAlert } from "lucide-react";

// Components
import DataTable from "@/shared/components/ui/table/DataTable";
import Switch from "@/shared/components/ui/switch/Switch";

// Hooks
import {
  usePnlQuery,
  useNormalizedQuery,
  useAlertsQuery,
} from "../hooks/useAnalyticsQueries";

const fmt = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(n || 0));
// null = hisoblab bo'lmadi (kirish ma'lumoti yo'q). "0" ko'rsatish
// "yomon ishlayapti" degan yolg'on xabar berardi.
const num = (n, suffix = "") => (n === null || n === undefined ? "—" : `${fmt(n)}${suffix}`);

const SEVERITY = {
  critical: {
    label: "Kritik",
    Icon: AlertTriangle,
    cls: "border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  warning: {
    label: "Ogohlantirish",
    Icon: TriangleAlert,
    cls: "border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  info: {
    label: "Ma'lumot",
    Icon: Info,
    cls: "border-border bg-muted text-muted-foreground",
  },
};

const AlertRow = ({ alert }) => {
  const s = SEVERITY[alert.severity] || SEVERITY.info;
  const { Icon } = s;
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 ${s.cls}`}>
      <Icon size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-sm">
        <p>{alert.message}</p>
        {alert.branchName && (
          <p className="mt-0.5 text-xs opacity-80">{alert.branchName}</p>
        )}
        {alert.fix && (
          <p className="mt-1 font-mono text-xs opacity-80">{alert.fix}</p>
        )}
      </div>
    </div>
  );
};

/**
 * FILIAL FOYDA/ZIYON + NORMALIZATSIYA + ANOMALIYALAR.
 *
 * KONSOLIDATSIYA KALITI eng muhim element: yoqilganda filiallararo ichki
 * o'tkazmalar va sotuvlar ayiriladi. Uni yashirish mumkin emas edi -
 * ikki raqam o'rtasidagi farqni owner KO'RISHI kerak, aks holda
 * "hisobot nega kamaydi" degan savol javobsiz qolardi.
 */
const BranchPnlPage = () => {
  const [consolidated, setConsolidated] = useState(false);

  const { data: pnl, isLoading } = usePnlQuery({ consolidated });
  const { data: normalized = [] } = useNormalizedQuery({});
  const { data: alertsRes } = useAlertsQuery();

  const items = pnl?.items || [];
  const totals = pnl?.totals || { revenue: 0, expense: 0, shortage: 0, net: 0 };
  const alerts = alertsRes?.alerts || [];

  const pnlColumns = [
    {
      key: "name",
      header: "Filial",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm font-medium">{r.name}</span>,
    },
    {
      key: "revenue",
      header: "Tushum",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm tabular-nums">{fmt(r.revenue)}</span>,
    },
    {
      key: "expense",
      header: "Xarajat",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm tabular-nums">{fmt(r.expense)}</span>,
    },
    {
      key: "shortage",
      header: "Kamomad",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      // Kamomad XARAJAT EMAS - alohida ustun. Aralashtirilsa "xarajat
      // oshdi" deb ko'rinib, sababi yashirinardi.
      cell: (r) => (
        <span
          className={`text-sm tabular-nums ${
            r.shortage > 0 ? "text-rose-600 dark:text-rose-400" : ""
          }`}
        >
          {fmt(r.shortage)}
        </span>
      ),
    },
    {
      key: "net",
      header: "Sof natija",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => (
        <span
          className={`text-sm font-semibold tabular-nums ${
            r.net < 0 ? "text-rose-600 dark:text-rose-400" : ""
          }`}
        >
          {fmt(r.net)}
        </span>
      ),
    },
    {
      key: "margin",
      header: "Marja",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => (
        <span className="text-sm tabular-nums">
          {r.margin === null ? "—" : `${r.margin}%`}
        </span>
      ),
    },
  ];

  const normColumns = [
    {
      key: "name",
      header: "Filial",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm font-medium">{r.name}</span>,
    },
    {
      key: "perM2",
      header: "1 kv.m ga",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm tabular-nums">{num(r.revenuePerM2)}</span>,
    },
    {
      key: "perStudent",
      header: "ARPU",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => (
        <span className="text-sm tabular-nums">{num(r.revenuePerStudent)}</span>
      ),
    },
    {
      key: "perRoom",
      header: "1 xonaga talaba",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm tabular-nums">{num(r.studentsPerRoom)}</span>,
    },
    {
      key: "util",
      header: "Bandlik",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => (
        <span className="text-sm tabular-nums">
          {r.utilizationPercent === null ? "—" : `${r.utilizationPercent}%`}
        </span>
      ),
    },
    {
      key: "cac",
      header: "CAC",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (r) => <span className="text-sm tabular-nums">{num(r.cac)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Filial tahlili</h1>
          {/* Raqamlarni O'QISH usuli — yo'riqnoma emas: markaz xarajati
              taqsimlanmasligini bilmagan odam filial foydasini noto'g'ri
              taqqoslaydi. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Markaz xarajatlari filiallarga taqsimlanmaydi
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Switch checked={consolidated} onChange={setConsolidated} />
          <span className="text-sm">
            Konsolidatsiya
            <span className="block text-xs text-muted-foreground">
              ichki o'tkazmalarni ayirish
            </span>
          </span>
        </label>
      </div>

      {/* ── ANOMALIYALAR ── */}
      {alerts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">
            Anomaliyalar
            <span className="ml-2 text-xs text-muted-foreground">
              {alertsRes.counts.critical} kritik · {alertsRes.counts.warning} ogohlantirish
            </span>
          </h2>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <AlertRow key={`${a.code}-${a.branchId}-${i}`} alert={a} />
            ))}
          </div>
        </section>
      )}

      {/* ── P&L ── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-sm font-medium">Foyda / ziyon</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            Jami: tushum {fmt(totals.revenue)} · xarajat {fmt(totals.expense)} ·
            sof {fmt(totals.net)}
          </span>
        </div>
        <DataTable
          rows={items}
          columns={pnlColumns}
          isLoading={isLoading}
          empty={
            <p className="py-8 text-center text-sm opacity-60">
              Bu davr uchun moliyaviy harakat yo'q
            </p>
          }
        />
      </section>

      {/* ── NORMALIZATSIYA ── */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Normalizatsiya</h2>
        <p className="text-xs text-muted-foreground">
          Filiallarni hajmidan qat'i nazar solishtirish. «—» = kirish
          ma'lumoti yo'q (filial maydoni, xona yoki marketing xarajati
          kiritilmagan).
        </p>
        <DataTable
          rows={normalized}
          columns={normColumns}
          empty={
            <p className="py-8 text-center text-sm opacity-60">
              Ma'lumot yetarli emas
            </p>
          }
        />
      </section>
    </div>
  );
};

export default BranchPnlPage;
