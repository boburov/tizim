#!/usr/bin/env bash
#
# BAZANI TOZALASH + OWNER SEED - bitta buyruq.
#
#   npm run db:reset                  # so'raydi, keyin tozalaydi va owner yaratadi
#   npm run db:reset -- -y            # so'ramaydi (CI uchun)
#   npm run db:reset -- --drop        # kolleksiyalarni butunlay drop qiladi
#   npm run db:reset -- --keep-auth   # ruxsat/rol/owner saqlanadi
#   npm run db:reset -- --force-remote   # masofaviy bazaga ham ruxsat
#
# NEGA SHELL, npm script EMAS: `npm run x -- --db=nom` argumentni zanjirdagi
# OXIRGI buyruqqa qo'shadi, ya'ni tasdiq bayrog'i tozalash script'iga emas,
# owner seed'ga tushib ketardi. Bu yerda esa baza nomi .env dan O'QILADI va
# tozalash script'iga aniq uzatiladi.
#
# XAVFSIZLIK: baza nomi bu yerda faqat TAKLIF qilinadi - haqiqiy to'siq
# cleanDatabase.seed.js ichida. U ulangan bazaning nomi bilan solishtiradi
# va mos kelmasa hech narsaga tegmaydi.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# --- Bayroqlarni ajratish ---
# `-y` faqat SHU script'niki (savolni o'tkazib yuborish). Qolgani
# cleanDatabase.seed.js ga uzatiladi.
SKIP_PROMPT=0
CLEAN_ARGS=()
for arg in "$@"; do
  case "$arg" in
    -y|--yes) SKIP_PROMPT=1 ;;
    *) CLEAN_ARGS+=("$arg") ;;
  esac
done

# --- Baza nomini aniqlash ---
# Muhitdagi MONGO_URL ustun (masalan: MONGO_URL=... npm run db:reset).
if [ -z "${MONGO_URL:-}" ] && [ -f .env ]; then
  MONGO_URL=$(grep -E '^[[:space:]]*MONGO_URL=' .env | head -1 | cut -d '=' -f2- | tr -d '"'\''\r' | xargs)
fi

if [ -z "${MONGO_URL:-}" ]; then
  echo "XATO: MONGO_URL topilmadi (.env da ham, muhitda ham)." >&2
  exit 1
fi

DB_NAME="${MONGO_URL##*/}"   # oxirgi "/" dan keyingi qism
DB_NAME="${DB_NAME%%\?*}"    # "?" dan oldingi qism (query parametrlarsiz)

if [ -z "$DB_NAME" ]; then
  echo "XATO: MONGO_URL ichida baza nomi ko'rsatilmagan." >&2
  exit 1
fi

# --- 1-qadam: nima o'chishini ko'rsatish (hech narsa o'chmaydi) ---
echo ""
echo "══════ 1/3  Hisobot ══════"
node src/seeds/cleanDatabase.seed.js --no-hints ${CLEAN_ARGS+"${CLEAN_ARGS[@]}"}

# --- 2-qadam: tasdiq ---
if [ "$SKIP_PROMPT" -eq 0 ]; then
  echo "══════ 2/3  Tasdiq ══════"
  echo ""
  # DIQQAT: ${...} jingalak qavsi SHART. Qavssiz yozilsa bash keyingi
  # ko'p baytli belgini (») o'zgaruvchi nomining davomi deb o'qiydi va
  # `set -u` tufayli "unbound variable" bilan yiqiladi.
  echo "  «${DB_NAME}» bazasi tozalanadi va owner qaytadan yaratiladi."
  echo "  BU AMALNI QAYTARIB BO'LMAYDI."
  echo ""
  printf "  Davom etish uchun baza nomini yozing (%s): " "$DB_NAME"
  read -r TYPED
  if [ "$TYPED" != "$DB_NAME" ]; then
    echo ""
    echo "  Bekor qilindi - hech narsa o'chirilmadi."
    exit 1
  fi
  echo ""
fi

# --- 3-qadam: tozalash + owner ---
echo "══════ 3/3  Tozalash ══════"
node src/seeds/cleanDatabase.seed.js --no-hints --yes --db="$DB_NAME" ${CLEAN_ARGS+"${CLEAN_ARGS[@]}"}

echo "══════ Owner seed ══════"
node src/seeds/owner.seed.js

echo ""
echo "  Tayyor. Login: owner / ${OWNER_PASSWORD:-owner123}"
echo "  «Asosiy filial» server ishga tushganda avtomatik yaraladi."
echo ""
