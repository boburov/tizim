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
| **`modules/users`** | list / stats / CRUD / parol / arxiv / rol / filial / hard-delete — **49/49 test** (`npm run test:users-prisma`) |
| `modules/studentFreeze` | muzlatish/chiqarish + ro'yxat filtri (users.list shunga tayanadi) |
| `modules/staffPayroll/payrollAudit` | HR sanasi auditi (`users.update` chaqiradi) |
| `helpers/userRelations.helper.js` | hard-delete bloklovchilari + cascade |
| `helpers/membership.helper.js`, `studentCompletion.helper.js` | a'zolik va yakunlash sanasi |
| `helpers/correlationCache.js`, `botStatus.helper.js`, `cascadeDelete.helper.js` | kesh, Telegram holati, soft-delete cascade |
| `finance/financeTxn.helper.js` | `runFinanceTxn` → `prisma.$transaction` |
| `groups/teacherGroupPeriod.service.js` | **o'qish/rezolver yo'llari** — **20/20 test** (`npm run test:group-periods`) |
| **`modules/teacherSalary`** (butun modul) | rateResolver, variableBase, teacherCompensation, teacherSalary, salaryTransaction, salaryAdjustment — **31/31 test** (`npm run test:salary-chain`) |
| **`modules/groups`** (butun modul) | groups.service (1673 → 1779), teacherGroupPeriod **yozish yo'llari ham** — **31/31 test** (`npm run test:groups-chain`) |
| **`modules/finance`** | groupFee, studentPayment, discount, transaction, financeTxn |
| **`modules/deposits`**, **`modules/openingBalance`** | to'liq |
| `modules/journal/journal.service.js` | qo'sh yozuv (post/reverse/balances/reconcile) |
| `modules/holidays`, `modules/lessonCancellations` | pul yo'lidagi tranzitiv blokerlar |
| `helpers/studentFreeze.helper.js`, `journalPosting.helper.js` | muzlatish oynalari, jurnal postlash |

**Hozir ishlaydi — 22 endpoint (200):**
`/auth/*`, `/branches` (+compare, stats), `/roles` (+matrix), `/courses`,
`/rooms`, `/archive-reasons`, `/feedback-types`, `/lead-options`,
`/notification-templates`, `/attendance-settings`, `/storage/usage`,
`/system-notifications`, `/notifications/inbox/unread-count`,
`/expense-approvals` (+pending-count, stats),
`/admin-dashboard/*` (overview, cashflow, student-flow).

Boot'da **0 ta ERROR**, rejalashtiruvchi 26 job bilan ko'tariladi.

**Hozir ishlamaydi:** `/leads`, `/expenses`, `/feedback`, `/activity-logs`,
`/attendance`, `/grades`, `/assignments`, `/staff-payroll`, `/imports`,
`/exports`, `/ai`, `/branch-analytics`, `/finance-report`, `/ledger`,
xazina (`shift`, `cashTransfer`, `journalVerify`) va bot.

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

### ⏳ Qolgan (121 fayl)

Quyidagilar **hali Mongoose'da** va shuning uchun **hozircha ishlamaydi**
(Mongo ulanishi olib tashlangan). Ko'chirish tartibi — bog'liqlik bo'yicha:

