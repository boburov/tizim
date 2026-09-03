#!/usr/bin/env bash
#
# reconfigure.sh — ishlab turgan tenantga o'zgarishni yetkazadi.
#
# provision.sh dan farqi: BU SKRIPT PAPKANI TOZALAMAYDI. U mavjud o'rnatmani
# joyida yangilaydi — shuning uchun mijoz sayti to'xtab qolmaydi va baza,
# yuklangan fayllar, git tarixi joyida qoladi.
#
# APPLY_MODE:
#   restart — server/.env qayta yoziladi + pm2 restart        (bir necha soniya)
#   rebuild — yuqoridagi + client/.env va client build        (1-2 daqiqa)
#   deploy  — kod GitHub repodan tortiladi, so'ng to'liq rebuild
#   push    — hech narsa qayta qurilmaydi, faqat kod GitHub'ga yuboriladi
#   suspend — obuna tugadi: pm2 jarayoni to'xtatiladi                (bir soniya)
#   resume  — to'lov keldi: pm2 jarayoni qaytariladi                 (bir soniya)
#
# admin_server beradigan ENV — provision.sh bilan bir xil to'plam,
# ustiga APPLY_MODE.
#
set -euo pipefail

TENANTS_ROOT="${TENANTS_ROOT:-/root/tenants}"
WEB_ROOT_BASE="${WEB_ROOT_BASE:-/var/www}"
WEB_USER="${WEB_USER:-www-data}"

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

APPLY_MODE="${APPLY_MODE:-restart}"
APP_DIR="${TENANTS_ROOT}/${TENANT_DB_NAME}"
WEB_ROOT="${WEB_ROOT_BASE}/${TENANT_DOMAIN}"

if [ ! -d "$APP_DIR" ]; then
  echo "❌ Tenant papkasi topilmadi: $APP_DIR" >&2
  echo "   Avval provisioning bajarilishi kerak." >&2
  exit 3
fi

echo "==> ⚙️  Qo'llash (${APPLY_MODE}): ${TENANT_DOMAIN}"

# ---------------------------------------------------------------------------
# 0) To'xtatish / qayta yoqish
#
# Bu ikki rejim fayllarga UMUMAN TEGMAYDI: `.env` qayta yozilmaydi, client
# qayta qurilmaydi, kod tortilmaydi. Faqat pm2 jarayoni to'xtaydi yoki
# qaytadi — shuning uchun bir soniyada bajariladi va baza, yuklangan
# fayllar, sertifikat joyida qoladi. To'lov kelishi bilan mijoz hech narsa
# yo'qotmagan holda ishlashda davom etadi.
#
# Sayt (statik client) o'chirilmaydi — nginx uni ko'rsatishda davom etadi,
# faqat API 502 qaytaradi. Bu ataylab: mijoz "sayt yo'qoldi" emas, "tizim
# to'xtatilgan" holatini ko'rishi kerak.
# ---------------------------------------------------------------------------
if [ "$APPLY_MODE" = "suspend" ]; then
  echo "==> ⏸  pm2 stop ${TENANT_PM2_NAME} — sabab: ${SUSPEND_REASON:-obuna tugadi}"
  # Jarayon allaqachon to'xtagan yoki ro'yxatda yo'q bo'lishi mumkin —
  # bu xato emas, natija baribir bir xil.
  pm2 stop "$TENANT_PM2_NAME" || true
  pm2 save >/dev/null 2>&1 || true
  echo "==> ✅ To'xtatildi: ${TENANT_DOMAIN}"
  exit 0
fi

if [ "$APPLY_MODE" = "resume" ]; then
  echo "==> ▶️  pm2 start ${TENANT_PM2_NAME}"
  # `pm2 start <nom>` faqat ro'yxatda turgan jarayonni qaytaradi. VPS qayta
  # yuklangan va `pm2 resurrect` bo'lmagan bo'lsa ro'yxat bo'sh bo'ladi —
  # o'shanda jarayonni papkadan qaytadan ko'taramiz.
  if ! pm2 start "$TENANT_PM2_NAME" --update-env 2>/dev/null; then
    echo "    (ro'yxatda yo'q — papkadan qayta ishga tushirilmoqda)"
    cd "$APP_DIR/server"
    # NestJS entrypoint (eski Express `src/index.js` mavjud emas).
    pm2 start dist/main.js --name "$TENANT_PM2_NAME" --update-env
  fi
  pm2 save >/dev/null 2>&1 || true
  echo "==> ✅ Qayta yoqildi: ${TENANT_DOMAIN}"
  exit 0
