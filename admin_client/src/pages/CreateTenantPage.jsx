import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Check, GraduationCap, Layers, Loader2, Rocket } from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import BrandPreview from '../components/BrandPreview';

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
    logoUrl: '',
    botToken: '',
  });

  // Dinamik tizimlar ro'yxati (select uchun)
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates', 'active'],
    queryFn: () => api.get('/templates/active').then((r) => r.data),
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
      toast.error(err.response?.data?.message || 'Yaratishda xatolik');
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.systemTemplateId) return toast.error('Tizimni tanlang');
    const payload = {
      systemTemplateId: form.systemTemplateId,
      name: form.name.trim(),
      domain: form.domain.trim().toLowerCase(),
      brandColor: form.brandColor,
      logoUrl: form.logoUrl.trim() || undefined,
      botToken: form.botToken.trim() || undefined,
    };
    mutation.mutate(payload);
  };

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';
  const label = 'mb-1 block text-sm font-medium text-slate-700';

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Yangi loyiha</h1>
        <p className="text-sm text-slate-500">
          Tizimni tanlang, brend ma'lumotlarini kiriting — server va client avtomatik
          yaratiladi (alohida baza bilan).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"
      >
        {/* Tizim tanlash (dinamik) — kartochka ko'rinishidagi radio guruh */}
        <fieldset>
          <legend className={label}>Tizim turi *</legend>

          {templatesLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-[86px] animate-pulse rounded-xl border border-slate-200 bg-slate-50"
                />
              ))}
            </div>
          ) : !templates?.length ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
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
                        active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 pr-5">
                      <span className="block text-sm font-medium text-slate-800">
                        {t.name}
                      </span>
                      {t.description && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
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

          <p className="mt-2 text-xs text-slate-400">
            Hozircha o'quv markaz tizimi. Keyinchalik boshqa tizimlar qo'shiladi.
          </p>
        </fieldset>

        <div>
          <label className={label}>Loyiha nomi *</label>
          <input
            className={field}
            value={form.name}
            onChange={set('name')}
            placeholder="Bilim O'quv Markazi"
            required
          />
        </div>

        <div>
          <label className={label}>Domen *</label>
          <input
            className={field}
            value={form.domain}
            onChange={set('domain')}
            placeholder="bilim.example.uz"
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            Yaratilgandan so'ng DNS uchun IP beriladi.
          </p>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-end gap-4">
          <div>
            <label className={label}>Brend rang *</label>
            <input
              type="color"
              value={form.brandColor}
              onChange={set('brandColor')}
              className="h-10 w-16 cursor-pointer rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className={label}>Logo URL</label>
            <input
              className={field}
              value={form.logoUrl}
              onChange={set('logoUrl')}
              placeholder="https://.../logo.png"
            />
          </div>
        </div>

        <div>
          <label className={label}>Telegram bot token</label>
          <input
            className={field}
            value={form.botToken}
            onChange={set('botToken')}
            placeholder="123456:ABC-DEF..."
          />
          <p className="mt-1 text-xs text-slate-400">
            Ixtiyoriy. Bo'lmasa bot o'chirilgan holda ishga tushadi.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || !form.systemTemplateId}
            className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
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
        <BrandPreview
          name={form.name}
          domain={form.domain}
          logoUrl={form.logoUrl.trim()}
          brandColor={form.brandColor}
          className="lg:sticky lg:top-6"
        />
      </div>
    </div>
  );
}
