import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import {
  BUSY_STATUSES,
  STATUS_LABEL,
  STATUS_STYLE,
} from '../lib/tenantStatus';

export default function TenantsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/tenants').then((r) => r.data),
    refetchInterval: (q) =>
      // Provisioning/o'chirish ketayotgan bo'lsa har 4 soniyada yangilaymiz
      q.state.data?.some((t) => BUSY_STATUSES.includes(t.status)) ? 4000 : false,
  });

  // Yoqilgan bo'limlar — BITTA so'rov, hamma loyiha uchun.
  //
  // ⚠ Har karta uchun alohida so'rov (N+1) qilinmaydi: 50 ta loyihada
  // bu 50 ta so'rov bo'lardi va ro'yxat sekinlashardi. Server tomonda
  // ham u loop emas, ommaviy so'rov (`moduleSummary`).
  //
  // ⚠ ALOHIDA QUERY, `/tenants` ga qo'shilmagan: ro'yxat provisioning
  // paytida har 4 soniyada qayta so'raladi, bo'limlar esa deyarli
  // o'zgarmaydi — ularni ham shu tezlikda tortish bekorga yuk bo'lardi.
  const { data: summary } = useQuery({
    queryKey: ['feature-summary'],
    queryFn: () => api.get('/feature-summary').then((r) => r.data),
    staleTime: 60_000,
  });

  const featuresOf = (tenantId) =>
    summary?.find((s) => s.tenantId === tenantId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Loyihalar</h1>
          <p className="text-sm text-muted-foreground">
            Yaratilgan o'quv markazlar va boshqa tizimlar
          </p>
        </div>
        <Link
          to="/tenants/new"
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark"
        >
          <Plus size={18} /> Yangi loyiha
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali loyiha yo'q. "Yangi loyiha" tugmasi bilan boshlang.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t) => (
            <Link
              key={t.id}
              to={`/tenants/${t.id}`}
              className="rounded-xl border border-border bg-card p-5 transition hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-lg"
                    style={{ background: t.brandColor }}
                  />
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.domain}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status]}`}
                >
                  {STATUS_LABEL[t.status] || t.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.systemTemplate?.name}
                </span>
              </div>
              <FeaturePills info={featuresOf(t.id)} />

              {t.status === 'ACTIVE' && (
                <div className="mt-3 flex items-center gap-1 text-xs text-brand">
                  <ExternalLink size={13} /> https://{t.domain}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Kartada ko'rsatiladigan pill soni. */
const PILL_LIMIT = 6;
/** Shundan ko'p bo'lim o'chiq bo'lsa ularni sanab o'tirmaymiz. */
const OFF_LIMIT = 4;

/**
 * YOQILGAN BO'LIMLAR — PILL'LAR.
 *
 * ⚠ FAQAT YOQILGANLARI CHIZILADI. O'chirilganlarni ham ko'rsatish
 * kartani 38 ta pill bilan to'ldirib, ro'yxatni o'qib bo'lmas holga
 * keltirardi. "Nima YO'Q" degan savol kartada emas, loyiha ichidagi
 * "Bo'limlar" jadvalida beriladi.
 *
 * ⚠ O'ZAK BO'LIMLAR SERVERDA CHIQARIB TASHLANGAN. Ular hamma loyihada
 * bir xil ochiq, ya'ni pill sifatida hech qanday farqni ko'rsatmasdi va
 * faqat haqiqiy ma'lumotni bosib qo'yardi.
 */
function FeaturePills({ info }) {
  // Yuklanmagan bo'lsa joy band qilinmaydi — karta balandligi sakramasin.
  if (!info) return null;

  if (!info.enabledCount) {
    return (
      <div className="mt-3 text-xs text-muted-foreground">
        Bo'limlar yoqilmagan
      </div>
    );
  }

  const shown = info.enabled.slice(0, PILL_LIMIT);
  const rest = info.enabledCount - shown.length;
  const off = info.disabled ?? [];

  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[11px] text-muted-foreground">
        Yoqilgan bo'limlar{' '}
        <span className="font-medium text-foreground">
          {info.enabledCount}/{info.total}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {shown.map((f) => (
          <span
            key={f.key}
            title={f.key}
            className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground"
          >
            {f.name}
          </span>
        ))}
        {rest > 0 && (
          <span
            title={info.enabled.slice(PILL_LIMIT).map((f) => f.name).join(', ')}
            className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            +{rest} ta
          </span>
        )}
      </div>

      {/* ⚠ O'CHIQLARI ALOHIDA — VA FAQAT KAMI BO'LSA.
          "37/38 yoqilgan" holatida eng qimmatli ma'lumot yoqilgan 37
          tasi emas, O'CHIQ qolgan bittasi: aynan u shu loyihani
          boshqalardan ajratadi. Ko'pi o'chiq bo'lsa esa bu ro'yxat
          kartani to'ldirib yuborardi, shuning uchun chegara bor. */}
      {off.length > 0 && off.length <= OFF_LIMIT && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          O'chiq:{' '}
          <span className="text-amber-700 dark:text-amber-400">
            {off.map((f) => f.name).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
