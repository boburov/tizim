#!/usr/bin/env bash
#
# BAZANI TOZALASH + OWNER SEED - bitta buyruq.
#
#   npm run db:reset                  # so'raydi, keyin tozalaydi va owner yaratadi
#   npm run db:reset -- -y            # so'ramaydi (CI uchun)
#
# DIQQAT: PostgreSQL'ga o'tgandan keyin bu skript BUTUN schema'ni qayta
# quradi (`prisma migrate reset`). Eski `--drop` / `--keep-auth` bayroqlari
# endi QO'LLANMAYDI - Mongo kolleksiyalarini tanlab tozalash mantig'i
# jadval va tashqi kalit (FK) bog'lanishlariga to'g'ri kelmaydi.
#
# NEGA SHELL, npm script EMAS: `npm run x -- --db=nom` argumentni zanjirdagi
# OXIRGI buyruqqa qo'shadi, ya'ni tasdiq bayrog'i tozalash script'iga emas,
# owner seed'ga tushib ketardi. Bu yerda esa baza nomi .env dan O'QILADI va
# tozalash script'iga aniq uzatiladi.
#
# XAVFSIZLIK: foydalanuvchi baza nomini QO'LDA yozib tasdiqlaydi (pastda),
# shundan keyingina tozalash boshlanadi.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# --- Bayroqlarni ajratish ---
# `-y` savolni o'tkazib yuboradi (CI uchun). Boshqa bayroq qabul
# qilinmaydi: tozalash `prisma migrate reset` bilan bo'ladi va u
# tanlab tozalashni (`--keep-auth`, `--drop`) qo'llab-quvvatlamaydi.
SKIP_PROMPT=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) SKIP_PROMPT=1 ;;
    *) echo "XATO: noma'lum bayroq '$arg' (faqat -y qabul qilinadi)." >&2; exit 1 ;;
  esac
done

# --- Baza nomini aniqlash ---
# Muhitdagi DATABASE_URL ustun (masalan: DATABASE_URL=... npm run db:reset).
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' .env | head -1 | cut -d '=' -f2- | tr -d '"'\''\r' | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "XATO: DATABASE_URL topilmadi (.env da ham, muhitda ham)." >&2
  exit 1
fi

DB_NAME="${DATABASE_URL##*/}"   # oxirgi "/" dan keyingi qism
DB_NAME="${DB_NAME%%\?*}"       # "?schema=public" kabi parametrlarsiz

if [ -z "$DB_NAME" ]; then
  echo "XATO: DATABASE_URL ichida baza nomi ko'rsatilmagan." >&2
  exit 1
fi

# --- 1-qadam: nima o'chishini ko'rsatish (hech narsa o'chmaydi) ---
echo ""
echo "══════ 1/3  Hisobot ══════"
echo "  Baza:  ${DB_NAME}"
echo "  Amal:  schema butunlay qayta quriladi (barcha jadvallar bo'shaydi)"

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
# PostgreSQL'da tozalash `prisma migrate reset` bilan: u schema'ni butunlay
# qayta quradi va BARCHA migratsiyalarni qaytadan qo'llaydi. Ya'ni
# `gen_object_id()` funksiyasi va 35 ta qisman unique indeks ham tiklanadi -
# ularni qo'lda yaratish shart emas (unutib qo'yish xavfi yo'q).
echo "══════ 3/3  Tozalash ══════"
npx prisma migrate reset --force --skip-seed --skip-generate

# RUXSAT/ROL SEED - MAJBURIY QADAM.
#
# Tozalashdan keyin `roles` va `permissions` kolleksiyalari BO'SH qoladi.
# Owner buni sezmaydi (uning ruxsati kodda ["*"] bilan qattiq bog'langan),
# lekin qolgan HAMMA rol yo'qoladi: direktor/administrator/o'qituvchi
# yarata olmaysiz, mavjudlari esa ruxsatsiz qoladi. Ilgari bu qadam
# qo'lda bajarilishi kerak edi va odatda unutilardi.
echo "══════ Ruxsat va rollar ══════"
node src/seeds/permissions.seed.js

echo "══════ Owner seed ══════"
node src/seeds/owner.seed.js

echo ""
echo "  Tayyor. Login: owner / ${OWNER_PASSWORD:-owner123}"
echo "  «Asosiy filial» server o'zi tiklaydi (ishga tushganda yoki"
echo "  birinchi /auth/me so'rovida) - serverni qayta ishga tushirish shart emas."
echo ""
