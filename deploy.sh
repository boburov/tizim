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

echo "==> 🚀 Deploy boshlandi: $(date)"

cd "$REPO_DIR"

# 1) Oxirgi kodni tortish
OLD_COMMIT="$(git rev-parse HEAD)"
echo "==> git pull..."
git pull --ff-only
NEW_COMMIT="$(git rev-parse HEAD)"

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

# package-lock o'zgargan bo'lsa yoki node_modules yo'q bo'lsa paket o'rnatamiz
if [ ! -d "node_modules" ] || changed "server/package-lock.json"; then
  echo "==> server: npm install..."
  npm install
fi

echo "==> pm2 restart $PM2_APP..."
pm2 restart "$PM2_APP" --update-env
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

echo "==> ✅ Tayyor! Commit: ${NEW_COMMIT:0:7}"
echo "    Server: pm2 $PM2_APP"
echo "    Client: https://tizim.nester.uz"
