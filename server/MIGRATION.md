# MongoDB → PostgreSQL (Prisma) migratsiyasi

Bu hujjat migratsiyaning **joriy holati**, **qabul qilingan qarorlar** va
**qolgan ish** ro'yxatini yuritadi. Modul ko'chirilgach shu yerdagi
jadval yangilanadi.

---

## 1. Nega va nima o'zgardi

| | Ilgari | Endi |
|---|---|---|
| Baza | MongoDB | PostgreSQL 16 |
| ORM | Mongoose (74 model) | Prisma (84 model) |
| Joblar | Agenda (Mongo'ga bog'liq) | pg-boss (Postgres) |
| Kalit | `ObjectId` | 24-hex satr (`gen_object_id()`) |
| TTL | `expireAfterSeconds` indeksi | `jobs/ttlCleanup.job.js` |
| Qisman unique | `partialFilterExpression` | `CREATE UNIQUE INDEX ... WHERE` |

---

## 2. Holat — ✅ TUGADI (2026-08-20)

`src/` da birorta Mongoose chaqiruvi QOLMADI. Tekshirish:

```bash
grep -rn 'from "mongoose"' src/     # 0 natija
grep -rn 'models/' src/             # 0 natija
```

### Yakuniy tozalash (Stage A)

| Nima | Holat |
|---|---|
| `src/models/` (74 model + 2 plagin) | 🗑 o'chirildi |
| `config/legacyMongoose.js` | 🗑 o'chirildi |
| `errorHandler` dagi Mongoose shoxlari (`ValidationError`, `CastError`, `11000`) | 🗑 o'chirildi |
| `501 MODULE_NOT_MIGRATED` shartnomasi | 🗑 o'chirildi — endi hech qachon ishlamaydi |
| `mongoose` bog'lamasi (`package.json`) | 🗑 o'chirildi |
| `app.js` dagi `configureLegacyMongoose()` chaqiruvi | 🗑 o'chirildi |

### Model konstantalari — yangi manzillar

Modellar faqat QIYMAT eksport qilgani uchun hali import qilinardi. Ular
allaqachon mavjud konstanta fayllariga ko'chirildi (qiymatlar AYNAN bir xil):

