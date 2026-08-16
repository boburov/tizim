# Backend - Bayyina (server/)

Node.js + Express + **PostgreSQL (Prisma)** + pg-boss + JWT (access + refresh).

> **Migratsiya davom etmoqda: MongoDB → PostgreSQL.**
> Poydevor (schema, migratsiyalar, klient, rejalashtiruvchi) tayyor va
> tekshirilgan; modullar ketma-ket ko'chirilmoqda. Joriy holat, qolgan
> ish ro'yxati va ko'chirish qoidalari: [`MIGRATION.md`](./MIGRATION.md).

## Folder structure

```
server/src/
├─ index.js                       # entrypoint: connect -> scheduler -> listen
├─ app.js                         # Express app + middleware + routes
├─ config/
│  ├─ env.js                      # process.env validation
│  ├─ prisma.js                   # PrismaClient (yagona nusxa) + connectDB
│  ├─ logger.js                   # pino logger
│  └─ scheduler.js                # pg-boss (Agenda API'sini takrorlaydi)
├─ middleware/
│  ├─ asyncHandler.js
│  ├─ errorHandler.js
│  ├─ notFound.js
│  ├─ auth.js                     # requireAuth (JWT verify)
│  ├─ requireRole.js
│  ├─ requirePermission.js
│  ├─ rateLimiter.js
│  └─ validate.js                 # zod schema -> middleware
├─ utils/
│  ├─ ApiError.js
│  ├─ ApiResponse.js
│  ├─ pagination.js
│  └─ jwt.js                      # signAccess, signRefresh, verify*
├─ helpers/
│  ├─ cookie.helper.js
│  ├─ password.helper.js
│  └─ permission.helper.js
├─ models/                        # ESKIRGAN - Mongoose modellari.
│  └─ ...                         # Modul ko'chirilgach fayli o'chiriladi.
│                                 # Yagona haqiqat manbai: prisma/schema.prisma
├─ modules/                       # feature-based segmentation
│  └─ <name>/
│     ├─ handlers/                # one file per endpoint
│     │  ├─ list.handler.js
│     │  ├─ getById.handler.js
│     │  ├─ create.handler.js
│     │  ├─ update.handler.js
│     │  └─ remove.handler.js
│     ├─ services/<name>.service.js
│     ├─ validators/              # zod schemas
│     └─ <name>.routes.js         # router assembly
├─ jobs/
│  ├─ index.js                    # define + start
│  ├─ ttlCleanup.job.js           # Mongo TTL indekslari o'rniga
│  └─ <name>.job.js
└─ routes/index.js                # mounts all modules under /api

prisma/
├─ schema.prisma                  # 78 model - BAZANING YAGONA MANBAI
└─ migrations/
   ├─ ..._object_id_function/     # gen_object_id() - 24-hex kalitlar
   ├─ ..._init/                   # jadvallar, FK, enumlar
   └─ ..._partial_unique_indexes/ # 35 ta qisman unique indeks (pul xavfsizligi)
```

## Module creation rules

Every endpoint lives in its own file (`handlers/<action>.handler.js`):

```js
// modules/students/handlers/create.handler.js
import asyncHandler from "@/middleware/asyncHandler.js";
import * as studentsService from "../services/students.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await studentsService.create(req.body, req.user);
  res.status(201).json({ success: true, data });
});

export default create;
```

The service handles business logic and **may access the DB directly**:

```js
// modules/students/services/students.service.js
import prisma from "@/config/prisma.js";
import ApiError from "@/utils/ApiError.js";

export const create = async (body, currentUser) => {
  // DIQQAT: `phone` bo'yicha tekshirilmaydi - bitta raqamdan bir nechta
  // odam foydalanadi (qarang: prisma/schema.prisma, User.phone). Yagona
  // kalit - username.
  const exists = await prisma.user.findUnique({
    where: { username: body.username },
  });
  if (exists) throw new ApiError(409, "Bunday foydalanuvchi mavjud");
  return prisma.user.create({ data: { ...body, role: "student" } });
};
```

