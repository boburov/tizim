# MongoDB → PostgreSQL (Prisma) migratsiyasi

Bu hujjat migratsiyaning **joriy holati**, **qabul qilingan qarorlar** va
**qolgan ish** ro'yxatini yuritadi. Modul ko'chirilgach shu yerdagi
jadval yangilanadi.

---

## 1. Nega va nima o'zgardi

| | Ilgari | Endi |
|---|---|---|
| Baza | MongoDB | PostgreSQL 16 |
| ORM | Mongoose (74 model) | Prisma (78 model) |
| Joblar | Agenda (Mongo'ga bog'liq) | pg-boss (Postgres) |
| Kalit | `ObjectId` | 24-hex satr (`gen_object_id()`) |
| TTL | `expireAfterSeconds` indeksi | `jobs/ttlCleanup.job.js` |
| Qisman unique | `partialFilterExpression` | `CREATE UNIQUE INDEX ... WHERE` |

---

## 2. Holat

### ✅ Tayyor va tekshirilgan (poydevor)

| Narsa | Holat |
|---|---|
| `prisma/schema.prisma` — 74 model + 4 yordamchi jadval | ✅ `prisma validate` o'tdi |
| 3 ta migratsiya (funksiya → jadvallar → qisman indekslar) | ✅ bazaga qo'llandi |
| 84 jadval, 77 enum, 35 qisman unique indeks | ✅ bazada tasdiqlandi |
| Pul xavfsizligi invariantlari (10 ta stsenariy) | ✅ hammasi kutilgandek |
| `config/prisma.js` — klient + `passwordHash` yopilgan | ✅ |
| `config/scheduler.js` — pg-boss, Agenda API'si saqlangan | ✅ |
| `jobs/ttlCleanup.job.js` | ✅ ro'yxatdan o'tgan |
| Provisioning (admin_server + shell skriptlar) | ✅ Postgres'ga o'tdi |

### ✅ Ko'chirilgan (server ko'tariladi, login ishlaydi)

| Fayl / modul | Nima uchun kerak edi |
|---|---|
| `modules/auth` | login / refresh / logout / parol / profil — **16/16 test** |
| `helpers/permission.helper.js` | rol va ruxsatlarni o'qish |
| `helpers/branchAccess.helper.js` | `ensureMainBranch()` — **boot'ni yiqitayotgan edi** |
| `helpers/branchContext.helper.js` | filial ko'lami filtrlari (butun tizim shunga tayanadi) |
| `helpers/userProfile.helper.js` | `/auth/me` javobi |
| `middleware/auth.js` | `requireAuth` — har bir himoyalangan so'rov |
| `index.js` | boot tekshiruvi |
| `seeds/permissions.seed.js`, `seeds/owner.seed.js` | bo'sh bazani ko'tarish |
| `modules/systemNotifications` | to'liq |
| `modules/storage` | kvota + fayl yozish (atomik `reserve`) |
| `modules/expenseApprovals` | **o'qish yo'li** (list / stats / getById / pendingCount) |
| `modules/notifications` | **inbox bo'lagi** (unread-count / markRead / markAllRead) |
| `modules/adminDashboard` | overview / cashflow / student-flow (6 aggregate) |
| `modules/roles` + `helpers/roles.helper.js` | matritsa, muzlatish, ko'chirish |
| `modules/branches` | list / stats / compare / softRemove |
| `modules/courses` (+ coursePrice) | narx merosi zanjiri |
| `modules/rooms` | to'liq |
| `modules/archiveReasons`, `feedbackTypes`, `leadOptions`, `notificationTemplates`, `attendanceSettings` | to'liq |

**Hozir ishlaydi — 22 endpoint (200):**
`/auth/*`, `/branches` (+compare, stats), `/roles` (+matrix), `/courses`,
`/rooms`, `/archive-reasons`, `/feedback-types`, `/lead-options`,
`/notification-templates`, `/attendance-settings`, `/storage/usage`,
`/system-notifications`, `/notifications/inbox/unread-count`,
`/expense-approvals` (+pending-count, stats),
`/admin-dashboard/*` (overview, cashflow, student-flow).

Boot'da **0 ta ERROR**, rejalashtiruvchi 26 job bilan ko'tariladi.

**Hozir ishlamaydi:** `/users`, `/groups`, `/leads`, `/holidays`,
`/expenses`, `/feedback`, `/activity-logs`, `/deposits` va qolgan modullar.

