# Super Admin Panel — Provisioning tizimi

Bu panel yangi loyihalarni (o'quv markazlar va keyinchalik boshqa tizimlar) yaratadi.
Har yangi loyiha uchun `client` + `server` nusxalanadi, **noyob PostgreSQL bazasi** bilan
alohida PM2 process, Nginx vhost va HTTPS sertifikati sozlanadi, kod **alohida GitHub
repositoriyasiga** yuboriladi. Oxirida DNS uchun IP beriladi.

## Arxitektura

```
admin_server (NestJS + Prisma + PostgreSQL)   ← provisioning metadata (tenant, template,
     │                                           sozlamalar, admin userlar)
     │  provision.sh / reconfigure.sh chaqiradi (VPS'da)
     ▼
/root/tenants/<dbName>/{server,client}         ← har tenant alohida nusxa
     ├─ server .env → DATABASE_URL=.../<dbName>  ← NOYOB baza nomi
     ├─ client .env → brend ranglari (HSL)
     ├─ pm2 start <dbName>-api  (alohida port)
     ├─ nginx vhost + certbot → https://<domain>
     └─ git remote → github.com/<owner>/<repo>  ← har tenant o'z reposi

admin_client (React + Tailwind)                ← super admin UI
```

- **admin_server** — Node/NestJS emas, TypeScript. PostgreSQL faqat panel metadatasi uchun.
- Har **tenant server** esa PostgreSQL (Prisma) da ishlaydi — admin bazasi bilan
  bir xil texnologiya, lekin **alohida baza** (izolyatsiya qat'iy qoladi).
- **DB nomi hech qachon takrorlanmaydi**: `tenant_<slug>_<8-hex-random>`, DB'da unique tekshiriladi.

## Uchta asosiy imkoniyat

### 1) Sozlamalar admin paneldan (`.env` boshqaruvi)

Tenant `.env` fayllari **skriptda yozilmaydi** — ularni admin server hosil qiladi va
skriptga `base64` ko'rinishida uzatadi.

Sozlamalar ro'yxati bitta joyda: [`src/settings/settings.registry.ts`](src/settings/settings.registry.ts).
Har yozuvda kalit, turi, standart qiymati, validatsiyasi, UI matni va **qo'llash rejimi**
(`restart` yoki `rebuild`) bor.

**Yangi sozlama qo'shish** — 3 qadam, VPS'ga tegilmaydi:

1. tenant ilovasida `process.env.X` ni o'qiydigan joyni yozing;
2. registrga bitta yozuv qo'shing;
3. tamom — panelda maydon o'zi paydo bo'ladi va `.env` ga o'zi tushadi.

Maxfiy sozlamalar (bot token, Gemini kalit) bazada **AES-256-GCM** bilan shifrlanadi
(`SETTINGS_ENCRYPTION_KEY`). Panelga hech qachon ochiq qaytarilmaydi — faqat `••••1234`.

O'zgarish darrov qo'llanmaydi: avval saqlanadi, keyin **"Qo'llash"** tugmasi bir necha
o'zgarishni birga yetkazadi. Shuning uchun brend rangini ketma-ket tahrirlash bir necha
build'ni ishga tushirmaydi.

> **JWT va cookie sirlari admin bazasida SAQLANMAYDI.** Ularni `provision.sh` bir marta
> yaratadi va keyingi qayta sozlashlarda mavjudini saqlab qoladi — shuning uchun sozlama
> o'zgartirilganda foydalanuvchilar tizimdan chiqib ketmaydi.

### 2) Har tenant uchun alohida GitHub repo

`GITHUB_TOKEN` + `GITHUB_OWNER` berilsa, har loyiha uchun **yopiq** repositoriy ochiladi
va kod VPS'dan o'sha yerga yuboriladi. Repoda: `server/`, `client/`, `.env.example`,
`tenant.json`, `README.md` va deploy workflow'i.

Xavfsizlik jihatlari:

- `.env` repoga **hech qachon** tushmaydi — `.gitignore` dan tashqari, `git-sync.sh`
  push oldidan indeksni alohida tekshiradi va topilsa **push'ni to'xtatadi**;
- GitHub tokeni `.git/config` ga ham, buyruq argumentiga ham yozilmaydi
  (`GIT_ASKPASS` orqali beriladi) — ya'ni `ps aux` bilan o'qib bo'lmaydi;
- tenant repolariga **VPS SSH kaliti tarqatilmaydi**. Workflow admin serverga bitta
  HTTP so'rov yuboradi va faqat **shu** tenantni qayta deploy qildiradi.

`main` ga push → GitHub Action → admin server → `reconfigure.sh` (kod tortiladi, server
qayta ishga tushadi, client qayta quriladi). Boshqa mijozlarga ta'sir qilmaydi.

Loyiha o'chirilganda repo standart holatda **arxivlanadi** (o'chirilmaydi) — mijoz kodi
va tarixi saqlanib qoladi. `GITHUB_DELETE_REPO_ON_DEPROVISION=true` bilan o'zgartirsa bo'ladi.

### 3) Brend preview

Brend rangi tenant client'da shunchaki qo'llanmaydi: undan butun token to'plami
(yuzalar, chegaralar, matn ranglari) hosil qilinadi va WCAG kontrasti majburlanadi.
Shuning uchun admin paneldagi preview **aynan o'sha dvigateldan** o'tadi —
`admin_client/src/lib/brand/` tenant client'dagi fayllarning nusxasi.

Nusxa siljib ketmasligi uchun tekshiruv bor:

```bash
cd admin_client && npm run check:brand-sync
```

> **Muhim:** tenant client `.env` dan ranglarni **HSL kanallari** ko'rinishida kutadi
> (`"243 75% 59%"`), HEX emas. O'girish admin serverda, `.env` yozilishidan oldin
> bajariladi (`src/common/color/brand-color.util.ts`).

### 4) Foydalanuvchilar, bepul sinov va obuna muddati

**Foydalanuvchilar** sahifasida ro'yxatdan o'tgan mijozlar, ularning loyihalari
va har loyihaning obuna holati bir joyda ko'rinadi. Shu yerdan uchta amal
bajariladi: sinov berish, to'xtatish, qaytarish.

**Bepul sinov (1-30 kun)** — faqat admin beradi. Mijoz oqimida (`customer/*`)
bunday endpoint umuman yo'q, `assignPlan` esa tarifda `trialDays` bo'lsa ham
sinov bermaydi. Sinov berilganda kim bergani, qachon va qancha muddatga —
hammasi `Subscription` yozuvida qoladi.

**Muddat tugashi**: ichki kuzatuvchi har 15 daqiqada tugagan obunalarni topadi,
holatini `EXPIRED` qiladi va tenant serverini **to'xtatadi** —
`reconfigure.sh` `suspend` rejimida `pm2 stop` bajaradi.

- baza, yuklangan fayllar, nginx vhost va sertifikat **tegilmaydi**;
- to'lov kelganda (`markPaid`) yoki sinov berilganda server **avtomatik
  qaytadi** — lekin faqat AVTOMATIK to'xtatilgan bo'lsa. Admin qo'lda
  to'xtatgan bo'lsa, qaytarish ham qo'lda bo'ladi;
- `SUBSCRIPTION_AUTOSUSPEND=false` butun mexanizmni bir zumda o'chiradi.

Ro'yxat sahifasidagi panel kuzatuvchi holatini ko'rsatadi: yoqilganmi, oxirgi
tekshiruv qachon bo'lgan, qo'shimcha muhlat bormi.

### 5) API xizmatlar va so'rovlar hisobi

Kalit bilan sotiladigan API mahsulotlari (`edu-pronauns` va h.k.) — xizmat,
tarif, mijoz, obuna, kalit va **har bir so'rov hisobi**.

Xizmat va tariflarni endi **paneldan** yaratish mumkin (SSH shart emas).
Serverdagi bazaga xizmat qo'shish yo'llari va data plane integratsiyasi
(`authorize` / `usage` / `meter`) alohida hujjatda:
[`docs/api-xizmatlar.md`](docs/api-xizmatlar.md).

## 1) admin_server ishga tushirish (lokalda)

```bash
cd admin_server
cp .env.example .env          # qiymatlarni to'ldiring (DATABASE_URL, super admin, secretlar)
npm install
npx prisma migrate dev --name init   # PostgreSQL jadvallarini yaratadi
npm run seed:templates        # "O'quv markaz tizimi" shablonini qo'shadi
npm run dev                   # http://localhost:4000
```

### Super admin parolini xeshlash (production)

```bash
node -e "console.log(require('bcrypt').hashSync('SIZNING_PAROL', 10))"
# natijani .env dagi SUPER_ADMIN_PASSWORD_HASH ga qo'ying
```

## 2) admin_client ishga tushirish

```bash
cd admin_client
cp .env.example .env          # VITE_ADMIN_API_URL ni tekshiring
npm install
npm run dev                   # http://localhost:5174
```

## 3) VPS tayyorlash (provisioning ishlashi uchun)

Skriptlar VPS'da ishlaydi va quyidagilarni talab qiladi:

- **Uchala skript bitta papkada** (`PROVISION_CWD`, odatda `/root/admin/`) — ular
  bir-birini nom bo'yicha chaqiradi:

  ```bash
  scp admin_server/{provision.sh,reconfigure.sh,git-sync.sh} root@VPS:/root/admin/
  ssh root@VPS 'chmod +x /root/admin/*.sh'
  ```

  | Skript | Vazifasi |
  |--------|----------|
  | `provision.sh` | noldan tenant yaratadi (papkani tozalaydi) |
  | `reconfigure.sh` | ishlab turgan tenantni yangilaydi (tozalamaydi) |
  | `git-sync.sh` | kodni GitHub'ga yuboradi (ikkalasi ham chaqiradi) |

- **Template papka**: `/root/templates/study-center/{server,client}` — mavjud loyiha nusxasi
  (bu repodagi `server/` va `client/`). `admin_server` `SystemTemplate.templateDir` shu yerga ishora qiladi.
- `node`, `npm`, `pm2`, `nginx`, `certbot`, `postgresql` (`psql` + `createdb`),
  `openssl`, **`git`** o'rnatilgan.
- `admin_server` `.env` da global sozlamalar (skriptlar o'qiydi):

```bash
SERVER_PUBLIC_IP=203.0.113.10      # DNS uchun beriladigan IP (bitta VPS — doim shu)
PROVISION_SCRIPT=/root/admin/provision.sh
RECONFIGURE_SCRIPT=/root/admin/reconfigure.sh
PROVISION_CWD=/root/admin
TENANT_PORT_MIN=5100
TENANT_PORT_MAX=5999

# Tenant .env ni admin server hosil qiladi — DATABASE_URL shu asosdan quriladi
POSTGRES_BASE_URL=postgresql://postgres:postgres@127.0.0.1:5432
# Baza yaratish/o'chirish uchun boshqaruv bazasi
POSTGRES_ADMIN_DB=postgres
# Maxfiy sozlamalarni shifrlash (bo'lmasa bot token / API kalit saqlanmaydi)
SETTINGS_ENCRYPTION_KEY=<64 hex belgi>
# Heartbeat va tenant repo deploy hook'i shu manzilga murojaat qiladi
ADMIN_API_PUBLIC_URL=https://admin.example.uz/api

# GitHub (bo'sh bo'lsa integratsiya o'chiq)
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_OWNER_TYPE=user

# Obuna muddati kuzatuvi (standart qiymatlar ko'rsatilgan)
SUBSCRIPTION_CHECK_INTERVAL_MIN=15   # necha daqiqada bir tekshiriladi
SUBSCRIPTION_AUTOSUSPEND=true        # false = tugagan obuna serverni o'chirmaydi
SUBSCRIPTION_GRACE_HOURS=0           # muddatdan keyin beriladigan qo'shimcha muhlat

# API xizmatlar (data plane shu sir bilan murojaat qiladi)
GATEWAY_SECRET=<uzun tasodifiy satr>

# skriptlar uchun (childEnv orqali uzatiladi yoki skript ichida standart):
# TENANTS_ROOT=/root/tenants
# WEB_ROOT_BASE=/var/www
# WEB_USER=www-data
# CERTBOT_EMAIL=admin@example.uz
```

### Migratsiya (mavjud o'rnatmada)

```bash
cd admin_server
npx prisma migrate deploy    # yangi jadval/ustunlar: TenantSetting, brend, GitHub
npx prisma generate
```

Mavjud tenantlar buzilmaydi:

- eski `Tenant.botToken` ustuni **o'qilaveradi** — birinchi marta panelda tahrirlanganda
  shifrlangan sozlamaga ko'chadi va ustun bo'shatiladi;
- JWT/cookie sirlari `reconfigure.sh` tomonidan **mavjud `.env` dan saqlab qolinadi**;
- brend rangi endi HSL ga o'girilib yoziladi — **ilgari u umuman ishlamayotgan edi**
  (client HEX ni o'qiy olmasdi), shuning uchun birinchi "Qo'llash" dan keyin sayt
  brend rangida chiqadi.

## Oqim (foydalanuvchi nuqtai nazaridan)

**Yaratish**

1. Login (statik super admin `.env` orqali).
2. **Yangi loyiha** → tizimni tanlash (dinamik) → domen, brend (nom, ranglar, logo),
   bot token, GitHub repo kerakmi.
3. O'ngdagi **jonli preview** brend qanday chiqishini light va dark rejimda darrov ko'rsatadi.
4. **Yaratish** → `DRAFT` yoziladi va fon rejimida `provision.sh` ishga tushadi (`PROVISIONING`).
5. Loyiha sahifasida real vaqtda status va **provisioning log** ko'rinadi.
6. Tugagach `ACTIVE` bo'ladi, **DNS uchun IP** ko'rsatiladi → Cloudflare'ga A record qo'shasiz,
   kod esa GitHub repoga yuborilgan bo'ladi.

**Keyinchalik o'zgartirish** — loyiha sahifasida 4 ta bo'lim:

| Bo'lim | Nima qilinadi | Qo'llash |
|--------|---------------|----------|
| Umumiy | DNS, texnik ma'lumot, tarif, loglar, o'chirish | — |
| Brend | nom, ranglar, logo + jonli preview | client rebuild |
| Sozlamalar | barcha `.env` qiymatlari (registrdan) | pm2 restart yoki rebuild |
| GitHub | repo holati, qayta yuborish, git log | — |

O'zgarish saqlangach yuqorida **"N ta o'zgarish qo'llanmagan"** paneli chiqadi va
qaysi amal bajarilishini (restart / rebuild) oldindan aytadi.

## 2-darajali admin userlar

Hozircha super admin statik (`.env`). Keyinchalik `POST /api/users` (faqat SUPER_ADMIN)
orqali `ADMIN` yoki `VIEWER` rolli userlar qo'shiladi — ular ham panelga kira oladi.

## API qisqacha

| Metod | Yo'l | Rol | Tavsif |
|-------|------|-----|--------|
| POST | `/api/auth/login` | — | Kirish |
| POST | `/api/auth/refresh` | — | Token yangilash |
| GET | `/api/auth/me` | auth | Joriy user |
| GET | `/api/templates/active` | auth | Select uchun tizimlar |
| POST | `/api/templates` | SUPER_ADMIN | Yangi tizim shabloni |
| GET | `/api/tenants` | auth | Loyihalar ro'yxati |
| POST | `/api/tenants` | SUPER_ADMIN, ADMIN | Yangi loyiha + provisioning |
| POST | `/api/tenants/:id/retry` | SUPER_ADMIN, ADMIN | Qayta urinish |
| PATCH | `/api/tenants/:id/brand` | SUPER_ADMIN, ADMIN | Nom, ranglar, logo |
| GET | `/api/tenants/:id/settings` | auth | Sozlamalar + kutilayotgan farq |
| PATCH | `/api/tenants/:id/settings` | SUPER_ADMIN, ADMIN | Sozlamalarni saqlash |
| POST | `/api/tenants/:id/apply` | SUPER_ADMIN, ADMIN | O'zgarishni tenantga yetkazish |
| GET | `/api/tenants/:id/repo` | auth | GitHub repo holati |
| POST | `/api/tenants/:id/repo/sync` | SUPER_ADMIN, ADMIN | Repo yaratish / kodni yuborish |
| GET | `/api/github/status` | auth | Integratsiya sozlanganmi |
| POST | `/api/tenant-deploy/hook` | deploy token | Tenant repo Action'i chaqiradi |
| GET/POST/PATCH/DELETE | `/api/users` | SUPER_ADMIN | 2-darajali userlar |
| GET | `/api/admin/customers` | auth | Foydalanuvchilar + loyihalari + obunasi |
| GET | `/api/admin/customers/unassigned-tenants` | auth | Egasiz (o'zimiz yaratgan) loyihalar |
| PATCH | `/api/admin/customers/:id/active` | SUPER_ADMIN, ADMIN | Hisobni bloklash / ochish |
| POST | `/api/subscriptions/tenants/:id/trial` | SUPER_ADMIN, ADMIN | **Bepul sinov berish (1-30 kun)** |
| POST | `/api/subscriptions/tenants/:id/suspend` | SUPER_ADMIN, ADMIN | Serverni to'xtatish (pm2 stop) |
| POST | `/api/subscriptions/tenants/:id/resume` | SUPER_ADMIN, ADMIN | Serverni qaytarish (pm2 start) |
| GET | `/api/subscriptions/expiring` | auth | Yaqinda tugaydigan obunalar |
| GET | `/api/subscriptions/checker` | auth | Muddat kuzatuvchisining holati |
| POST | `/api/subscriptions/checker/run` | SUPER_ADMIN, ADMIN | Muddatni hozir tekshirish |
| POST | `/api/api-gateway/authorize` | gateway secret | Kalitni tekshirish (data plane) |
| POST | `/api/api-gateway/usage` | gateway secret | So'rovlar batch hisobi |
| POST | `/api/api-gateway/meter` | gateway secret | Bitta so'rov hisobi |

> `/api/tenant-deploy/hook` — yagona **JWT'siz** yo'l. U `Authorization: Bearer <deployToken>`
> bilan himoyalangan; token har tenantga alohida va faqat o'sha tenantni deploy qila oladi.
> Shuning uchun u `tenants/*` prefiksidan tashqarida turadi — himoyalanmagan yo'lni
> himoyalangan yo'llar orasiga qo'yish kelajakda oson xatoga olib keladi.
