import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, Terminal, Trash2, Webhook } from 'lucide-react';
import { api } from '../api/client';

/**
 * Yangi bot yaratish.
 *
 * Rejim (polling/webhook) SO'RALMAYDI — u tildan kelib chiqadi va shu yerda
 * faqat tushuntiriladi. Node polling'da domensiz ishlaydi, PHP esa uzluksiz
 * jarayon bo'la olmagani uchun webhook talab qiladi; foydalanuvchiga
 * noto'g'ri juftlikni tanlash imkonini bermaslik kerak.
 */
export default function CreateBotPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    runtime: 'NODEJS',
    source: 'TEMPLATE',
    token: '',
    repoUrl: '',
    repoBranch: 'main',
    templateId: '',
  });
  const [env, setEnv] = useState([]);

  const { data: templates } = useQuery({
    queryKey: ['bot-templates'],
    queryFn: () => api.get('/bots/templates').then((r) => r.data),
  });

  const forRuntime = (templates ?? []).filter((t) => t.runtime === form.runtime);
  const isWebhook = form.runtime === 'PHP';

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        runtime: form.runtime,
        source: form.source,
        token: form.token.trim(),
        env: env
          .filter((e) => e.key.trim())
          .map((e) => ({
            key: e.key.trim().toUpperCase(),
            value: e.value,
            isSecret: e.isSecret,
          })),
      };
      if (form.source === 'REPO') {
        payload.repoUrl = form.repoUrl.trim();
        payload.repoBranch = form.repoBranch.trim() || 'main';
      } else {
        payload.templateId = form.templateId;
      }
      return api.post('/bots', payload);
    },
    onSuccess: (r) => {
      toast.success('Bot yaratildi — deploy boshlandi');
      navigate(`/bots/${r.data.id}`);
    },
    onError: (e) => {
      const msg = e.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Xato');
    },
  });

  const valid =
    form.name.trim().length >= 2 &&
    form.token.trim().length > 20 &&
    (form.source === 'REPO' ? form.repoUrl.trim() : form.templateId);

  return (
    <div className="max-w-2xl">
      <Link
        to="/bots"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand"
      >
        <ArrowLeft size={15} /> Telegram botlar
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">Yangi bot</h1>

      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        <Field label="Nom">
          <input
            value={form.name}
            onChange={set('name')}
            placeholder="Masalan: Qabul boti"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Til">
          <div className="grid grid-cols-2 gap-3">
            {['NODEJS', 'PHP'].map((rt) => (
              <button
                key={rt}
                type="button"
                onClick={() =>
                  setForm({ ...form, runtime: rt, templateId: '' })
                }
                className={`rounded-lg border p-3 text-left transition ${
                  form.runtime === rt
                    ? 'border-brand bg-brand/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div className="font-medium">
                  {rt === 'NODEJS' ? 'Node.js' : 'PHP'}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {rt === 'NODEJS' ? (
                    <>
                      <Terminal size={12} /> polling — domen kerak emas
                    </>
                  ) : (
                    <>
                      <Webhook size={12} /> webhook — subdomen olinadi
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Field>

        {isWebhook && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            PHP bot uzluksiz jarayon bo'la olmaydi, shuning uchun u webhook
            rejimida ishlaydi: unga <b>subdomen</b> ajratiladi, nginx vhost va
            HTTPS sertifikat avtomatik qo'yiladi. Buning uchun serverda{' '}
            <code className="font-mono">BOTS_BASE_DOMAIN</code> sozlangan
            bo'lishi kerak.
          </p>
        )}

        <Field label="Bot tokeni (@BotFather)">
          <input
            value={form.token}
            onChange={set('token')}
            placeholder="123456789:AAE..."
            autoComplete="off"
            spellCheck="false"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Token saqlashdan oldin Telegram orqali tekshiriladi — yaroqsiz
            bo'lsa bot yaratilmaydi.
          </p>
        </Field>

        <Field label="Kod manbasi">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['TEMPLATE', 'Tayyor shablon', 'serverdagi namuna kod'],
              ['REPO', 'GitHub repo', 'clone qilinadi, keyin git pull'],
            ].map(([val, title, hint]) => (
              <button
                key={val}
                type="button"
                onClick={() => setForm({ ...form, source: val })}
                className={`rounded-lg border p-3 text-left transition ${
                  form.source === val
                    ? 'border-brand bg-brand/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div className="font-medium">{title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {hint}
                </div>
              </button>
            ))}
          </div>
        </Field>

        {form.source === 'TEMPLATE' ? (
          <Field label="Shablon">
            <select
              value={form.templateId}
              onChange={set('templateId')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— tanlang —</option>
              {forRuntime.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {!forRuntime.length && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
                Bu til uchun shablon yo'q. `npm run seed:bots` ni ishga
                tushiring yoki GitHub repo tanlang.
              </p>
            )}
          </Field>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Repo URL">
                <input
                  value={form.repoUrl}
                  onChange={set('repoUrl')}
                  placeholder="https://github.com/foydalanuvchi/bot"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
            <Field label="Branch">
              <input
                value={form.repoBranch}
                onChange={set('repoBranch')}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
        )}

        <EnvEditor items={env} onChange={setEnv} />

        <div className="flex gap-2 border-t border-border pt-4">
          <button
            onClick={() => create.mutate()}
            disabled={!valid || create.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="animate-spin" size={16} />}
            {create.isPending ? 'Yaratilmoqda…' : 'Yaratish va deploy qilish'}
          </button>
          <Link
            to="/bots"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Bekor
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Qo'shimcha .env qiymatlari — BOT_TOKEN bu yerda emas, u alohida maydonda. */
export function EnvEditor({ items, onChange }) {
  const update = (i, patch) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium">
          Qo'shimcha .env qiymatlari
        </label>
        <button
          type="button"
          onClick={() =>
            onChange([...items, { key: '', value: '', isSecret: false }])
          }
          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition hover:bg-muted"
        >
          <Plus size={13} /> Qo'shish
        </button>
      </div>

      {!items.length ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Kerak bo'lsa qo'shing — masalan ADMIN_CHAT_ID yoki API_URL.
          BOT_TOKEN avtomatik yoziladi.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={it.key}
                onChange={(e) =>
                  update(i, { key: e.target.value.toUpperCase() })
                }
                placeholder="ADMIN_CHAT_ID"
                className="w-1/3 rounded-lg border border-input bg-background px-2 py-1.5 font-mono text-xs"
              />
              <input
                value={it.value}
                onChange={(e) => update(i, { value: e.target.value })}
                type={it.isSecret ? 'password' : 'text'}
                placeholder="qiymat"
                className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
              />
              <label
                className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                title="Shifrlab saqlanadi va panelda qayta ko'rsatilmaydi"
              >
                <input
                  type="checkbox"
                  checked={it.isSecret}
                  onChange={(e) => update(i, { isSecret: e.target.checked })}
                />
                maxfiy
              </label>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="rounded p-1 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
