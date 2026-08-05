#!/usr/bin/env bash
#
# git-sync.sh — tenant papkasidagi kodni uning GitHub repositoriysiga yuboradi.
#
# Chaqirish:
#   bash git-sync.sh <APP_DIR> [commit xabari]
#
# Kerakli ENV:
#   GIT_REMOTE — https://github.com/owner/repo.git
#   GIT_TOKEN  — GitHub PAT
#   GIT_BRANCH — odatda "main"
#
# XAVFSIZLIK BO'YICHA UCHTA QAROR:
#
# 1) Token remote URL ichiga YOZILMAYDI. Ko'p qo'llanmalarda
#    `https://TOKEN@github.com/...` deb yozishadi — u holda token
#    `.git/config` ichida ochiq qoladi va keyingi har qanday `git remote -v`
#    uni ko'rsatadi. Bu yerda token faqat GIT_ASKPASS orqali, bir martalik
#    vaqtinchalik skript orqali beriladi.
#
# 2) Token buyruq argumentiga ham tushmaydi — aks holda serverdagi har
#    qanday foydalanuvchi `ps aux` bilan uni o'qib olardi.
#
# 3) PUSH OLDIDAN `.env` KUZATILAYOTGANI TEKSHIRILADI. Bu oxirgi to'siq:
#    `.gitignore` noto'g'ri bo'lsa yoki kimdir `git add -f` qilgan bo'lsa,
#    mijozning MongoDB manzili, JWT sirlari va Telegram tokeni GitHub'ga
#    chiqib ketardi. Bunday holatda push BAJARILMAYDI.
#
set -euo pipefail

APP_DIR="${1:?APP_DIR argumenti kerak}"
COMMIT_MSG="${2:-Avtomatik yangilanish}"

: "${GIT_REMOTE:?GIT_REMOTE kerak}"
: "${GIT_TOKEN:?GIT_TOKEN kerak}"
GIT_BRANCH="${GIT_BRANCH:-main}"

GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Admin Panel}"
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-admin-panel@localhost}"

if ! command -v git >/dev/null 2>&1; then
  echo "❌ git o'rnatilmagan — kod yuborilmadi" >&2
  exit 1
fi

cd "$APP_DIR"

# --- 1) Repo tayyorlash ---
if [ ! -d .git ]; then
  echo "    git init..."
  git init -q
fi

git config user.name "$GIT_AUTHOR_NAME"
git config user.email "$GIT_AUTHOR_EMAIL"
# Katta papkada fayl rejimi farqlari ortiqcha "o'zgarish" ko'rsatmasin
git config core.fileMode false

# Remote — TOKENSIZ toza URL
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$GIT_REMOTE"
else
  git remote add origin "$GIT_REMOTE"
fi

# Branch nomini kafolatlash (git init standarti "master" bo'lishi mumkin)
current_branch="$(git symbolic-ref --short -q HEAD || echo '')"
if [ "$current_branch" != "$GIT_BRANCH" ]; then
  git checkout -q -B "$GIT_BRANCH"
fi

# --- 2) O'zgarishlarni indekslash ---
git add -A

# --- 3) XAVFSIZLIK TO'SIG'I: maxfiy fayllar indeksda emasligini tekshirish ---
LEAKED="$(git ls-files --cached | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' || true)"
if [ -n "$LEAKED" ]; then
  echo "❌ TO'XTATILDI: maxfiy fayl(lar) git indeksida topildi:" >&2
  echo "$LEAKED" | sed 's/^/     /' >&2
  echo "   .gitignore buzilgan — push bajarilmadi." >&2
  # Indeksni tozalab qo'yamiz, keyingi urinishda ham tushib qolmasin
  echo "$LEAKED" | while read -r f; do git rm --cached -q "$f" 2>/dev/null || true; done
  exit 1
fi

# node_modules ham kutilmaganda tushib qolmasin (repo hajmini portlatadi)
if git ls-files --cached | grep -q '^node_modules/\|/node_modules/'; then
  echo "❌ TO'XTATILDI: node_modules git indeksiga tushgan — .gitignore ni tekshiring" >&2
  exit 1
fi

# --- 4) Commit ---
if git diff --cached --quiet; then
  echo "    O'zgarish yo'q — yangi commit qilinmadi."
else
  git commit -q -m "$COMMIT_MSG"
  echo "    Commit: $(git rev-parse --short HEAD)"
fi

# --- 5) Push (token GIT_ASKPASS orqali, diskda va ps'da qolmaydi) ---
ASKPASS="$(mktemp)"
cleanup() { rm -f "$ASKPASS"; }
trap cleanup EXIT

cat > "$ASKPASS" <<'ASKPASS_EOF'
#!/usr/bin/env bash
# git foydalanuvchi nomi va parolni shu skriptdan so'raydi
case "$1" in
  Username*) echo "x-access-token" ;;
  Password*) echo "${GIT_TOKEN}" ;;
esac
ASKPASS_EOF
chmod 700 "$ASKPASS"

echo "    push -> ${GIT_REMOTE} (${GIT_BRANCH})"
GIT_ASKPASS="$ASKPASS" \
GIT_TERMINAL_PROMPT=0 \
  git push -u origin "HEAD:${GIT_BRANCH}"

echo "    ✅ GitHub'ga yuborildi"
