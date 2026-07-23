# Super Admin Panel — Provisioning tizimi

Bu panel yangi loyihalarni (o'quv markazlar va keyinchalik boshqa tizimlar) yaratadi.
Har yangi loyiha uchun `client` + `server` nusxalanadi, **noyob MongoDB bazasi** bilan
alohida PM2 process, Nginx vhost va HTTPS sertifikati sozlanadi. Oxirida DNS uchun IP
beriladi.

## Arxitektura

```
admin_server (NestJS + Prisma + PostgreSQL)   ← provisioning metadata (tenant, template, admin userlar)
     │  provision.sh chaqiradi (VPS'da)
     ▼
/root/tenants/<dbName>/{server,client}         ← har tenant alohida nusxa
     ├─ server .env → MONGO_URL=.../<dbName>    ← NOYOB baza nomi
     ├─ pm2 start <dbName>-api  (alohida port)
     └─ nginx vhost + certbot → https://<domain>

admin_client (React + Tailwind)                ← super admin UI
```

- **admin_server** — Node/NestJS emas, TypeScript. PostgreSQL faqat panel metadatasi uchun.
- Har **tenant server** esa mavjud loyihadagidek MongoDB (mongoose) da ishlaydi.
- **DB nomi hech qachon takrorlanmaydi**: `tenant_<slug>_<8-hex-random>`, DB'da unique tekshiriladi.

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

`provision.sh` VPS'da ishlaydi va quyidagilarni talab qiladi:

- **Template papka**: `/root/templates/study-center/{server,client}` — mavjud loyiha nusxasi
  (bu repodagi `server/` va `client/`). `admin_server` `SystemTemplate.templateDir` shu yerga ishora qiladi.
- `node`, `npm`, `pm2`, `nginx`, `certbot`, `mongod`, `openssl` o'rnatilgan.
- `admin_server` `.env` da global sozlamalar (`provision.sh` o'qiydi):

```bash
SERVER_PUBLIC_IP=203.0.113.10      # DNS uchun beriladigan IP (bitta VPS — doim shu)
PROVISION_SCRIPT=/root/admin/provision.sh
PROVISION_CWD=/root/admin
TENANT_PORT_MIN=5100
TENANT_PORT_MAX=5999
# provision.sh uchun (childEnv orqali uzatiladi yoki skript ichida):
# MONGO_BASE_URL=mongodb://127.0.0.1:27017
# TENANTS_ROOT=/root/tenants
# WEB_ROOT_BASE=/var/www
# WEB_USER=www-data
# CERTBOT_EMAIL=admin@example.uz
```

## Oqim (foydalanuvchi nuqtai nazaridan)

1. Login (statik super admin `.env` orqali).
2. **Yangi loyiha** → tizimni tanlash (select, dinamik) → nom, domen, brend rang, logo, bot token.
3. **Yaratish** → server darrov `DRAFT` yozadi va fon rejimida `provision.sh` ishga tushadi (`PROVISIONING`).
4. Loyiha sahifasida real vaqtda status va **provisioning log** ko'rinadi.
5. Tugagach `ACTIVE` bo'ladi va **DNS uchun IP** ko'rsatiladi → Cloudflare'ga A record qo'shasiz.

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
| GET/POST/PATCH/DELETE | `/api/users` | SUPER_ADMIN | 2-darajali userlar |
