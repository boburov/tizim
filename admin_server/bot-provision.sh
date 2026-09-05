#!/usr/bin/env bash
#
# bot-provision.sh — Telegram botni VPS'ga chiqaradi (Node.js yoki PHP).
#
# provision.sh ning bot uchun yengil ko'zgusi. Farqi: bazasi yo'q, client
# build'i yo'q, va Node bot ko'pincha domensiz ishlaydi.
#
# ────────────────────────────────────────────────────────────────────────
# IKKI REJIM, IKKI TIL — nima uchun aynan shunday:
#
#   NODEJS + POLLING  — bot pm2 ostida getUpdates qiladi. Domen, nginx va
#                       sertifikat KERAK EMAS. Eng sodda yo'l.
#   PHP    + WEBHOOK  — PHP uzluksiz jarayon sifatida getUpdates qila
#                       olmaydi, shuning uchun nginx + php-fpm ortida
#                       webhook oladi. Boshqa iloji yo'q.
#
# MUHIM: Telegram polling va webhook'ni BIR VAQTDA ishlatishga ruxsat
# bermaydi — webhook o'rnatilgan bo'lsa getUpdates xato qaytaradi. Shuning
# uchun polling rejimida deleteWebhook MAJBURIY chaqiriladi. Aks holda bot
# jimgina ishlamay turadi va sababi hech qayerda ko'rinmaydi.
# ────────────────────────────────────────────────────────────────────────
#
# admin_server beradigan ENV:
#   BOT_SLUG BOT_NAME BOT_RUNTIME BOT_MODE BOT_SOURCE BOT_PM2_NAME
#   BOT_ENV_B64          — .env mazmuni (ichida BOT_TOKEN bor)
#   BOT_TOKEN            — setWebhook/deleteWebhook uchun
#   REPO manbasi:     BOT_REPO_URL BOT_REPO_BRANCH GIT_TOKEN
#   TEMPLATE manbasi: BOT_TEMPLATE_DIR BOT_ENTRY_FILE
#   WEBHOOK rejimi:   BOT_WEBHOOK_URL BOT_WEBHOOK_SECRET BOT_PORT
#   BOT_ACTION       — bo'sh = to'liq deploy; "stop" | "start" | "logs"
#
# Global sozlamalar:
#   BOTS_ROOT (/root/bots), BOTS_BASE_DOMAIN, CERTBOT_EMAIL,
#   PHP_FPM_SOCK, NGINX_SITES, NGINX_ENABLED
#
set -euo pipefail

BOTS_ROOT="${BOTS_ROOT:-/root/bots}"
NGINX_SITES="${NGINX_SITES:-/etc/nginx/sites-available}"
NGINX_ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@example.uz}"
PHP_FPM_SOCK="${PHP_FPM_SOCK:-/run/php/php8.2-fpm.sock}"
BOT_LOG_LINES="${BOT_LOG_LINES:-200}"

req() {
  if [ -z "${!1:-}" ]; then
    echo "❌ ENV yo'q: $1" >&2
    exit 2
  fi
}

req BOT_SLUG
req BOT_RUNTIME
req BOT_MODE
req BOT_PM2_NAME

APP_DIR="${BOTS_ROOT}/${BOT_SLUG}"
BOT_DOMAIN=""
if [ "$BOT_MODE" = "WEBHOOK" ]; then
  BOT_DOMAIN="${BOT_SLUG}.${BOTS_BASE_DOMAIN:-}"
fi

# Telegram API chaqiruvi. Token buyruq qatorida ko'rinmasligi uchun URL
# o'zgaruvchida yig'iladi va chiqishda tokenni yulduzchalar bilan bekitamiz.
tg() {
  local method="$1"; shift
  local out
  out=$(curl -sS -m 15 "https://api.telegram.org/bot${BOT_TOKEN}/${method}" "$@" || true)
  echo "$out" | sed "s#${BOT_TOKEN}#***#g"
}

