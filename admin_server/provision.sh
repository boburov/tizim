#!/usr/bin/env bash
#
# provision.sh — yangi tenant (o'quv markaz) ni ishga tushiradi.
#
# Har tenant uchun:
#   1) template client/server ni yangi papkaga nusxalaydi
#   2) admin server yuborgan .env fayllarini yozadi
#   3) npm ci + client build
#   4) pm2 start (tenant API)
#   5) nginx vhost + certbot (HTTPS)
#   6) kodni tenantning O'Z GitHub repositoriysiga yuboradi
#
# ────────────────────────────────────────────────────────────────────────
# MUHIM: .env mazmuni endi SHU SKRIPTDA YOZILMAYDI.
# Uni admin server hosil qiladi (sozlamalar registri + brend ranglari) va
# base64 ko'rinishida uzatadi. Shuning uchun yangi sozlama qo'shish uchun
# bu faylga TEGISH SHART EMAS — faqat admin serverdagi registrga bitta
# yozuv qo'shiladi. Yagona istisno — kripto sirlari (pastda izohi bor).
# ────────────────────────────────────────────────────────────────────────
#
# admin_server beradigan ENV:
#   TENANT_DB_NAME, TENANT_DOMAIN, TENANT_PM2_NAME, TENANT_PORT,
#   TENANT_NAME, TENANT_TEMPLATE_DIR
#   TENANT_SERVER_ENV_B64, TENANT_CLIENT_ENV_B64            — .env fayllari
#   TENANT_ENV_EXAMPLE_B64, TENANT_GITIGNORE_B64,
#   TENANT_META_B64, TENANT_README_B64, TENANT_WORKFLOW_B64 — repo fayllari
#   GIT_ENABLED, GIT_REMOTE, GIT_TOKEN, GIT_BRANCH          — GitHub
#
# Global sozlamalar:
#   TENANTS_ROOT   — tenant ilovalar papkasi (/root/tenants)
#   WEB_ROOT_BASE  — client build papkasi (/var/www)
#   WEB_USER       — nginx foydalanuvchisi (www-data)
#   CERTBOT_EMAIL  — Let's Encrypt uchun email
#
set -euo pipefail

TENANTS_ROOT="${TENANTS_ROOT:-/root/tenants}"
WEB_ROOT_BASE="${WEB_ROOT_BASE:-/var/www}"
WEB_USER="${WEB_USER:-www-data}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@example.uz}"
NGINX_SITES="${NGINX_SITES:-/etc/nginx/sites-available}"
NGINX_ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

req() {
  if [ -z "${!1:-}" ]; then
    echo "❌ ENV yo'q: $1" >&2
    exit 2
  fi
}
req TENANT_DB_NAME
req TENANT_DOMAIN
req TENANT_PM2_NAME
req TENANT_PORT
req TENANT_NAME
req TENANT_TEMPLATE_DIR
req TENANT_SERVER_ENV_B64
req TENANT_CLIENT_ENV_B64

echo "==> 🚀 Provisioning: ${TENANT_DOMAIN}"
echo "    DB:   ${TENANT_DB_NAME}"
echo "    Port: ${TENANT_PORT}"
echo "    PM2:  ${TENANT_PM2_NAME}"

APP_DIR="${TENANTS_ROOT}/${TENANT_DB_NAME}"
WEB_ROOT="${WEB_ROOT_BASE}/${TENANT_DOMAIN}"

# base64 -> fayl (papkasi bilan birga)
write_b64() {
  local b64="$1" dest="$2"
  [ -z "$b64" ] && return 0
  mkdir -p "$(dirname "$dest")"
  printf '%s' "$b64" | base64 -d > "$dest"
}