| Konstanta | Eski joy | Yangi joy |
|---|---|---|
| `DEFAULT_THRESHOLDS`, `DEFAULT_CHURN_WEIGHTS`, `DEFAULT_PAYMENT_WEIGHTS` | `models/aiConfig.model.js` | `constants/aiDefaults.js` |
| `GROUP_DAYS` | `models/group.model.js` | `constants/calendar.js` |
| `AI_REPORT_PERIODS` | `models/aiReport.model.js` | `constants/ai.js` *(yangi qo'shildi)* |
| `STAFF_SALARY_TYPES` | `models/staffCompensation.model.js` | `constants/staffPayroll.js` |
| `CLEANUP_FREQUENCIES` | `models/storageSettings.model.js` | `constants/storage.js` |
| `COMP_BASE_TYPES`, `COMP_VARIABLE_TYPES`, `COMP_PERCENT_BASES` | `models/teacherCompensation.model.js` | `constants/compensation.js` |
| `INSIGHT_SUBJECT_TYPES`, `INSIGHT_SEVERITIES`, `INSIGHT_STATUSES` | `models/insight.model.js` | `modules/ai/insightKinds.js` *(yangi qo'shildi)* |

### Seedlar

**Ko'chirildi (8):** `communicationDefaults`, `fakeData`, `fakeExtras`,
`fakeExtras2`, `aiDemoFinance`, `multiBranchDemo`, `aiChurnBacktest`,
`demoGroup` (avval `package.json` da yo'q edi — `seed:demo-group` qo'shildi).

**O'CHIRILDI (14)** — Mongo davridagi BIR MARTALIK migratsiyalar:
`migrateAttendanceSlot`, `migrateBotUserIndex`, `migrateBranches`,
`migrateCourses`, `migrateDirectorGrades`, `migrateGroupEndDate`,
`migrateMembershipIndex`, `migrateTeacherCompensation`,
`migrateTeacherGroupPeriods`, `migrateUserPhoneIndex`, `backfillUserRole`,
`backfillStudentCompletedAt`, `removePlainPasswords`, `cleanDatabase`.

**NEGA KO'CHIRILMADI, O'CHIRILDI:**

1. PostgreSQL bazasi HAR DOIM noldan quriladi (`createdb` + `prisma migrate
   deploy`) — Mongo'dan ma'lumot ko'chirish skripti kodbazada UMUMAN yo'q.
   Ya'ni bu backfill'lar hech qachon ishlatilmaydigan bazani tuzatardi.
2. `schema.prisma` ularning YAKUNIY HOLATINI allaqachon o'z ichiga oladi
   (`User.role @default("student")`, `phone` unique EMAS, qisman unique
   indekslar migratsiyasi va h.k.).
3. Bir nechtasi Mongo INDEKSLARI bilan ishlaydi (`syncIndexes`, `dropIndex`,
   `sparse` → `partial`) — PostgreSQL'da ekvivalenti yo'q.
4. `migrateDirectorGrades` ni `migrateDirectorFullAccess.seed.js` (Prisma)
   TO'LIQ o'rnini bosadi — u `constants/permissionScope.js` dagi barcha
   filial-ichi ruxsatlarini beradi, `grades.record` ham shular ichida.
5. `cleanDatabase.seed.js` allaqachon ISHLAMAS holatda edi: u `env.MONGO_URL`
   ni o'qirdi, u esa `config/env.js` dan olib tashlangan — ya'ni har
   chaqiruvda 2-xavfsizlik to'sig'ida to'xtardi. `db-reset.sh` ham undan
   voz kechib `prisma migrate reset` ga o'tgan.

### ⚠ SEEDLARDA XULQ-ATVOR O'ZGARDI: o'chirish tartibi va qamrovi

Mongo'da FK yo'q edi — foydalanuvchini istalgan paytda o'chirsa bo'lardi va
unga ishora qiluvchi yozuvlar YETIM qolardi. PostgreSQL'da FK'lar `RESTRICT`.

Shuning uchun `fakeData` va `multiBranchDemo` dagi tozalash:
- **tartiblangan** (`Promise.all` EMAS): bola → ota;
- **kengroq**: `fakeData` endi `grades`, `student_payments`,
  `payment_transactions`, `group_fees` ni ham tozalaydi. Mongo'da ular yetim
  qolardi, bu yerda esa o'chirishni TO'SADI. Bu tanlov emas — baza talabi.

### ⚠ `createMany` yozilgan qatorlarni QAYTARMAYDI

Mongo `insertMany` yaratilgan hujjatlarni `_id` bilan qaytarardi. Prisma
`createMany` faqat SONINI beradi. Kalit kerak bo'lgan joyda ikki yechim:
- `fakeData` — `username` bo'yicha qayta o'qish (`attachIds()`), TARTIB
  saqlanadi (guruhga o'qituvchi indeks bo'yicha biriktiriladi);
- `multiBranchDemo` — kalit OLDINDAN yaratiladi (`oid()`, `gen_object_id()`
  ning JS ekvivalenti), shunda bog'lanishlar yozishdan oldin quriladi.

Ichma-ich yozish kerak bo'lgan joyda (`Group.schedule` + `teachers`,
`Notification.audience*`) `createMany` UMUMAN ishlamaydi — u nested write'ni
qo'llab-quvvatlamaydi, shuning uchun qator alohida `create()` bilan yoziladi.

### ✅ SEEDLARNI ISHLATIB TOPILGAN IKKI SXEMA MUAMMOSI — TUZATILDI

Ikkalasi ham `ON DELETE SET NULL` ning invariant bilan to'qnashuvi. Ikkalasi
ham **mavjud xatti-harakat** edi (bu tozalash keltirib chiqargani EMAS).

> **HOLAT: TUZATILDI** — migratsiya
> `20260820120000_restrict_journal_and_salary_ownership_fks`.
> Beshta egalik kaliti `RESTRICT` ga o'tkazildi:
> `journal_entries.{studentId, teacherId, staffId, groupId}` va
> `teacher_salaries.groupId`. Ma'lumot o'zgarmadi (digest bir xil),
> regressiya testi: `npm run test:fk-restrict` (10 ta tekshiruv).

**1. `teacher_salaries.groupId` — guruhni o'chirib bo'lmaydi.**

`groupId` ixtiyoriy FK, ya'ni Prisma unga standart `SET NULL` qo'yadi.
Guruh o'chganda maosh qatorining `groupId` si NULL ga tushadi, lekin
`teacher_salaries_kind_group_check` `kind='group'` qatoridan `groupId`
NOT NULL bo'lishini TALAB QILADI:

```
ERROR 23514: new row for relation "teacher_salaries"
violates check constraint "teacher_salaries_kind_group_check"
```

Ya'ni **maosh qatori bor guruhni o'chirish MUMKIN EMAS** — na seed'dan,
na paneldan, na `groups.remove()` orqali. Xato esa `group.deleteMany()`
da chiqadi va sababi ko'rinmaydi (guruhga to'g'ridan-to'g'ri hech narsa
tayanmaydi). To'g'ri yechim — FK ni `RESTRICT` qilish (xato o'z joyida
va ma'noli bo'ladi) yoki `kind` ni ham birga yangilash. **Qaror egasiniki.**