**1-to'lqin — poydevor helperlar** ✅ **bajarildi**
`membership`, `studentCompletion`, `userRelations`, `roles`, `cascadeDelete`,
`botStatus`, `correlationCache`, `selfSalary.guard` — hammasi Prisma'da.
Qolgani: `studentFreeze.helper.js` va `lessonCancellation.helper.js` —
ular davomat/to'lov to'lqiniga tegishli (chaqiruvchilari hali Mongoose'da).

**2-to'lqin — asosiy ma'lumot** — `branches`, `roles`, `courses`, `rooms` ✅

**`users`** ✅ **bajarildi** (1385 qator, 17 eksport, 49 ta test).

**`groups`** ✅ **bajarildi** (1779 qator, 26 eksport, 31 ta test).

**Moliya/maosh zanjiri (2-to'lqin)** ✅ **bajarildi**

| Modul | Holat |
|---|---|
| `teacherSalary/rateResolver.helper.js` | ✅ |
| `teacherSalary/variableBase.helper.js` | ✅ |
| `teacherSalary/teacherCompensation.service.js` | ✅ |
| `teacherSalary/teacherSalary.service.js` | ✅ |
| `teacherSalary/salaryTransaction.service.js` | ✅ |
| `teacherSalary/salaryAdjustment.service.js` | ✅ |
| `finance/groupFee.service.js` | ✅ |
| `finance/studentPayment.service.js` | ✅ |
| `finance/discount.service.js` | ✅ |
| `finance/services/transaction.service.js` | ✅ |
| `deposits/deposit.service.js` | ✅ |
| `openingBalance/openingBalance.service.js` | ✅ |
| `groups/groups.service.js` | ✅ |
| `journal/journal.service.js` | ✅ |

### ⚠️ ATOMIK YOZISH: Mongo update-pipeline'ining o'rni

Mongo `paidAmount`/`status`/`overpaidAmount` ni **aggregation update
pipeline** bilan yozardi — status BAZADAGI joriy `paidAmount` dan bitta
atomik amalda keltirib chiqarilardi. Prisma'da bunday quvur **yo'q**.
Ikki vosita bilan almashtirildi:

1. **`applyPaidDelta`** (teacherSalary + studentPayment + depozit balansi)
   → **bitta xom `UPDATE`**. Faqat shu yerda "shartli-atomik" o'zgartirish
   kerak (`capToRemaining`: yangi summa qoldiqdan oshsa qator umuman
   yangilanmasin). SQL'da o'ng tomondagi ustun ESKI qiymatni beradi —
   Mongo'dagi `"$paidAmount"` bilan aynan bir xil.
2. **`recalc` / `recalcStatus`** → `$transaction` + `SELECT … FOR UPDATE`.
   Qator qulflanadi, `paidAmount` o'qiladi, status JS'da hisoblanadi.

> **HECH QACHON** "o'qi → hisobla → saqla" naqshiga tushirmang: u yo'qolgan
> to'lov (lost update) demakdir.
>
> **`updatedAt`**: Prisma'ning `@updatedAt` KLIENT tomonida ishlaydi.
> Xom SQL uni chetlab o'tadi — `"updatedAt" = NOW()` ochiq yoziladi.

### ⚠️ O'CHIRISH TARTIBI ENDI MAJBURIY

Mongo'da FK yo'q edi — qatorlarni istalgan tartibda o'chirish mumkin edi.
PostgreSQL'da `RESTRICT` bor, ya'ni **bola ota'sidan oldin** ketishi shart:

```text
payment_transactions.paymentId → student_payments   (RESTRICT)
salary_transactions.salaryId   → teacher_salaries   (RESTRICT)
deposit_transactions.depositId → student_deposits   (RESTRICT)
```

`helpers/userRelations.helper.js` shu tartibda qayta yozildi va Mongo
umuman tegmagan jadvallar qo'shildi (depozit, muzlatish, boshlang'ich
qoldiq, yomon qarz, maosh stavkasi, audit jurnali) — ularsiz o'chirish
FK xatosi bilan yiqilardi.

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

### `cascadeDelete` moliya yozuvlarini YASHIRMASDI

`cascadeDelete.helper.js` guruh yoki o'quvchi o'chirilganda
`StudentPayment` va `TeacherSalary` ga ham `$set: { isDeleted: true }`
yozardi. Ikkala modelda softDelete plagini **umuman yo'q** (fayllardagi
izoh buni ochiq aytadi), Mongoose esa sxemada bo'lmagan maydonni
jimgina tashlab yuborardi — ya'ni bu qatorlar **hech qachon hech nima
qilmagan**.