fi

write_b64() {
  local b64="$1" dest="$2"
  [ -z "$b64" ] && return 0
  mkdir -p "$(dirname "$dest")"
  printf '%s' "$b64" | base64 -d > "$dest"
}

# ---------------------------------------------------------------------------
# 1) Kodni repodan tortish (faqat `deploy` rejimida)
#
# Repo — kod uchun haqiqat manbai, shuning uchun mahalliy o'zgarishlar
# tashlab yuboriladi. `.env`, `node_modules` va `uploads` git nazoratida
# emas — ular `reset --hard` dan keyin ham joyida qoladi.
# ---------------------------------------------------------------------------
if [ "$APPLY_MODE" = "deploy" ]; then
  if [ ! -d "$APP_DIR/.git" ] || [ -z "${GIT_REMOTE:-}" ]; then
    echo "❌ Bu tenantda GitHub repo ulanmagan — deploy bajarilmaydi" >&2
    exit 4
  fi

  echo "==> 📥 Kod repodan tortilmoqda: ${GIT_BRANCH:-main}"
  cd "$APP_DIR"

  ASKPASS="$(mktemp)"
  trap 'rm -f "$ASKPASS"' EXIT
  cat > "$ASKPASS" <<'ASKPASS_EOF'
#!/usr/bin/env bash
case "$1" in
  Username*) echo "x-access-token" ;;
  Password*) echo "${GIT_TOKEN}" ;;
esac
ASKPASS_EOF
  chmod 700 "$ASKPASS"

  GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0 \
    git fetch --depth=1 origin "${GIT_BRANCH:-main}"
  git reset --hard "origin/${GIT_BRANCH:-main}"

  echo "    Yangi commit: $(git rev-parse --short HEAD)"
fi

# ---------------------------------------------------------------------------
# 2) .env fayllari — admin server har doim haqiqat manbai
#
# Kripto sirlari mavjud fayldan OLINADI. Ularni qayta yaratish barcha
# foydalanuvchini tizimdan chiqarib yuborardi — oddiy sozlama o'zgarishi
# uchun bu juda qattiq narx.
# ---------------------------------------------------------------------------
OLD_ENV="$APP_DIR/server/.env"
grab() {
  if [ -f "$OLD_ENV" ]; then
    sed -n "s/^$1=//p" "$OLD_ENV" | head -n1 | tr -d '"' || true
  fi
}

if [ "$APPLY_MODE" != "push" ] && [ -n "${TENANT_SERVER_ENV_B64:-}" ]; then
  JWT_ACCESS_SECRET="$(grab JWT_ACCESS_SECRET)"
  JWT_REFRESH_SECRET="$(grab JWT_REFRESH_SECRET)"
  COOKIE_SECRET="$(grab COOKIE_SECRET)"

  gen_secret() { openssl rand -hex 32; }
  [ -z "$JWT_ACCESS_SECRET" ] && JWT_ACCESS_SECRET="$(gen_secret)"
  [ -z "$JWT_REFRESH_SECRET" ] && JWT_REFRESH_SECRET="$(gen_secret)"
  [ -z "$COOKIE_SECRET" ] && COOKIE_SECRET="$(gen_secret)"

  echo "==> server/.env yangilanmoqda..."
  TMP_ENV="$(mktemp)"
  printf '%s' "$TENANT_SERVER_ENV_B64" | base64 -d > "$TMP_ENV"
  cat >> "$TMP_ENV" <<EOF

# --- Kripto sirlari (shu serverda yaratilgan, admin bazasida yo'q) ---
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
COOKIE_SECRET=${COOKIE_SECRET}
EOF
  # Atomik almashtirish — server yarim yozilgan .env ni o'qib qolmasin
  mv "$TMP_ENV" "$APP_DIR/server/.env"
  chmod 600 "$APP_DIR/server/.env"
fi

if [ "$APPLY_MODE" = "rebuild" ] || [ "$APPLY_MODE" = "deploy" ]; then
  if [ -n "${TENANT_CLIENT_ENV_B64:-}" ]; then
    echo "==> client/.env yangilanmoqda..."
    write_b64 "$TENANT_CLIENT_ENV_B64" "$APP_DIR/client/.env"
    chmod 600 "$APP_DIR/client/.env"
  fi
