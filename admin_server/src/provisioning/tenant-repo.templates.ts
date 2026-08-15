/**
 * Tenant GitHub repositoriysiga qo'shiladigan fayllar.
 *
 * Repo ichida FAQAT kod va yo'riqnoma bo'ladi — hech qanday maxfiy qiymat
 * yo'q. `.env` `.gitignore` bilan ikki qavat bloklangan (papka darajasida
 * ham, ildizda ham), chunki bitta noto'g'ri `git add -f` mijozning Telegram
 * tokeni va JWT sirlarini GitHub'ga chiqarib yuboradi.
 */
import { Tenant } from '@prisma/client';

/**
 * Repo ildizidagi `.gitignore`.
 *
 * Template papkasida allaqachon `.gitignore` bor, lekin unga tayanib
 * bo'lmaydi: shablon o'zgarishi mumkin, bu fayl esa har provisioningda
 * qayta yoziladi va maxfiy fayllar ro'yxatini kafolatlaydi.
 */
export function renderGitignore(): string {
  return `# ============================================================
#  Bu fayl admin panel tomonidan yaratilgan — o'zgartirmang.
#  Maxfiy qiymatlar repoga TUSHMASLIGI shart.
# ============================================================

# --- MAXFIY: hech qachon commit qilinmaydi ---
.env
.env.*
!.env.example
**/.env
**/.env.*
!**/.env.example

# --- Bog'lamalar va build chiqishi ---
node_modules
**/node_modules
dist
**/dist
dist-ssr
*.local

# --- Yuklangan fayllar (mijoz ma'lumoti) ---
uploads
**/uploads

# --- Loglar ---
logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*

# --- Muharrir / OS ---
.DS_Store
.idea
.vscode/*
!.vscode/extensions.json
*.sw?
`;
}

/**
 * Tenant haqidagi texnik ma'lumot (maxfiy emas).
 * Repoga qarab turib qaysi mijoz, qaysi domen va qaysi port ekanini
 * bilish uchun — VPS'da o'nlab tenant bo'lganda juda asqotadi.
 */