**2. `journal_entries.*Id` — o'zgarmas jurnal JIMGINA o'zgaradi.**

`journal_entries` ning `studentId` / `teacherId` / `groupId` / `courseId` /
`roomId` / `membershipId` ustunlari ham `SET NULL`. Ya'ni foydalanuvchi yoki
guruh o'chirilganda **jurnal yozuvining sub'ekti yo'qoladi**. O'lchangan:

| Ustun | Oldin NULL | Keyin NULL |
|---|---|---|
| `studentId` | 25 / 48 | 48 / 48 |
| `teacherId` | 23 / 48 | 48 / 48 |
| `groupId` | 17 / 48 | 48 / 48 |

Bu `config/prisma.js` dagi **jurnal o'zgarmasligi kengaytmasini CHETLAB
O'TADI**: kengaytma `update`/`upsert` ni to'sadi, FK esa qatorni BAZA
ICHIDA o'zgartiradi — ilova qatlami buni umuman ko'rmaydi. Ya'ni
"yozuvni faqat storno bilan tuzatish mumkin" kafolati o'chirish yo'lida
amal qilmaydi. Summalar (`journal_lines`) tegilmaydi, lekin
"bu pul KIMGA tegishli edi" degan ma'lumot qaytarib bo'lmaydigan
tarzda yo'qoladi.

---

### 🔒 GURUHNI O'CHIRISH: MOLIYAVIY TARIX TO'SADI

`journal_entries.groupId` `RESTRICT` bo'lgach, jurnalda izi bor guruhni
o'chirish FK xatosi bilan yiqila boshladi — va xato tranzaksiyaning
O'RTASIDA, depozitlar allaqachon qaytarilgandan keyin chiqardi.

`groups.permanentRemove()` endi buni OLDINDAN tekshiradi:

```
DELETE guruh
   ↓
moliyaviy tarix (journal_entries.groupId) bormi?
   ↓  ha
409 GROUP_HAS_FINANCIAL_HISTORY   →  arxivlang (kursni yakunlang)
```

Javob: `{ success:false, code:"GROUP_HAS_FINANCIAL_HISTORY",
details:{ journalEntries:<son> } }`.

Qo'riqchi TASDIQ NOMIDAN OLDIN turadi — ataylab: umuman mumkin bo'lmagan
amalni tasdiqlatishning ma'nosi yo'q.

Tarixi YO'Q guruh avvalgidek butunlay o'chadi (depozit qaytarish +
atomik o'chirish yo'li saqlangan). Ikkala holat ham
`npm run test:groups-chain` da qadalgan.

---

### ⏳ QOLGAN ISH: 27 ta eski test

`tests/` da 27 fayl hali `mongoose` va `src/models/` ga tayanadi. Ular
ALLAQACHON ishlamas edi (`mongoose.connect(MONGO_URL)` — bunday baza yo'q),
`src/models/` o'chirilgach esa import darajasida yiqiladi.

Ularning `package.json` dagi skriptlari ham o'lik. Ro'yxat:
`aiAdvisor`, `approvalModel`, `assignmentStorage`, `attendanceScope`,
`branchAnalytics`, `branchDelegation`, `branchLeak`, `configApprovals`,
`coursesRoomsPricing`, `directorRole`, `exportScope`, `importDraftGroup`,
`importEngine`, `leadCreatedKpi`, `leadRouting`, `ledger`, `lessonReminders`,
`moneyIsolation`, `openedRoutesScope`, `openingBalance`, `paymentRace`,
`privEscalation`, `resourceScope`, `teacherHandover`, `teacherOffboarding`,
`teacherSalaryBalance` + `helpers/branchGuard.js`.

Ularni o'chirish yoki Prisma'ga ko'chirish — ALOHIDA qaror (qamrov
masalasi), shuning uchun bu tozalashga QO'SHILMADI. Ishlaydigan 27 ta
Prisma testi ularga BOG'LIQ EMAS (`branchGuard.js` ni faqat `branchLeak`
ishlatadi), ya'ni `mongoose` ni olib tashlash ishlaydigan hech narsani
buzmaydi.

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

