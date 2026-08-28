import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  Check,
  Infinity as InfinityIcon,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  X,
} from 'lucide-react';
import { api } from '../api/client';

/**
 * FILIALLAR — loyihaning chegarasi, foydalanishi va pullik paketlari.
 *
 * ⚠ BU YERDAGI TUGMALAR HIMOYA EMAS. Chegarani majburlash tenant
 * serverida (`POST /branches` → 402 BRANCH_LIMIT_REACHED). Bu panel
 * faqat Developer Admin uchun boshqaruv va ko'rsatkich.
 */

const SOURCE_LABEL = {
  override: "qo'lda qo'yilgan",
  plan: 'tarifdan',
  default: 'tizim standarti',
  'single-center': 'yakka markaz rejimi',
};

/** Foydalanish darajasiga qarab rang — 90% dan keyin qizil. */
function barColor(percent) {
  if (percent >= 100) return 'bg-red-500';
  if (percent >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export default function BranchLimits({ tenantId, canEdit }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['branch-config', tenantId],
    queryFn: () => api.get(`/tenants/${tenantId}/branch-config`).then((r) => r.data),
  });

  const refresh = (res) => {
    qc.setQueryData(['branch-config', tenantId], res.data);
    qc.invalidateQueries({ queryKey: ['tenant-usage', tenantId] });
    qc.invalidateQueries({ queryKey: ['tenant-settings', tenantId] });
  };
  const fail = (e) => {
    const msg = e.response?.data?.message;
    toast.error(Array.isArray(msg) ? msg[0] : msg || 'Xatolik');
  };

  const patch = useMutation({
    mutationFn: (body) => api.patch(`/tenants/${tenantId}/branch-config`, body),
    onSuccess: (res) => {
      refresh(res);
      setDraft('');
      toast.success('Filial sozlamasi yangilandi');
    },
    onError: fail,
  });

  const adjust = useMutation({
    mutationFn: (delta) => api.patch(`/tenants/${tenantId}/branch-limit`, { delta }),
    onSuccess: (res) => {
      refresh(res);
      toast.success('Chegara o\'zgartirildi');
    },
    onError: fail,
  });

  const grant = useMutation({
    mutationFn: (addonKey) => api.post(`/tenants/${tenantId}/branch-addons`, { addonKey }),
    onSuccess: (res) => {
      refresh(res);
      toast.success('Paket biriktirildi');
    },
    onError: fail,
  });

  const revoke = useMutation({
    mutationFn: (addonKey) => api.delete(`/tenants/${tenantId}/branch-addons/${addonKey}`),
    onSuccess: (res) => {
      refresh(res);
      toast.success('Paket olib tashlandi');
    },
    onError: fail,
  });

  const busy =
    patch.isPending || adjust.isPending || grant.isPending || revoke.isPending;

  if (isLoading || !data) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 size={15} className="animate-spin" /> Filial sozlamalari yuklanmoqda…
      </div>
    );
  }

  const { usage, unlimited, branchesEnabled } = data;
  // ⚠ `used` null bo'lishi mumkin — hali birorta heartbeat kelmagan.
  // "0" deb ko'rsatish YOLG'ON bo'lardi: bu "filial yo'q" degani emas,
  // "hali bilmaymiz" degani.
  const known = usage.used !== null && usage.used !== undefined;
  const percent =
    known && !unlimited && data.branchLimit > 0
      ? Math.round((usage.used / data.branchLimit) * 100)
      : 0;

  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-medium text-foreground">
          <Building2 size={17} /> Filiallar
        </h2>
        {usage.limitReached && (
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
            <AlertTriangle size={12} /> Chegara tugadi
          </span>
        )}
      </div>

      {/* ── Used / Limit / Remaining ── */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { label: 'Ishlatilgan', value: known ? usage.used : '—' },
          {
            label: 'Chegara',
            value: unlimited ? <InfinityIcon size={18} className="inline" /> : data.branchLimit,
          },
          {
            label: 'Qolgan',
            value: unlimited ? (
              <InfinityIcon size={18} className="inline" />
            ) : known ? (
              usage.remaining
            ) : (
              '—'
            ),
          },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/60 px-3 py-2 text-center">
            <div className="text-lg font-semibold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {known && !unlimited && (
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor(percent)}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}

      <p className="mb-4 text-xs text-muted-foreground">
        {!known && 'Hali heartbeat kelmagan — soni birinchi aloqadan keyin ko\'rinadi. '}
        Chegara manbasi: <b>{SOURCE_LABEL[data.source] || data.source}</b>
        {data.addonBonus > 0 && ` (${data.base} + ${data.addonBonus} sotib olingan)`}
        {data.planName && data.source === 'plan' && ` — ${data.planName}`}.
      </p>

      {/* ── Rejim ── */}
      <label
        className={`mb-4 flex items-start gap-3 rounded-xl border border-border p-3 ${
          canEdit ? 'cursor-pointer hover:bg-muted' : 'opacity-60'
        }`}
      >
        <input
          type="checkbox"
          checked={branchesEnabled}
          disabled={!canEdit || busy}
          onChange={(e) => patch.mutate({ branchesEnabled: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            Ko'p filialli rejim
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            O'chirilsa loyiha yakka markaz bo'ladi: chegara doim 1 ta va filial
            tushunchasi mijoz panelidan yo'qoladi. Tarif ham, sotib olingan paket
            ham buni ko'tarmaydi.
          </span>
        </span>
      </label>

      {/* ── Chegarani boshqarish ── */}
      {canEdit && branchesEnabled && (
        <div className="mb-4 space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Chegarani o'zgartirish</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => adjust.mutate(-1)}
                disabled={busy || unlimited || data.base <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                title="Bitta kamaytirish"
              >
                <Minus size={14} />
              </button>
              <button
                onClick={() => adjust.mutate(1)}
                disabled={busy || unlimited}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                title="Bitta oshirish"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={data.limits.min}
              max={data.limits.max}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Aniq son (${data.limits.min}–${data.limits.max})`}
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={() => patch.mutate({ branchLimit: Number(draft) })}
              disabled={busy || draft === ''}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
            >
              <Check size={14} /> Qo'yish
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => patch.mutate({ branchLimit: data.limits.unlimitedValue })}
              disabled={busy || unlimited}
              className="rounded-lg border border-border px-2.5 py-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              Cheksiz qilish
            </button>
            {/* ⚠ `null` = "qo'lda qo'yilgani bekor qilinsin" — chegara
                tarifga/standartga qaytadi va tarif o'zgarsa AVTOMATIK
                yangilanadi. */}
            <button
              onClick={() => patch.mutate({ branchLimit: null })}
              disabled={busy || data.override === null}
              className="rounded-lg border border-border px-2.5 py-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              Tarifga qaytarish
              {data.override !== null && ` (hozir: ${data.override})`}
            </button>
          </div>
        </div>
      )}

      {/* ── Pullik kengaytma ── */}
      {branchesEnabled && (
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ShoppingCart size={14} /> Pullik kengaytma
          </h3>

          {data.addons.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {data.addons.map((a) => (
                <div
                  key={a.key}
                  className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-500/10"
                >
                  <span className="text-emerald-800 dark:text-emerald-300">
                    {a.name}
                    {/* Miqdor 1 dan katta bo'lsa OCHIQ ko'rsatiladi: "+5 × 2"
                        va yig'indi "+10". Faqat yig'indini ko'rsatish
                        "qaysi paket necha marta sotilgan" savolini
                        javobsiz qoldirardi. */}
                    {a.quantity > 1 && (
                      <span className="ml-1 text-xs">× {a.quantity}</span>
                    )}
                    <span className="ml-1.5 font-mono text-xs">(+{a.units})</span>
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => revoke.mutate(a.key)}
                      disabled={busy}
                      className="text-muted-foreground hover:text-red-500 disabled:opacity-40"
                      title="Olib tashlash"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!data.availableAddons.length ? (
            <p className="text-xs text-muted-foreground">
              Filial paketlari sozlanmagan — <span className="font-mono">npm run seed:plans</span>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.availableAddons.map((a) => {
                // ⚠ "Allaqachon olingan" TO'SIQ EMAS: paket qayta sotilishi
                // MUMKIN va miqdor ustiga qo'shiladi (+5 ni ikki marta
                // olgan mijoz 10 ta filial oladi). Faqat `maxQuantity`
                // to'sadi — uni server ham majburlaydi.
                const owned = data.addons.find((x) => x.key === a.key);
                const qty = owned?.quantity ?? 0;
                const capped = a.maxQuantity != null && qty >= a.maxQuantity;
                return (
                  <button
                    key={a.key}
                    onClick={() => grant.mutate(a.key)}
                    disabled={!canEdit || busy || capped || unlimited}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted disabled:opacity-40"
                    title={
                      unlimited
                        ? 'Chegara cheksiz — paketning ta\'siri yo\'q'
                        : capped
                          ? `Bu paket eng ko'pi ${a.maxQuantity} marta olinadi`
                          : qty > 0
                            ? `Hozir ${qty} ta — yana bittasi qo'shiladi`
                            : ''
                    }
                  >
                    {a.name} · {Number(a.price).toLocaleString('uz-UZ')} {a.currency}
                    {qty > 0 && <span className="ml-1 opacity-60">({qty})</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