# ---------------------------------------------------------------------------
# 0) KRIPTO SIRLARINI VA GIT TARIXINI SAQLAB QOLISH
#
# JWT va cookie sirlari admin bazasida SAQLANMAYDI — nazorat qatlami
# tenantlarning sessiya kalitlarini tutmasligi kerak. Ular shu yerda bir
# marta yaratiladi, keyingi provisioninglarda mavjudidan olinadi.
#
# Nega muhim: qayta urinish (retry) papkani tozalaydi. Sirlarni saqlab
# qolmasak, har retry'da o'quv markazning HAMMA foydalanuvchisi tizimdan
# chiqib ketardi.
# ---------------------------------------------------------------------------
OLD_ENV="$APP_DIR/server/.env"
grab() {
  if [ -f "$OLD_ENV" ]; then
    sed -n "s/^$1=//p" "$OLD_ENV" | head -n1 | tr -d '"' || true
  fi
}

JWT_ACCESS_SECRET="$(grab JWT_ACCESS_SECRET)"
JWT_REFRESH_SECRET="$(grab JWT_REFRESH_SECRET)"
COOKIE_SECRET="$(grab COOKIE_SECRET)"

gen_secret() { openssl rand -hex 32; }
[ -z "$JWT_ACCESS_SECRET" ] && JWT_ACCESS_SECRET="$(gen_secret)"
[ -z "$JWT_REFRESH_SECRET" ] && JWT_REFRESH_SECRET="$(gen_secret)"
[ -z "$COOKIE_SECRET" ] && COOKIE_SECRET="$(gen_secret)"

# Git tarixi ham saqlanadi: papka tozalanganda tarix yo'qolsa, keyingi
# push repodagi commitlar bilan to'qnashardi va "force" talab qilardi.
GIT_BACKUP=""
if [ -d "$APP_DIR/.git" ]; then
  GIT_BACKUP="$(mktemp -d)"
  echo "==> Git tarixi vaqtincha saqlanmoqda..."
  cp -r "$APP_DIR/.git" "$GIT_BACKUP/.git"
fi

if [ -d "$APP_DIR" ]; then
  echo "==> Eski papka topildi, tozalanmoqda: $APP_DIR"
  pm2 delete "$TENANT_PM2_NAME" >/dev/null 2>&1 || true
  rm -rf "$APP_DIR"
fi

# ---------------------------------------------------------------------------
# 1) Template ni nusxalash
# ---------------------------------------------------------------------------
echo "==> Template nusxalanmoqda: $TENANT_TEMPLATE_DIR -> $APP_DIR"
mkdir -p "$APP_DIR"
cp -r "$TENANT_TEMPLATE_DIR/server" "$APP_DIR/server"
cp -r "$TENANT_TEMPLATE_DIR/client" "$APP_DIR/client"

# server/dist ham tozalanadi: shablonda eski build qolib ketsa, yangi .env
# bilan ESKI kod ishga tushardi va buni hech narsa ushlamasdi.
rm -rf "$APP_DIR/server/node_modules" "$APP_DIR/client/node_modules" \
       "$APP_DIR/client/dist" "$APP_DIR/server/dist" 2>/dev/null || true
# Shablondan .env kelib qolishi mumkin — bizniki ustidan yozadi, lekin
# ehtiyot uchun oldindan olib tashlaymiz.
rm -f "$APP_DIR/server/.env" "$APP_DIR/client/.env" 2>/dev/null || true

if [ -n "$GIT_BACKUP" ]; then
  echo "==> Git tarixi qaytarilmoqda..."
  cp -r "$GIT_BACKUP/.git" "$APP_DIR/.git"
  rm -rf "$GIT_BACKUP"
fi

# ---------------------------------------------------------------------------
# 2) .env fayllari (admin serverdan) + kripto sirlari
# ---------------------------------------------------------------------------
echo "==> server/.env yozilmoqda..."
write_b64 "$TENANT_SERVER_ENV_B64" "$APP_DIR/server/.env"

cat >> "$APP_DIR/server/.env" <<EOF

# --- Kripto sirlari (shu serverda yaratilgan, admin bazasida yo'q) ---
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
COOKIE_SECRET=${COOKIE_SECRET}
EOF

echo "==> client/.env yozilmoqda..."
write_b64 "$TENANT_CLIENT_ENV_B64" "$APP_DIR/client/.env"

# .env fayllarini faqat egasi o'qiy olsin
chmod 600 "$APP_DIR/server/.env" "$APP_DIR/client/.env"

