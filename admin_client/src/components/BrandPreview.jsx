// Tenant client'i qanday ko'rinishini brend ma'lumotlaridan mock qilib ko'rsatadi.
// Haqiqiy sayt hali yo'q paytda (forma to'ldirilayotganda yoki provisioning ketayotganda)
// brend rang / nom / logo qanday chiqishini shu yerda ko'ramiz.
import { useState } from 'react';
import { LayoutGrid, LogIn } from 'lucide-react';
import { cn } from '../lib/utils';
import { normalizeHex, readableOn, withAlpha } from '../lib/color';

// Tenant client sidebar menyusiga yaqin ro'yxat (o'quv markaz tizimi)
const NAV = ['Bosh sahifa', "O'quvchilar", 'Guruhlar', 'Davomat', 'Moliya'];
const STATS = [
  { label: "O'quvchilar", value: '128' },
  { label: 'Guruhlar', value: '12' },
  { label: 'Bugun davomat', value: '94%' },
];

function Logo({ logoUrl, name, color, size = 'md' }) {
  const [broken, setBroken] = useState(false);
  const box = size === 'lg' ? 'h-12 w-12 text-lg' : 'h-7 w-7 text-xs';

  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setBroken(true)}
        className={cn(box, 'shrink-0 rounded-lg object-contain')}
      />
    );
  }
  return (
    <div
      className={cn(box, 'flex shrink-0 items-center justify-center rounded-lg font-bold')}
      style={{ background: color, color: readableOn(color) }}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}

export default function BrandPreview({ name, brandColor, logoUrl, domain, className }) {
  const [view, setView] = useState('panel');
  const color = normalizeHex(brandColor);
  const onColor = readableOn(color);
  const title = name?.trim() || 'Nomsiz loyiha';
  const host = domain?.trim() || 'domen.example.uz';

  const tab = (key, label, Icon) => (
    <button
      type="button"
      onClick={() => setView(key)}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition',
        view === key
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Ko'rinishi</span>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {tab('panel', 'Panel', LayoutGrid)}
          {tab('login', 'Kirish', LogIn)}
        </div>
      </div>

      {/* Brauzer oynasi taqlidi */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
          <span className="flex gap-1">
            <i className="h-2 w-2 rounded-full bg-red-400" />
            <i className="h-2 w-2 rounded-full bg-amber-400" />
            <i className="h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="ml-1 flex-1 truncate rounded-md bg-card px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
            {host}
          </span>
        </div>

        {view === 'panel' ? (
          <div className="flex h-[268px] text-[10px]">
            {/* Sidebar */}
            <div className="flex w-[104px] shrink-0 flex-col gap-1 border-r border-border bg-muted/80 p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <Logo logoUrl={logoUrl} name={title} color={color} />
                <span className="truncate font-semibold text-foreground">{title}</span>
              </div>
              {NAV.map((item, i) => (
                <div
                  key={item}
                  className="truncate rounded-md px-2 py-1.5"
                  style={
                    i === 0
                      ? { background: withAlpha(color, 0.12), color }
                      : { color: '#64748b' }
                  }
                >
                  {item}
                </div>
              ))}
            </div>

            {/* Kontent */}
            <div className="flex-1 overflow-hidden p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground">Bosh sahifa</div>
                  <div className="text-muted-foreground">Umumiy ko'rsatkichlar</div>
                </div>
                <div
                  className="rounded-md px-2.5 py-1 font-medium"
                  style={{ background: color, color: onColor }}
                >
                  + Qo'shish
                </div>
              </div>

              <div className="mb-3 grid grid-cols-3 gap-2">
                {STATS.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg border border-border bg-card p-2"
                  >
                    <div className="truncate text-muted-foreground">{s.label}</div>
                    <div className="text-sm font-semibold" style={{ color }}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border">
                <div
                  className="rounded-t-lg px-2 py-1.5 font-medium"
                  style={{ background: withAlpha(color, 0.1), color }}
                >
                  So'nggi to'lovlar
                </div>
                {[0, 1, 2].map((r) => (
                  <div
                    key={r}
                    className="flex items-center gap-2 border-t border-border px-2 py-1.5"
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ background: withAlpha(color, 0.18) }}
                    />
                    <span className="h-1.5 flex-1 rounded bg-muted" />
                    <span className="h-1.5 w-8 rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Kirish sahifasi — tenant client'dagi AuthLayout matnlari bilan bir xil
          <div className="flex h-[268px] flex-col items-center justify-center px-8 text-center">
            <Logo logoUrl={logoUrl} name={title} color={color} size="lg" />
            <div className="mt-3 text-sm font-semibold text-foreground">
              Tizimga kirish
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {title} o'quv markazi tizimiga kirish
            </div>
            <div className="mt-4 w-full max-w-[220px] space-y-2">
              <div className="rounded-md border border-border px-2 py-1.5 text-left text-[10px] text-muted-foreground">
                +998 90 123 45 67
              </div>
              <div className="rounded-md border border-border px-2 py-1.5 text-left text-[10px] text-muted-foreground">
                ••••••••
              </div>
              <div
                className="rounded-md py-1.5 text-[11px] font-medium"
                style={{ background: color, color: onColor }}
              >
                Kirish
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Taxminiy ko'rinish — brend rang, nom va logo shu tarzda qo'llanadi.
      </p>
    </div>
  );
}