**Fon xizmatlari** (hammasi `.catch()` bilan o'ralgan — serverni yiqitmaydi):
`botlocks`, `groups.find` (autoEndGroups), `studentpayments`
(catchUpMonthly + dailyAccrual).

### ⚠️ ESDA TUTING: `branchContext` shakli o'zgardi

`branchFilter()` / `branchMatchStage()` endi **Prisma shaklini** qaytaradi
(`in` — `$in` emas; `branchMatchStage()` esa `$match` o'ramisiz `where`
bo'lagini beradi).

Ularni **57 fayl** ishlatadi. Ko'chirilmagan modul ularni Mongoose'ga
uzatsa **aniq xato** beradi (masalan *"Arguments must be aggregate
pipeline operators"*) — bu yaxshi, chunki jimgina noto'g'ri natija
qaytarmaydi. Modulni ko'chirayotganda `...branchMatchStage()` ni
`AND: [...]` ichiga qo'ying.

### ⏳ Qolgan (43 modul)

Quyidagilar **hali Mongoose'da** va shuning uchun **hozircha ishlamaydi**
(Mongo ulanishi olib tashlangan). Ko'chirish tartibi — bog'liqlik bo'yicha:

**1-to'lqin — poydevor helperlar** ✅ asosiylari bajarildi
Qolgani: `membership.helper.js` (1 ta so'rov), `roles.helper.js` (6 ta),
`cascadeDelete.helper.js` (20 ta so'rov, 11 model — eng kattasi).

**2-to'lqin — asosiy ma'lumot** — `branches`, `roles`, `courses`, `rooms` ✅

Qolgani: **`users`** (1460 qator) va **`groups`** (2606 qator) ← **KEYINGI QADAM**

> Ikkalasida ham `branchAssignments` bilan ishlash bor. Eslatma:
> `$pull: { branchAssignments: ... }` endi `user_branch_assignments`
> jadvali ustidagi `deleteMany`, `Group.teachers` esa ko'p-ko'pga
> bog'lanish (`connect` / `set` / `disconnect`).

**3-to'lqin — o'quv jarayoni**
`attendance`, `grades`, `assignments`, `holidays`, `lessonCancellations`,
`attendanceExemptions`, `attendanceSettings`, `studentFreeze`, `teacherAttendance`

**4-to'lqin — moliya** (eng ehtiyot bo'lish kerak bo'lgan qism)
`finance`, `deposits`, `expenses`, `expenseApprovals`, `journal`, `ledger`,
`openingBalance`, `teacherSalary`, `staffPayroll`, `financeReport`

**5-to'lqin — qolganlari**
`leads`, `leadOptions`, `notifications`, `notificationTemplates`, `feedback`,
`feedbackTypes`, `systemNotifications`, `storage`, `imports`, `exports`,
`search`, `activityLogs`, `activityHistory`, `adminDashboard`,
`branchAnalytics`, `archiveReasons`, `botAuth`, `ai`

Shuningdek: **23 ta job**, **bot handlerlari**, **seedlar**, **33 ta eski test**.

> **MUHIM:** modul ko'chirilmagunicha server TO'LIQ ishga tushmaydi —
> `config/db.js` (mongoose.connect) olib tashlangan, ya'ni har qanday
> Mongoose chaqiruvi ulanishsiz osiladi. Migratsiya tugagach
> `src/models/` papkasi va `mongoose` bog'lamasi o'chiriladi.

---

## 3. Ko'chirish qoidalari (har bir modul uchun)

### 3.1 Mongo → Prisma moslik jadvali

| Mongoose | Prisma |
|---|---|
| `Model.findById(id)` | `prisma.model.findUnique({ where: { id } })` |
| `Model.findOne({ a, b })` | `prisma.model.findFirst({ where: { a, b } })` |
| `Model.find(q).lean()` | `prisma.model.findMany({ where })` |
| `.select("a b")` | `select: { a: true, b: true }` |
| `.select("+passwordHash")` | `omit: { passwordHash: false }` |
| `.populate("user")` | `include: { user: true }` |
| `.sort({ a: -1 })` | `orderBy: { a: "desc" }` |
| `.skip(n).limit(m)` | `skip: n, take: m` |
| `Model.countDocuments(q)` | `prisma.model.count({ where })` |
| `Model.create(doc)` | `prisma.model.create({ data: doc })` |
| `Model.insertMany(docs)` | `prisma.model.createMany({ data: docs })` |
| `Model.updateOne(q, {$set:d})` | `prisma.model.update({ where, data })` |
| `Model.updateMany(q, {$set:d})` | `prisma.model.updateMany({ where, data })` |
| `findOneAndUpdate` (atomik) | `updateMany` + `count` tekshiruvi |
| `Model.deleteMany(q)` | `prisma.model.deleteMany({ where })` |
| `$in / $nin` | `in / notIn` |
| `$gt / $gte / $lt / $lte` | `gt / gte / lt / lte` |
| `$ne` | `not` |
| `$or / $and` | `OR / AND` |
| `$regex` | `contains / startsWith` (`mode: "insensitive"`) |
| `$exists: false` | `null` (yoki `isSet` — Prisma'da kerak emas) |
| `$inc: { n: 1 }` | `data: { n: { increment: 1 } }` |
| `$push` | ichki jadvalga `create` |
| `.aggregate([...])` | `groupBy` / `aggregate`, murakkabi — `$queryRaw` |
| `session.withTransaction` | `prisma.$transaction([...])` |

### 3.2 Ehtiyot bo'lish kerak bo'lgan joylar

1. **`_id` → `id`.** Servis ichida `id` ishlatiladi, lekin **javobda**
   `_id` qolishi SHART — butun frontend shunga tayangan. Buning uchun
   `utils/serialize.js` dagi `withLegacyId()` ishlatiladi.

2. **NULL semantikasi.** Mongo unique indeksda `null` ni oddiy qiymat deb
   sanaydi, PostgreSQL esa `NULL != NULL`. Shuning uchun Mongo'dagi bitta
   unique indeks bu yerda ikkitaga bo'linishi mumkin — namuna:
   `migrations/*_partial_unique_indexes/migration.sql`.

3. **Soft delete avtomatik EMAS.** Mongoose plugin'i ham avtomatik
   filtrlamasdi, shuning uchun xulq bir xil: har bir so'rovda
   `isDeleted: false` ni **ochiq** yozing.

4. **Aggregate.** 114 ta quvur bor. Oddiy `$group`/`$sum` uchun
   `groupBy` yetadi; `$lookup` yoki bir nechta bosqichli quvur uchun
   `$queryRaw` bilan SQL yozish TO'G'RIROQ — Prisma'da sun'iy
   ko'p bosqichli qurilma yasashdan ko'ra.

5. **Tranzaksiya — endi haqiqiy.** Mongo'da ko'p joyda "ikki so'rov,
   oradagi xato = buzuq holat" muammosi bor edi. Ko'chirishda bunday
   juftliklarni `prisma.$transaction([...])` ichiga oling
   (namuna: `changePassword`).

---

## 4. Qabul qilingan qarorlar

| Qaror | Sabab |
|---|---|
| Kalit — 24-hex satr, `cuid()` emas | 14 ta zod validator va frontend `/^[0-9a-fA-F]{24}$/` ni tekshiradi |
| Pul maydonlari — `Float` | Mongo'da ham `float64` edi; `Decimal` ga o'tish 54k qator arifmetikani o'zgartiradi → **alohida ish** |
| Prisma 6 (7 emas) | Prisma 7 `datasource.url` ni tashlab, driver adapter + `prisma.config.ts` talab qiladi |
| `deletedBy` — FK emas, oddiy ustun | Hech qachon populate qilinmaydi; audit izi foydalanuvchi o'chsa ham qolishi kerak |
| Enumlar — Prisma `enum` | Mongoose ham enum bilan cheklardi; xulq bir xil qoladi |
| Embedded massivlar | Qidiriladiganlari alohida jadvalga (`GroupScheduleItem`, `JournalLine`, `UserBranchAssignment`, `DebtWriteOffBreakdown`), qolgani `Json` |

---

## 5. Migratsiya davomida topilgan xato

**Refresh token bir sekund ichida takrorlanishi** (`utils/jwt.js`).

`signRefresh({sub, role})` bir xil payload bilan bir sekund ichida
**bayt-bayt bir xil** token beradi (JWT `iat` faqat sekund aniqligida),
ya'ni `tokenHash` ham bir xil. `tokenHash` esa unique — natijada
"kirish → darhol yangilash" oqimi unique constraint xatosi bilan yiqilardi.

Bu **Mongo davridan beri bor edi** (u yerda ham `tokenHash: unique`), lekin
odam tezligida kamdan-kam ko'rinardi; migratsiya testi uni ochib berdi.
Tuzatish: refresh payload'iga noyob `jti` qo'shildi.

---

## 6. Deploy talabi: Node ≥ 22.12

`pg-boss@12` **Node 22.12+** talab qiladi (`engines`). VPS'da eskiroq Node
bo'lsa `provision.sh` ichidagi `npm ci` shu bosqichda yiqiladi.

Deploydan oldin tekshiring:

```bash
node -v   # >= v22.12.0 bo'lishi kerak
```

Eskiroq Node'da qolish shart bo'lsa — `pg-boss@10` ga tushirish mumkin,
lekin unda `work()` handler imzosi boshqacha; `config/scheduler.js`
dagi moslashtiruvchi qatlam shunga moslanishi kerak bo'ladi.

---

## 7. Qanday ishga tushirish

```bash
# 1) PostgreSQL va baza
createdb bayyina

# 2) .env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bayyina?schema=public

# 3) Migratsiyalar + klient
npm run prisma:deploy
npm run prisma:generate

# 4) Tekshirish
npm run test:auth-prisma
```
