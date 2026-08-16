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
| **`modules/groups`** (butun modul) | groups.service (1673 → 1779), teacherGroupPeriod **yozish yo'llari ham** — **32/32 test** (`npm run test:groups-chain`) |
| **`modules/finance`** | groupFee, studentPayment, discount, transaction, financeTxn |
| **`modules/deposits`**, **`modules/openingBalance`** | to'liq |
| `modules/journal/journal.service.js` | qo'sh yozuv (post/reverse/balances/reconcile) |
| **`modules/staffPayroll`** (butun modul) | kpiTriggers, kpiRule, kpiEngine, staffPayroll, staffCompensation, staffAdjustment, staffSalaryTransaction, payrollHistory — **47/47 test** (`npm run test:staff-payroll`) |
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
`/attendance`, `/grades`, `/assignments`, `/imports`,
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

### ⏳ Qolgan (110 fayl)

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

**Moliyaviy zanjir (4-to'lqin)** ✅ **bajarildi**

| Modul | Holat |
|---|---|
| `expenseApprovals` (qaror yo'llari) | ✅ — **butun zanjirning to'sig'i edi** |
| `expenses/expense.service.js` | ✅ |
| `expenses/expenseCategory.service.js` | ✅ |
| `journal/cashTransfer.service.js` | ✅ |
| `journal/shift.service.js` | ✅ |
| `journal/journalVerify.service.js` | ✅ |
| `financeReport/financeReport.service.js` | ✅ |
| `branchAnalytics/branchPnl.service.js` | ✅ |

**TARTIB O'ZGARDI VA NEGA.** Reja "chiqimlardan boshlash" edi, lekin
chiqimlar tasdiqlarga bog'liq, tasdiqlarning YOZISH yo'llari esa hali
Mongoose'da edi. `expenseApproval.service.js` ni **29 fayl** ishlatadi —
jumladan allaqachon ko'chirilgan `users`, `groups`, `teacherSalary`,
`deposits`, `finance`, `staffPayroll`. Ya'ni ular ham yashirin Mongoose
bog'liqligiga ega edi: tasdiq talab qiladigan har qanday yo'l 501
qaytarardi. Shuning uchun tasdiqlar birinchi ko'chirildi.

**Xodim oyligi (3-to'lqin)** ✅ **bajarildi**

| Modul | Holat |
|---|---|
| `staffPayroll/kpiTriggers.js` | ✅ |
| `staffPayroll/kpiRule.service.js` | ✅ |
| `staffPayroll/kpiEngine.service.js` | ✅ |
| `staffPayroll/staffPayroll.service.js` | ✅ |
| `staffPayroll/staffCompensation.service.js` | ✅ |
| `staffPayroll/staffAdjustment.service.js` | ✅ |
| `staffPayroll/staffSalaryTransaction.service.js` | ✅ |
| `staffPayroll/payrollHistory.service.js` | ✅ |
| `staffPayroll/payrollAudit.service.js` | ✅ |

**Keyingi to'lqin uchun bog'liqlik tartibi** (qolgan 110 fayl):

| Guruh | Fayl | Nega shu tartibda |
|---|---|---|
| 1 | `expenses` (3) + `expenseApprovals` yozish yo'li | `journal.post()` allaqachon Prisma'da; chiqim unga yozadi |
| 2 | `journal/cashTransfer`, `journalVerify` (3) | Xazina; `accounts` cheklovlari tayyor |
| 3 | `attendance` (2) + `grades` (2) + `attendanceExemptions` (1) + `teacherAttendance` (1) | Davomat KPI triggerlarini oziqlantiradi |
| 4 | `assignments`, `feedback`, `activityHistory`, `activityLogs`, `search`, `notifications` (2) | Bir-biriga bog'liq emas, parallel |
| 5 | `ledger` (1), `financeReport` (1), `branchAnalytics` (4) | Faqat O'QIYDI — yuqoridagilar tugagach |
| 6 | `imports` (11) | Barcha servislarga yozadi, shuning uchun oxirida |
| 7 | `ai` (27), `bot` (3), `exports`, `storage` | Mustaqil; `ai` eng katta, lekin pul yo'lida emas |
| — | `seeds` (25), `jobs` (6), `middleware` (3), `queues` (1) | Chaqiruvchilari bilan birga |

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

### `assignTeacher` o'qituvchini 0 maoshga qulflardi (MONGO DAVRIDAN) — ✅ TUZATILDI

`teacherGroupPeriod.assignTeacher()` → `create()` ni `inheritStandardRate`
BERMASDAN chaqirardi. `normalizeRate()` esa stavka berilmasa ham
`salaryType:"fixed", fixedAmount:0` yozadi, `rateResolver.hasOwnRate()`
buni **davrning o'z stavkasi** deb biladi. Ierarxiya bo'yicha davr o'z
stavkasiga ega bo'lsa standart shartnoma (`TeacherCompensation`) umuman
qaralmaydi — natijada guruh yaratish va o'qituvchi almashtirish orqali
biriktirilgan o'qituvchining o'sha guruhdagi maoshi **0** bo'lib qolardi
(`rateSource: "period_legacy"`). `handover` yo'li bayroqni berardi, ya'ni
u to'g'ri ishlardi.

**Ko'zlangan qoida yangi o'ylab topilmadi** — u `inheritStandardRate`
bayrog'ining o'z izohida allaqachon yozilgan: "guruh boshqa o'qituvchiga
topshirilganda yangi o'qituvchi O'Z shartnomasi bo'yicha olishi kerak".
`assignTeacher` aynan o'sha ergonomik yo'l. Tuzatish shu bayroqni
berishdan iborat; guruhga xos alohida stavka kerak bo'lgan yo'l
(`create()` ni ochiq stavka bilan chaqirish — `teacherPeriod.create`
handler'i) **tegilmadi**.

Bu **migratsiya regressiyasi EMAS** edi — `git 9fb01b7` da ham shunday.
Shuning uchun u migratsiya kommitiga jimgina qo'shilmadi, alohida
biznes-mantiq kommiti bilan tuzatildi (`1c4bd00`).

**QAMROVI: faqat oldinga.** Allaqachon yozilgan davrlarda
`salaryType:"fixed", fixedAmount:0` joyida qoladi va ular baribir 0
bo'lib turaveradi — eski ma'lumotni tuzatish alohida qaror (§5b).

Regressiya: `tests/groupsChainPrisma.test.js` ikkita test bilan qadaydi —
biri natijani (`rateSource="compensation"`, summa > 0), ikkinchisi
sababini (davrning uchala stavka maydoni ham `null`).

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
| `assignTeacher` bilan yaratilgan ESKI davrlarni tuzatish | Kod tuzatildi, lekin faqat oldinga. Mavjud `salaryType:"fixed", fixedAmount:0` davrlarni `null` ga o'tkazish o'tgan oylarning maoshini 0 dan real summaga ko'taradi — to'langan/qulflangan oylarga tegmaslik kerak |
| Foiz maoshi bazasi `isOpening` / `writtenOff` qatorlarni QAMRAB OLADI, `financeReport` esa ularni chiqarib tashlaydi | Ikkisini moslashtirish ish haqini o'zgartiradi. Avval `SUM(...) FILTER (...)` bilan o'lchash kerak |
| `computeLessonHours` bayramlarni `["all","students"]` bo'yicha oladi — `audience:"students"` bayram O'QITUVCHI soatini ham kamaytiradi | Assimetriya ehtimol kutilmagan, lekin tuzatish har bir soatbay o'qituvchining maoshini o'zgartiradi |
| `StaffPayroll` da `overpaidAmount` ustuni va `PayStatus.overpaid` YO'Q (egizagi `TeacherSalary` da BOR) | Shartnoma tuzatilib `finalAmount` pasaysa, `paidAmount > finalAmount` bo'lib ortiqcha to'lov hech qayerda qayd etilmaydi. Ustun qo'shish yoki fayl sarlavhasidagi "overpaid" da'vosini olib tashlash — egasining qarori |
| `Discount` da unique indeks yo'q (Mongo'da ham yo'q edi) | Ikki bir xil faol chegirma qo'shilib ketishi mumkin. Qisman unique qo'shish mavjud ma'lumotni buzishi mumkin |
| `obligations()`, `salary.getById()`, `groups.restoreDeleted()` filial filtri QO'LLAMAYDI | Mavjud xatti-harakat. `staffPayroll` yo'llari `assertUserInBranchScope()` bilan yopildi (§7); bular boshqa modullarda va alohida ko'rib chiqilishi kerak |
| `staffCompensation.set/amend` da `computePayroll` `try/catch` bilan yutiladi (Mongo davridan) | Shartnoma saqlanadi, joriy oy qatori eskirgan qoladi. Bu hosila kesh (keyingi `generateMonth` tiklaydi), lekin qoida bo'yicha muvaffaqiyatli javob barcha yon ta'sirlar bajarilganini anglatishi kerak |

---

## 6. Validatsiya invariantlari inventarizatsiyasi

MongoDB'da 19 ta model `pre("validate")` hook'iga ega edi. Mongoose modeli
ishlatilmay qo'yilishi bilan bu hooklar **jimgina** ishlamay qoladi: kod
kompilyatsiya bo'ladi, testlar o'tadi, faqat qoida yo'q bo'ladi.

Hooklar **ko'r-ko'rona qayta yaratilmadi.** Har biri uchun avval savol
berildi: bu qoida baza invariantimi, dastur invariantimi, yoki HTTP
darajasidagi qulaylikmi? Javob qayerga qo'yilishini belgilaydi.

### Tasnif mezoni

| Turi | Qayerda | Qachon |
|---|---|---|
| **BAZA INVARIANTI** | `CHECK` cheklovi | Faqat bitta qatorning ustunlariga bog'liq, tashqi kontekst kerak emas |
| **DASTUR INVARIANTI** | Servis qatlami | Boshqa jadvalni o'qish yoki normalizatsiya (mutatsiya) kerak |
| **HTTP VALIDATSIYASI** | Zod | Faqat qulay xato matni; chetlab o'tilsa ham xavf yo'q |
| **HALI TIRIK** | Mongoose | Model hali Prisma'ga ko'chmagan — hook ishlayveradi |

**NEGA IKKI QATLAM (servis + CHECK):** Zod faqat HTTP yo'lini qoplaydi.
Importlar (`src/modules/imports/registry/*`), seedlar, joblar,
`executeApproved*` va ichki servis chaqiruvlari uni **chetlab o'tadi**.
Shuning uchun muhim qoidalar servisda. CHECK esa oxirgi himoya: xom SQL,
`psql` va qo'lda yozilgan tuzatish skripti uchun.

### Ro'yxat

| # | Model | Invariant | Tasnif | Amalga oshirilishi | Test | Holat |
|---|---|---|---|---|---|---|
| 1 | `journalEntry` | Debet yig'indisi = kredit yig'indisi | DASTUR (ko'p qatorli — CHECK ko'ra olmaydi) | `journal.service.js` → `post()` | salary-chain | ✅ saqlangan |
| 2 | `journalEntry` | Bitta qatorda debet va kredit birga bo'lmaydi | BAZA | `journal_lines_single_side_check` + `post()` | invariants | ✅ tiklangan (ikki qatlam) |
| 3 | `journalEntry` | Bo'sh qator (ikkalasi ham 0) bo'lmaydi | BAZA | `journal_lines_nonzero_check` + `post()` | invariants | ✅ tiklangan |
| 4 | `journalEntry` | Nol summali yozuv yozilmaydi | DASTUR | `post()` | salary-chain | ✅ saqlangan |
| 5 | `account` | Filiallararo hisob ↔ qarshi filial juftligi | BAZA | `accounts_counterparty_shape_check` | invariants | ✅ tiklangan |
| 6 | `account` | Filial o'ziga qarzdor bo'lmaydi | BAZA | `accounts_no_self_counterparty_check` | invariants | ✅ tiklangan |
| 7 | `cashTransfer` | Filial o'ziga pul jo'natmaydi | BAZA | `cash_transfers_distinct_branches_check` | invariants | ✅ tiklangan (model hali Mongoose ostida — kelajakka tayyor) |
| 8 | `teacherCompensation` | Foiz stavkasi ≤ 100 | BAZA + HTTP | `teacher_compensations_percent_max_check` + zod refine | invariants | ✅ mustahkamlangan |
| 9 | `teacherCompensation` | `effectiveTo` > `effectiveFrom` | BAZA | `teacher_compensations_range_check` + `assertRange()` | invariants | ✅ tiklangan |
| 10 | `teacherCompensation` | "none" qismning summasi 0 ga tushadi | DASTUR (mutatsiya) + BAZA | `applyRateShape()` + `..._none_zeroed_check` | invariants | 🔴 **YO'QOLGAN EDI → tiklandi** |
| 11 | `teacherCompensation` | Ikkala qism ham "none" bo'lmaydi | DASTUR + BAZA | `applyRateShape()` + `..._not_empty_check` | invariants | 🔴 **YO'QOLGAN EDI → tiklandi** |
| 12 | `teacherSalary` | `kind="group"` guruhsiz, `kind="base"` guruhli bo'lmaydi | BAZA | `teacher_salaries_kind_group_check` | invariants | 🔴 **YO'QOLGAN EDI → tiklandi** |
| 13 | `staffCompensation` | `kpi_only` → `baseAmount` = 0 | DASTUR (mutatsiya) | `setCompensation` (bor edi) + `amendCompensation` | invariants, staff-payroll | 🟡 **YARIM YO'QOLGAN (`amend` yo'li) → tiklandi** |
| 14 | `staffCompensation` | `effectiveTo` > `effectiveFrom` | BAZA | `staff_compensations_range_check` | invariants | ✅ saqlangan (servis) + mustahkamlangan |
| 15 | `kpiRule` | Foizli mukofot ≤ 100 | DASTUR + BAZA | `assertRewardShape()` + `kpi_rules_percent_max_check` | invariants | 🔴 **YO'QOLGAN EDI → tiklandi** |
| 16 | `discount` | Foiz ≤ 100 | DASTUR + BAZA | `assertDiscountShape()` + `discounts_percent_max_check` | invariants | 🔴 **YO'QOLGAN EDI → tiklandi** |
| 17 | `discount` | `scope="monthly"` → yil va oy majburiy | DASTUR + BAZA | `assertDiscountShape()` + `discounts_monthly_scope_check` | invariants | 🔴 **JIMGINA YO'QOLGAN EDI → tiklandi** |
| 18 | `openingBalance` | Summa nolga teng bo'lmagan butun son, ≤ 500 mln | DASTUR + BAZA + HTTP | servis (bor edi) + 3 ta CHECK + zod | invariants, staff-payroll | ✅ saqlangan + mustahkamlangan |
| 19 | `group` | Jadvalda (kun+vaqt+effectiveFrom) takrorlanmaydi | HTTP | `validators/common.js` → `scheduleArray` | groups-chain | ✅ saqlangan |
| 20 | `group` | `startTime` < `endTime` | HTTP | `validators/common.js` → `scheduleItem` | groups-chain | ✅ saqlangan |
| 21 | `holiday` | Bir martalik → yil majburiy; takrorlanuvchi → yil `null` | DASTUR + BAZA | `holidays.service.js` + `holidays_recurring_year_check` | invariants | ✅ saqlangan + mustahkamlangan |
| 22 | `leadRoutingRule` | `isFallback` ↔ `sourceKey` bir-birini INKOR qiladi | DASTUR + BAZA | `leadRouting.service.js` + `..._fallback_shape_check` | invariants | ✅ saqlangan + mustahkamlangan |
| 23 | `studentFreeze` | `endDate` ≥ `startDate` | DASTUR + BAZA | `unfreeze()` + `student_freezes_range_check` | invariants | ✅ saqlangan + mustahkamlangan |
| 24 | `role` | Tizim roli muzlatilmaydi / tipi o'zgarmaydi | DASTUR | `assertNotSystemRole()`, `create` da `isSystem:false` | — | ✅ ekvivalent |
| 25 | `user` | `role` bo'sh bo'lsa → `student` | BAZA (default) | `User.role @default("student")` | users | ✅ kuchaytirilgan (endi baza standarti) |
| 26 | `branch` | Delegatsiya matritsasi shakli | DASTUR | `branches.service.js:216` → `validateDelegation()` | — | ✅ saqlangan |
| 27 | `approval` | `category` `kind` dan HOSILA; moliyaviy so'rovda summa ≥ 1 | HALI TIRIK | Mongoose hook | — | ⏳ modul ko'chmagan |
| 28 | `attendanceExemption` | `endDate` ≥ `startDate` | HALI TIRIK + BAZA | Mongoose hook + `attendance_exemptions_range_check` | invariants | ⏳ modul ko'chmagan, CHECK tayyor |
| 29 | `expense` | Valyuta → kurs va asl summa; kapital → amortizatsiya | HALI TIRIK | Mongoose hook | — | ⏳ modul ko'chmagan |

Qo'shimcha: Mongoose **sxemasida** (hook'da emas) turgan cheklovlar ham
ko'chishda tushib qolgan edi — ular ham baza darajasida edi:

| Model | Invariant | Amalga oshirilishi |
|---|---|---|
| `staffPayrollAdjustment` | Summa ≥ 1 (ishora `kind` da) | `..._amount_min_check` |
| `staffPayrollAdjustment` | Oy 1..12 | `..._month_check` |
| `staffPayrollAdjustment` | Sabab majburiy, ≤ 500 belgi | `..._reason_len_check` |
| `staffPayrollAdjustment` | `carriedFromYear`/`Month` **birga** to'ldiriladi | `..._carried_from_pair_check` |

Oxirgisi **yassilash oqibati**: Mongo'da `carriedFrom` bitta ichki obyekt
edi (yo bor, yo yo'q). Ikkita mustaqil ustunga bo'linganda "yil bor, oy
yo'q" holati texnik jihatdan mumkin bo'lib qoldi — bunday qator qarz
qaysi oydan ko'chganini yo'qotadi va zanjir uziladi.

### Yakun

- **Bazaga qo'shilgan cheklovlar:** 27 ta `CHECK`, 14 jadvalda
  (`20260816090000_validation_invariants`).
- **Dastur invariantlari (servis qatlami):** `applyRateShape()`,
  `assertRange()` (teacherCompensation), `assertRewardShape()` (kpiRule),
  `assertDiscountShape()` (discount), `amendCompensation` dagi `kpi_only`
  koersiyasi (staffCompensation) — barchasi **qisman patch** ustida ham
  ishlaydi (tekshiruv keyingi holat bo'yicha, yuborilgan maydonlar
  bo'yicha emas).
- **Faqat HTTP darajasida qolganlar:** guruh jadvali qoidalari (19, 20).
  Guruh jadvali faqat `groups` servisi orqali yoziladi va u zod
  sxemasidan o'tadi; import yo'li yo'q. Ataylab shunday qoldirildi —
  massiv ichidagi takrorlanishni `CHECK` ifodalay olmaydi.
- **Hal qilinmagan:** yo'q. `⏳` bilan belgilangan 3 tasi hali Mongoose
  ostida **tirik** — ular yo'qolgan emas, moduli ko'chganda ko'chiriladi.


### 4-to'lqinda topilgan va tuzatilgan xatolar

| Xato | Qayerda | Ta'siri |
|---|---|---|
| **Pul ikkilanishi (poyga)** | `cashTransfer.receive/cancel`, `shift.close` | "O'qi → tekshir → jurnalga yoz → holatni yoz". Ikki bir vaqtdagi `receive` IKKALASI ham `in_transit` ni o'qib, IKKALASI ham jurnal yozardi: `due_from`/`due_to` va kassa **ikki barobar** oshardi. Endi holat AVVAL atomik olinadi (`updateMany` + count), jurnal esa o'sha tranzaksiyada. |
| **`/journal/reconcile` butunlay buzuq** | `journal.findUnbalanced` (Wave 2 dan beri) | Prisma maydon havolasi `not` bilan ishlamaydi → `PrismaClientValidationError` → 500. Jurnal to'g'riligini tekshiradigan **yagona vosita** o'zi yiqilgan edi. Xom SQL bilan tuzatildi. |
| **Filial sizishi ×2** | `financeReport.getLedger`, `getWriteOffs` | Filial ko'lami UMUMAN yo'q edi: filial direktori butun tarmoqning tranzaksiyalarini **o'quvchi/o'qituvchi ismlari bilan** ko'rardi. Modul 501 bo'lgani uchun ko'rinmasdi — ko'chirish uni tiriltirardi, shuning uchun ayni ko'chirishda yopildi. `debt_write_offs` da `branchId` ustuni yo'q, shuning uchun ko'lam guruh orqali (`branchGroupFilter`). |
| **Prisma xatolari moslanmagan** | `errorHandler` | `P2002` (unique) → 500 "Serverda xatolik" bo'lib chiqardi. Endi 409/400 + CHECK buzilishi uchun 400. |
| **Yo'qolgan invariant #27** | `Approval` | Model `amount: {min: 0}` va "moliyaviy so'rovda summa majburiy" qoidalarini ushlab turardi. Model o'lgach ikkalasi ham yo'qolardi — chiqim so'rovining butun ma'nosi limit tekshiruvida, summasiz so'rov esa uni aylanib o'tish yo'li bo'lardi. Servis + 2 ta CHECK. |
| **Yo'qolgan invariant #29** | `Expense` | Valyuta → kurs va asl summa majburiy; kapital → amortizatsiya muddati majburiy. Servisga qo'yildi (Zod'ga EMAS: `executeApprovedExpense` HTTP'ni chetlab o'tadi). |
| **Ikki xil sxemaga bitta funksiya** | `financeReport.billedAndOutstanding` | `TeacherSalary` da `writtenOff` ustuni **yo'q** — Mongo `$ifNull` bilan jimgina `false` qilardi, Postgres esa `column does not exist` beradi. Ikkita alohida funksiyaga ajratildi; farq endi kodda ko'rinadi. |
| **Soat mintaqasi** | `groupsChain` testi | Handover cutoff'i `getUTCDate()+1` bilan hisoblanardi, ilova esa kunni MAHALLIY zonada belgilaydi. Kechasi 00:00–05:00 oralig'ida ikkalasi teng bo'lib qolib test yiqilardi. |

### Migratsiyani qo'llash haqida ogohlantirish

`20260816090000_validation_invariants` **ma'lumot buzuq bo'lsa yiqiladi.**
Bu kutilgan xatti-harakat: buzilgan moliyaviy qatorni jimgina qabul
qilgandan ko'ra deploy'ni to'xtatgan yaxshi. Migratsiya yozilishidan oldin
mavjud baza har bir shart bo'yicha tekshirildi — buzilgan qator topilmadi;
prod bazada topilsa, xato matnidagi cheklov nomi bo'yicha aybdor qatorlarni
shu shartning **inkori** bilan qidiring:

```sql
SELECT * FROM discounts WHERE type = 'percent' AND value > 100;
```

Cheklov darhol ish berdi: `usersPrisma` testidagi bir fixture sxema
standarti tufayli `kind='group', groupId=NULL` yaroqsiz qatorini
yozayotgan ekan (Mongo hook'i ham uni rad etardi).

---

## 7. Filial izolyatsiyasi: `assertUserInBranchScope()`

Ro'yxat funksiyalari filial shartini `where` ichida qo'llaydi — begona
qator umuman **topilmaydi**, ya'ni ular o'z-o'zidan xavfsiz. Lekin
identifikatorni `params`/`body` dan to'g'ridan-to'g'ri oladigan yo'llarda
hech qanday filtr yo'q edi.

**Tahdid modeli:** filial direktori o'z panelida boshqa filial xodimini
ko'rmaydi, lekin ID ni qo'lda kiritib so'rov yubora oladi. UI da yashirish
himoya emas — tekshiruv **server tomonda** bo'lishi shart.

```js
// helpers/branchContext.helper.js
await assertUserInBranchScope(employeeId);   // aks holda 403
```

Qo'riqchi `userBranchCondition()` bilan **bir xil mantiqda** ishlaydi
(`homeBranchId` YOKI `branchAssignments`), shuning uchun ro'yxat nimani
ko'rsatsa, qo'riqchi aynan o'shanga ruxsat beradi — ikki xil qoida bo'lib
qolmaydi. Super Admin (`canSeeAllBranches`, filial tanlanmagan) va
kontekstsiz chaqiruvlar (job, seed, import) uchun `userBranchCondition()`
`null` qaytaradi va tekshiruv o'tkazib yuboriladi.

404 emas, **403**: yozuv bor-yo'qligini oshkor qilmaymiz, lekin
"topilmadi" deyish chaqiruvchini adashtirardi (u ID ni to'g'ri biladi).

Yopilgan yo'llar (har biri test bilan qadalgan — tuzatishdan oldin
**o'tib ketardi**):

| Servis | Funksiya | Nima qilardi |
|---|---|---|
| `staffPayroll` | `getById` | Begona filial maosh qatorini to'liq ochardi |
| `staffPayroll` | `historyByEmployee` | Begona xodimning butun maosh tarixi |
| `staffPayroll` | `setLifecycle` | Begona oyni qulflash/ochish **va qayta hisoblash** |
| `staffAdjustment` | `create` | **Begona xodimga bonus/jarima yozish** (pul yozadigan yo'l) |
| `payrollHistory` | `getImpact`, `setPayrollStart`, `previewGenerate`, `generateRange`, `recalcUnlocked`, `setLock` | O'qish, generatsiya va qulflash |

To'lov yo'li (`staffSalaryTransaction`) allaqachon `isBranchAllowed()`
bilan himoyalangan edi.

**Qo'riqchi haddan tashqari qattiq emasligi ham qadalgan:** ikki test —
"o'z filialida barcha yo'llar ochiq qoladi" va "Super Admin hamma
filialni ko'radi". Ularsiz "hammasini rad et" ham testdan o'tib ketardi.

---

## 8. Ko'chirilmagan modul — HTTP kontrakti (501)

Mongo ulanishi olib tashlangan, `src/models/*` esa hali joyida. Ko'chirilmagan
modulga so'rov kelganda Mongoose standart holatda **10 soniya buferda kutardi**,
keyin `MongooseError: buffering timed out` bilan yiqilardi va `errorHandler`
uni **500** qilib qaytarardi.

Ikki tomonlama noto'g'ri edi:

| | Ilgari | Endi |
|---|---|---|
| Tezlik | 10 000 ms osiladi | **2–26 ms** |
| Kod | `500` "server buzilgan" | `501 MODULE_NOT_MIGRATED` |
| Mijoz | qizil xato, "qayta urinib ko'ring" | xotirjam "Manba ulanmagan" |

**Yechim:** `config/legacyMongoose.js` → `mongoose.set("bufferCommands", false)`
(boot'da, marshrutlar import qilinishidan oldin) + `errorHandler` ulanish
xatosini tanib **501** qaytaradi.

**NEGA MARSHRUT RO'YXATI EMAS.** "Qaysi modul ko'chirilmagan" degan qo'lda
yozilgan ro'yxat ikki tomonlama xato bo'lardi:

- Statik importlar bo'yicha aniqlash **haddan tashqari keng**: `/admin-dashboard`
  `retention.service.js` orqali `user.model.js` ni import qiladi, lekin
  `getOverview` uni hech qachon **chaqirmaydi** — endpoint mukammal ishlaydi
  (200). Import zararsiz; faqat **so'rov bajarish** osiladi. Ro'yxatga tayansak
  ishlab turgan endpointni o'ldirardik.
- Qo'lda yozilgan ro'yxat **eskiradi**: modul ko'chgach kimdir uni o'chirishni
  unutsa, ishlaydigan endpoint 501 bo'lib turaverardi.

Bu yerdagi yondashuv **haqiqatga** tayanadi: so'rov chinakam bajarilsa va
ulanish bo'lmasa — 501. Modul Prisma'ga ko'chgach Mongoose chaqiruvi qolmaydi
va 501 **o'z-o'zidan** yo'qoladi.

### Hozir 501 qaytaradiganlar (rahbariyat paneli chaqiradigan)

| Endpoint | Sabab |
|---|---|
| `/ai/*` | `insights.find()` — Mongoose |

**4-to'lqindan keyin 200 qaytaradiganlar** (ilgari 501 edi):
`/expenses/*`, `/expense-approvals/*`, `/journal/transfers`,
`/journal/shifts`, `/journal/reconcile`, `/finance-report/*`,
`/branch-analytics/pnl`.

Rahbariyat paneli ularni **avtomatik** ko'rsata boshladi — klient kodiga
BIR QATOR ham tegilmadi. Shartnoma shunga mo'ljallangan edi:
`fromQuery` 501 ni `not_connected`, 200 ni `ready` deb o'qiydi.

Test: `npm run test:dashboard-contract` (32 tekshiruv). U **501 ni ham, 200 ni
ham** qabul qiladi — modul ko'chganda test yiqilmasligi kerak, aks holda uni
ko'chirgan odam testni ham "tuzatishga" majbur bo'lardi.

---

## 9. Deploy talabi: Node ≥ 22.12

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

## 10. Qanday ishga tushirish

```bash
# 1) PostgreSQL va baza
createdb bayyina

# 2) .env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bayyina?schema=public

# 3) Migratsiyalar + klient
npm run prisma:deploy
npm run prisma:generate

# 4) Tekshirish — 239 ta tekshiruv, haqiqiy Postgres ustida
npm run test:auth-prisma      #  16  login / refresh / parol
npm run test:users-prisma     #  49  CRUD / arxiv / hard-delete
npm run test:group-periods    #  20  dars davrlari, stavka rezolveri
npm run test:salary-chain     #  31  o'qituvchi maoshi + jurnal
npm run test:groups-chain     #  32  guruh, jadval versiyalash
npm run test:staff-payroll    #  47  xodim oyligi + filial qo'riqchisi
npm run test:invariants       #  44  validatsiya invariantlari (servis + CHECK)
npm run test:expenses-chain      # 35  chiqim + tasdiq zanjiri
npm run test:dashboard-contract  # 40  klient↔server kontrakti (server ISHLAB TURSIN)
```

`test:dashboard-contract` boshqalardan FARQ QILADI: u haqiqiy HTTP so'rov
yuboradi, ya'ni `npm run dev` ishlab turishi shart. U qiymatlarni emas,
KONTRAKTNI tekshiradi (maydon bor, turi to'g'ri, konvert kutilgan shaklda) —
qiymatlar har bazada boshqacha.

Testlar **bir-biriga bog'liq emas** va o'zidan keyin tozalanadi, shuning
uchun istalgan tartibda ishlatsa bo'ladi. Ular MOCK EMAS — haqiqiy
`DATABASE_URL` ustida ishlaydi, ya'ni indeks, FK va CHECK cheklovlari
ham tekshiriladi.
