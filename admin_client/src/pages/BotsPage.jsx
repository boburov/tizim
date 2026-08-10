import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, Loader2, Plus, Terminal, Webhook } from 'lucide-react';
import { api } from '../api/client';
import {
  BOT_BUSY_STATUSES,
  BOT_STATUS_LABEL,
  BOT_STATUS_STYLE,
  MODE_LABEL,
  RUNTIME_LABEL,
} from '../lib/botStatus';

const timeAgo = (date) => {
  if (!date) return 'hech qachon';
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1) return 'hozir';
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
};

export default function BotsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['bots'],
    queryFn: () => api.get('/bots').then((r) => r.data),
    // Deploy davom etayotgan bo'lsa tez-tez yangilaymiz, aks holda kamdan-kam.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((b) => BOT_BUSY_STATUSES.has(b.status))
        ? 3000
        : 30000,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Telegram botlar</h1>
          <p className="text-sm text-muted-foreground">
            Node.js va PHP botlarni serverga chiqarish va boshqarish
          </p>
        </div>
        <Link
          to="/bots/new"
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark"
        >
          <Plus size={18} /> Yangi bot
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali bot yo'q.
          <div className="mt-1 text-xs">
            "Yangi bot" tugmasi orqali GitHub repodan yoki tayyor shablondan
            chiqaring.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((b) => (
            <Link
              key={b.id}
              to={`/bots/${b.id}`}
              className="rounded-xl border border-border bg-card p-5 transition hover:border-brand"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    <Bot size={17} className="shrink-0 text-brand" />
                    <span className="truncate">{b.name}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {b.botUsername ? `@${b.botUsername}` : b.slug}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    BOT_STATUS_STYLE[b.status]
                  }`}
                >
                  {BOT_STATUS_LABEL[b.status] || b.status}
                </span>
              </div>

              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg border border-border px-2 py-1">
                  {RUNTIME_LABEL[b.runtime] || b.runtime}
                </span>
                <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
                  {b.mode === 'WEBHOOK' ? (
                    <Webhook size={12} />
                  ) : (
                    <Terminal size={12} />
                  )}
                  {MODE_LABEL[b.mode]}
                </span>
                <span className="rounded-lg border border-border px-2 py-1 text-muted-foreground">
                  {b.source === 'REPO' ? 'GitHub repo' : 'shablon'}
                </span>
              </div>

              <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                Oxirgi deploy: {timeAgo(b.lastDeployedAt)}
                {b.tenant && <> · {b.tenant.name}</>}
              </div>

              {b.failureReason && (
                <div className="mt-2 truncate text-xs text-red-600 dark:text-red-300">
                  {b.failureReason}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
