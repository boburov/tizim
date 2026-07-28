#!/usr/bin/env bash
#
# deprovision.sh — tenant (o'quv markaz) ni VPS'dan butunlay o'chiradi.
# provision.sh ning teskarisi. admin_server buni ENV orqali chaqiradi.
#
# admin_server beradigan ENV:
#   TENANT_DB_NAME, TENANT_DOMAIN, TENANT_PM2_NAME
#
# Global sozlamalar (provision.sh bilan bir xil bo'lishi SHART):
#   MONGO_BASE_URL, TENANTS_ROOT, WEB_ROOT_BASE, NGINX_SITES, NGINX_ENABLED
#
# MUHIM: bu skript `set -e` ISHLATMAYDI. Sabab — o'chirishda ba'zi resurslar
# allaqachon yo'q bo'lishi mumkin (masalan certbot sertifikat olinmagan bo'lsa).
# Bitta qadam yiqilsa ham qolganlari bajarilishi kerak, aks holda yarim
# o'chirilgan tenant qolib ketadi. Har qadam alohida hisoblanadi.

set -uo pipefail

MONGO_BASE_URL="${MONGO_BASE_URL:-mongodb://127.0.0.1:27017}"
TENANTS_ROOT="${TENANTS_ROOT:-/root/tenants}"
WEB_ROOT_BASE="${WEB_ROOT_BASE:-/var/www}"
NGINX_SITES="${NGINX_SITES:-/etc/nginx/sites-available}"
NGINX_ENABLED="${NGINX_ENABLED:-/etc/nginx/sites-enabled}"

req() {
  if [ -z "${!1:-}" ]; then
    echo "❌ ENV yo'q: $1" >&2
    exit 2
  fi
}
req TENANT_DB_NAME
req TENANT_DOMAIN
req TENANT_PM2_NAME

APP_DIR="${TENANTS_ROOT}/${TENANT_DB_NAME}"
WEB_ROOT="${WEB_ROOT_BASE}/${TENANT_DOMAIN}"
VHOST="${NGINX_SITES}/${TENANT_DOMAIN}"

# Xavfsizlik: bo'sh yoki "/" ga teng yo'lni hech qachon o'chirmaymiz.
safe_rm() {
  local target="$1"
  if [ -z "$target" ] || [ "$target" = "/" ] || [ "${#target}" -lt 8 ]; then
    echo "⚠️  Xavfli yo'l, o'tkazib yuborildi: '$target'"
    return 1
  fi
  rm -rf "$target"
}

FAILED_STEPS=""
step_failed() { FAILED_STEPS="${FAILED_STEPS}\n  - $1"; }

echo "==> 🗑  Deprovisioning: ${TENANT_DOMAIN}"
echo "    DB:   ${TENANT_DB_NAME}"
echo "    PM2:  ${TENANT_PM2_NAME}"

# --- 1) PM2 process to'xtatish va o'chirish ---
echo "==> [1/6] pm2 delete ${TENANT_PM2_NAME}..."
if pm2 delete "$TENANT_PM2_NAME" >/dev/null 2>&1; then
  pm2 save >/dev/null 2>&1 || true
  echo "    ✅ pm2 process o'chirildi"
else
  echo "    ℹ️  pm2 process topilmadi (allaqachon o'chirilgan bo'lishi mumkin)"
fi

# --- 2) MongoDB bazasini drop qilish ---
# Avval mongosh, bo'lmasa eski mongo klientini sinaymiz.
echo "==> [2/6] MongoDB drop: ${TENANT_DB_NAME}..."
MONGO_TARGET="${MONGO_BASE_URL}/${TENANT_DB_NAME}"
if command -v mongosh >/dev/null 2>&1; then
  if mongosh "$MONGO_TARGET" --quiet --eval 'db.dropDatabase()' >/dev/null 2>&1; then
    echo "    ✅ baza drop qilindi (mongosh)"
  else
    echo "    ❌ mongosh bilan drop qilib bo'lmadi"
    step_failed "MongoDB drop (${TENANT_DB_NAME})"
  fi
elif command -v mongo >/dev/null 2>&1; then
  if mongo "$MONGO_TARGET" --quiet --eval 'db.dropDatabase()' >/dev/null 2>&1; then
    echo "    ✅ baza drop qilindi (mongo)"
  else
    echo "    ❌ mongo bilan drop qilib bo'lmadi"
    step_failed "MongoDB drop (${TENANT_DB_NAME})"
  fi
else
  echo "    ❌ mongosh/mongo topilmadi — bazani QO'LDA o'chiring: ${TENANT_DB_NAME}"
  step_failed "MongoDB klienti yo'q (${TENANT_DB_NAME} qo'lda o'chirilsin)"
fi

# --- 3) Nginx vhost o'chirish (symlink + config) ---
echo "==> [3/6] nginx config o'chirilmoqda..."
rm -f "${NGINX_ENABLED}/${TENANT_DOMAIN}" 2>/dev/null || true
rm -f "$VHOST" 2>/dev/null || true
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1 || service nginx reload >/dev/null 2>&1 || true
    echo "    ✅ nginx config o'chirildi va reload qilindi"
  else
    echo "    ⚠️  nginx -t xato berdi — reload qilinmadi, configni tekshiring"
    step_failed "nginx reload (config test xatosi)"
  fi
else
  echo "    ℹ️  nginx topilmadi"
fi

# --- 4) SSL sertifikatni o'chirish ---
echo "==> [4/6] certbot sertifikat o'chirilmoqda..."
if command -v certbot >/dev/null 2>&1; then
  if certbot delete --cert-name "$TENANT_DOMAIN" --non-interactive >/dev/null 2>&1; then
    echo "    ✅ sertifikat o'chirildi"
  else
    echo "    ℹ️  sertifikat topilmadi (olinmagan bo'lishi mumkin)"
  fi
else
  echo "    ℹ️  certbot topilmadi"
fi

# --- 5) Ilova papkasi ---
echo "==> [5/6] ilova papkasi: ${APP_DIR}"
if [ -d "$APP_DIR" ]; then
  if safe_rm "$APP_DIR"; then
    echo "    ✅ o'chirildi"
  else
    step_failed "APP_DIR o'chirish (${APP_DIR})"
  fi
else
  echo "    ℹ️  papka yo'q"
fi

# --- 6) Client build (web root) ---
echo "==> [6/6] web root: ${WEB_ROOT}"
if [ -d "$WEB_ROOT" ]; then
  if safe_rm "$WEB_ROOT"; then
    echo "    ✅ o'chirildi"
  else
    step_failed "WEB_ROOT o'chirish (${WEB_ROOT})"
  fi
else
  echo "    ℹ️  papka yo'q"
fi

if [ -n "$FAILED_STEPS" ]; then
  echo ""
  echo "⚠️  Deprovisioning tugadi, LEKIN ba'zi qadamlar bajarilmadi:"
  echo -e "$FAILED_STEPS"
  echo ""
  echo "Yuqoridagilarni qo'lda tekshiring."
  exit 1
fi

echo ""
echo "==> ✅ Deprovisioning to'liq tugadi: ${TENANT_DOMAIN}"
