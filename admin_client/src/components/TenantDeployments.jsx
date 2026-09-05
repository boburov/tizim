import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  XCircle,
} from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';

/**
 * ══════════════════════════════════════════════════════════════════════
 * DEPLOY JURNALI — HAR AMAL BITTA QATOR, LOG TIRIK
 * ══════════════════════════════════════════════════════════════════════
 *
 * Ilgari panel faqat OXIRGI logni ko'rsatardi va u ham jarayon
 * tugagandan keyin. Endi har provision/apply/migrate alohida yozuv;
 * ishlab turgani ochiq holda ko'rsatiladi va 2 soniyada bir yangilanadi.
 *
 * ⚠ POLLING FAQAT KERAK BO'LGANDA: ro'yxatda `RUNNING` yozuv bo'lsa 2s,
 * bo'lmasa umuman so'ralmaydi. Doimiy 2s so'rov 50 ta ochiq tabda
 * admin serverni behuda yuklardi.
 */

const KIND_LABEL = {
  PROVISION: "O'rnatish",
  RESTART: 'Qayta ishga tushirish',
  REBUILD: 'Qayta qurish',
  DEPLOY: 'Kod deploy',
  PUSH: 'GitHub push',
  SUSPEND: "To'xtatish",
  RESUME: 'Qayta yoqish',
  DEPROVISION: "O'chirish",
  MIGRATE: "Boshqa serverga ko'chirish",
  STOP_SOURCE: "Manbani to'xtatish",
  DECOMMISSION_SOURCE: 'Manbani tozalash',
  BOOTSTRAP_VPS: 'VPS tayyorlash',
};

const STEP_LABEL = {
  preflight: 'Tekshiruv',
  dump: 'Baza nusxasi',
  'uploads-pull': 'Fayllarni olish',
  provision: "Nishonda o'rnatish",
  restore: 'Bazani tiklash',
  'uploads-push': 'Fayllarni joylash',
  verify: 'Tekshirish',
  switch: 'Routing almashtirish',
  'stop-source': "Manbani to'xtatish",
  done: 'Tugadi',
};

const dur = (a, b) => {
  if (!a) return '';
  const ms = (b ? new Date(b) : new Date()) - new Date(a);
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

function StatusIcon({ status }) {
  if (status === 'RUNNING') return <Loader2 size={15} className="animate-spin text-brand" />;
  if (status === 'SUCCESS') return <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-300" />;
  return <XCircle size={15} className="text-red-600 dark:text-red-300" />;
}

/** Bitta yozuv — ochilganda to'liq log so'raladi. */
function DeploymentRow({ row, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const live = row.status === 'RUNNING';

  const { data: full } = useQuery({
    queryKey: ['deployment', row.id],
    queryFn: () => api.get(`/deployments/${row.id}`).then((r) => r.data),
    enabled: open,
    refetchInterval: open && live ? 2000 : false,
  });

  const step = full?.meta?.step || row.meta?.step;

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-2.5 text-left text-sm hover:bg-muted/40"
      >
        {open ? <ChevronDown size={15} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={15} className="shrink-0 text-muted-foreground" />}
        <StatusIcon status={row.status} />
        <span className="font-medium">{KIND_LABEL[row.kind] || row.kind}</span>
        {step && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {STEP_LABEL[step] || step}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {row.vps && <span className="font-mono">{row.vps.name}</span>}
          <span>{dur(row.startedAt, row.finishedAt)}</span>
          <span>{new Date(row.startedAt).toLocaleString('uz-UZ')}</span>
        </span>
      </button>

      {open && (
        <div className="pb-3">
          {row.error && (
            <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {row.error}
            </div>
          )}
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[11px] leading-relaxed">
            {full?.log || (live ? 'Kutilmoqda…' : 'Log bo\'sh')}
          </pre>
          {row.startedBy && (
            <div className="mt-1 text-xs text-muted-foreground">Boshlagan: {row.startedBy}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TenantDeployments({ tenantId }) {
  // Ro'yxat: ishlayotgan yozuv bo'lsa tez, bo'lmasa sekin.
  const { data: list, isLoading } = useQuery({
    queryKey: ['deployments', tenantId],
    queryFn: () => api.get(`/tenants/${tenantId}/deployments`).then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'RUNNING') ? 2000 : false),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Yuklanmoqda…
      </div>
    );
  }

  const running = list?.find((d) => d.status === 'RUNNING');

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 font-medium text-foreground">Deploy tarixi</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Har o'rnatish, qo'llash va ko'chirish alohida yozuv sifatida saqlanadi.
      </p>

      {!list?.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Hali deploy bo'lmagan.</p>
      ) : (
        <div className={cn('divide-y divide-border', running && 'rounded-lg ring-1 ring-brand/20')}>
          {list.map((row) => (
            <DeploymentRow key={row.id} row={row} defaultOpen={row.id === running?.id} />
          ))}
        </div>
      )}
    </div>
  );
}