# ---------------------------------------------------------------------------
# Kichik amallar — to'liq deploy'siz
# ---------------------------------------------------------------------------
case "${BOT_ACTION:-}" in
  logs)
    if [ "$BOT_RUNTIME" = "NODEJS" ]; then
      pm2 logs "$BOT_PM2_NAME" --lines "$BOT_LOG_LINES" --nostream 2>&1 || \
        echo "pm2 process topilmadi: $BOT_PM2_NAME"
    else
      echo "--- nginx error log (oxirgi ${BOT_LOG_LINES} satr) ---"
      tail -n "$BOT_LOG_LINES" "/var/log/nginx/${BOT_SLUG}.error.log" 2>/dev/null || \
        echo "Log fayl hali yaratilmagan."
    fi
    exit 0
    ;;
  stop)
    echo "==> Bot to'xtatilmoqda: ${BOT_SLUG}"
    if [ "$BOT_RUNTIME" = "NODEJS" ]; then
      pm2 stop "$BOT_PM2_NAME" 2>/dev/null || echo "pm2 process topilmadi"
      pm2 save >/dev/null 2>&1 || true
    fi
    # Webhook botni to'xtatish = Telegram'ga xabar yubormaslikni aytish.
    # Fayllar joyida qoladi, "Ishga tushirish" ularni qayta ulaydi.
    if [ "$BOT_MODE" = "WEBHOOK" ] && [ -n "${BOT_TOKEN:-}" ]; then
      echo "==> deleteWebhook..."
      tg deleteWebhook
    fi
    echo "==> ✅ To'xtatildi"
    exit 0
    ;;
  start)
    echo "==> Bot ishga tushirilmoqda: ${BOT_SLUG}"
    if [ "$BOT_RUNTIME" = "NODEJS" ]; then
      pm2 start "$BOT_PM2_NAME" 2>/dev/null || {
        echo "❌ pm2 process yo'q — avval qayta deploy qiling"; exit 1;
      }
      pm2 save >/dev/null 2>&1 || true
      [ "$BOT_MODE" = "POLLING" ] && { echo "==> deleteWebhook (polling)..."; tg deleteWebhook; }
    fi
    if [ "$BOT_MODE" = "WEBHOOK" ]; then
      echo "==> setWebhook..."
      tg setWebhook \
        -d "url=${BOT_WEBHOOK_URL}" \
        -d "secret_token=${BOT_WEBHOOK_SECRET}"
    fi
    echo "==> ✅ Ishga tushdi"
    exit 0
    ;;
esac

# ---------------------------------------------------------------------------
# To'liq deploy
# ---------------------------------------------------------------------------
req BOT_SOURCE
req BOT_ENV_B64
req BOT_TOKEN

echo "==> 🤖 Bot deploy: ${BOT_SLUG}"
echo "    Til:    ${BOT_RUNTIME}"
echo "    Rejim:  ${BOT_MODE}"
echo "    Manba:  ${BOT_SOURCE}"
[ -n "$BOT_DOMAIN" ] && echo "    Domen:  ${BOT_DOMAIN}"

mkdir -p "$BOTS_ROOT"

