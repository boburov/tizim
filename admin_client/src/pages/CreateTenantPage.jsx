import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  GraduationCap,
  Layers,
  Loader2,
  Lock,
  Rocket,
} from 'lucide-react';
// lucide v1 brend ikonkalarini olib tashladi — GitHub belgisi lokal.
import Github from '../components/GithubIcon';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import BrandPreview from '../components/BrandPreview';
import BrandFields from '../components/BrandFields';

// Sahifa ochilganda shu tizim avtomatik tanlanadi (topilmasa — ro'yxatdagi birinchisi).
const DEFAULT_TEMPLATE_KEY = 'study-center';

// Template key → ikonka. Yangi tizim qo'shilsa shu yerga qo'shiladi.
const TEMPLATE_ICON = {
  'study-center': GraduationCap,
};

export default function CreateTenantPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    systemTemplateId: '',
    name: '',
    domain: '',
    brandColor: '#4f46e5',
    brandBackground: '',
    brandColorDark: '',
    brandBackgroundDark: '',
    logoUrl: '',
    botToken: '',
    createRepo: true,
  });

  // Dinamik tizimlar ro'yxati (select uchun)
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates', 'active'],
    queryFn: () => api.get('/templates/active').then((r) => r.data),
  });

  // GitHub integratsiyasi sozlanganmi — sozlanmagan bo'lsa katakcha
  // ko'rsatilmaydi, aks holda foydalanuvchi ishlamaydigan narsani yoqardi.
  const { data: gh } = useQuery({
    queryKey: ['github-status'],
    queryFn: () => api.get('/github/status').then((r) => r.data),
    retry: false,
  });

  // Ro'yxat kelgach o'quv markaz tizimini avtomatik tanlab qo'yamiz.
  useEffect(() => {
    if (!templates?.length) return;
    setForm((f) => {
      if (f.systemTemplateId) return f;
      const preferred =
        templates.find((t) => t.key === DEFAULT_TEMPLATE_KEY) || templates[0];
      return { ...f, systemTemplateId: preferred.id };
    });
  }, [templates]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: (payload) => api.post('/tenants', payload).then((r) => r.data),
    onSuccess: (tenant) => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Loyiha yaratildi! Provisioning boshlandi.');
      navigate(`/tenants/${tenant.id}`);
    },
    onError: (err) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Yaratishda xatolik');
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.systemTemplateId) return toast.error('Tizimni tanlang');

    // Bo'sh ixtiyoriy maydonlar umuman yuborilmaydi — serverda ular
    // "berilmagan" (avtomatik hosil qilinsin) degani.
    const optional = (v) => (v?.trim() ? v.trim() : undefined);

    mutation.mutate({
      systemTemplateId: form.systemTemplateId,
      name: form.name.trim(),
      domain: form.domain.trim().toLowerCase(),
      brandColor: form.brandColor,
      brandBackground: optional(form.brandBackground),
      brandColorDark: optional(form.brandColorDark),
      brandBackgroundDark: optional(form.brandBackgroundDark),
      logoUrl: optional(form.logoUrl),
      botToken: optional(form.botToken),
      createRepo: form.createRepo,
    });
  };

  const field =
    'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';
  const label = 'mb-1 block text-sm font-medium text-foreground';

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Yangi loyiha</h1>
        <p className="text-sm text-muted-foreground">
          Tizimni tanlang, brend ma'lumotlarini kiriting — server va client avtomatik
          yaratiladi (alohida baza bilan).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <form
          onSubmit={submit}
          className="space-y-6 rounded-xl border border-border bg-card p-6"
        >
          {/* Tizim tanlash (dinamik) — kartochka ko'rinishidagi radio guruh */}
          <fieldset>
            <legend className={label}>Tizim turi *</legend>

            {templatesLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="h-[86px] animate-pulse rounded-xl border border-border bg-muted"
                  />
                ))}
              </div>
            ) : !templates?.length ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  Faol tizim shabloni topilmadi. Avval "Sozlamalar"da tizim qo'shing.
                </span>
              </div>
            ) : (
              // Bitta tizim bo'lsa — to'liq kenglik, ko'p bo'lsa 2 ustun
              <div className={cn('grid gap-3', templates.length > 1 && 'sm:grid-cols-2')}>
                {templates.map((t) => {
                  const Icon = TEMPLATE_ICON[t.key] || Layers;
                  const active = form.systemTemplateId === t.id;
                  return (
                    <label
                      key={t.id}
                      className={cn(
                        'relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition',
                        'focus-within:ring-2 focus-within:ring-brand/30',
                        active
                          ? 'border-brand bg-brand/5 shadow-sm'
                          : 'border-border hover:bg-muted',
                      )}
                    >
                      <input
                        type="radio"
                        name="systemTemplateId"
                        value={t.id}
                        checked={active}
                        onChange={set('systemTemplateId')}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition',
                          active
                            ? 'bg-brand text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 pr-5">
                        <span className="block text-sm font-medium text-foreground">
                          {t.name}
                        </span>
                        {t.description && (
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {t.description}
                          </span>
                        )}
                      </span>
                      {active && (
                        <Check
                          size={16}
                          strokeWidth={3}
                          className="absolute right-3 top-3 text-brand"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div>
            <label className={label}>Domen *</label>
            <input
              className={field}
              value={form.domain}
              onChange={set('domain')}
              placeholder="bilim.example.uz"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Yaratilgandan so'ng DNS uchun IP beriladi.
            </p>
          </div>

          {/* Brend — nom, ranglar, logo */}
          <div className="border-t border-border pt-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Brend</h2>
            <BrandFields value={form} onChange={setForm} />
          </div>

          {/* Integratsiyalar */}
          <div className="space-y-4 border-t border-border pt-5">
            <h2 className="text-sm font-semibold text-foreground">Integratsiyalar</h2>

            <div>
              <label className={label}>Telegram bot token</label>
              <input
                className={field}
                value={form.botToken}
                onChange={set('botToken')}
                placeholder="123456:ABC-DEF..."
              />
              <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Lock size={12} className="mt-0.5 shrink-0" />
                Ixtiyoriy. Bazada shifrlangan holda saqlanadi. Keyinchalik
                loyiha sozlamalaridan o'zgartirsa bo'ladi.
              </p>
            </div>

            {gh?.configured && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition hover:bg-muted">
                <input
                  type="checkbox"
                  checked={form.createRepo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, createRepo: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Github size={14} /> Alohida GitHub repo yaratilsin
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    Kod <span className="font-mono">{gh.owner}</span> hisobida yopiq
                    repositoriyga yuboriladi. `.env` fayllari repoga tushmaydi.
                    Keyinchalik push qilinsa sayt avtomatik yangilanadi.
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !form.systemTemplateId}
              className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-60"
            >
              {mutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Rocket size={16} />
              )}
              Yaratish va ishga tushirish
            </button>
          </div>
        </form>

        {/* Jonli preview — kiritilayotgan brend darrov ko'rinadi */}
        <div className="lg:sticky lg:top-6">
          <div className="mb-2 text-sm font-medium text-foreground">Ko'rinishi</div>
          <BrandPreview
            name={form.name}
            domain={form.domain}
            logoUrl={form.logoUrl.trim()}
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
