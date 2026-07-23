#!/usr/bin/env bash
#
# provision.sh — yangi tenant (o'quv markaz) ni ishga tushiradi.
# admin_server bu skriptni ENV o'zgaruvchilari orqali chaqiradi. Har tenant uchun:
#   1) template client/server ni yangi papkaga nusxalaydi
#   2) noyob DB nomi bilan .env yozadi (server + client)
#   3) MongoDB bazasini tayyorlaydi (mongoose birinchi yozuvda avtomatik yaratadi)
#   4) npm ci + client build
#   5) pm2 start (tenant API)
#   6) nginx vhost + certbot (HTTPS)
#
# admin_server beradigan ENV:
#   TENANT_DB_NAME, TENANT_DOMAIN, TENANT_PM2_NAME, TENANT_PORT,
#   TENANT_NAME, TENANT_BRAND_COLOR, TENANT_LOGO_URL, TENANT_BOT_TOKEN,
#   TENANT_TEMPLATE_DIR
#
# Global sozlamalar (admin_server .env yoki bu yerda):
#   MONGO_BASE_URL   — masalan mongodb://127.0.0.1:27017
#   TENANTS_ROOT     — tenant ilovalar joylashadigan papka (masalan /root/tenants)
#   WEB_ROOT_BASE    — client build joylashadigan papka (masalan /var/www)
#   WEB_USER         — nginx foydalanuvchisi (www-data)
#   CERTBOT_EMAIL    — Let's Encrypt uchun email
#
set -euo pipefail

# --- Global standart qiymatlar ---
MONGO_BASE_URL="${MONGO_BASE_URL:-mongodb://127.0.0.1:27017}"
TENANTS_ROOT="${TENANTS_ROOT:-/root/tenants}"
WEB_ROOT_BASE="${WEB_ROOT_BASE:-/var/www}"
WEB_USER="${WEB_USER:-www-data}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@example.uz}"
NGINX_SITES="${NGINX_SITES:-/etc/nginx/sites-available}"
NGINX_ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled}"

# --- Kerakli argumentlarni tekshirish ---
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
req TENANT_BRAND_COLOR
req TENANT_TEMPLATE_DIR

echo "==> 🚀 Provisioning: ${TENANT_DOMAIN}"
echo "    DB:   ${TENANT_DB_NAME}"
echo "    Port: ${TENANT_PORT}"
echo "    PM2:  ${TENANT_PM2_NAME}"

APP_DIR="${TENANTS_ROOT}/${TENANT_DB_NAME}"
WEB_ROOT="${WEB_ROOT_BASE}/${TENANT_DOMAIN}"

# --- 0) Idempotentlik: papka bo'lsa avval tozalaymiz ---
if [ -d "$APP_DIR" ]; then
  echo "==> Eski papka topildi, tozalanmoqda: $APP_DIR"
  pm2 delete "$TENANT_PM2_NAME" >/dev/null 2>&1 || true
  rm -rf "$APP_DIR"
fi

# --- 1) Template ni nusxalash ---
echo "==> Template nusxalanmoqda: $TENANT_TEMPLATE_DIR -> $APP_DIR"
mkdir -p "$APP_DIR"
# node_modules va build chiqishini nusxalamaymiz (tez va toza)
cp -r "$TENANT_TEMPLATE_DIR/server" "$APP_DIR/server"
cp -r "$TENANT_TEMPLATE_DIR/client" "$APP_DIR/client"
rm -rf "$APP_DIR/server/node_modules" "$APP_DIR/client/node_modules" \
       "$APP_DIR/client/dist" 2>/dev/null || true

# --- 2) Maxfiy secretlar generatsiyasi (har tenant o'ziniki) ---
gen_secret() { openssl rand -hex 32; }
JWT_ACCESS_SECRET="$(gen_secret)"
JWT_REFRESH_SECRET="$(gen_secret)"
COOKIE_SECRET="$(gen_secret)"

MONGO_URL="${MONGO_BASE_URL}/${TENANT_DB_NAME}"
CLIENT_URL="https://${TENANT_DOMAIN}"
API_URL="https://${TENANT_DOMAIN}/api"

# --- 3) server/.env yozish ---
echo "==> server/.env yozilmoqda..."
BOT_ENABLED="false"
if [ -n "${TENANT_BOT_TOKEN:-}" ]; then BOT_ENABLED="true"; fi

cat > "$APP_DIR/server/.env" <<EOF
NODE_ENV=production
PORT=${TENANT_PORT}

MONGO_URL=${MONGO_URL}

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

COOKIE_SECRET=${COOKIE_SECRET}
COOKIE_DOMAIN=${TENANT_DOMAIN}

CLIENT_URL=${CLIENT_URL}

TELEGRAM_BOT_TOKEN=${TENANT_BOT_TOKEN:-}
TELEGRAM_BOT_ENABLED=${BOT_ENABLED}
TELEGRAM_BOT_WEBAPP_URL=${CLIENT_URL}/bot-auth
EOF

# --- 4) client/.env yozish (brend) ---
echo "==> client/.env yozilmoqda..."
cat > "$APP_DIR/client/.env" <<EOF
VITE_API_URL=${API_URL}
VITE_APP_NAME=${TENANT_NAME}
VITE_APP_PRIMARY=${TENANT_BRAND_COLOR}
VITE_APP_LOGO=${TENANT_LOGO_URL:-}
EOF

# --- 5) Server bog'lamalari ---
echo "==> server: npm ci..."
cd "$APP_DIR/server"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# --- 6) Client build ---
echo "==> client: npm ci + build..."
cd "$APP_DIR/client"
npm ci 2>/dev/null || npm install
npm run build

echo "==> client dist -> $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*
cp -r dist/* "$WEB_ROOT"/
chown -R "$WEB_USER":"$WEB_USER" "$WEB_ROOT"

# --- 7) PM2 start (tenant API) ---
echo "==> pm2 start ${TENANT_PM2_NAME}..."
cd "$APP_DIR/server"
pm2 start src/index.js --name "$TENANT_PM2_NAME" --update-env
pm2 save >/dev/null 2>&1 || true

# --- 8) Nginx vhost ---
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

# --- 9) HTTPS (certbot) — domen DNS allaqachon shu IP ga ishora qilishi kerak ---
if command -v certbot >/dev/null 2>&1; then
  echo "==> certbot (HTTPS) urinilmoqda..."
  certbot --nginx -d "${TENANT_DOMAIN}" \
    --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" --redirect || \
    echo "⚠️  certbot muvaffaqiyatsiz — DNS hali ishlamayotgan bo'lishi mumkin. Keyin qayta urinib ko'ring."
else
  echo "⚠️  certbot topilmadi — HTTPS o'rnatilmadi."
fi

echo "==> ✅ Provisioning tugadi: https://${TENANT_DOMAIN}"
echo "    IP (DNS uchun): ${SERVER_PUBLIC_IP:-<nomalum>}"