# ---------------------------------------------------------------------------
# 3) Repo fayllari (GitHub uchun — ichida maxfiy qiymat yo'q)
# ---------------------------------------------------------------------------
echo "==> Repo fayllari yozilmoqda..."
write_b64 "${TENANT_GITIGNORE_B64:-}"   "$APP_DIR/.gitignore"
write_b64 "${TENANT_ENV_EXAMPLE_B64:-}" "$APP_DIR/.env.example"
write_b64 "${TENANT_META_B64:-}"        "$APP_DIR/tenant.json"
write_b64 "${TENANT_README_B64:-}"      "$APP_DIR/README.md"
write_b64 "${TENANT_WORKFLOW_B64:-}"    "$APP_DIR/.github/workflows/deploy.yml"

# ---------------------------------------------------------------------------
# 4) Server bog'lamalari
# ---------------------------------------------------------------------------
# DIQQAT: --omit=dev QO'YMANG. Server NestJS'da yozilgan va `npm run build`
# (nest build) uchun @nestjs/cli + typescript kerak — ular devDependencies'da.
# Ular tashlansa dist/main.js hech qachon paydo bo'lmaydi va pm2 yiqiladi.
echo "==> server: npm ci..."
cd "$APP_DIR/server"
# --include=dev SHART: server NestJS ilovasi va uni `nest build` bilan
# kompilyatsiya qilish kerak. `nest` va `typescript` — devDependencies.
# NODE_ENV=production meros bo'lgani uchun usiz ular o'rnatilmaydi va
# `npm run build` -> "nest: not found" beradi. (Plain `npm ci` ham yetarli
# emas — NODE_ENV=production o'zi devDependencies'ni tashlab ketadi.)
npm ci --include=dev 2>/dev/null || npm install --include=dev

# ---------------------------------------------------------------------------
# 4b) PostgreSQL bazasi + Prisma migratsiyalari
#
# Har tenant O'Z bazasida ishlaydi (izolyatsiya avvalgi Mongo modeli bilan
# bir xil). Baza YO'Q bo'lsa yaratiladi - `createdb` allaqachon bor bazada
# xato beradi, shuning uchun oldindan tekshiramiz (skript qayta ishga
# tushirilsa ham xavfsiz bo'lishi kerak).
#
# MIGRATSIYA `migrate deploy` bilan: u faqat TAYYOR migratsiyalarni
# qo'llaydi va hech qachon schema'ni o'zgartirmaydi yoki ma'lumot
# o'chirmaydi (`migrate dev` dan farqi shu - u prod'da ISHLATILMAYDI).
# ---------------------------------------------------------------------------
PG_BASE_URL="${POSTGRES_BASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432}"
PG_ADMIN_DB="${POSTGRES_ADMIN_DB:-postgres}"

echo "==> PostgreSQL bazasi: ${TENANT_DB_NAME}"
if psql "${PG_BASE_URL}/${PG_ADMIN_DB}" -tAc \
     "SELECT 1 FROM pg_database WHERE datname='${TENANT_DB_NAME}'" | grep -q 1; then
  echo "    ℹ️  baza allaqachon mavjud"
else
  psql "${PG_BASE_URL}/${PG_ADMIN_DB}" -c "CREATE DATABASE \"${TENANT_DB_NAME}\"" >/dev/null
  echo "    ✅ baza yaratildi"
fi

echo "==> Prisma migratsiyalari..."
npx prisma migrate deploy
npx prisma generate

# ---------------------------------------------------------------------------
# 4c) Server build (dist/main.js) + boshlang'ich seedlar
#
# Build `prisma generate` DAN KEYIN turishi shart: TypeScript kodi Prisma
# generatsiya qilgan tiplarni import qiladi. Bu qadamsiz `dist` faqat
# shablondan ko'chirilgan eski nusxa bo'lardi va `deploy` rejimida
# (git reset --hard, `dist` gitignore'da) umuman bo'lmasdi.
#
# Seedlar `dist/seeds/*.js` dan yuriladi, ya'ni build'dan keyin.
# `seed:owner` ATAYLAB CHAQIRILMAYDI — ega hisobi dev paneldan yaratiladi
# (admin_server tenant bazasiga to'g'ridan-to'g'ri yozadi), aks holda ikkita
# haqiqat manbai paydo bo'lardi.
# ---------------------------------------------------------------------------
echo "==> server: build (nest build)..."
npm run build

