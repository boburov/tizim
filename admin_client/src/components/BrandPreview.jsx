/**
 * Tenant sayti brend sozlamalari bilan qanday ko'rinishini ko'rsatadi.
 *
 * ILGARI qanday edi: rang shunchaki `background: <hex>` sifatida bir necha
 * joyga qo'yilardi. Bu "taxminiy rasm" edi va haqiqiy saytdan sezilarli
 * farq qilardi — chunki tenant client rangni shundayligicha ishlatmaydi:
 * u undan butun token to'plamini (yuzalar, chegaralar, matn ranglari)
 * hosil qiladi va kontrastni majburlaydi.
 *
 * HOZIR: preview AYNAN o'sha token dvigatelidan o'tadi (`lib/brand`),
 * natijadagi tokenlar esa CSS o'zgaruvchisi sifatida shu blokka
 * o'rnatiladi. Shuning uchun ichkaridagi har bir `bg-card`, `text-primary`
 * klassi tenant palitrasida chiziladi — admin panel palitrasida emas.
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Info,
  LayoutGrid,
  LogIn,
  Moon,
  Sun,
  Table2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { analyzeBrand, hexToChannels } from '../lib/brand';

const NAV = [
  { label: 'Bosh sahifa', active: true },
  { label: "O'quvchilar" },
  { label: 'Guruhlar' },
  { label: 'Davomat' },
  { label: 'Moliya' },
];

const STATS = [
  { label: "O'quvchilar", value: '128', delta: '+12' },
  { label: 'Guruhlar', value: '12', delta: '+1' },
  { label: 'Davomat', value: '94%', delta: '−2%' },
];

const ROWS = [
  { name: 'Aziza Karimova', group: 'IELTS-3', status: 'ok' },
  { name: 'Bekzod Toshev', group: 'CEFR-1', status: 'warn' },
  { name: 'Dilnoza Rahimova', group: 'IELTS-1', status: 'bad' },
];

const STATUS = {
  ok: { label: "To'landi", cls: 'bg-success/15 text-success' },
  warn: { label: 'Kutilmoqda', cls: 'bg-warning/15 text-warning' },
  bad: { label: 'Muddati o\'tgan', cls: 'bg-destructive/15 text-destructive' },
};

/** Logo yoki nomning bosh harfi (rasm yuklanmasa ham chiroyli ko'rinadi). */
function Logo({ logoUrl, name, size = 'md' }) {
  const [broken, setBroken] = useState(false);
  const box = size === 'lg' ? 'h-12 w-12 text-lg' : 'h-7 w-7 text-[11px]';

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
      className={cn(
        box,
        'flex shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground',
      )}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}

/** Sidebar tokenlari Tailwind konfigida yo'q — inline stil bilan olamiz. */
const sidebarStyle = {
  background: 'hsl(var(--sidebar-background))',
  color: 'hsl(var(--sidebar-foreground))',
  borderColor: 'hsl(var(--sidebar-border))',
};

