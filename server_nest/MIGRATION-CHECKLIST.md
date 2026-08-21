# EXPRESS → NESTJS — TO'LIQ KO'CHIRISH RO'YXATI

Holat sanasi: 2026-08-20. Manba: `server/src` (Express), maqsad: `server_nest/src`.

## 0. HAJM (audit natijasi)

| O'lchov | Express (`server/src`) | NestJS (`server_nest/src`) |
|---|---|---|
| Fayl (`.js` / `.ts`) | 816 | 46 |
| Qator | 80 132 | 3 567 |
| Biznes moduli | 47 | 3 (auth, roles*, users*) |
| Marshrut e'loni | **388** | 8 |
| Fon jobi | 24 | 0 |
| Navbat (queue) | 1 (`importQueue`, Redis/pg-boss) | 0 |
| Telegram bot | 11 handler + 3 servis | 0 |

`*` — qisman (faqat o'qish yo'llari).

## 1. UMUMIY QATLAM (modul emas, lekin ko'chirilishi shart)

| Express | Holat |
|---|---|
| `config/prisma.js` | ✅ `prisma/prisma.service.ts` |
| `config/env.js` | ✅ `config/env.validation.ts` |
| `config/logger.js` | ⬜ (Nest `Logger` ishlatilyapti) |
| `config/redis.js` | ⬜ (faqat import navbati uchun) |
| `config/scheduler.js` | ⬜ FAZA 10 |
| `config/entitlements.js` | ⬜ |
| `middleware/auth.js` | ✅ `middleware/auth.middleware.ts` |
| `middleware/requirePermission.js` + `requireAnyPermission.js` | ✅ `PermissionsGuard` |
| `middleware/requireRole.js` | ✅ `RolesGuard` |
| `middleware/requirePermissionOrSelf.js` | ✅ `PermissionOrSelfGuard` |
| `middleware/validate.js` | ✅ `@Validated()` dekoratori |
| `middleware/errorHandler.js` | ✅ `AllExceptionsFilter` |
| `middleware/rateLimiter.js` | ✅ `common/middleware/rate-limit.ts` (+ `trust proxy` — pastga qarang) |
| `app.js::app.set("trust proxy", 1)` | ✅ `main.ts` (⚠ KO'CHIB QOLGAN EDI — xavfsizlik) |
| `middleware/auditLog.middleware.js` | ⬜ FAZA 2.7 |
| `middleware/attendanceScope.js` | ✅ `common/guards/attendance-scope.guard.ts` |
| `middleware/enforceLimit.js` | ⬜ |
| `middleware/uploadAttachment.js`, `uploadSheet.js` | ⬜ FAZA 10 (multer) |
| `middleware/requireDatasetPermission.js` | ⬜ FAZA 9 (exports) |
| `middleware/requireImporterPermission.js` | ⬜ FAZA 10 (imports) |
| `helpers/branchAccess.helper.js` | ✅ `common/rbac/branch-access.service.ts` |
| `branchContext.helper::resolveBranchForWrite` / `resolveBranchFromGroup` | ✅ `BranchAccessService` (prisma kerak — ALS moduliga sig'maydi) |
| `utils/serialize::withPopulatedShape` | ✅ `common/utils/serialize.ts` |
| `helpers/branchContext.helper.js` | ✅ `common/als/branch-context.ts` |
| `helpers/branchIntent.guard.js` | ✅ `common/rbac/branch-intent.ts` |
| `helpers/credentialScope.helper.js` | ✅ `common/rbac/credential-scope.ts` |
| `helpers/permission.helper.js` | ✅ `common/rbac/permission.service.ts` |
| `helpers/botStatus.helper.js` | ✅ `common/rbac/bot-status.ts` |
| `helpers/userProfile.helper.js` | ✅ `modules/auth/user-profile.service.ts` |
| `helpers/roles.helper.js` | ✅ `common/rbac/roles.helper.ts` |
| `helpers/studentCompletion.helper.js` | ✅ `common/helpers/student-completion.service.ts` |
| `utils/pagination.js` | ✅ `common/utils/pagination.ts` |
| `helpers/actor.helper.js`, `auditLog.helper.js` | ⬜ FAZA 2.7 |
| `helpers/userRelations.helper.js` | ✅ `common/helpers/user-relations.service.ts` (⚠ `hardDeleteGroupData` — `groups` bilan) |
| `helpers/cascadeDelete.helper.js` | ⬜ FAZA 5 (faqat `groups.service` chaqiradi) |
| `archiveReasons::logAction` | ✅ `common/helpers/archive-log.service.ts` (⚠ VAQTINCHALIK KO'PRIK) |
| `systemNotifications::create` | ✅ `common/helpers/system-notification.service.ts` (⚠ VAQTINCHALIK KO'PRIK) |
| `finance::runFinanceTxn` | ✅ `common/utils/finance-txn.ts` (faqat chegaralar) |
| `helpers/group.helper.js` | ✅ `common/helpers/group-state.ts` |
| `helpers/membership.helper.js` | ✅ `common/helpers/membership.service.ts` |
| `helpers/period.helper.js` | ✅ `common/utils/period.ts` |
| `helpers/attendance.helper.js` | ✅ `common/utils/attendance.ts` + `date.ts` |
| `helpers/lessonCancellation.helper.js` | ⬜ FAZA 6 |
| `helpers/studentFreeze.helper.js` | qisman ✅ — davomat qismi (`loadExemptionsWithFreezes`) `StudentFreezeService` da; to'lov qismi (`loadFreezeWindows*`) moliya bilan birga |
| `helpers/roomOccupancy.helper.js` | ⬜ FAZA 3 (`/rooms` marshrutlarida ISHLATILMAYDI — u `branchAnalytics` uchun) |
| `constants/delegation.js` | ✅ `common/constants/delegation.ts` |
| `constants/payrollAudit.js` | ✅ `common/constants/payroll-audit.ts` |
| `constants/ledger.js`, `constants/treasury.js` | ✅ `common/constants/{ledger,treasury}.ts` (FAZA 7) |
| `helpers/selfSalary.guard.js` | ⬜ FAZA 8 |
| `helpers/correlationCache.js` | ✅ `common/helpers/correlation-cache.service.ts` |
| `configMetrics.helper.js` | ⬜ FAZA 9 |
| `utils/ApiError.js` | ✅ `common/errors/api-error.ts` |
| `utils/jwt.js`, `hashToken.js`, `credentials.js`, `phone.js`, `serialize.js` | ✅ |
| `utils/cookie.helper.js` | ✅ `common/utils/cookie.ts` |
| `utils/money.js`, `ApiResponse.js`, `sendXlsx.js` | ⬜ |
| `constants/*` (22 fayl) | qisman ✅ (`permissions.ts`); qolgani modul bilan birga |

## 2. MODUL RO'YXATI — BOG'LIQLIK TARTIBIDA

Ustunlar: **E** = Express marshrut soni, **P** = faza.

### FAZA 2 — XAVFSIZLIK (poydevor)
| # | Modul | Manzil | E | Holat |
|---|---|---|---|---|
| 2.1 | poydevor | — | — | ✅ |
| 2.2 | ALS / RBAC / auth middleware | — | — | ✅ |
| 2.3 | auth | `/api/auth` | 7 | ✅ |
| 2.4 | roles (+`helpers/roles.helper`) | `/api/roles` | 7 | ✅ 7/7 |
| 2.5a | users (mustaqil marshrutlar) | `/api/users` | 10/14 | ✅ |
| 2.5b | users (arxivlash/tiklash/hard delete) | `/api/users` | 3/14 | ✅ |
| 2.5c | users (`POST /staff`) | `/api/users` | 1/14 | ✅ **14/14** |
| 2.6 | botAuth | `/api/bot-auth` | 2 | 🛑 **BLOKLANGAN** — Express'da ishlamaydi |
| 2.7 | activityLogs + auditLog middleware | `/api/activity-logs` | 3 | ⬜ |

#### 🛑 2.6 `botAuth` — KO'CHIRIB BO'LMAYDI (Express manbasi buzuq)

`modules/botAuth/services/botAuth.service.js` MONGOOSE davridan qolgan
maydon nomlarini ishlatadi; ular Prisma sxemasida YO'Q:

| Kod | Sxemadagi haqiqat |
|---|---|
| `user.password` | `passwordHash` |
| `where: { login }` | `username` |
| `include: { role: true }` | `role` — SKALYAR (String), relation emas |
| `include: { branches: true }` | bunday relation yo'q (`branchAssignments`) |

Handler `{ accessToken, refreshToken, user, roleMeta }` ni kutadi, servis
esa `{ user, tokens }` qaytaradi — `accessToken` HAR DOIM `undefined`.

O'LCHANDI (taxmin emas): HAQIQIY bot tokeni bilan HMAC to'sig'idan
o'tilgach IKKALA marshrut ham **500 `PrismaClientValidationError`**
beradi. Takrorlash:

```
node --env-file=../server/.env test/bot-auth-blocker.probe.mjs
```

⚠ NEGA BU ILGARI KO'RINMAGAN: haqiqiy `initData` bo'lmasa har qanday
so'rov 401 da to'xtaydi va Prisma yo'liga umuman yetib bormaydi.

NEGA TO'SIQ: ko'chirish qoidasi "Express — etalon". Bu yerda etalon 500
qaytaradi, ya'ni SAQLANADIGAN XULQ-ATVOR YO'Q. Avval Express'dagi
`botAuth` tuzatilishi (= yangi xulq-atvor loyihalash) yoki modul
keraksiz deb e'lon qilinishi kerak. Ikkalasi ham MAHSULOT QARORI.

### FAZA 3 — TASHKILIY TUZILMA
| Modul | Manzil | E | Holat |
|---|---|---|---|
| branches | `/api/branches` | 8 | ✅ 8/8 |
| rooms | `/api/rooms` | 5 | ✅ 5/5 |
| courses | `/api/courses` | 9 | ⬜ **KEYINGI** |
| holidays | `/api/holidays` | 7 | ✅ 7/7 |
| archiveReasons | `/api/archive-reasons` | 6 | ✅ 6/6 |
| leadOptions | `/api/lead-options` | 4 | ✅ 4/4 |
| feedbackTypes | `/api/feedback-types` | 5 | ✅ 5/5 |
| attendanceSettings | `/api/attendance-settings` | 2 | ✅ 2/2 |

### FAZA 4 — O'QUVCHILAR
| Modul | Manzil | E | Holat |
|---|---|---|---|
| leads | `/api/leads` | 16 | ⬜ |
| studentFreeze | `/api/student-freezes` | 3 | ⬜ |
| activityHistory | `/api/activity-history` | 2 | ✅ 2/2 |
| search | `/api/search` | 1 | ✅ 1/1 |

> O'quvchi/o'qituvchi **alohida jadval emas** — `User` + `role`/`roleType`.
> Shuning uchun "students" va "teachers" modullari `users` ichida (2.5).

### FAZA 5–6 — GURUHLAR / TA'LIM
| Modul | Manzil | E | Holat |
|---|---|---|---|
| groups (5a — o'qish) | `/api/groups` | 9/24 | ✅ |
| groups (5b — yozish) | `/api/groups` | 15/24 | ⬜ MOLIYA/MAOSHDAN KEYIN |
| attendance | `/api/attendance` | 11 | ✅ 11/11 |
| teacherAttendance | `/api/teacher-attendance` | 2 | ⬜ |
| attendanceExemptions | `/api/attendance-exemptions` | 4 | ⬜ |
| lessonCancellations | `/api/lesson-cancellations` | 3 | ⬜ |
| grades | `/api/grades` | 8 | ⬜ |
| assignments | `/api/assignments` | 10 | ⬜ |

### FAZA 7 — MOLIYA (eng ehtiyotkorlik talab qiladigan)
| Modul | Manzil | E | Holat |
|---|---|---|---|
| finance | `/api/finance` | 13 | 🟡 yadro ko'chdi (`financialTransaction`, `dimensionResolver`, `money`) — marshrutlar `studentPayment`/`discount`/`groupFee` ni kutmoqda |
| deposits | `/api/deposits` | 8 | ⬜ |
| expenses | `/api/expenses` | 10 | ⬜ |
| expenseApprovals | `/api/expense-approvals`, `/api/approvals` | 10 | 🟡 8/10 (`approve`, `bulk-approve` — bajaruvchilar kutilmoqda) |
| journal | `/api/journal` | 9 | ✅ 9/9 |
| ledger | `/api/ledger` | 2 | ⬜ |
| openingBalance | `/api/opening-balance` | 3 | ⬜ |
| financeOps | `/api/finance-ops` | 8 | ✅ 8/8 |
| financeReport | `/api/finance-report` | 5 | ✅ 5/5 |

### FAZA 8 — MAOSH
| Modul | Manzil | E | Holat |
|---|---|---|---|
| teacherSalary | `/api/teacher-salary` | 15 | ⬜ |
| staffPayroll | `/api/staff-payroll` | 30 | ⬜ |

### FAZA 9 — TAHLIL / PANEL
| Modul | Manzil | E | Holat |
|---|---|---|---|
| adminDashboard | `/api/admin-dashboard` | 6 | ⬜ |
| financeAnalytics | `/api/finance-analytics` | 30 | ⬜ |
| branchAnalytics | `/api/branch-analytics` | 11 | ⬜ |
| ai | `/api/ai` | 15 | ⬜ |
| exports | `/api/exports` | 2 | ⬜ |

### FAZA 10 — ALOQA / INTEGRATSIYA / FON
| Modul | Manzil | E | Holat |
|---|---|---|---|
| notifications | `/api/notifications` | 11 | ✅ 11/11 |
| systemNotifications | `/api/system-notifications` | 5 | ✅ 5/5 |
| notificationTemplates | `/api/notification-templates` | 5 | ✅ 5/5 |
| feedback | `/api/feedback` | 9 | ✅ 9/9 |
| storage | `/api/storage` | 7 | ✅ 7/7 |
| imports (+ `queues/importQueue`) | `/api/imports` | 11 | ⬜ |
| bot (Telegram, 11 handler) | — | — | ⬜ |
| jobs (24 ta) | — | — | ⬜ |

## 3. FON JOBLARI (24)

`aiIntradayRefresh`, `aiLifecycle`, `aiMorningDigest`, `aiNarration`,
`aiNightlyRecompute`, `aiReports`, `assignmentDeliver`, `attendanceReminders`,
`autoEndGroups`, `catchUpMonthly`, `dailyAccrueFinance`, `generateMonthlyFinance`,
`generateMonthlySalary`, `generateMonthlyStaffPayroll`, `holidayGreetings`,
`leadDailyDigest`, `leadFollowupReminders`, `lessonReminders`,
`lowAttendanceDigest`, `notificationDeliver`, `notificationSchedule`,
`storageCleanup`, `ttlCleanup`, `usageHeartbeat` — barchasi ⬜ (FAZA 10).

## 3b. ⚠ BOG'LIQLIK YO'NALISHI — TAVSIYA ETILGAN TARTIB TUZATILDI

Statik tahlil KO'RSATDI: `users` tizimning eng PASTKI qatlami EMAS, eng
YUQORISI. `users.service.js` quyidagilarga tayanadi:

```
users ──► finance/studentPayment   (arxivlashda to'lovni qayta hisoblash)
      ──► teacherSalary            (kompensatsiya, guruh maoshi)
      ──► expenseApprovals         (ishga olish tasdig'i)
      ──► openingBalance           (boshlang'ich qoldiq)
      ──► systemNotifications, archiveReasons
      ──► userRelations/cascadeDelete (butunlay o'chirish — moliyaviy tarix)
      ──► buildUserProfile ──► groups + attendance + studentFreeze
```

Shu sababli `users` BITTA fazada tugamaydi. U IKKI TO'LQINGA bo'lindi:

**2.5a (bajarildi)** — bog'liqligi yo'q yoki kichik yordamchilar bilan
qoplanadigan 10 marshrut:
`GET /`, `GET /staff-stats`, `GET /check-availability`, `GET /:id`,
`GET /:id/group-history`, `GET /:id/password`, `PATCH /:id/password`,
`PATCH /:id/role`, `PATCH /:id/branches`, `PATCH /:id`.

**2.5b (BAJARILDI)** — hayot sikli, 3 marshrut: `DELETE /:id`,
`POST /:id/restore`, `DELETE /:id/permanent`.

Dastlabki reja ularni FAZA 7/8 gacha kechiktirgan edi. QAYTA TEKSHIRUV
ko'rsatdiki, bu UCHALASIDA ham moliya bog'liqligi JAVOB TANASIGA
CHIQMAYDI — u faqat `try/catch` ichidagi yon ta'sir:

| Marshrut | Ko'chirilmagan bog'liqlik | Javobga ta'siri |
|---|---|---|
| `DELETE /:id` | `teacherCompensation.recomputeFrom` | YO'Q (best-effort) |
| `DELETE /:id` | `financePayment.recalcForStudent` | ERISHIB BO'LMAYDI (o'quvchi 400 bilan to'siladi) |
| `POST /:id/restore` | `teacherCompensation.getActive` | ICHKARIGA ko'chirildi (sof o'qish) |
| `DELETE /:id/permanent` | `teacherSalary.recalcForGroup` | YO'Q (best-effort) |

Qolgan ikkita chaqiruv (`recomputeFrom`, `recalcForGroup`) 2 700 qatorlik
maosh hisoblash dvigateliga tayanadi — u FAZA 8. Ular JIMGINA tashlab
ketilmadi: `UsersService.deferredEffect()` har safar barqaror belgili
`DEFERRED_EFFECT` WARN yozadi. FAZA 8 kelganda o'sha belgini qidirib,
ikkita chaqiruvni ulash kifoya.

**2.5c (BAJARILDI)** — `POST /staff`. U dastlab BLOKLANGAN edi; uchta
to'siqning ikkitasi boshqa to'lqinlar ko'chgach o'z-o'zidan yopildi:

| To'siq | Holat |
|---|---|
| `expenseApprovals.checkConfigApproval` + `createRequest` | ✅ `expense-approvals` ko'chdi |
| `buildUserProfile` o'qituvchi nishonida | ✅ `groups` ko'chdi |
| `openingBalance.create` / `teacherSalary.setCompensation` | 🛑 hamon yo'q |

Oxirgisi uchun `POST /auth/register-user` dagi ALLAQACHON QABUL
QILINGAN naqsh qo'llandi: `compensation` yoki `openingBalance` bilan
kelgan so'rov OCHIQ 501 (`REGISTER_SIDE_EFFECTS_NOT_MIGRATED`) oladi —
pul jimgina yo'qolmasin.

⚠ 501 QAYERDA TURGANI MUHIM. `register-user` da u metodning eng
boshida; `createStaff` da esa ATAYLAB PASTGA tushirildi — BARCHA
tekshiruvlardan KEYIN, birinchi YOZUVDAN OLDIN:

  • noto'g'ri kirish + openingBalance → Express bilan AYNAN bir xil
    xato (400/403/409);
  • to'g'ri kirish + openingBalance   → 501, HECH NARSA YOZILMAYDI.

Ya'ni paritet `register-user` dagidan KENGROQ saqlangan.

⚠ TASDIQ SHOXI (202) TO'LIQ ISHLAYDI, lekin tasdiqni BAJARISH
(`executeApprovedHire`) hamon yopiq — `expense-approvals` ning
`approve`/`bulkDecide` marshrutlari allaqachon ochiq 501
(`APPROVAL_EXECUTORS_NOT_MIGRATED`) beradi. So'rov faqat payload
saqlaydi, moliyaviy yon ta'sir bajarmaydi — ya'ni pul jimgina
yo'qolishi mumkin bo'lgan yo'l YO'Q.

### Meros qilib olingan cheklov (Faza 2.3 dan)

`buildUserProfile` FAQAT O'QUVCHI uchun NestJS'da 501
(`PROFILE_NOT_MIGRATED`). Ta'sir qiladigan marshrutlar: `/auth/me`,
`GET /users/:id`, `PATCH /users/:id/role`, `PATCH /users/:id/branches`.

O'QITUVCHI shoxi **OCHILDI** (`groups` ko'chgach) — 10 ta o'qituvchida
o'lchandi, 0 farq. O'quvchi uchun to'rtta manbadan uchtasi tayyor,
to'rtinchisi yo'q:

| Manba | Holat |
|---|---|
| `groups.findAllActiveForStudent` | ✅ |
| `groups.findPendingRemovalNotice` | ✅ |
| `studentFreeze.getActiveFreeze` | ✅ |
| `attendance.getStudentSummary` | 🛑 `attendance` moduli YO'Q |

`attendance` ko'chgan kuni `user-profile.service.ts` dagi BITTA `throw`
o'chiriladi va qolgan uchta chaqiruv qo'shiladi.

⚠ HAYOT SIKLI MARSHRUTLARI BUNGA TEGMAYDI: `DELETE /:id`,
`POST /:id/restore` va `DELETE /:id/permanent` profil QURMAYDI — ular
`withLegacyId(saved)` yoki faqat `{ success, message }` qaytaradi.
Shuning uchun ular o'quvchi/o'qituvchi nishonida ham Express bilan
AYNAN bir xil (`test/users-lifecycle-parity.test.mjs` da o'lchangan).
Bu `groups` + `attendance` + `studentFreeze` ko'chgach yopiladi va
`test/users-parity.test.mjs` dagi `expectDivergence` uni KUZATIB turadi —
farq yo'qolgan kuni test yiqiladi va e'tibor tortadi.

### Natijada FAZA tartibi

Tavsiya etilgan ro'yxat "students → teachers → groups → payments" edi.
Bog'liqlik grafi esa TESKARISINI talab qiladi: avval barg modullar
(branches, rooms, courses, holidays...), keyin groups/attendance,
keyin finance/salary, va ENG OXIRIDA `users` ning qolgan 4 marshruti.

## 4. QAT'IY CHEKLOVLAR (ko'chirish davomida)

1. **Yagona yozuvchi**: rol/ruxsat mutatsiyalarini NestJS kodida yozamiz,
   lekin **trafik Express'da qoladi** to'liq cutover'gacha. Ikki jarayon
   bir vaqtda YOZMAYDI — shuning uchun jarayonlararo kesh invalidatsiyasi
   (Redis/pub-sub) KERAK EMAS.
2. Baza sxemasi **o'zgarmaydi**. Migratsiya faqat ilova qatlamida.
3. Moliyaviy yozuvlar **o'zgarmas** (`JOURNAL_IMMUTABLE`).
4. API shartnomasi (URL/metod/tana/status/xato kodi) **aynan** saqlanadi.
5. Har modul: parity testi Express'ga qarshi ✅ bo'lmaguncha keyingisiga o'tilmaydi.

## 5. KO'CHIRISHDA TOPILGAN XATTI-HARAKATLAR (o'zgartirilmadi)

Quyidagilar Express'da SHU HOLICHA ishlaydi va NestJS'da AYNAN
takrorlandi. Har biri klient shartnomasining bir qismi, shuning uchun
"tuzatish" alohida qaror talab qiladi — jimgina o'zgartirilmadi.

| # | Joy | Xatti-harakat | Baho |
|---|---|---|---|
| B1 | `POST /rooms` | Mavjud BO'LMAGAN `branchId` → **409 `FK_CONSTRAINT`** ("Bog'langan yozuv mavjud..."), 404/400 emas. Sabab: `resolveBranchForWrite` faqat KO'LAMNI tekshiradi, filial BORLIGINI emas; owner uchun `isBranchAllowed()` doim `true`, ID Prisma'ga o'tadi va FK buziladi (P2003). | ATAYLAB EMAS, lekin ZARARSIZ: ko'lam himoyasi buzilmaydi (ko'lamdan tashqari ID baribir 403 oladi). Xabar chalg'ituvchi. `test/rooms-parity.test.mjs` uni QULFLAB turadi. |
| B2 | `GET /rooms` | Standart `limit` = **200** (umumiy `parsePagination()` 20 beradi) va `meta` da **`pages` YO'Q**. | ATAYLAB: xona tanlagichi butun ro'yxatni bir so'rovda oladi. |
| B3 | `PATCH /rooms/:id` | Filial almashtirishni to'suvchi tekshiruv `data` yig'ilgandan KEYIN turadi. | Zararsiz — `prisma.update` dan OLDIN, ya'ni hech narsa saqlanmaydi. |
| B4 | `GET /notifications/stats` | **HAR DOIM 500** (`PrismaClientValidationError`). Sabab: `groupBy({ orderBy: { _count: { _all: "desc" } } })` — Prisma `groupBy` ning `orderBy._count` ida `_all` ni QO'LLAB-QUVVATLAMAYDI, aniq maydon kutadi. Xato so'rov QURILISHIDA yuz beradi, ya'ni ma'lumot bor-yo'qligiga bog'liq emas. | ⚠ HAQIQIY, ISHLAYOTGAN XATO — Express'da ham shunday. NestJS uni AYNAN takrorlaydi (kod ko'chirma). **Jimgina tuzatilmadi**: tuzatish javob shaklini 500 → 200 ga o'zgartiradi, ya'ni bu ko'chirish ishi emas, alohida qaror. `test/notifications-parity.test.mjs` ikkala stekda 500 ekanini qulflab turadi. |
| B5 | `GET /notifications/:id/recipients` | Mavjud BO'LMAGAN xabar ID'si → **200 + bo'sh ro'yxat**, 404 emas (`getRecipientList` xabar borligini tekshirmaydi). | Zararsiz, lekin shartnomaning bir qismi — test uni qulflab turadi. |
| B6 | `POST /notifications/inbox/:id/read` | Begona oluvchi yozuvi so'ralsa ham **200 `{ success: true }`** qaytadi (`markRead` `null` qaytarsa ham handler farq qilmaydi). | HIMOYA BUZILMAGAN: `userId` `WHERE` ichida, ya'ni yozuv O'ZGARMAYDI (IDOR yopiq). Faqat javob kodi "muvaffaqiyat" deb ko'rinadi. Test buni JAVOB KODI bilan emas, BAZADAN o'lchaydi. |
| B7 | Seed o'quvchilari | Parollari 4 belgidan qisqa va `POST /auth/login` VALIDATORI ularni rad etadi — ya'ni seed'dagi o'quvchi bilan tizimga KIRIB BO'LMAYDI. | Ko'chirishga aloqasi yo'q (seed ma'lumoti). Testlar rol chegarasi uchun `qa_staff_a` dan foydalanadi. |
| B8 | `system_notifications` 100 talik cheklovi | Oshgan qatorlar `deleteMany` bilan QATTIQ o'chiriladi (eng eskisidan). | ⚠ EVICTION SHOXI PARITET TESTIDA O'LCHANMAGAN — uni ataylab ishga tushirish REAL bildirishnomalarni o'chirardi (jadvalda 98 ta haqiqiy yozuv bor). Test cheklovdan OSHMAYDI va yakunda eng eski yozuv joyidaligini tekshiradi. Kod Express bilan bir xil (ko'chirma). |
| B9 | `GET /notification-templates` | `orderBy: { createdAt: "desc" }` — IKKILAMCHI TARTIB YO'Q. Seed'da bir xil `createdAt` li qatorlar BOR, ya'ni ular orasidagi tartib KAFOLATLANMAGAN va bir xil so'rov turli tartibda qaytishi mumkin (sahifalashda qator takrorlanishi/tushib qolishi mumkin). | Ikkala stekda BIR XIL kamchilik. `notifications` inbox'ida bu ataylab `[{createdAt}, {id}]` bilan yopilgan — bu yerda esa yopilmagan. Tuzatish tartibni o'zgartiradi, ya'ni alohida qaror. Test solishtirishdan oldin `id` bo'yicha saralaydi. |
| B10 | `UPLOAD_DIR` (ko'chirish davri) | Express `server/` dan, NestJS `server_nest/` dan yuradi va `UPLOAD_DIR` NISBIY bo'lsa ular IKKI XIL papkani ko'radi — baza esa BITTA. O'shanda NestJS o'chirgan fayl diskda QOLIB ketardi (`unlink` xatosi yutiladi), kvota hisoblagichi esa kamayardi: joy "bo'shadi" deb ko'rinib, aslida bo'shamasdi. | ⚠ NESTJS TOMONDA TUZATILDI: `env.validation.ts` uni Express kabi `path.resolve(cwd, ...)` bilan yechadi, `StorageService` ishga tushganda papka yo'qligini ogohlantiradi, `.env.example` da MUTLAQ yo'l talab qilinishi yozildi. Test diskdagi faylning haqiqatan o'chganini tekshiradi. |
| B11 | Fayl o'chirilganda faqat `assignment.fileId` nollanadi | `StoredFile` ga `Expense.receipt`, `JournalEntry.attachment`, `Refund.receipt` ham ishora qiladi, lekin `runCleanup`/`removeFileById` FAQAT `assignment` havolasini uzadi. | Yumshoq o'chirish bo'lgani uchun FK buzilmaydi — havola o'chirilgan faylga ishora qilib turaveradi. Express xulqi AYNAN shunday; o'zgartirish moliya modullariga tegadi, ya'ni alohida qaror. |
| B12 | `npm run test:rooms` (`tests/roomUtilization.test.js`) | **4 ta tekshiruv yiqiladi** (ko'chirishdan OLDIN ham). Sabab: test o'zi yaratgan guruhlardan tashqari SEED guruhlarini ham hisobga oladigan servisga qarshi yozilgan — "faol kunlar" dushanba–juma deb kutiladi, seed'da esa SHANBA darslari ham bor (6 kun). Shu sababli maxraj 60 emas 72 chiqadi va bandlik 100% o'rniga 83.3%. | ⚠ TEST IZOLYATSIYASI kamchiligi, MAHSULOT xatosi emas: `getRoomUtilization` butun filial bo'yicha hisoblaydi, test esa faqat o'z fixture'lari borday taxmin qiladi. `roomUtilization` `branchAnalytics` bilan birga ko'chiriladi — o'shanda test fixture'lari izolyatsiya qilinadi. Jimgina "tuzatilmadi": maxrajni o'zgartirish bandlik foizini, u esa xona rejalashtirish qarorlarini o'zgartiradi. |
| B13 | `GET /groups/:id/history` | Guruh TUGAGAN bo'lsa **400** ("Kurs tugagan..."), 200 EMAS. Sabab: handler `ensureGroup()` dan o'tadi, u esa YOZUV amallari uchun mo'ljallangan. Natijada arxivlangan guruhning a'zolik TARIXINI umuman ko'rib bo'lmaydi. | ⚠ ANIQ ZIDDIYAT: `GET /groups/:id` AYNI arxivlangan guruh uchun 200 beradi. Jimgina tuzatilmadi — javob 400 → 200 ga o'zgarardi, ya'ni bu ko'chirish ishi emas, alohida qaror. `test/groups-read-parity.test.mjs` QULFLAB turadi. |
| B14 | `POST /groups/me/removal-notice/seen` | Express **200** qaytaradi (`res.json`), NestJS `POST` standarti esa **201**. `@HttpCode(200)` bilan tenglashtirildi. | KO'CHIRISHDA TOPILGAN VA TUZATILGAN paritet xatosi. Xulosa: HAR BIR ko'chirilgan `POST` marshrutida status OCHIQ tekshirilishi shart. |
| B15 | `GET /groups/:id/available-teachers` | Express marshrutida `validate()` CHAQIRILMAGAN — ID sxemadan o'tmaydi, yaroqsiz ID 400 emas **404** beradi. | Ataylab takrorlandi: validator qo'shilsa status jimgina o'zgarardi. |
| B16 | `attendance.service::consecutiveAbsences()` | **HAR CHAQIRUVDA YIQILADI.** Prisma'ga MONGO filtri uzatiladi: `{ student: id, isDeleted: { $ne: true }, dateKey: { $lte: … } }` → `PrismaClientValidationError` ("Argument `student`: Invalid value provided"). Xato `notifyConsecutiveAbsences` da `.catch()` bilan yutiladi. NATIJA: ketma-ket qoldirish ogohlantirishi `consecutiveAbsencesAlert = 3` bo'lsa ham **HECH QACHON yuborilmaydi**. Tekshirib ko'rilgan (ikkala shox ham yiqiladi). | ⚠ HAQIQIY XATO, ATAYLAB EMAS (Mongo qoldig'i). NestJS'da `consecutiveAbsences()` TO'G'RI yozilgan (bila turib buzuq kod ko'chirilmaydi), lekin ogohlantirish `EXPRESS_NOTIFICATION_IS_DEAD` bayrog'i bilan ATAYLAB o'chirilgan — aks holda ko'chirish paytida egalarga kutilmagan xabarlar oqimi ketardi. **Yoqish alohida qaror**: Express ham tuzatilib, ikkalasi BIR VAQTDA yoqilishi kerak. `test/attendance-parity.test.mjs` 3 marta ketma-ket "absent" dan keyin `notifications` jadvali O'SMASLIGINI qulflab turadi. |
| B17 | `attendance.service::getDashboardStats()` — `groupBreakdown` | `groupMemberships` `select: { groupId, studentId, student }` bilan olinadi (`joinedAt`/`leftAt` SO'RALMAGAN), keyin esa `m.joinedAt` / `m.leftAt` o'qiladi — ikkalasi ham `undefined`. `computeClassDays` da `undefined > from` HAR DOIM `false` → `effFrom = from`, `effTo = to`. Ya'ni **har bir o'quvchi butun oraliq davomida a'zo deb hisoblanadi** va oraliq o'rtasida qo'shilgan/chiqqan o'quvchining dars kunlari SHISHIRILADI. | ⚠ HAQIQIY XATO: `GET /attendance/groups/:id/summary` AYNI ma'lumot uchun BOSHQA son beradi. TypeScript ko'chirishda buni ushlab qoldi. `select` ga ikki maydon qo'shilsa dashboard raqamlari O'ZGARADI — bu ko'chirish ishi emas, alohida qaror. NestJS Express xatti-harakatini AYNAN takrorlaydi (`as never` bilan). |
| B18 | `getGroupMonthly` / `getGroupSummary` javobidagi `group._id` | Express `{ _id: group._id, … }` yozadi, lekin `ensureGroup()` Prisma qatorini qaytaradi va unda `_id` YO'Q (faqat `id`). `_id` `undefined` bo'lgani uchun `JSON.stringify` kalitni butunlay TASHLAB KETADI — javobda `group: { name, schedule }` qoladi va **klient guruh ID'sini bu yerdan ola olmaydi**. | Zararsiz, lekin shartnomaning bir qismi. `group.id` ga o'zgartirilsa javobga YANGI kalit qo'shilardi. `listForGroupOnDate` esa `_id: group.id` yozadi — ya'ni bir modul ichida ikki xil. Ataylab saqlandi. |
| B19 | `teacherAbsence.service::setPresent()` | `setAbsent()` dan farqli: guruh MAVJUDLIGI tekshirilmaydi (`loadGroup` chaqirilmaydi) va kelajak-kun to'sig'i YO'Q. Mavjud bo'lmagan guruh uchun ham `{ removed: false }` (200) qaytadi, 404 EMAS. | Ataylab takrorlandi — "belgini olib tashlash" idempotent amal. |
