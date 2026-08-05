/**
 * Tenant `.env` fayllarini matn ko'rinishida quradi.
 *
 * Ilgari bu ish provision.sh ichidagi heredoc'da edi: yangi sozlama qo'shish
 * uchun VPS'dagi skriptni tahrirlash kerak bo'lardi. Endi fayl mazmuni shu
 * yerda hosil bo'ladi va skriptga base64 ko'rinishida uzatiladi — skript
 * uni shunchaki yozadi, ichida nima borligini bilishi shart emas.
 *
 * KRIPTO SIRLARI BU YERDA YO'Q. `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
 * va `COOKIE_SECRET` ni skriptning o'zi boshqaradi: birinchi provisioningda
 * generatsiya qiladi, keyingi qayta sozlashlarda mavjudini SAQLAB QOLADI.
 * Ataylab shunday — admin bazasi tenantlarning sessiya kalitlarini tutmaydi,
 * va sozlama o'zgartirilganda hamma foydalanuvchi tizimdan chiqib ketmaydi.
 */
import { SETTINGS, SettingDefinition } from './settings.registry.js';

export interface ResolvedConfig {
  server: Record<string, string>;
  client: Record<string, string>;
}

/** `.env` qiymatini xavfsiz qatorga aylantiradi. */
function envLine(key: string, value: string): string {
  // Bo'sh joy, tirnoq, `#` yoki `$` bo'lsa qo'shtirnoqqa olamiz — aks holda
  // dotenv qiymatni kesib yuboradi yoki shell kengaytirishga urinadi.
  const needsQuotes = /[\s"'#$`\\]/.test(value);
  if (!needsQuotes) return `${key}=${value}`;

  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${key}="${escaped}"`;
}

/** Izohni `.env` ga mos ko'rinishga keltiradi (har satr oldiga `# `). */
function comment(text: string, width = 74): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line += ` ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());

  return lines.map((l) => `# ${l}`);
}

/**
 * Tenant SERVER uchun `.env` matni.
 *
 * `managed` — tenant yozuvidan hosil qilingan, o'zgartirilmaydigan qiymatlar.
 * `settings` — registrdan kelgan, admin o'zgartira oladigan qiymatlar.
 */
export function renderServerEnv(config: ResolvedConfig): string {
  const out: string[] = [
    '# ============================================================',
    '#  BU FAYL AVTOMATIK YARATILGAN — qo\'lda tahrirlamang.',
    '#  Manba: admin panel → loyiha → Sozlamalar.',
    '#  Qo\'lda o\'zgartirilgan qiymat keyingi "Qo\'llash"da yo\'qoladi.',
    '# ============================================================',
    '',
  ];

  const serverDefs = SETTINGS.filter((s) => s.scope === 'server');

  // 1) Boshqariladigan (hosil qilingan) qiymatlar — registrda yo'q kalitlar
  const managedKeys = Object.keys(config.server).filter(
    (k) => !serverDefs.some((d) => d.key === k),
  );
  if (managedKeys.length) {
    out.push('# --- Tizim tomonidan boshqariladi (panelda o\'zgarmaydi) ---');
    for (const key of managedKeys) {
      out.push(envLine(key, config.server[key]));
    }
    out.push('');
  }

  // 2) Registr sozlamalari — guruhlab, izohlari bilan
  const groups = [...new Set(serverDefs.map((d) => d.group))];
  for (const group of groups) {
    const defs = serverDefs.filter(
      (d) => d.group === group && config.server[d.key] !== undefined,
    );
    if (!defs.length) continue;

    out.push(`# --- ${group} ---`);
    for (const def of defs) {
      if (def.help) out.push(...comment(def.help));
      out.push(envLine(def.key, config.server[def.key]));
      out.push('');
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Tenant CLIENT uchun `.env` matni (Vite `VITE_*` o'zgaruvchilari). */
export function renderClientEnv(config: ResolvedConfig): string {
  const out: string[] = [
    '# ============================================================',
    '#  BU FAYL AVTOMATIK YARATILGAN — qo\'lda tahrirlamang.',
    '#  Manba: admin panel → loyiha → Brend / Sozlamalar.',
    '#',
    '#  Ranglar HSL KANALLARI ko\'rinishida: "<tus> <to\'yinganlik>% <yorug\'lik>%"',
    '#  (hsl() o\'ramisiz — qiymat to\'g\'ridan-to\'g\'ri CSS o\'zgaruvchisiga tushadi).',
    '# ============================================================',
    '',
  ];

  for (const [key, value] of Object.entries(config.client)) {
    out.push(envLine(key, value));
  }

  return out.join('\n').trimEnd() + '\n';
}

/**
 * GitHub repoga qo'yiladigan `.env.example`.
 *
 * Haqiqiy qiymatlar EMAS — faqat kalitlar, izohlar va standartlar.
 * Repoda `.env` hech qachon bo'lmaydi (`.gitignore` bilan bloklangan),
 * shuning uchun kodni qayta tiklashda shu fayl yo'l ko'rsatadi.
 */
export function renderEnvExample(): string {
  const out: string[] = [
    '# ============================================================',
    "#  Tenant server sozlamalari — namuna.",
    '#',
    "#  HAQIQIY .env admin panel tomonidan yaratiladi va repoga",
    "#  HECH QACHON qo'yilmaydi (maxfiy kalitlar bor).",
    '#  Bu fayl faqat qaysi o\'zgaruvchilar borligini ko\'rsatadi.',
    '# ============================================================',
    '',
    '# --- Tizim tomonidan boshqariladi ---',
    "# Bu qiymatlarni admin panel hosil qiladi — qo'lda to'ldirmang.",
    'NODE_ENV=production',
    'PORT=<tenant porti>',
    'MONGO_URL=mongodb://127.0.0.1:27017/<tenant bazasi>',
    'JWT_ACCESS_SECRET=<provision.sh generatsiya qiladi>',
    'JWT_REFRESH_SECRET=<provision.sh generatsiya qiladi>',
    'COOKIE_SECRET=<provision.sh generatsiya qiladi>',
    'COOKIE_DOMAIN=<tenant domeni>',
    'CLIENT_URL=https://<tenant domeni>',
    'ADMIN_API_URL=<admin panel API manzili>',
    'TENANT_ID=<tenant id>',
    'HEARTBEAT_SECRET=<noyob kalit>',
    '',
  ];

  const serverDefs = SETTINGS.filter((s) => s.scope === 'server');
  const groups = [...new Set(serverDefs.map((d) => d.group))];

  for (const group of groups) {
    out.push(`# --- ${group} ---`);
    for (const def of serverDefs.filter((d) => d.group === group)) {
      if (def.help) out.push(...comment(def.help));
      const placeholder =
        def.type === 'secret' ? '' : (def.default ?? '');
      out.push(`${def.key}=${placeholder}`);
      out.push('');
    }
  }

  out.push('# ============================================================');
  out.push('#  Client (Vite) sozlamalari — client/.env');
  out.push('# ============================================================');
  out.push('VITE_API_URL=https://<tenant domeni>/api');
  out.push('VITE_APP_NAME=<markaz nomi>');
  out.push('VITE_APP_LOGO=/logo.svg');
  out.push('# Ranglar HSL kanallari ko\'rinishida, masalan "217 91% 60%"');
  out.push('VITE_APP_PRIMARY=');
  out.push('VITE_APP_BACKGROUND=');
  out.push('VITE_APP_PRIMARY_DARK=');
  out.push('VITE_APP_BACKGROUND_DARK=');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Registrdagi ta'rifni UI uchun xavfsiz ko'rinishga keltiradi. */
export function publicDefinition(def: SettingDefinition) {
  return {
    key: def.key,
    scope: def.scope,
    type: def.type,
    group: def.group,
    label: def.label,
    help: def.help ?? null,
    default: def.default ?? '',
    options: def.options ?? null,
    min: def.min ?? null,
    max: def.max ?? null,
    patternHint: def.patternHint ?? null,
    applies: def.applies,
    advanced: Boolean(def.advanced),
  };
}