Postgres bunday yozuvni yutmaydi: ustun yo'q → xato. Chaqiruvlar olib
tashlandi va sabab kodda izohlab qo'yildi. **Xulq-atvor o'zgarmadi** —
u yozuvlar ilgari ham belgilanmasdi; ular a'zolik/davrlardan qayta
hisoblanadi (`recalc`), ya'ni summalar o'zi nolga tushadi.

### `assignTeacher` o'qituvchini 0 maoshga qulflaydi (MONGO DAVRIDAN)

`teacherGroupPeriod.assignTeacher()` → `create()` ni `inheritStandardRate`
BERMASDAN chaqiradi. `normalizeRate()` esa stavka berilmasa ham
`salaryType:"fixed", fixedAmount:0` yozadi, `rateResolver.hasOwnRate()`
buni **ustunlik** deb biladi va o'qituvchining STANDART shartnomasi
(`TeacherCompensation`) umuman qaralmaydi.

Natija: guruh yaratish va o'qituvchi almashtirish orqali biriktirilgan
o'qituvchining o'sha guruhdagi maoshi **0** bo'lib qoladi
(`rateSource: "period_legacy"`). `handover` yo'li bayroqni beradi, ya'ni
u to'g'ri ishlaydi.

Bu **migratsiya regressiyasi EMAS** — `git 9fb01b7` da ham shunday.
Tuzatish o'qituvchilarning haqiqiy maoshini 0 dan real summaga ko'taradi,
ya'ni bu **moliyaviy qaror**; migratsiya kommitiga jimgina qo'shilmadi.
`tests/groupsChainPrisma.test.js` uni "[MAVJUD XATO]" nomi bilan ochiq
qayd etadi — tuzatilsa test ogohlantirish beradi.

### `leadRouting` — `branchId: undefined`

`ensureMainBranch()` xom Prisma obyekti qaytaradi (`id`), servis esa
`main._id` o'qirdi → `undefined`. Zaxira yo'lda lidga filial
biriktirilmay qolardi ("lid hech qachon yo'qolmaydi" invarianti
buzilardi). Tuzatildi.

---

## 5b. Ochiq qarorlar (kod emas, siyosat)

Audit topgan, lekin **migratsiyada ataylab hal qilinmagan** masalalar.
Har biri pul summasini o'zgartiradi, shuning uchun egasining qarori kerak:

| Masala | Nega hozir hal qilinmadi |
|---|---|
| `assignTeacher` 0 stavkasi (yuqorida) | Tuzatish maoshni oshiradi — e'lon qilinishi kerak |
| Foiz maoshi bazasi `isOpening` / `writtenOff` qatorlarni QAMRAB OLADI, `financeReport` esa ularni chiqarib tashlaydi | Ikkisini moslashtirish ish haqini o'zgartiradi. Avval `SUM(...) FILTER (...)` bilan o'lchash kerak |
| `computeLessonHours` bayramlarni `["all","students"]` bo'yicha oladi — `audience:"students"` bayram O'QITUVCHI soatini ham kamaytiradi | Assimetriya ehtimol kutilmagan, lekin tuzatish har bir soatbay o'qituvchining maoshini o'zgartiradi |
| Mongoose `pre('validate')` hooklari (≈20 ta) yo'qoldi; bazada CHECK cheklovlari YO'Q | Route'dagi zod faqat HTTP yo'lini qoplaydi; `executeApproved*`, seed va importlar uni chetlab o'tadi. Yagona qaror kerak: CHECK qo'shish, servis qo'riqchisi yoki ataylab qabul qilish |
| `Discount` da unique indeks yo'q (Mongo'da ham yo'q edi) | Ikki bir xil faol chegirma qo'shilib ketishi mumkin. Qisman unique qo'shish mavjud ma'lumotni buzishi mumkin |
| `obligations()`, `salary.getById()`, `groups.restoreDeleted()` filial filtri QO'LLAMAYDI | Hammasi mavjud xatti-harakat; o'zgartirish ruxsat siyosati qarori |

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