The router only wires up the methods:

```js
// modules/students/students.routes.js
import { Router } from "express";
import requireAuth from "@/middleware/auth.js";
import requirePermission from "@/middleware/requirePermission.js";
import validate from "@/middleware/validate.js";
import create from "./handlers/create.handler.js";
import { createSchema } from "./validators/create.validator.js";

const router = Router();
router.post("/", requireAuth, requirePermission("students.create"), validate(createSchema), create);
export default router;
```

## Response shape

Success:
```json
{ "success": true, "data": {...}, "message": "...", "meta": { "page": 1, "limit": 20, "total": 100 } }
```

Error (emitted by the central `errorHandler`):
```json
{ "success": false, "message": "...", "code": "ERR_CODE", "details": [...] }
```

## Auth flow

- `POST /api/auth/login` - `{ login, password }` -> `accessToken` + refresh httpOnly cookie.
- `POST /api/auth/refresh` - refresh cookie -> new access + a rotated new refresh.
- `POST /api/auth/logout` - refresh is removed from the DB + the cookie is cleared.
- `GET /api/auth/me` - protected by `requireAuth`, returns `{ user, role, permissions }`.

## Role and permission

- `User.role` - satr (dinamik rol; `Role.value` ga ishora qiladi, FK EMAS).
- Owner - always has every permission (hard rule in the code base).
- `Permission` jadvali: `{ key, label, group, module, action }`.
- Rol va ruxsat **ko'p-ko'pga** bog'langan (`_RolePermissions` join jadvali);
  Prisma'da `include: { permissions: true }` bilan o'qiladi.
- Middleware: `requireAuth -> (requireRole("owner") | requirePermission("students.create"))`.

## Rejalashtiruvchi (joblar)

Agenda **faqat MongoDB** bilan ishlagani uchun u **pg-boss** bilan
almashtirildi (ishlar endi o'sha PostgreSQL bazasida turadi).

- `config/scheduler.js` - pg-boss nusxasi. U **ataylab Agenda API'sini
  takrorlaydi** (`define / every / now / schedule / start / stop / cancel`),
  shuning uchun 23 ta job fayli va chaqiruvchi servislar o'zgarmadi.
- Handler avvalgidek `job.attrs.data` oladi - moslashtiruvchi qatlam
  pg-boss'ning `job.data` sini shu shaklga o'giradi.
- `jobs/index.js` - `define(...)` + `await start()`.

### TTL: MUHIM FARQ

MongoDB `expireAfterSeconds` bilan eskirgan hujjatni **o'zi** o'chirardi.
PostgreSQL'da bunday mexanizm **yo'q**, shuning uchun `jobs/ttlCleanup.job.js`
har kuni 03:15 da tozalaydi: `caches`, `refresh_tokens`, `ai_runs` (90 kun),
`ai_usage_logs` (400 kun). **Bu job o'chirilsa jadvallar cheksiz o'sadi.**

## Commands

```bash
npm run dev              # nodemon
npm start                # production
npm run lint

# ── Prisma ──
npm run prisma:generate  # klientni qayta yaratish (postinstall'da avtomatik)
npm run prisma:migrate   # yangi migratsiya (development)
npm run prisma:deploy    # tayyor migratsiyalarni qo'llash (production)
npm run prisma:studio    # bazani brauzerda ko'rish
npm run db:reset         # schema'ni qayta qurish + owner seed

# ── Testlar ──
npm run test:auth-prisma  # ko'chirilgan auth oqimi (haqiqiy Postgres ustida)
npm run test:branch-cross # filiallar kesimi: sotuv voronkasi + o'qituvchi resursi
```

Schema o'zgargach `npm run prisma:generate` **shart** - aks holda klient
eski tuzilmani biladi va yangi maydon `undefined` bo'lib qoladi.

## Language rules

- Code and technical values - English.
- The `message` returned to the user - Uzbek (`"Tizimga xush kelibsiz"`, `"Login yoki parol noto'g'ri"`).
