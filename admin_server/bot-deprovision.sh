#!/usr/bin/env bash
#
# bot-deprovision.sh — botni VPS'dan butunlay o'chiradi.
# bot-provision.sh ning teskarisi.
#
# MUHIM: bu skript `set -e` ISHLATMAYDI (deprovision.sh dagi kabi).
# O'chirishda ba'zi resurslar allaqachon yo'q bo'lishi mumkin — masalan
# polling botda nginx vhost umuman yaratilmagan, yoki certbot sertifikat
# olmagan. Bitta qadam yiqilsa ham qolganlari bajarilishi kerak, aks holda
# yarim o'chirilgan bot qolib ketadi.
#
# admin_server beradigan ENV:
#   BOT_SLUG BOT_RUNTIME BOT_MODE BOT_PM2_NAME BOT_TOKEN BOT_DOMAIN
#
# Global sozlamalar (bot-provision.sh bilan bir xil bo'lishi SHART):
#   BOTS_ROOT, NGINX_SITES, NGINX_ENABLED

BOTS_ROOT="${BOTS_ROOT:-/root/bots}"
NGINX_SITES="${NGINX_SITES:-/etc/nginx/sites-available}"
NGINX_ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled}"

if [ -z "${BOT_SLUG:-}" ]; then
  echo "❌ ENV yo'q: BOT_SLUG" >&2
  exit 2
fi

APP_DIR="${BOTS_ROOT}/${BOT_SLUG}"
FAILED_STEPS=""

note_fail() { FAILED_STEPS="${FAILED_STEPS} $1"; echo "⚠️  $1 bajarilmadi"; }

echo "==> 🗑  Bot o'chirilmoqda: ${BOT_SLUG}"

# --- 1) Telegram: webhook'ni olib tashlash --------------------------------
# BIRINCHI navbatda: bot o'chirilayotganda Telegram unga xabar yuborishda
# davom etmasligi kerak.
echo "==> [1/5] deleteWebhook..."
if [ -n "${BOT_TOKEN:-}" ]; then
  curl -sS -m 15 "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook" \
    | sed "s#${BOT_TOKEN}#***#g" || note_fail "deleteWebhook"
else
  echo "    token yo'q — o'tkazib yuborildi"
fi
echo

# --- 2) pm2 process -------------------------------------------------------
echo "==> [2/5] pm2 delete ${BOT_PM2_NAME:-}..."
if [ "${BOT_RUNTIME:-}" = "NODEJS" ] && [ -n "${BOT_PM2_NAME:-}" ]; then
  pm2 delete "$BOT_PM2_NAME" 2>/dev/null || echo "    process topilmadi (allaqachon yo'q)"
  pm2 save >/dev/null 2>&1 || true
else
  echo "    pm2 process yo'q (PHP yoki nom berilmagan)"
fi

# --- 3) Nginx vhost -------------------------------------------------------
echo "==> [3/5] nginx vhost..."
if [ -n "${BOT_DOMAIN:-}" ]; then
  rm -f "${NGINX_ENABLED}/${BOT_DOMAIN}" || note_fail "symlink o'chirish"
  rm -f "${NGINX_SITES}/${BOT_DOMAIN}" || note_fail "vhost o'chirish"
  if nginx -t 2>/dev/null; then
    systemctl reload nginx || note_fail "nginx reload"
  else
    note_fail "nginx konfiguratsiyasi buzuq — reload qilinmadi"
  fi
else
  echo "    domen yo'q (polling bot) — o'tkazib yuborildi"
fi

# --- 4) Certbot sertifikati ----------------------------------------------
echo "==> [4/5] sertifikat..."
if [ -n "${BOT_DOMAIN:-}" ] && command -v certbot >/dev/null 2>&1; then
  certbot delete --cert-name "$BOT_DOMAIN" --non-interactive 2>/dev/null || \
    echo "    sertifikat topilmadi (olinmagan bo'lishi mumkin)"
else
  echo "    o'tkazib yuborildi"
fi

# --- 5) Papka -------------------------------------------------------------
# Xavfsizlik: bo'sh, "/" yoki BOTS_ROOT ning o'ziga teng yo'lni HECH QACHON
# o'chirmaymiz — noto'g'ri ENV butun serverni o'chirib yuborishi mumkin.
echo "==> [5/5] papka: ${APP_DIR}"
if [ -z "$APP_DIR" ] || [ "$APP_DIR" = "/" ] || [ "$APP_DIR" = "$BOTS_ROOT" ]; then
  note_fail "papka yo'li xavfli ko'rindi — o'chirilmadi"
elif [ -d "$APP_DIR" ]; then
  rm -rf "$APP_DIR" || note_fail "papka o'chirish"
else
  echo "    papka yo'q (allaqachon o'chirilgan)"
fi

# Nginx loglari qoladi — ular tarix va tekshiruv uchun kerak bo'lishi mumkin.
echo
if [ -n "$FAILED_STEPS" ]; then
  echo "==> ⚠️  Tugadi, lekin ba'zi qadamlar bajarilmadi:${FAILED_STEPS}"
  exit 1
fi
echo "==> ✅ Bot butunlay o'chirildi: ${BOT_SLUG}"
exit 0