# --- 1) Kod ---------------------------------------------------------------
echo "==> [1/6] Kod olinmoqda..."
if [ "$BOT_SOURCE" = "REPO" ]; then
  req BOT_REPO_URL
  BRANCH="${BOT_REPO_BRANCH:-main}"

  # Token URL ichiga FAQAT shu yerda qo'shiladi va `set -x` yoqilmagan,
  # shuning uchun u logga tushmaydi.
  AUTH_URL="$BOT_REPO_URL"
  if [ -n "${GIT_TOKEN:-}" ]; then
    AUTH_URL=$(echo "$BOT_REPO_URL" | sed -E "s#https://#https://${GIT_TOKEN}@#")
  fi

  if [ -d "$APP_DIR/.git" ]; then
    echo "    mavjud repo — yangilanmoqda (${BRANCH})"
    cd "$APP_DIR"
    git remote set-url origin "$AUTH_URL"
    git fetch origin "$BRANCH"
    # reset --hard: VPS'da qo'lda o'zgartirilgan fayl deploy'ni to'xtatib
    # qo'ymasligi kerak — manba haqiqati repoda.
    git reset --hard "origin/${BRANCH}"
    git clean -fd -e .env -e node_modules -e vendor
  else
    echo "    clone (${BRANCH})"
    rm -rf "$APP_DIR"
    git clone --depth 1 --branch "$BRANCH" "$AUTH_URL" "$APP_DIR"
  fi

  # Remote'da token qolib ketmasin — keyingi `git remote -v` uni ochib qo'yardi.
  cd "$APP_DIR" && git remote set-url origin "$BOT_REPO_URL"
else
  req BOT_TEMPLATE_DIR
  if [ ! -d "$BOT_TEMPLATE_DIR" ]; then
    echo "❌ Shablon papkasi topilmadi: $BOT_TEMPLATE_DIR" >&2
    exit 3
  fi
  echo "    shablon: ${BOT_TEMPLATE_DIR}"
  mkdir -p "$APP_DIR"
  # .env va bog'lamalarni saqlab qolgan holda kodni yangilaymiz
  rsync -a --delete \
    --exclude '.env' --exclude 'node_modules' --exclude 'vendor' \
    "$BOT_TEMPLATE_DIR"/ "$APP_DIR"/
fi

# --- 2) .env --------------------------------------------------------------
echo "==> [2/6] .env yozilmoqda..."
echo "$BOT_ENV_B64" | base64 -d > "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# --- 3) Bog'lamalar -------------------------------------------------------
echo "==> [3/6] Bog'lamalar..."
cd "$APP_DIR"
if [ "$BOT_RUNTIME" = "NODEJS" ]; then
  if [ -f package-lock.json ]; then
    env -u GIT_TOKEN npm ci --omit=dev
  else
    env -u GIT_TOKEN npm install --omit=dev
  fi
else
  if [ -f composer.json ]; then
    composer install --no-dev --no-interaction --optimize-autoloader
  else
    echo "    composer.json yo'q — o'tkazib yuborildi"
  fi
fi

# --- 4) Ishga tushirish ---------------------------------------------------
echo "==> [4/6] Ishga tushirilmoqda..."
if [ "$BOT_RUNTIME" = "NODEJS" ]; then
  # Kirish faylini topamiz: shablon aytgan fayl -> package.json main -> odatiy nomlar
  ENTRY="${BOT_ENTRY_FILE:-}"
  if [ -z "$ENTRY" ] || [ ! -f "$APP_DIR/$ENTRY" ]; then
    ENTRY=$(node -e "try{process.stdout.write(require('$APP_DIR/package.json').main||'')}catch(e){}" 2>/dev/null || true)
  fi
  for cand in "$ENTRY" index.js bot.js src/index.js src/bot.js app.js; do
    if [ -n "$cand" ] && [ -f "$APP_DIR/$cand" ]; then ENTRY="$cand"; break; fi
  done
  if [ -z "$ENTRY" ] || [ ! -f "$APP_DIR/$ENTRY" ]; then
    echo "❌ Kirish fayli topilmadi (index.js / bot.js / package.json main)" >&2
    exit 4
  fi
  echo "    kirish fayli: ${ENTRY}"

  # Qayta deploy'da eski process qoladi — uni almashtiramiz.
  pm2 delete "$BOT_PM2_NAME" >/dev/null 2>&1 || true
  pm2 start "$ENTRY" --name "$BOT_PM2_NAME" --cwd "$APP_DIR" --update-env
  pm2 save >/dev/null 2>&1 || true
