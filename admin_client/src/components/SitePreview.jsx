// Yaratilgan tenant saytini admin panel ichida ko'rish.
// Sayt tirikligini admin server tekshiradi (/tenants/:id/preview) — brauzer
// cross-origin iframe holatini bilolmaydi, shuning uchun holat serverdan olinadi.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ExternalLink,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import BrandPreview from './BrandPreview';

const FRAME_H = 460;

export default function SitePreview({ tenant }) {
  const [device, setDevice] = useState('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);

  const { data, isLoading, isFetching, refetch } = useQuery({
    // reloadKey qasddan kalitga kirmaydi — qayta tekshirishda eski natija ko'rinib
    // turadi va iframe "pirillamaydi"
    queryKey: ['tenant-preview', tenant.id],
    queryFn: () => api.get(`/tenants/${tenant.id}/preview`).then((r) => r.data),
    enabled: tenant.status !== 'DELETED',
    // Provisioning ketayotganda sayt qachon ko'tarilishini kuzatib turamiz
    refetchInterval: tenant.status === 'PROVISIONING' ? 10000 : false,
  });

  const url = data?.url;
  const live = !!data?.reachable;

  const reload = () => {
    setFrameLoading(true);
    setReloadKey((k) => k + 1);
    refetch();
  };

  if (tenant.status === 'DELETED') return null;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-medium text-slate-800">
          <Monitor size={17} /> Sayt preview
          {isLoading ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              tekshirilmoqda…
            </span>
          ) : live ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Tirik{data.elapsedMs ? ` · ${data.elapsedMs} ms` : ''}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Javob bermadi
            </span>
          )}
        </h2>

        <div className="flex items-center gap-2">
          {live && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {[
                ['desktop', Monitor],
                ['mobile', Smartphone],
              ].map(([key, Icon]) => (
                <button
                  key={key}
                  onClick={() => setDevice(key)}
                  title={key === 'desktop' ? 'Kompyuter' : 'Telefon'}
                  className={cn(
                    'rounded-md p-1.5 transition',
                    device === key
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          )}

          <button
            onClick={reload}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} />
            Yangilash
          </button>

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              <ExternalLink size={14} /> Ochish
            </a>
          )}
        </div>
      </div>

      {live ? (
        <>
          <div
            className={cn(
              'relative mx-auto overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-all',
              device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full',
            )}
          >
            {frameLoading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" /> Sayt yuklanmoqda…
              </div>
            )}
            <iframe
              key={`${url}-${reloadKey}`}
              src={url}
              title={`${tenant.name} — preview`}
              onLoad={() => setFrameLoading(false)}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              className="w-full bg-white"
              style={{ height: FRAME_H }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {url} · Ba'zi saytlar iframe ichida ochilmasligi mumkin — u holda
            "Ochish" tugmasidan foydalaning.
          </p>
        </>
      ) : (
        <>
          {!isLoading && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <div>
                <div>{data?.message}</div>
                {data?.error && (
                  <div className="mt-0.5 font-mono text-xs text-amber-700/80">
                    {data.error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sayt hali yo'q — brend ko'rinishini mock bilan ko'rsatamiz */}
          <BrandPreview
            name={tenant.name}
            domain={tenant.domain}
            logoUrl={tenant.logoUrl}
            brandColor={tenant.brandColor}
            className="mx-auto max-w-xl"
          />
        </>
      )}
    </div>
  );
}