## 8. Ko'chirilmagan modul — HTTP kontrakti (501) — 🗄 TARIXIY

> **Bu bo'lim endi AMAL QILMAYDI.** `config/legacyMongoose.js` va
> `errorHandler` dagi 501 shoxi o'chirildi (§2), ya'ni `501
> MODULE_NOT_MIGRATED` hech qachon qaytmaydi. Bo'lim migratsiya
> davridagi qarorlarni yozib qo'yish uchun saqlanadi.
>
> **Klient tomonda qoldi:** `client/src/app/query-client.js`,
> `shared/components/dashboard/dataStatus.js`,
> `owner/features/systemAnalysis/*`, `owner/features/ai/pages/
> OperationsCenterPage.jsx` hali 501 ni maxsus ishlaydi. Bu zararsiz
> (shox hech qachon ishlamaydi), lekin o'lik kod — alohida tozalanadi.

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

### Holatni QANDAY o'lchash kerak — `npm run probe:migration`

**Statik tahlilga (`grep mongoose`) ISHONMANG.** U ikkala yo'nalishda
ham adashadi va ikkalasi ham sodir bo'lgan:

* import bor, lekin chaqirilmaydi → endpoint 200, statik tahlil
  "ko'chirilmagan" deydi;
* import yo'q, lekin boshqa fayl orqali chaqiriladi → 501, statik
  tahlil "tayyor" deydi.

`tests/migrationProbe.mjs` har bir modulni HAQIQATAN chaqiradi va HTTP
kodiga qaraydi. Oldingi holat bilan solishtirish:

```bash
npm run probe:migration -- --json > /tmp/before.json
# ...ko'chirish...
npm run probe:migration -- --before /tmp/before.json   # ⬆ YANGI / ⬇ REGRESSIYA
```

**YOLG'ON IJOBIYDAN EHTIYOT BO'LING.** Endpoint ma'lumotga yetmasdan
erta qaytishi mumkin. Haqiqiy misol: `/search?q=a` — kod 2 belgidan
qisqa so'rovni Mongoose'ga umuman yubormaydi, ya'ni 200 qaytarib
"ishlayapti" bo'lib ko'rinardi; `q=owner` bilan esa 501. Zonddagi har
bir yozuv shu sababdan MA'LUMOTGA YETADIGAN parametr bilan yoziladi.

### Hozir 501 qaytaradiganlar

Oxirgi o'lchov: **61/61 (100%)** — ishlash yo'lida Mongoose so'rovi QOLMADI.

Seedlar (25 fayl) ATAYLAB Mongoose'da qoladi — bir martalik skriptlar.

### ⚠ TASHQI AI KO'CHIRISHIDAN KEYIN TOPILGAN VA TUZATILGAN

Ko'chirishning bir qismi tashqi model (Gemini) tomonidan bajarilgan.
Quyidagilar KEYIN topildi — ular zond 100% ko'rsatib turganda ham
mavjud edi:

1. **`aiConfig.service.js` va `aiBudget.service.js` BUTUNLAY o'tkazib
   yuborilgan.** `/ai/briefing`, `/ai/insights`, `/ai/reports` 200
   qaytarardi (bo'sh bazada o'qish yo'li ma'lumot qatlamiga yetmaydi),
   lekin `/ai/recompute` — ya'ni BUTUN detektor zanjiri — 501 edi.
   `aiConfig` har bir detektor birinchi o'qiydigan sozlama qatlami.

