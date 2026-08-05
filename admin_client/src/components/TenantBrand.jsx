/**
 * Brend tahriri — nom, ranglar, logo. Chapda forma, o'ngda jonli preview.
 *
 * Saqlash o'zgarishni tenantga DARROV yetkazmaydi: brend client `.env`
 * ga tushadi, ya'ni faqat qayta build'dan keyin ko'rinadi. Shuning uchun
 * saqlangach yuqorida "Qo'llash" paneli paydo bo'ladi.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { api } from '../api/client';
import BrandFields from './BrandFields';
import BrandPreview from './BrandPreview';
import PendingChanges from './PendingChanges';

const fromTenant = (t) => ({
  name: t.name || '',
  brandColor: t.brandColor || '#4f46e5',
  brandBackground: t.brandBackground || '',
  brandColorDark: t.brandColorDark || '',
  brandBackgroundDark: t.brandBackgroundDark || '',
  logoUrl: t.logoUrl || '',
});

export default function TenantBrand({ tenant, canEdit }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => fromTenant(tenant));

  // Boshqa joyda (masalan qayta provisioning) o'zgarsa formani yangilaymiz —
  // lekin faqat tahrirlanmagan holatda, aks holda kiritilayotgan qiymat
  // ko'z oldida yo'qolib ketardi.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setForm(fromTenant(tenant));
  }, [tenant, dirty]);

  const { data: settings } = useQuery({
    queryKey: ['tenant-settings', tenant.id],
    queryFn: () => api.get(`/tenants/${tenant.id}/settings`).then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.applyStatus === 'APPLYING' ? 3000 : false),
  });

  const save = useMutation({
    mutationFn: (payload) =>
      api.patch(`/tenants/${tenant.id}/brand`, payload).then((r) => r.data),
    onSuccess: (res) => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
      qc.invalidateQueries({ queryKey: ['tenant-settings', tenant.id] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(
        res.pending?.count
          ? "Saqlandi — saytga chiqishi uchun \"Qo'llash\"ni bosing"
          : 'Saqlandi',
      );
    },
    onError: (e) => {
      const msg = e.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Saqlashda xatolik');
    },
  });

  const update = (next) => {
    setForm(next);
    setDirty(true);
  };

  const submit = () => {
    if (!form.name?.trim()) return toast.error('Loyiha nomi kerak');
    save.mutate({
      name: form.name.trim(),
      brandColor: form.brandColor,
      // Bo'sh satr ATAYLAB yuboriladi — u "rangni olib tashla,
      // avtomatik hosil qilinsin" degani.
      brandBackground: form.brandBackground.trim(),
      brandColorDark: form.brandColorDark.trim(),
      brandBackgroundDark: form.brandBackgroundDark.trim(),
      logoUrl: form.logoUrl.trim(),
    });
  };

  const locked = !canEdit || tenant.status === 'DELETED';

  return (
    <div className="space-y-4">
      {settings && (
        <PendingChanges
          tenantId={tenant.id}
          pending={settings.pending}
          applyStatus={settings.applyStatus}
          applyError={settings.applyError}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="rounded-xl border border-border bg-card p-6">
          <fieldset disabled={locked} className={locked ? 'opacity-60' : undefined}>
            <BrandFields value={form} onChange={update} />
          </fieldset>

          {!locked && (
            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-5">
              <button
                onClick={() => {
                  setForm(fromTenant(tenant));
                  setDirty(false);
                }}
                disabled={!dirty}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={submit}
                disabled={save.isPending || !dirty}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-60"
              >
                {save.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                Saqlash
              </button>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-6">
          <div className="mb-2 text-sm font-medium text-foreground">Ko'rinishi</div>
          <BrandPreview
            name={form.name}
            domain={tenant.domain}
            logoUrl={form.logoUrl?.trim()}
            brandColor={form.brandColor}
            brandBackground={form.brandBackground}
            brandColorDark={form.brandColorDark}
            brandBackgroundDark={form.brandBackgroundDark}
          />
        </div>
      </div>
    </div>
  );
}
