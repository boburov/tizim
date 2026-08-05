/**
 * Loyihaning GitHub repositoriysi: holat, havola va qayta yuborish.
 *
 * Har tenant kodi alohida repoda yashaydi — shu sababli bitta mijoz uchun
 * qilingan tuzatish boshqalarga tegmaydi, va har o'zgarish tarixi
 * mijoz bo'yicha ajratilgan holda saqlanadi.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Github,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
  UploadCloud,
} from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';

const STATUS = {
  DISABLED: {
    label: "O'chirilgan",
    cls: 'bg-muted text-muted-foreground',
  },
  PENDING: {
    label: 'Kutilmoqda',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  CREATING: {
    label: 'Repo ochilmoqda',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  },
  PUSHING: {
    label: 'Yuborilmoqda',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  },
  SYNCED: {
    label: 'Sinxron',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  FAILED: {
    label: 'Xato',
    cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  },
};

const BUSY = ['CREATING', 'PUSHING'];

export default function TenantRepo({ tenant, canEdit }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-repo', tenant.id],
    queryFn: () => api.get(`/tenants/${tenant.id}/repo`).then((r) => r.data),
    refetchInterval: (q) => (BUSY.includes(q.state.data?.gitStatus) ? 3000 : false),
  });

  const sync = useMutation({
    mutationFn: () => api.post(`/tenants/${tenant.id}/repo/sync`).then((r) => r.data),
    onSuccess: () => {
      toast.success("Kod GitHub'ga yuborilmoqda");
      qc.invalidateQueries({ queryKey: ['tenant-repo', tenant.id] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Xatolik'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Yuklanmoqda…
      </div>
    );
  }

  if (!data) return null;

  // Integratsiya umuman sozlanmagan — nima qilish kerakligini aytamiz
  if (!data.integrationReady) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <Github size={18} /> GitHub integratsiyasi
        </div>
        <p className="mb-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Integratsiya sozlanmagan. Yoqilsa, har yangi loyiha uchun alohida yopiq
          repositoriy ochiladi va kod avtomatik yuboriladi — mijozga tegishli
          tuzatishlarni alohida olib borish mumkin bo'ladi.
        </p>
        <div className="rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground">
          <div># admin_server/.env</div>
          <div>GITHUB_TOKEN=ghp_...</div>
          <div>GITHUB_OWNER=hisob-yoki-tashkilot</div>
          <div>GITHUB_OWNER_TYPE=user # yoki org</div>
        </div>
      </div>
    );
  }

  const status = STATUS[data.gitStatus] || STATUS.PENDING;
  const busy = BUSY.includes(data.gitStatus);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Github size={20} className="shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-foreground">
                {data.repoFullName || 'Repo hali yaratilmagan'}
              </div>
              <div className="text-sm text-muted-foreground">
                {data.lastPushedAt
                  ? `Oxirgi yuborish: ${new Date(data.lastPushedAt).toLocaleString('uz-UZ')}`
                  : "Hali hech narsa yuborilmagan"}
              </div>
            </div>
          </div>

          <span
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              status.cls,
            )}
          >
            {busy && <Loader2 size={11} className="animate-spin" />}
            {status.label}
          </span>
        </div>

        <div className="mb-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            {data.repoPrivate ? (
              <>
                <Lock size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                Yopiq repositoriy — faqat sizning hisobingiz ko'radi
              </>
            ) : (
              <>
                <Unlock size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                OCHIQ repositoriy — kodni hamma ko'ra oladi
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-mono text-xs">.env</span> fayllari repoga
            yuborilmaydi — push oldidan alohida tekshiriladi
          </div>

          {data.hasDeployToken && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              Avto-deploy yoqilgan — <span className="font-mono text-xs">main</span>{' '}
              ga push qilinsa sayt o'zi yangilanadi
            </div>
          )}
        </div>

        {data.repoError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{data.repoError}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {data.repoUrl && (
            <a
              href={data.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              <ExternalLink size={15} /> GitHub'da ochish
            </a>
          )}

          {canEdit && tenant.status !== 'DELETED' && (
            <button
              onClick={() => sync.mutate()}
              disabled={sync.isPending || busy}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-brand-dark disabled:opacity-60"
            >
              {sync.isPending || busy ? (
                <Loader2 size={15} className="animate-spin" />
              ) : data.repoFullName ? (
                <UploadCloud size={15} />
              ) : (
                <Github size={15} />
              )}
              {data.repoFullName ? 'Kodni qayta yuborish' : 'Repo yaratish va yuborish'}
            </button>
          )}
        </div>
      </div>

      {data.gitLog && (
        <details className="rounded-xl border border-border bg-slate-900 p-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">
            Git log
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
            {data.gitLog}
          </pre>
        </details>
      )}

      <div className="rounded-xl border border-border bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <RefreshCw size={12} /> Repo qanday ishlaydi
        </div>
        Kod VPS'dan repoga yuboriladi. Repoda <span className="font-mono">main</span>{' '}
        branchiga push qilsangiz, GitHub Action admin serverga xabar beradi va
        shu loyiha qayta deploy qilinadi — kod tortiladi, server qayta ishga
        tushadi, client qayta quriladi. Boshqa mijozlarga ta'sir qilmaydi.
      </div>
    </div>
  );
}
