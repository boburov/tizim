import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '../api/client';

/**
 * Obunaning kunlik so'rovlar grafigi.
 *
 * Inline SVG — loyihada chart kutubxonasi yo'q va bitta ustunli grafik uchun
 * yangisini qo'shish (~50 KB) mantiqsiz.
 *
 * Har kun ikki qismli ustun: pastda muvaffaqiyatli, tepada rad etilganlar
 * (limit/muddat). Shunda "mijoz limitga urilyaptimi" bir qarashda ko'rinadi.
 */
export default function ApiUsageChart({ subscriptionId, days = 30 }) {
  const { data, isLoading } = useQuery({
    queryKey: ['api-usage', subscriptionId, days],
    queryFn: () =>
      api
        .get(`/api-services/subscriptions/${subscriptionId}/usage`, {
          params: { days },
        })
        .then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Grafik yuklanmoqda…
      </div>
    );
  }

  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((d) => d.ok + d.rejected));
  const totalOk = rows.reduce((s, d) => s + d.ok, 0);
  const totalRejected = rows.reduce((s, d) => s + d.rejected, 0);
  const totalFailed = rows.reduce((s, d) => s + d.failed, 0);

  // O'rtacha latency — faqat so'rov bo'lgan kunlar bo'yicha.
  const withCalls = rows.filter((d) => d.avgMs != null);
  const avgMs = withCalls.length
    ? Math.round(
        withCalls.reduce((s, d) => s + d.avgMs * d.ok, 0) /
          Math.max(1, withCalls.reduce((s, d) => s + d.ok, 0)),
      )
    : null;

  const W = 100; // viewBox kengligi — foizda, konteynerga cho'ziladi
  const H = 32;
  const gap = 0.25;
  const barW = W / rows.length - gap;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <Stat label="Muvaffaqiyatli" value={totalOk.toLocaleString('uz-UZ')} tone="ok" />
        <Stat
          label="Rad etilgan"
          value={totalRejected.toLocaleString('uz-UZ')}
          tone={totalRejected > 0 ? 'warn' : 'muted'}
        />
        <Stat
          label="Xato"
          value={totalFailed.toLocaleString('uz-UZ')}
          tone={totalFailed > 0 ? 'bad' : 'muted'}
        />
        <Stat label="O'rtacha" value={avgMs != null ? `${avgMs} ms` : '—'} tone="muted" />
      </div>

      {totalOk + totalRejected + totalFailed === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          Bu davrda so'rov bo'lmagan
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-24 w-full"
          role="img"
          aria-label={`Oxirgi ${days} kunlik so'rovlar`}
        >
          {rows.map((d, i) => {
            const total = d.ok + d.rejected;
            const h = (total / max) * H;
            const okH = total > 0 ? (d.ok / total) * h : 0;
            const x = i * (barW + gap);
            return (
              <g key={d.day}>
                <title>
                  {d.day}: {d.ok} ok
                  {d.rejected > 0 ? `, ${d.rejected} rad etildi` : ''}
                  {d.failed > 0 ? `, ${d.failed} xato` : ''}
                </title>
                {/* rad etilganlar — ustun tepasida */}
                {d.rejected > 0 && (
                  <rect
                    x={x}
                    y={H - h}
                    width={barW}
                    height={h - okH}
                    className="fill-amber-500"
                  />
                )}
                <rect
                  x={x}
                  y={H - okH}
                  width={barW}
                  height={okH}
                  className="fill-brand"
                />
              </g>
            );
          })}
        </svg>
      )}

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{rows[0]?.day}</span>
        <span>{rows[rows.length - 1]?.day}</span>
      </div>
    </div>
  );
}

const TONE = {
  ok: 'text-emerald-600 dark:text-emerald-300',
  warn: 'text-amber-600 dark:text-amber-300',
  bad: 'text-red-600 dark:text-red-300',
  muted: 'text-foreground',
};

function Stat({ label, value, tone }) {
  return (
    <span className="text-muted-foreground">
      {label}: <b className={TONE[tone]}>{value}</b>
    </span>
  );
}
