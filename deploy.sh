#!/usr/bin/env bash
#
# To'liq deploy: GitHub'dan kod tortadi, server (pm2) va client (nginx) ni yangilaydi.
# GitHub Actions SSH orqali shu skriptni chaqiradi. Qo'lda ham ishlaydi:
#   bash /root/tizim/deploy.sh
#
set -euo pipefail

# --- Sozlamalar ---
REPO_DIR="/root/tizim"
CLIENT_DIR="$REPO_DIR/client"
SERVER_DIR="$REPO_DIR/server"
WEB_ROOT="/var/www/tizim.nester.uz"
WEB_USER="www-data"
PM2_APP="tizim-api"

# --- Admin panel sozlamalari ---
ADMIN_SERVER_DIR="$REPO_DIR/admin_server"   # NestJS + Prisma (port 4000)
ADMIN_CLIENT_DIR="$REPO_DIR/admin_client"   # Vite SPA
ADMIN_WEB_ROOT="/var/www/nester.uz"         # nester.uz nginx root
ADMIN_PM2_APP="admin-api"

echo "==> 🚀 Deploy boshlandi: $(date)"

cd "$REPO_DIR"

# 1) Oxirgi kodni tortish
# SKIP_PULL=1 bo'lsa git pull o'tkazib yuboriladi (kod qo'lda tortilgan yoki
# pull ishlamayotgan holatlar uchun). Bunda OLD/NEW COMMIT bir xil bo'ladi,
# ya'ni "o'zgarish yo'q" deb hisoblanadi, lekin build baribir davom etadi.
OLD_COMMIT="$(git rev-parse HEAD)"
if [ "${SKIP_PULL:-0}" = "1" ]; then
  echo "==> git pull O'TKAZIB YUBORILDI (SKIP_PULL=1)."
  NEW_COMMIT="$OLD_COMMIT"
else
  echo "==> git pull..."
  git pull --ff-only
  NEW_COMMIT="$(git rev-parse HEAD)"
fi

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
  echo "==> Yangi commit yo'q, lekin baribir qayta build qilamiz."
fi

# Qaysi papkada o'zgarish borligini aniqlash uchun yordamchi
changed() {
  git diff --name-only "$OLD_COMMIT" "$NEW_COMMIT" -- "$1" | grep -q . && return 0 || return 1
}

# ---------------------------------------------------------------------------
# 2) SERVER (backend) — pm2
# ---------------------------------------------------------------------------
echo "==> Server yangilanyapti..."
cd "$SERVER_DIR"

# package-lock o'zgargan bo'lsa, node_modules yo'q bo'lsa YOKI nest CLI yo'q bo'lsa
# paket o'rnatamiz. `--include=dev` MAJBURIY: `nest build` uchun devDependencies
# (@nestjs/cli, typescript) kerak; production o'rnatmasi ularni tashlab ketadi.
if [ ! -d "node_modules" ] || [ ! -x "node_modules/.bin/nest" ] || changed "server/package-lock.json"; then
  echo "==> server: npm install (dev deps ham — nest build uchun kerak)..."
  npm install --include=dev
fi

# Prisma: client generatsiya + kutilayotgan migratsiyalarni qo'llash.
# DIQQAT: npm install'ning postinstall (prisma generate) xavfsizlik (allow-scripts)
# tufayli ishlamasligi mumkin, shuning uchun bu yerda ATAYLAB qo'lda chaqiramiz.
# Ikkalasi ham idempotent: yangi migratsiya bo'lmasa hech narsa o'zgarmaydi.
echo "==> server: prisma generate + migrate deploy..."
npx prisma generate
npx prisma migrate deploy

# NestJS TypeScript'ni dist/main.js ga kompilyatsiya qiladi. Bu qadam
# Express'da kerak emas edi (u src'ni to'g'ridan ishlatardi) — cutover'dan
# keyin SHART: bo'lmasa pm2 eski/yo'q faylni ishga tushiradi.
echo "==> server: nest build..."
npm run build

echo "==> pm2 startOrReload ($PM2_APP)..."
# `pm2 restart` MAVJUD jarayonning eski script yo'lini (Express src/index.js)
# saqlab qolardi. ecosystem fayl orqali startOrReload to'g'ri yo'lni
# (dist/main.js) va cwd'ni kafolatlaydi.
pm2 startOrReload "$REPO_DIR/ecosystem.config.cjs" --only "$PM2_APP" --update-env
pm2 save >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 3) CLIENT (frontend) — build + nginx
# ---------------------------------------------------------------------------
echo "==> Client yangilanyapti..."
cd "$CLIENT_DIR"

if [ ! -d "node_modules" ] || changed "client/package-lock.json"; then
  echo "==> client: npm install..."
  npm install
fi

echo "==> client: npm run build..."
npm run build

echo "==> $WEB_ROOT ga ko'chirilyapti..."
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*
cp -r dist/* "$WEB_ROOT"/
chown -R "$WEB_USER":"$WEB_USER" "$WEB_ROOT"

# ---------------------------------------------------------------------------
# 4) ADMIN SERVER (admin_server) — NestJS + Prisma + pm2
# ---------------------------------------------------------------------------
echo "==> Admin server yangilanyapti..."
cd "$ADMIN_SERVER_DIR"

# package-lock o'zgargan bo'lsa, node_modules yo'q bo'lsa YOKI nest CLI yo'q bo'lsa
# paket o'rnatamiz (`--include=dev` — nest build uchun).
if [ ! -d "node_modules" ] || [ ! -x "node_modules/.bin/nest" ] || changed "admin_server/package-lock.json"; then
  echo "==> admin_server: npm install (dev deps ham)..."
  npm install --include=dev
fi

# Prisma: client generatsiya + kutilayotgan migratsiyalarni qo'llash (ikkalasi ham idempotent)
echo "==> admin_server: prisma generate + migrate deploy..."
npx prisma generate
npx prisma migrate deploy

echo "==> admin_server: nest build..."
npm run build

echo "==> pm2 startOrReload ($ADMIN_PM2_APP)..."
pm2 startOrReload "$REPO_DIR/ecosystem.config.cjs" --only "$ADMIN_PM2_APP" --update-env
pm2 save >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 5) ADMIN CLIENT (admin_client) — Vite build + nginx
# ---------------------------------------------------------------------------
echo "==> Admin client yangilanyapti..."
cd "$ADMIN_CLIENT_DIR"

if [ ! -d "node_modules" ] || changed "admin_client/package-lock.json"; then
  echo "==> admin_client: npm install..."
  npm install
fi

echo "==> admin_client: npm run build..."
npm run build

echo "==> $ADMIN_WEB_ROOT ga ko'chirilyapti..."
mkdir -p "$ADMIN_WEB_ROOT"
rm -rf "${ADMIN_WEB_ROOT:?}"/*
cp -r dist/* "$ADMIN_WEB_ROOT"/
chown -R "$WEB_USER":"$WEB_USER" "$ADMIN_WEB_ROOT"

echo "==> ✅ Tayyor! Commit: ${NEW_COMMIT:0:7}"
echo "    Server:       pm2 $PM2_APP"
echo "    Client:       https://tizim.nester.uz"
echo "    Admin server: pm2 $ADMIN_PM2_APP (port 4000)"
echo "    Admin client: https://nester.uz"