export function renderTenantMeta(tenant: Tenant, templateKey?: string): string {
  return (
    JSON.stringify(
      {
        tenantId: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        systemTemplate: templateKey ?? null,
        dbName: tenant.dbName,
        pm2Name: tenant.pm2Name,
        port: tenant.port,
        brand: {
          primary: tenant.brandColor,
          background: tenant.brandBackground,
          primaryDark: tenant.brandColorDark,
          backgroundDark: tenant.brandBackgroundDark,
          logoUrl: tenant.logoUrl,
        },
        createdAt: tenant.createdAt,
        note: "Bu fayl admin panel tomonidan yaratiladi. Qo'lda tahrirlash ta'sir bermaydi.",
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * Tenant repo uchun GitHub Actions workflow'i.
 *
 * MUHIM XAVFSIZLIK QARORI: bu workflow VPS'ga SSH qilmaydi va SSH kalitini
 * TUTMAYDI. O'rniga admin serverga bitta HTTP so'rov yuboradi, admin server
 * esa faqat SHU tenantni qayta deploy qiladi. Sabab — o'nlab tenant repoga
 * bitta VPS root kalitini tarqatish: bitta repo sizib chiqsa butun server
 * qo'ldan ketadi. Deploy tokeni esa faqat bitta tenantga tegishli va uni
 * admin paneldan bir zumda almashtirsa bo'ladi.
 */
export function renderDeployWorkflow(input: {
  adminApiUrl: string;
  domain: string;
}): string {
  return `# ============================================================
#  Bu fayl admin panel tomonidan yaratilgan.
#  main'ga har push bo'lganda ${input.domain} qayta deploy qilinadi.
#
#  Kerakli secret (admin panel avtomatik qo'yadi):
#    TENANT_DEPLOY_TOKEN — faqat shu loyihaga tegishli kalit
# ============================================================
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch: {}

# Ketma-ket push bo'lsa faqat oxirgisi deploy bo'ladi
concurrency:
  group: deploy-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Admin panelga deploy so'rovi
        env:
          DEPLOY_TOKEN: \${{ secrets.TENANT_DEPLOY_TOKEN }}
        run: |
          if [ -z "$DEPLOY_TOKEN" ]; then
            echo "::error::TENANT_DEPLOY_TOKEN secret yo'q — admin panelda 'Deploy tokenini qayta yozish' tugmasini bosing"
            exit 1
          fi

          echo "==> ${input.domain} deploy so'rovi yuborilmoqda..."
          code=$(curl -sS -o response.json -w '%{http_code}' \\
            -X POST '${input.adminApiUrl}/tenant-deploy/hook' \\
            -H "Authorization: Bearer $DEPLOY_TOKEN" \\
            -H 'Content-Type: application/json' \\
            -d "{\\"ref\\":\\"\${{ github.sha }}\\"}")

          echo "HTTP $code"
          cat response.json
          echo

          if [ "$code" != "200" ] && [ "$code" != "202" ]; then
            echo "::error::Deploy so'rovi rad etildi (HTTP $code)"
            exit 1
          fi

          echo "==> ✅ Deploy boshlandi. Holatni admin panelda kuzating."
`;
}

/** Repo ildizidagi README — kod bilan ishlaydigan odam uchun. */
export function renderReadme(input: {
  tenant: Tenant;
  templateName?: string;
  adminPanelUrl?: string;
}): string {
  const { tenant } = input;

  return `# ${tenant.name}

${input.templateName || "O'quv markaz tizimi"} — \`${tenant.domain}\` uchun alohida nusxa.

> Bu repo admin panel tomonidan avtomatik yaratilgan. Kod shu mijozga
> tegishli: bu yerdagi o'zgarish faqat \`${tenant.domain}\` saytiga tushadi,
> boshqa mijozlarga ta'sir qilmaydi.

## Tuzilma

| Papka | Nima |
|---|---|
| \`server/\` | Node.js + Express + PostgreSQL (Prisma) API |
| \`client/\` | Vite + React panel |
| \`.env.example\` | Qanday o'zgaruvchilar borligi (qiymatlarsiz) |
| \`tenant.json\` | Texnik ma'lumot: domen, port, pm2 nomi, brend |

## Muhim: \`.env\` bu repoda YO'Q

Haqiqiy \`.env\` fayllarini **admin panel** yaratadi va to'g'ridan-to'g'ri
serverga yozadi. Ular repoga hech qachon tushmaydi — ichida PostgreSQL manzili,
JWT sirlari va Telegram tokeni bor.

Sozlamani o'zgartirish kerak bo'lsa — **admin panel → loyiha → Sozlamalar**.
Repodagi \`.env.example\` faqat qaysi kalitlar borligini ko'rsatadi.

## Deploy

\`main\` branchiga push qilinsa GitHub Action ishga tushadi va admin serverdan
shu loyihani qayta yig'ishni so'raydi:

1. VPS'da repo tortiladi (\`git pull\`)
2. \`server\` bog'lamalari yangilanadi va \`pm2 restart\` bo'ladi
3. \`client\` qayta build qilinadi va nginx papkasiga ko'chiriladi

Qo'lda ishga tushirish: **Actions → Deploy → Run workflow**, yoki admin
panelda **Qayta deploy** tugmasi.

## Lokal ishga tushirish

\`\`\`bash
# server
cd server
cp ../.env.example .env    # qiymatlarni o'zingiz to'ldiring
npm install
npm run dev

# client (boshqa terminalda)
cd client
npm install
npm run dev
\`\`\`

## Texnik ma'lumot

| | |
|---|---|
| Domen | ${tenant.domain} |
| PM2 process | \`${tenant.pm2Name}\` |
| Port | ${tenant.port} |
| Baza | \`${tenant.dbName}\` |
${input.adminPanelUrl ? `| Admin panel | ${input.adminPanelUrl} |\n` : ''}
`;
}
