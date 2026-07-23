import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Rocket } from 'lucide-react';
import { api } from '../api/client';

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
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Yangi loyiha</h1>
        <p className="text-sm text-slate-500">
          Tizimni tanlang, brend ma'lumotlarini kiriting — server va client avtomatik
          yaratiladi (alohida baza bilan).
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"
      >
        {/* Tizim tanlash (dinamik) */}
        <div>
          <label className={label}>Tizim turi *</label>
          {templatesLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Tizimlar yuklanmoqda…
            </div>
          ) : (
            <select
              value={form.systemTemplateId}
              onChange={set('systemTemplateId')}
              className={field}
              required
            >
              <option value="">— Tanlang —</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Hozircha o'quv markaz tizimi. Keyinchalik boshqa tizimlar qo'shiladi.
          </p>
        </div>

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
            disabled={mutation.isPending}
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
    </div>
  );
}
