#!/usr/bin/env bash
#
# MUZLATILGAN ROL TEKSHIRUVI (login 403 / refresh 401).
#
# NEGA SHELL: NestJS'ni QAYTA ISHGA TUSHIRISH kerak. Rol keshi
# JARAYONGA XOS (5 daqiqa) va Express muzlatgach o'z keshini tozalaydi,
# NestJS esa bundan XABARSIZ qoladi. Jarayon boshqaruvini test faylining
# ichiga qo'yish ishonchsiz bo'ldi (osilib qolish, port bo'shamasligi) —
# shuning uchun u shu yerda, tasdiqlash esa alohida node skriptida.
#
# ⚠ ROL HAR QANDAY HOLATDA MUZLATISHDAN CHIQARILADI (trap).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

EXPRESS=http://127.0.0.1:5000
ROLE=qa_staff

tok() { curl -s -X POST $EXPRESS/api/auth/login -H 'content-type: application/json' \
  -d '{"login":"owner","password":"owner123"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['accessToken'])"; }

TOKEN="$(tok)"
[ -n "$TOKEN" ] || { echo "owner tokeni olinmadi"; exit 1; }

setfrozen() {
  curl -s -X PATCH "$EXPRESS/api/roles/$ROLE/freeze" \
    -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d "$1" -o /dev/null -w '%{http_code}'
}

restart_nest() {
  kill -TERM "$(lsof -ti:5001)" 2>/dev/null || true
  for _ in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:5001/api/health 2>/dev/null || break; sleep 0.25; done
  sleep 0.5
  (node dist/main.js > /tmp/nest.log 2>&1 &)
  for _ in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:5001/api/health 2>/dev/null && return 0; sleep 0.5; done
  return 1
}

cleanup() {
  echo; echo "── tozalash: rolni muzlatishdan chiqaramiz ──"
  setfrozen '{"isFrozen":false}' | sed 's/^/  unfreeze HTTP /'
  echo
  restart_nest && echo "  nest qayta ishga tushdi" || echo "  ⚠ nest ko'tarilmadi"
  node test/frozen-role-assert.mjs thawed | grep -E '✅|❌'
}
trap cleanup EXIT

echo "── 0) ikkala stek tirikligiga ishonch hosil qilamiz ──"
curl -sf -o /dev/null $EXPRESS/api/health || { echo "  ❌ Express javob bermayapti"; exit 1; }
curl -sf -o /dev/null http://127.0.0.1:5001/api/health 2>/dev/null || restart_nest || { echo "  ❌ nest ko'tarilmadi"; exit 1; }
echo "  ✅ tayyor"

echo; echo "── 1) muzlatishdan OLDIN sessiya olamiz ──"
OUT="$(node test/frozen-role-assert.mjs thawed)"
echo "$OUT" | grep -E '✅|❌'
COOKIE_E="$(echo "$OUT" | grep '^COOKIE_E=' | cut -d= -f2-)"
COOKIE_N="$(echo "$OUT" | grep '^COOKIE_N=' | cut -d= -f2-)"

echo; echo "── 2) rolni muzlatamiz (FAQAT Express — yagona yozuvchi) ──"
echo "  freeze HTTP $(setfrozen '{"isFrozen":true,"reason":"Parity test"}')"

echo; echo "── 3) NestJS qayta ishga tushadi (kesh yangilanadi) ──"
restart_nest && echo "  ✅ tayyor" || { echo "  ❌ ko'tarilmadi"; exit 1; }

echo; echo "── 4) tekshiruv ──"
node test/frozen-role-assert.mjs frozen "$COOKIE_E" "$COOKIE_N"