else
  echo "    PHP — pm2 kerak emas, nginx+php-fpm ishlatiladi"
fi

# --- 5) Nginx + HTTPS (faqat webhook) -------------------------------------
if [ "$BOT_MODE" = "WEBHOOK" ]; then
  req BOTS_BASE_DOMAIN
  echo "==> [5/6] nginx vhost: ${BOT_DOMAIN}"
  VHOST="${NGINX_SITES}/${BOT_DOMAIN}"

  if [ "$BOT_RUNTIME" = "PHP" ]; then
    cat > "$VHOST" <<EOF
server {
    listen 80;
    server_name ${BOT_DOMAIN};
    root ${APP_DIR};
    index index.php;

    access_log /var/log/nginx/${BOT_SLUG}.access.log;
    error_log  /var/log/nginx/${BOT_SLUG}.error.log;

    # Telegram faqat shu yo'lga POST qiladi. Qolgan hamma narsa yopiq —
    # bot papkasidagi fayllar internetga ochilib qolmasligi kerak.
    location = /hook {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${PHP_FPM_SOCK};
        fastcgi_param SCRIPT_FILENAME ${APP_DIR}/index.php;
    }

    location / { return 404; }
}
EOF
  else
    cat > "$VHOST" <<EOF
server {
    listen 80;
    server_name ${BOT_DOMAIN};

    access_log /var/log/nginx/${BOT_SLUG}.access.log;
    error_log  /var/log/nginx/${BOT_SLUG}.error.log;

    location = /hook {
        proxy_pass http://127.0.0.1:${BOT_PORT}/hook;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Telegram-Bot-Api-Secret-Token \$http_x_telegram_bot_api_secret_token;
    }

    location / { return 404; }
}
EOF
  fi

  ln -sf "$VHOST" "${NGINX_ENABLED}/${BOT_DOMAIN}"
  nginx -t
  systemctl reload nginx

  # DNS'da *.BOTS_BASE_DOMAIN wildcard A yozuvi bo'lsa, HTTP-01 shu
  # subdomen uchun oddiy sertifikat oladi — wildcard SERTIFIKAT kerak emas
  # (u DNS-01 talab qilardi, --nginx uni bera olmaydi).
  if command -v certbot >/dev/null 2>&1; then
    echo "==> certbot: ${BOT_DOMAIN}"
    certbot --nginx -d "${BOT_DOMAIN}" \
      --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" --redirect || \
      echo "⚠️  certbot muvaffaqiyatsiz — DNS hali tarqalmagan bo'lishi mumkin."
  else
    echo "⚠️  certbot topilmadi — HTTPS o'rnatilmadi."
  fi
else
  echo "==> [5/6] Polling rejimi — nginx va sertifikat kerak emas."
fi

# --- 6) Telegram bilan bog'lash -------------------------------------------
echo "==> [6/6] Telegram sozlanmoqda..."
if [ "$BOT_MODE" = "WEBHOOK" ]; then
  echo "    setWebhook -> ${BOT_WEBHOOK_URL}"
  RESP=$(tg setWebhook -d "url=${BOT_WEBHOOK_URL}" -d "secret_token=${BOT_WEBHOOK_SECRET}")
  echo "    $RESP"
  case "$RESP" in
    *'"ok":true'*) ;;
    *) echo "❌ setWebhook muvaffaqiyatsiz" >&2; exit 5;;
  esac
else
  # Polling ishlashi uchun webhook BO'LMASLIGI shart.
  echo "    deleteWebhook (polling uchun majburiy)"
  echo "    $(tg deleteWebhook)"
fi

echo "==> ✅ Bot tayyor: ${BOT_SLUG}"
[ -n "$BOT_DOMAIN" ] && echo "    Webhook: https://${BOT_DOMAIN}/hook"
[ "$BOT_RUNTIME" = "NODEJS" ] && echo "    pm2:     ${BOT_PM2_NAME}"
exit 0