function PanelView({ name, logoUrl }) {
  return (
    <div className="flex h-[300px] text-[10px]">
      {/* Sidebar */}
      <div
        className="flex w-[116px] shrink-0 flex-col gap-0.5 border-r p-2"
        style={sidebarStyle}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <Logo logoUrl={logoUrl} name={name} />
          <span className="truncate font-semibold">{name}</span>
        </div>

        {NAV.map((item) => (
          <div
            key={item.label}
            className="truncate rounded-md px-2 py-1.5"
            style={
              item.active
                ? {
                    background: 'hsl(var(--sidebar-primary))',
                    color: 'hsl(var(--sidebar-primary-foreground))',
                    fontWeight: 500,
                  }
                : undefined
            }
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* Kontent */}
      <div className="flex-1 overflow-hidden bg-background p-3">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold text-foreground">Bosh sahifa</div>
            <div className="text-muted-foreground">Umumiy ko'rsatkichlar</div>
          </div>
          <div className="flex gap-1.5">
            <div className="rounded-md border border-border px-2 py-1 text-foreground">
              Filtr
            </div>
            <div className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground">
              + Qo'shish
            </div>
          </div>
        </div>

        <div className="mb-2.5 grid grid-cols-3 gap-2">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-2">
              <div className="truncate text-muted-foreground">{s.label}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-semibold text-foreground">{s.value}</span>
                <span className="text-[9px] text-primary">{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Grafik taqlidi — brend rangining bosqichlari */}
        <div className="mb-2.5 rounded-lg border border-border bg-card p-2">
          <div className="mb-1.5 text-muted-foreground">Oylik tushum</div>
          <div className="flex h-10 items-end gap-1">
            {[40, 65, 45, 80, 60, 95, 70].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-primary"
                style={{ height: `${h}%`, opacity: 0.35 + (h / 100) * 0.65 }}
              />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="bg-muted px-2 py-1.5 font-medium text-foreground">
            So'nggi to'lovlar
          </div>
          {ROWS.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-2 border-t border-border bg-card px-2 py-1.5"
            >
              <span className="h-4 w-4 shrink-0 rounded-full bg-primary/20" />
              <span className="min-w-0 flex-1 truncate text-foreground">{r.name}</span>
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium',
                  STATUS[r.status].cls,
                )}
              >
                {STATUS[r.status].label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoginView({ name, logoUrl }) {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center bg-background px-8 text-center">
      <Logo logoUrl={logoUrl} name={name} size="lg" />

      <div className="mt-3 text-sm font-semibold text-foreground">Tizimga kirish</div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {name} o'quv markazi tizimiga kirish
      </div>

      <div className="mt-4 w-full max-w-[230px] space-y-2">
        <div className="rounded-md border border-input bg-card px-2 py-1.5 text-left text-[10px] text-muted-foreground">
          +998 90 123 45 67
        </div>
        <div
          className="rounded-md border bg-card px-2 py-1.5 text-left text-[10px] text-muted-foreground"
          style={{ borderColor: 'hsl(var(--ring))', boxShadow: '0 0 0 2px hsl(var(--ring) / 0.25)' }}
        >
          ••••••••
        </div>
        <div className="rounded-md bg-primary py-1.5 text-[11px] font-medium text-primary-foreground">
          Kirish
        </div>
        <div className="pt-0.5 text-[10px] text-primary">Parolni unutdingizmi?</div>
      </div>
    </div>
  );
}

function TableView({ name }) {
  return (
    <div className="h-[300px] overflow-hidden bg-background p-3 text-[10px]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-foreground">O'quvchilar</div>
        <div className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground">
          + Yangi
        </div>
      </div>

      <div className="mb-2 flex gap-1.5">
        <div className="flex-1 rounded-md border border-input bg-card px-2 py-1 text-muted-foreground">
          Qidirish…
        </div>
        {['Barchasi', 'Faol'].map((chip, i) => (
          <div
            key={chip}
            className={cn(
              'rounded-md px-2 py-1',
              i === 1
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground',
            )}
          >
            {chip}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex gap-2 bg-muted px-2 py-1.5 font-medium text-muted-foreground">
          <span className="flex-1">Ism</span>
          <span className="w-14">Guruh</span>
          <span className="w-16 text-right">Holat</span>
        </div>
        {[...ROWS, ...ROWS].map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border-t border-border bg-card px-2 py-[7px]"
          >
            <span className="flex flex-1 items-center gap-1.5 truncate text-foreground">
              <span className="h-4 w-4 shrink-0 rounded-full bg-accent" />
              {r.name}
            </span>
            <span className="w-14 truncate text-muted-foreground">{r.group}</span>
            <span className="flex w-16 justify-end">
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[9px] font-medium',
                  STATUS[r.status].cls,
                )}
              >
                {STATUS[r.status].label}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-muted-foreground">
        <span>Jami 128 ta</span>
        <span className="flex gap-1">
          <span className="rounded border border-border px-1.5 py-0.5">‹</span>
          <span className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground">1</span>
          <span className="rounded border border-border px-1.5 py-0.5">2</span>
          <span className="rounded border border-border px-1.5 py-0.5">›</span>
        </span>
      </div>
      <span className="sr-only">{name}</span>
    </div>
  );
}

const VIEWS = {
  panel: { label: 'Panel', icon: LayoutGrid, Component: PanelView },
  jadval: { label: 'Jadval', icon: Table2, Component: TableView },
  login: { label: 'Kirish', icon: LogIn, Component: LoginView },
};

export default function BrandPreview({
  name,
  brandColor,
  brandBackground,
  brandColorDark,
  brandBackgroundDark,
  logoUrl,
  domain,
  className,
  showChannels = true,
}) {
  const [view, setView] = useState('panel');
  const [mode, setMode] = useState('light');

  const brand = {
    primary: brandColor,
    background: brandBackground,
    primaryDark: brandColorDark,
    backgroundDark: brandBackgroundDark,
  };

  // Token hisobi arzon emas (kontrast sikllari bor) — brend o'zgarmasa qayta
  // hisoblanmaydi, aks holda har harf yozilganda butun to'plam qaytadan quriladi.
  const { theme, warnings } = useMemo(
    () => analyzeBrand(brand),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandColor, brandBackground, brandColorDark, brandBackgroundDark],
  );

  const title = name?.trim() || 'Nomsiz loyiha';
  const host = domain?.trim() || 'domen.example.uz';
  const { Component } = VIEWS[view];

  // Tenant `.env` ga aynan shu qiymatlar tushadi — ko'rsatib qo'yish
  // "nega rang boshqacha chiqdi?" savolini oldindan yopadi.
  const channels = [
    ['VITE_APP_PRIMARY', hexToChannels(brandColor)],
    ['VITE_APP_BACKGROUND', hexToChannels(brandBackground)],
    ['VITE_APP_PRIMARY_DARK', hexToChannels(brandColorDark)],
    ['VITE_APP_BACKGROUND_DARK', hexToChannels(brandBackgroundDark)],
  ].filter(([, v]) => v);

  const tab = (key) => {
    const { label, icon: Icon } = VIEWS[key];
    return (
      <button
        key={key}
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
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {Object.keys(VIEWS).map(tab)}
        </div>

        {/* Light / dark — tenant saytda ikkalasi ham bor, shuning uchun
            ikkalasini ham ko'rish kerak: qora brend rangi aynan shu yerda
            "yo'qolib qoladi". */}
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          title="Light / dark rejimni almashtirish"
        >
          {mode === 'light' ? <Sun size={13} /> : <Moon size={13} />}
          {mode === 'light' ? 'Light' : 'Dark'}
        </button>
      </div>

      {/* Brauzer oynasi taqlidi */}
      <div className="overflow-hidden rounded-xl border border-border shadow-sm">
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

        {/*
          Tokenlar shu blokka o'rnatiladi — ichkaridagi barcha semantik
          klasslar (bg-card, text-primary, border-border) tenant palitrasini
          oladi. `dark` klassi esa ichkarida `dark:` variantlari to'g'ri
          ishlashi uchun.
        */}
        <div
          className={cn(mode === 'dark' && 'dark')}
          style={theme[mode]}
        >
          <Component name={title} logoUrl={logoUrl} />
        </div>
      </div>

      {/* Ogohlantirishlar — bloklamaydi, faqat nima o'zgarishini aytadi */}
      {warnings.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {warnings.map((w) => (
            <div
              key={w.title}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                w.level === 'warn'
                  ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              {w.level === 'warn' ? (
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              ) : (
                <Info size={14} className="mt-0.5 shrink-0" />
              )}
              <span>
                <span className="font-medium">{w.title}.</span> {w.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {warnings.length === 0 && brandColor && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Check size={14} className="shrink-0 text-success" />
          Ranglar ikkala rejimda ham o'qiladi — saytda aynan shunday chiqadi.
        </div>
      )}

      {/* .env ga tushadigan qiymatlar */}
      {showChannels && channels.length > 0 && (
        <details className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            client/.env ga qanday yoziladi
          </summary>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-foreground">
            {channels.map(([key, value]) => (
              <div key={key} className="truncate">
                <span className="text-muted-foreground">{key}=</span>
                {value}
              </div>
            ))}
          </div>
          <p className="mt-2 font-sans text-[11px] leading-relaxed text-muted-foreground">
            Tenant client ranglarni HSL kanallari ko'rinishida kutadi — HEX
            qiymat o'qilmaydi. O'girish avtomatik bajariladi.
          </p>
        </details>
      )}
    </div>
  );
}
