import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  GraduationCap,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';

/**
 * ══════════════════════════════════════════════════════════════════════
 * LOYIHA ANALITIKASI — TENANTDAN TORTIB OLINADI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Ma'lumot admin bazasida SAQLANMAYDI: har ochilganda loyiha serveridan
 * o'qiladi (`GET /tenants/:id/analytics`). Shuning uchun bu yerda
 * ko'ringan raqam markaz egasining o'z panelidagi bilan bir xil bo'ladi.
 *
 * ⚠ `null` = O'LCHANMADI, `0` EMAS. Yiqilgan bo'lak yoki dars bo'lmagan
 * oy uchun "0 so'm"/"0%" chizish ishonchli yolg'on bo'lardi — bunday
 * qiymat "—" bilan ko'rsatiladi.
 */

const money = (v) =>
  Number.isFinite(v) ? `${Math.round(v).toLocaleString('uz-UZ')} so'm` : '—';
const count = (v) => (Number.isFinite(v) ? v.toLocaleString('uz-UZ') : '—');

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const METHOD_LABEL = {
  cash: 'Naqd', card: 'Karta', click: 'Click', payme: 'Payme',
  uzcard: 'Uzcard', humo: 'Humo', bank: 'Bank', transfer: "O'tkazma",
};

function Tile({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon size={13} />} {label}
      </div>
      <div
        className={cn(
          'mt-1 text-lg font-semibold',
          tone === 'good' && 'text-emerald-700 dark:text-emerald-300',
          tone === 'bad' && 'text-red-700 dark:text-red-300',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Oddiy ustunli trend — kutubxonasiz, chunki bitta grafik uchun 100 KB ortiqcha. */
function TrendBars({ trend }) {
  if (!trend?.length) return null;
  const max = Math.max(...trend.flatMap((t) => [t.revenue || 0, t.expenses || 0]), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Tushum va chiqim</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" /> tushum</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-red-400" /> chiqim</span>
        </div>
      </div>
      <div className="flex items-end gap-2 overflow-x-auto" style={{ height: 140 }}>
        {trend.map((t) => (
          <div key={`${t.year}-${t.month}`} className="flex min-w-10 flex-1 flex-col items-center gap-1">
            <div className="flex h-28 w-full items-end justify-center gap-0.5">
              <div
                title={money(t.revenue)}
                className="w-1/2 rounded-t bg-emerald-500"
                style={{ height: `${Math.round(((t.revenue || 0) / max) * 100)}%`, minHeight: t.revenue ? 2 : 0 }}
              />
              <div
                title={money(t.expenses)}
                className="w-1/2 rounded-t bg-red-400"
                style={{ height: `${Math.round(((t.expenses || 0) / max) * 100)}%`, minHeight: t.expenses ? 2 : 0 }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{MONTHS[t.month - 1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TenantAnalytics({ tenantId }) {
  const [months, setMonths] = useState(6);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['tenant-analytics', tenantId, months],
    queryFn: () => api.get(`/tenants/${tenantId}/analytics?months=${months}`).then((r) => r.data),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Loyihadan olinmoqda…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Analitika olinmadi</div>
            <div className="mt-1 text-xs leading-relaxed">
              {error.response?.data?.message || error.message}
            </div>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw size={14} /> Qayta urinish
        </button>
      </div>
    );
  }

  const g = data?.general;
  const f = data?.finance;
  const e = data?.education;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {data?.generatedAt && <>Olingan: {new Date(data.generatedAt).toLocaleString('uz-UZ')}</>}
          {data?.cached && <span className="ml-2 rounded bg-muted px-1.5 py-0.5">kesh</span>}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
            value={months}
            onChange={(ev) => setMonths(Number(ev.target.value))}
          >
            <option value={3}>3 oy</option>
            <option value={6}>6 oy</option>
            <option value={12}>12 oy</option>
          </select>
          <button
            onClick={() => api.get(`/tenants/${tenantId}/analytics?months=${months}&force=true`).then(() => refetch())}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Yangilash
          </button>
        </div>
      </div>

      {/* ── UMUMIY ── */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Users size={14} /> Umumiy
        </h3>
        {!g ? (
          <p className="text-sm text-muted-foreground">O'lchanmadi.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Tile label="O'quvchilar" value={count(g.students)} hint={`${count(g.activeStudents)} faol`} />
            <Tile label="Xodimlar" value={count(g.users)} hint={`${count(g.teachers)} o'qituvchi`} />
            <Tile label="Guruhlar" value={count(g.groups)} hint={`${count(g.activeGroups)} faol`} />
            <Tile label="Filiallar" value={count(g.branches)} />
            <Tile label="Baza hajmi" value={g.storageMb != null ? `${g.storageMb} MB` : '—'} />
            <Tile label="Faoliyat (30 kun)" value={count(g.recentActivity30d)} hint="audit yozuvlari" />
          </div>
        )}
      </div>

      {/* ── MOLIYA ── */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Banknote size={14} /> Moliya
          {f?.from && (
            <span className="font-normal text-xs text-muted-foreground">
              {new Date(f.from).toLocaleDateString('uz-UZ')} dan
            </span>
          )}
        </h3>
        {!f ? (
          <p className="text-sm text-muted-foreground">O'lchanmadi.</p>
        ) : (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Tile icon={TrendingUp} label="Tushum" value={money(f.revenue)} hint={`${count(f.paymentCount)} to'lov`} tone="good" />
              <Tile icon={TrendingDown} label="Chiqim" value={money(f.expenses)} hint={`${count(f.expenseCount)} yozuv`} tone="bad" />
              <Tile label="Sof natija" value={money(f.net)} tone={f.net >= 0 ? 'good' : 'bad'} hint="tushum − chiqim − qaytarim" />
              <Tile label="Qarzdorlik" value={money(f.receivable)} hint="hozirgi holat" />
              <Tile label="Qaytarimlar" value={money(f.refunds)} hint={`${count(f.refundCount)} ta`} />
              <Tile label="Chegirmalar" value={money(f.discounts)} />
              <Tile label="Provayder komissiyasi" value={money(f.providerFees)} hint={`sof tushum ${money(f.netRevenue)}`} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <TrendBars trend={f.trend} />

              <div className="space-y-3">
                {f.byMethod?.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="mb-2 text-sm font-medium">To'lov usullari</h3>
                    <ul className="space-y-1 text-sm">
                      {f.byMethod.map((m) => (
                        <li key={m.method} className="flex justify-between">
                          <span className="text-muted-foreground">{METHOD_LABEL[m.method] || m.method}</span>
                          <span className="font-medium">{money(m.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {f.byCategory?.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="mb-2 text-sm font-medium">Chiqim kategoriyalari</h3>
                    <ul className="space-y-1 text-sm">
                      {f.byCategory.map((c) => (
                        <li key={c.category} className="flex justify-between gap-3">
                          <span className="truncate text-muted-foreground">{c.category}</span>
                          <span className="shrink-0 font-medium">{money(c.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── TA'LIM ── */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <GraduationCap size={14} /> Ta'lim (30 kun)
        </h3>
        {!e ? (
          <p className="text-sm text-muted-foreground">O'lchanmadi.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Tile
              label="Davomat"
              value={e.attendanceRate30d != null ? `${e.attendanceRate30d}%` : '—'}
              hint={e.attendanceRate30d == null ? "dars belgilanmagan" : `${count(e.attendanceRecords30d)} yozuv`}
            />
            <Tile label="Faol a'zoliklar" value={count(e.activeMemberships)} />
            <Tile label="Yangi lidlar" value={count(e.newLeads30d)} />
          </div>
        )}
      </div>
    </div>
  );
}