2. **So'ralmagan `superAdmin` moduli** qo'shilgan va olib tashlandi:
   - `/super-admin/overview` va `/compare` **500** berardi
     (`Lead.isDeleted` ustuni mavjud emas);
   - **filial ko'lami umuman yo'q**: `req.query.branchIds` to'g'ridan-
     to'g'ri filtrga ketardi, `allowedBranchIds` tekshirilmasdi, bo'sh
     bo'lsa BARCHA filial. Ruxsat `admin_dashboard.read` — filial
     direktorida bor. Ya'ni direktor butun tarmoq moliyasini ko'rardi;
   - `generateActionPlan` **qo'lda yozilgan soxta AI tavsiyasi**
     qaytarardi (o'ylab topilgan foizlar bilan);
   - javob shakli `{success, data}` shartnomasini buzardi;
   - klient marshrutlari `PermissionGuard`siz edi;
   - `/admin` rahbariyat qobig'ini takrorlardi (u allaqachon shu uchta
     ekranni to'g'ri ko'lam bilan beradi).

3. **Zondning ko'r nuqtasi.** U faqat GET qilardi. Endi `WRITE_PROBES`
   bor (`/ai/recompute`) — u ma'lumot qatlamini haqiqatan ishga soladi.

4. **Inventar skriptining ko'r nuqtasi.** `import X, { Y } from` shakli
   regexga tushmasdi — aynan shu tufayli ikkala AI fayli sanoqdan
   chetda qolgan edi.

### `/ai` zanjiri — QISMAN ko'chirilgan

`/admin/tahlil` sahifasi `/ai/briefing` ga tayanadi, u esa quyidagi
zanjirdan iborat. Tugatish tartibi shu (har biri oldingisiga bog'liq):

| Fayl | So'rov / agg | Holat |
|---|---|---|
| `services/briefing.service.js` | 4 / 0 | ✅ |
| `signals/finance.signal.js` | 11 / 8 | ✅ |
| `signals/pulse.signal.js` | 13 / 11 | ⏳ **keyingi** |
| `signals/health.signal.js` | 6 / 0 | ⏳ |
| `services/recompute.service.js` | 3 / 1 | ⏳ |
| `services/insightWriter.service.js` | 4 / 0 | ⏳ |

Qolgan signallar (`student`, `teacher`, `lead`, `course`, `group`) va
`insight` / `report` / `ranking` / `lifecycle` servislari — alohida.

Zanjir tugamaguncha `/ai/briefing` **501 qaytaraveradi va bu TO'G'RI**:
`briefing` Prisma'ga o'tgan bo'lsa ham, u chaqiradigan `pulse` hali
Mongoose'da — 501 shartnomasi shuni aynan shunday ko'rsatishi kerak.

#### `branchMatchStage()` xom SQL'da ISHLAMAYDI

Signallarda filial ko'lami `...branchMatchStage()` ko'rinishida Mongo
quvuriga spread qilinardi. U endi PRISMA shaklini qaytaradi, ya'ni eski
kod uni quvurga qo'shib *"Arguments must be aggregate pipeline
operators"* bilan yiqiladi.

Xom SQL'da esa `where` obyekti umuman ishlamaydi. Shuning uchun har bir
signal faylida `rawBranchClause()` yoziladi (namuna:
`ai/signals/finance.signal.js`, `financeReport.service.js`). U
**FAIL-CLOSED**: bo'sh ro'yxat `AND FALSE` beradi — hech qaysi filialga
biriktirilmagan xodim hech nima ko'rmaydi.

### `attendance` ko'chirilganda topilgan JIMGINA YO'QOLISH

`buildAttBySlot` va `getGroupMonthly` xarita kalitini `String(a.group)` /
`String(a.student)` dan quradi. Prisma qatorida bu maydonlar RELATION —
so'ralmasa `undefined`, ya'ni kalit `"undefined|2026-08-17"` bo'lib
HECH QACHON mos kelmasdi.

Oqibati: davomat yozuvlari bazada bor, lekin hisobotda **butunlay
yo'qolardi** — "jami darslar: 9, kelgan: 0, kelmagan: 0". Xato ham
bermasdi, ekran shunchaki "hech kim belgilanmagan" deb ko'rsatardi.

Shu sababdan ko'chirishdan keyin HAR BIR o'qish yo'li haqiqiy yozuv
bilan tekshirilishi shart — `200 OK` bu yerda hech nima isbotlamaydi.

Seedlar (25 fayl, 120 so'rov) ATAYLAB qoldirilgan — bir martalik
skriptlar, ishlash yo'lida emas.

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
npm run test:groups-chain     #  33  guruh, jadval versiyalash, moliyaviy tarix qo'riqchisi
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
