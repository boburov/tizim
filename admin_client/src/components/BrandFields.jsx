/**
 * Brend maydonlari — yaratish va tahrirlash sahifalarida bir xil ishlaydi.
 *
 * Tenant client to'rtta rangni tushunadi: light brend, light fon, dark
 * brend, dark fon. Oxirgi uchtasi IXTIYORIY — berilmasa client ularni
 * brend rangidan hosil qiladi. Shuning uchun ular ataylab "Qo'shimcha"
 * ostiga yashirilgan: ko'pchilikka bitta rang yetadi, kerak bo'lganda
 * esa to'liq nazorat bor.
 */
import { useState } from 'react';
import { ChevronDown, Palette, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { normalizeHex } from '../lib/brand';
import LogoUploadField from './LogoUploadField';

/** Tayyor palitralar — noldan rang tanlash ko'pchilik uchun qiyin. */
const PRESETS = [
  { name: "Ko'k", primary: '#2563eb', background: '#f8fafc' },
  { name: 'Indigo', primary: '#4f46e5', background: '#f8fafc' },
  { name: 'Zumrad', primary: '#059669', background: '#f7fdf9' },
  { name: "Qo'ng'ir", primary: '#78552e', background: '#fdfaf5' },
  { name: 'Pushti', primary: '#db2777', background: '#fdf7fa' },
  { name: 'Siyoh', primary: '#0f172a', background: '#f8fafc', primaryDark: '#93b4e8' },
];

function ColorField({ label, value, onChange, help, optional, placeholder }) {
  const isSet = Boolean(value);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {optional && isSet && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
            title="Avtomatik hosil qilinsin"
          >
            <RotateCcw size={11} /> Avtomatik
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          // `<input type="color">` bo'sh qiymatni bilmaydi — "avtomatik"
          // holatda unga ko'rsatkichli qiymat beramiz, lekin holatni
          // O'ZGARTIRMAYMIZ: foydalanuvchi bosmaguncha maydon bo'sh qoladi.
          value={value || placeholder || '#4f46e5'}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-9 w-12 shrink-0 cursor-pointer rounded-lg border',
            isSet ? 'border-border' : 'border-dashed border-border opacity-60',
          )}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            // Foydalanuvchi "4f46e5" yoki "#4F46E5" yozishi mumkin
            const raw = e.target.value.trim();
            if (!raw) return;
            const withHash = raw.startsWith('#') ? raw : `#${raw}`;
            const normalized = normalizeHex(withHash);
            if (normalized && normalized !== value) onChange(normalized);
          }}
          placeholder={optional ? 'Avtomatik' : '#4f46e5'}
          className="w-full rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {help && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  );
}

export default function BrandFields({
  value,
  onChange,
  showName = true,
  className,
  /** Berilsa — logo yuklanadi; berilmasa (yaratish formasi) faqat eslatma. */
  tenantId,
}) {
  const [advanced, setAdvanced] = useState(
    // Qo'shimcha rang allaqachon kiritilgan bo'lsa bo'lim ochiq turadi
    Boolean(value.brandColorDark || value.brandBackgroundDark || value.brandBackground),
  );

  const set = (key) => (v) => onChange({ ...value, [key]: v });

  const applyPreset = (preset) =>
    onChange({
      ...value,
      brandColor: preset.primary,
      brandBackground: preset.background,
      brandColorDark: preset.primaryDark || '',
      brandBackgroundDark: '',
    });

  return (
    <div className={cn('space-y-4', className)}>
      {showName && (
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Loyiha nomi *
          </label>
          <input
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={value.name || ''}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Bilim O'quv Markazi"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Sayt sarlavhasi va sidebar'da ko'rinadi.
          </p>
        </div>
      )}

      {/* Tayyor palitralar */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Palette size={14} /> Tayyor palitralar
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition',
                value.brandColor?.toLowerCase() === p.primary
                  ? 'border-brand bg-brand/5 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              <span
                className="h-3 w-3 rounded-full ring-1 ring-black/10"
                style={{ background: p.primary }}
              />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <ColorField
        label="Brend rang *"
        value={value.brandColor || ''}
        onChange={set('brandColor')}
        help="Tugmalar, havolalar va faol elementlar shu rangda bo'ladi."
      />

      {/* ⚠ Logo yuklash uchun tenant `id` KERAK (`POST /tenants/:id/logo`).
          Yaratish formasida u hali yo'q — o'sha yerda faqat eslatma. */}
      {tenantId ? (
        <LogoUploadField
          tenantId={tenantId}
          value={value.logoUrl || ''}
          onChanged={(url) => onChange({ ...value, logoUrl: url || '' })}
        />
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Logo</label>
          <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
            Loyiha yaratilgandan so'ng "Brend" bo'limidan yuklaysiz. Hozircha
            nomning bosh harfi brend rangida ko'rsatiladi.
          </p>
        </div>
      )}

      {/* Qo'shimcha ranglar */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium text-foreground">
              Qo'shimcha ranglar
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Fon va dark rejim ranglari — berilmasa avtomatik hosil qilinadi
            </span>
          </span>
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 text-muted-foreground transition',
              advanced && 'rotate-180',
            )}
          />
        </button>

        {advanced && (
          <div className="space-y-4 border-t border-border p-4">
            <ColorField
              label="Fon rangi"
              optional
              placeholder="#f8fafc"
              value={value.brandBackground || ''}
              onChange={set('brandBackground')}
              help="Light rejim foni. Neytral yuzalar shu rangning tusidan oladi."
            />

            <ColorField
              label="Dark rejim brend rangi"
              optional
              placeholder="#93b4e8"
              value={value.brandColorDark || ''}
              onChange={set('brandColorDark')}
              help="Qora yoki juda to'q brend rangi uchun MAJBURIY — aks holda qorong'i fonda u kulrangga aylanadi."
            />

            <ColorField
              label="Dark rejim foni"
              optional
              placeholder="#0a0a0a"
              value={value.brandBackgroundDark || ''}
              onChange={set('brandBackgroundDark')}
              help="Berilsa, qolgan barcha qorong'i yuzalar shu rangdan pog'onalab hosil qilinadi."
            />
          </div>
        )}
      </div>
    </div>
  );
}
