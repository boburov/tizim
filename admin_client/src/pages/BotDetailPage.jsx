import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  ScrollText,
  Square,
  Trash2,
  Webhook,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EnvEditor } from './CreateBotPage';
import {
  BOT_BUSY_STATUSES,
  BOT_STATUS_LABEL,
  BOT_STATUS_STYLE,
  MODE_LABEL,
  RUNTIME_LABEL,
} from '../lib/botStatus';

export default function BotDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [env, setEnv] = useState(null); // null = hali yuklanmadi
  const [showLogs, setShowLogs] = useState(false);

  const { data: bot, isLoading } = useQuery({
    queryKey: ['bot', id],
    queryFn: () => api.get(`/bots/${id}`).then((r) => r.data),
    refetchInterval: (q) =>
      BOT_BUSY_STATUSES.has(q.state.data?.status) ? 3000 : false,
  });

  // env formasini faqat BIR MARTA to'ldiramiz — aks holda 3 soniyalik
  // yangilanish foydalanuvchi yozayotgan qiymatni ustidan yozib ketardi.
  useEffect(() => {
    if (bot && env === null) setEnv(bot.env ?? []);
  }, [bot, env]);

  const busy = BOT_BUSY_STATUSES.has(bot?.status);
  const refresh = () => qc.invalidateQueries({ queryKey: ['bot', id] });

  const fail = (e) => {
    const msg = e.response?.data?.message;
    toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Xato');
  };

  const act = useMutation({
    mutationFn: ({ path }) => api.post(`/bots/${id}/${path}`),
    onSuccess: (_r, v) => {
      refresh();
      toast.success(
        { deploy: 'Deploy boshlandi', stop: "To'xtatilmoqda", start: 'Ishga tushirilmoqda' }[
          v.path
        ],
      );
    },
    onError: fail,
  });

  const saveEnv = useMutation({
    mutationFn: () =>
      api.put(`/bots/${id}/env`, {
        items: (env ?? [])
          .filter((e) => e.key.trim())
          .map((e) => ({
            key: e.key.trim().toUpperCase(),
            value: e.value,
            isSecret: e.isSecret,
          })),
      }),
    onSuccess: () => {
      refresh();
      toast.success("Saqlandi — kuchga kirishi uchun qayta deploy qiling");
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/bots/${id}`),
    onSuccess: () => {
      refresh();
      toast.success("O'chirilmoqda…");
    },
    onError: fail,
  });

  const purge = useMutation({
    mutationFn: () => api.delete(`/bots/${id}/purge`),
    onSuccess: () => {
      toast.success('Yozuv tozalandi');
      navigate('/bots');
    },
    onError: fail,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
      </div>
    );
  }
  if (!bot) return <div>Bot topilmadi</div>;

  return (
    <div className="max-w-3xl">
      <Link
        to="/bots"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand"
      >
        <ArrowLeft size={15} /> Telegram botlar
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{bot.name}</h1>
          <div className="font-mono text-sm text-muted-foreground">
            {bot.botUsername ? `@${bot.botUsername}` : bot.slug} ·{' '}
            {RUNTIME_LABEL[bot.runtime]} · {MODE_LABEL[bot.mode]}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            BOT_STATUS_STYLE[bot.status]
          }`}
        >
          {busy && <Loader2 className="mr-1 inline animate-spin" size={13} />}
          {BOT_STATUS_LABEL[bot.status] || bot.status}
        </span>
      </div>

      {bot.failureReason && (
        <div className="mb-5 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          {bot.failureReason}
        </div>
      )}

      {/* --- Amallar --- */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => act.mutate({ path: 'deploy' })}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
        >
          <RefreshCw size={16} /> Qayta deploy
        </button>

        {bot.status === 'STOPPED' ? (
          <button
            onClick={() => act.mutate({ path: 'start' })}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
          >
            <Play size={16} /> Ishga tushirish
          </button>
        ) : (
          <button
            onClick={() => act.mutate({ path: 'stop' })}
            disabled={busy || bot.status !== 'ACTIVE'}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
          >
            <Square size={16} /> To'xtatish
          </button>
        )}

        <button
          onClick={() => setShowLogs((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
        >
          <ScrollText size={16} /> {showLogs ? 'Logni yopish' : 'Jonli log'}
        </button>

        {isSuperAdmin && bot.status !== 'DELETED' && (
          <button
            onClick={() => {
              if (confirm(`"${bot.name}" serverdan o'chirilsinmi?`))
                remove.mutate();
            }}
            disabled={busy}
            className="ml-auto flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            <Trash2 size={16} /> O'chirish
          </button>
        )}
        {isSuperAdmin && bot.status === 'DELETED' && (
          <button
            onClick={() => purge.mutate()}
            className="ml-auto rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Yozuvni tozalash
          </button>
        )}
      </div>

      {showLogs && <LiveLog botId={id} />}

      {bot.mode === 'WEBHOOK' && <WebhookCard botId={id} bot={bot} />}

      {/* --- Manba --- */}
      <Card title="Kod manbasi">
        {bot.source === 'REPO' ? (
          <dl className="space-y-1 text-sm">
            <Row label="Repo" value={bot.repoUrl} mono />
            <Row label="Branch" value={bot.repoBranch} mono />
            <p className="pt-1 text-xs text-muted-foreground">
              "Qayta deploy" bosilganda serverdagi nusxa{' '}
              <code className="font-mono">git reset --hard</code> bilan
              repodagi holatga keltiriladi.
            </p>
          </dl>
        ) : (
          <dl className="space-y-1 text-sm">
            <Row label="Shablon" value={bot.template?.name || '—'} />
            <Row label="Papka" value={bot.template?.templateDir || '—'} mono />
          </dl>
        )}
      </Card>

      {/* --- Env --- */}
      <Card title="Sozlamalar (.env)">
        {env !== null && <EnvEditor items={env} onChange={setEnv} />}
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <button
            onClick={() => saveEnv.mutate()}
            disabled={saveEnv.isPending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
          >
            {saveEnv.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
          <span className="text-xs text-muted-foreground">
            Maxfiy qiymatlar qayta ko'rsatilmaydi — bo'sh qoldirilsa eskisi
            saqlanadi.
          </span>
        </div>
      </Card>

      {/* --- Oxirgi deploy logi --- */}
      {bot.deployLog && (
        <Card title="Oxirgi deploy logi">
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
            {bot.deployLog}
          </pre>
        </Card>
      )}
    </div>
  );
}

/** Telegram tarafidagi haqiqiy holat — panel bilan mos kelmasligi mumkin. */
function WebhookCard({ botId, bot }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['bot-telegram', botId],
    queryFn: () => api.get(`/bots/${botId}/telegram`).then((r) => r.data),
    retry: false,
  });

  return (
    <Card title="Webhook holati">
      <div className="mb-2 flex items-center gap-2">
        <Webhook size={16} className="text-muted-foreground" />
        <code className="flex-1 break-all font-mono text-xs">
          {bot.webhookUrl || '—'}
        </code>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded p-1 text-muted-foreground transition hover:bg-muted disabled:opacity-50"
          title="Telegram'dan qayta so'rash"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Tekshirilmoqda…</div>
      ) : !data ? (
        <div className="text-xs text-muted-foreground">
          Telegram'dan holat olinmadi.
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          <div
            className={`flex items-center gap-1.5 ${
              data.inSync
                ? 'text-emerald-600 dark:text-emerald-300'
                : 'text-amber-600 dark:text-amber-300'
            }`}
          >
            {data.inSync ? (
              <CheckCircle2 size={13} />
            ) : (
              <AlertTriangle size={13} />
            )}
            {data.inSync
              ? "Telegram'dagi manzil mos — bot xabar olyapti"
              : `Telegram'da boshqa manzil turibdi: ${data.url || "(bo'sh)"}`}
          </div>
          {data.pendingUpdateCount > 0 && (
            <div className="text-muted-foreground">
              Kutayotgan xabarlar: {data.pendingUpdateCount}
            </div>
          )}
          {data.lastErrorMessage && (
            <div className="text-red-600 dark:text-red-300">
              Telegram xatosi: {data.lastErrorMessage}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Ishlab turgan botning logi (deploy logi emas). */
function LiveLog({ botId }) {
  const { data, isFetching } = useQuery({
    queryKey: ['bot-logs', botId],
    queryFn: () =>
      api.get(`/bots/${botId}/logs`, { params: { lines: 200 } }).then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Jonli log
          {isFetching && <Loader2 className="animate-spin" size={13} />}
        </span>
      }
    >
      <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
        {data?.log || 'Yuklanmoqda…'}
      </pre>
    </Card>
  );
}

function Card({ title, children }) {
  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