fi

# Repo fayllari har doim yangilanadi (README, tenant.json, workflow) —
# ular brend/domen o'zgarishini aks ettiradi.
write_b64 "${TENANT_GITIGNORE_B64:-}"   "$APP_DIR/.gitignore"
write_b64 "${TENANT_ENV_EXAMPLE_B64:-}" "$APP_DIR/.env.example"
write_b64 "${TENANT_META_B64:-}"        "$APP_DIR/tenant.json"
write_b64 "${TENANT_README_B64:-}"      "$APP_DIR/README.md"
write_b64 "${TENANT_WORKFLOW_B64:-}"    "$APP_DIR/.github/workflows/deploy.yml"

# ---------------------------------------------------------------------------
# 3) Bog'lamalar va build
# ---------------------------------------------------------------------------
if [ "$APPLY_MODE" = "deploy" ]; then
  echo "==> server: bog'lamalar yangilanmoqda..."
  cd "$APP_DIR/server"
  # --omit=dev QO'YMANG: `nest build` uchun @nestjs/cli va typescript kerak.
  npm ci 2>/dev/null || npm install

  # Repodan yangi kod keldi — u yangi migratsiya bilan kelgan bo'lishi mumkin.
  # Migratsiyasiz eski schema ustida ko'tarilsa, xato faqat ish vaqtida
  # chiqadi va sababi ko'rinmaydi.
  echo "==> server: prisma migrate deploy + generate..."
  npx prisma migrate deploy
  npx prisma generate

  # Kompilyatsiya. Busiz `git pull` qilingan kod hech qachon ishga tushmaydi:
  # pm2 eski dist/main.js ni qayta ishga tushirib, "deploy muvaffaqiyatli"
  # deb ko'rsatardi.
  echo "==> server: build..."
  npm run build
fi

if [ "$APPLY_MODE" = "rebuild" ] || [ "$APPLY_MODE" = "deploy" ]; then
  echo "==> client: build..."
  cd "$APP_DIR/client"

  if [ ! -d node_modules ] || [ "$APPLY_MODE" = "deploy" ]; then
    npm ci 2>/dev/null || npm install
  fi

  npm run build

  # Yangi build tayyor bo'lgandan KEYIN almashtiramiz: eski papkani
  # oldin tozalab qo'ysak, build yiqilganda sayt butunlay yo'qolardi.
  echo "==> client dist -> $WEB_ROOT"
  mkdir -p "$WEB_ROOT"
  rm -rf "${WEB_ROOT:?}"/*
  cp -r dist/* "$WEB_ROOT"/
  chown -R "$WEB_USER":"$WEB_USER" "$WEB_ROOT"
fi

# ---------------------------------------------------------------------------
# 4) Serverni qayta ishga tushirish
# ---------------------------------------------------------------------------
if [ "$APPLY_MODE" != "push" ]; then
  echo "==> pm2 restart ${TENANT_PM2_NAME}..."
  # --update-env SHART: usiz pm2 eski jarayon muhitini saqlab qoladi va
  # yangi .env umuman o'qilmaydi.
  pm2 restart "$TENANT_PM2_NAME" --update-env
  pm2 save >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------------
# 5) GitHub'ga yuborish
#
# `deploy` rejimida yubormaymiz — kod allaqachon repodan kelgan, qaytarib
# yuborish bo'sh commit yoki halqa hosil qilardi.
# ---------------------------------------------------------------------------
if [ "${GIT_ENABLED:-false}" = "true" ] && [ -n "${GIT_REMOTE:-}" ] \
   && [ "$APPLY_MODE" != "deploy" ]; then
  echo "==> 📦 Kod GitHub'ga yuborilmoqda..."
  MSG="Sozlama yangilandi (${APPLY_MODE}): ${TENANT_DOMAIN}"
  [ "$APPLY_MODE" = "push" ] && MSG="Kod sinxronlandi: ${TENANT_DOMAIN}"

  if bash "$SCRIPT_DIR/git-sync.sh" "$APP_DIR" "$MSG"; then
    echo "GIT_PUSH_OK"
  else
    echo "GIT_PUSH_FAILED"
  fi
fi

echo "==> ✅ Qo'llash tugadi: ${TENANT_DOMAIN}"