echo "==> server: seedlar (ruxsatlar katalogi va standart ma'lumotlar)..."
npm run seed:permissions
npm run seed:communication
npm run seed:expense-categories

# ---------------------------------------------------------------------------
# 5) Client build
# ---------------------------------------------------------------------------
echo "==> client: npm ci + build..."
cd "$APP_DIR/client"
# --include=dev SHART: admin-api pm2 ostida NODE_ENV=production bilan ishlaydi va
# bu qiymat skriptga meros bo'ladi. Usiz `npm ci` devDependencies'ni (jumladan
# `vite`) o'tkazib yuboradi, natijada `vite build` -> "vite: not found" (kod 127).
npm ci --include=dev 2>/dev/null || npm install --include=dev
npm run build

echo "==> client dist -> $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*
cp -r dist/* "$WEB_ROOT"/
chown -R "$WEB_USER":"$WEB_USER" "$WEB_ROOT"

# ---------------------------------------------------------------------------
# 6) PM2 start (tenant API)
# ---------------------------------------------------------------------------
echo "==> pm2 start ${TENANT_PM2_NAME}..."
cd "$APP_DIR/server"
# NestJS kirish nuqtasi dist/main.js (eski Express `src/index.js` o'chirilgan —
# u yerda endi faqat main.ts bor, ya'ni eski yo'l har doim yiqilardi).
pm2 start dist/main.js --name "$TENANT_PM2_NAME" --update-env
pm2 save >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 7) Nginx vhost
# ---------------------------------------------------------------------------
echo "==> nginx vhost yozilmoqda..."
VHOST="${NGINX_SITES}/${TENANT_DOMAIN}"
cat > "$VHOST" <<EOF
server {
    listen 80;
    server_name ${TENANT_DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    # SPA — barcha yo'llar index.html ga
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API — tenant serverga proxy
    location /api/ {
        proxy_pass http://127.0.0.1:${TENANT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf "$VHOST" "${NGINX_ENABLED}/${TENANT_DOMAIN}"
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------------------
# 8) HTTPS (certbot) — DNS allaqachon shu IP ga ishora qilishi kerak
# ---------------------------------------------------------------------------
if command -v certbot >/dev/null 2>&1; then
  echo "==> certbot (HTTPS) urinilmoqda..."
  certbot --nginx -d "${TENANT_DOMAIN}" \
    --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" --redirect || \
    echo "⚠️  certbot muvaffaqiyatsiz — DNS hali ishlamayotgan bo'lishi mumkin. Keyin qayta urinib ko'ring."
else
  echo "⚠️  certbot topilmadi — HTTPS o'rnatilmadi."
fi

# ---------------------------------------------------------------------------
# 9) Kodni GitHub'ga yuborish
#
# ATAYLAB ENG OXIRIDA va xatosi yutiladi: GitHub tarafidagi muammo sababli
# ISHLAB TURGAN sayt "muvaffaqiyatsiz" deb belgilanishi mumkin emas.
# Natija maxsus belgi bilan bildiriladi — admin server logdan
# GIT_PUSH_OK / GIT_PUSH_FAILED ni o'qiydi.
# ---------------------------------------------------------------------------
if [ "${GIT_ENABLED:-false}" = "true" ] && [ -n "${GIT_REMOTE:-}" ]; then
  echo "==> 📦 Kod GitHub'ga yuborilmoqda..."
  if bash "$SCRIPT_DIR/git-sync.sh" "$APP_DIR" "Provisioning: ${TENANT_DOMAIN}"; then
    echo "GIT_PUSH_OK"
  else
    echo "GIT_PUSH_FAILED"
  fi
else
  echo "==> GitHub integratsiyasi o'chiq — kod yuborilmadi."
fi

echo "==> ✅ Provisioning tugadi: https://${TENANT_DOMAIN}"
echo "    IP (DNS uchun): ${SERVER_PUBLIC_IP:-<nomalum>}"
