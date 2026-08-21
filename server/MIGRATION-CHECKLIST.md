# EXPRESS → NESTJS — TO'LIQ KO'CHIRISH RO'YXATI

Holat sanasi: **2026-08-22** (cutover bajarildi).

⚠ **PAPKALAR ALMASHTIRILDI.** Quyidagi matnda `server/` — ESKI Express
steki, `server_nest/` — NestJS. Cutover'dan keyin ular:

| Matndagi nom | Hozirgi papka |
|---|---|
| `server/` (Express, etalon) | **`server_legacy/`** |
| `server_nest/` (NestJS) | **`server/`** — ASOSIY SERVER |

Tarixiy matn ATAYLAB o'zgartirilmadi: u ko'chirish paytidagi holatni
tasvirlaydi va o'sha paytdagi o'lchovlarga havola qiladi.

## 0. HAJM — YAKUNIY HOLAT (2026-08-22)

| O'lchov | Express (`server/src`) | NestJS (`server_nest/src`) |
|---|---|---|
| Ro'yxatdan o'tgan marshrut | **399** | **399** (+1 ataylab: `GET /api/health/db`) |
| Biznes moduli | 47 | 47 (60 ta modul `AppModule` dan erishiladi) |
| Kontroller | — | 52 (manba = qurilma) |
| Fon jobi | 25 | **25** (cron 25/25 AYNAN mos) |
| Navbat (queue) | 1 (`bulk-import`) | 1 (⚠ FAQAT PRODUSER) |
| Telegram bot | 11 handler + 3 servis | ✅ (⚠ polling O'CHIQ) |

⚠ **MARSHRUT MATRITSASI MANBADAN EMAS, RO'YXATDAN o'qiladi**
(`test/route-matrix.mjs`): Express `_router.stack` va NestJS'ning
`dist/` dan ko'tarilgan adapteri. Ya'ni "modul yozilgan, lekin
`AppModule` ga qo'shilmagan" holat KO'RINADI.

⚠ **RO'YXATDA TURISH = ISHGA TUSHISH EMAS.** Kesishuv davrida
joblarni EXPRESS yuritadi (`NEST_WORKERS_ENABLED=false`), bot
buyruqlarini ham Express qabul qiladi (`NEST_BOT_POLLING=false`),
import navbatini ham Express iste'mol qiladi. NestJS shu davrda
FAQAT HTTP xizmat qiladi.

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
| leads | `/api/leads` | 16 | 🟡 14/16 (`convert*` bloklangan) |
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
| teacherAttendance | `/api/teacher-attendance` | 2 | ✅ 2/2 |
| attendanceExemptions | `/api/attendance-exemptions` | 4 | ✅ 4/4 |
| lessonCancellations | `/api/lesson-cancellations` | 3 | ⬜ |
| grades | `/api/grades` | 8 | ⬜ |
| assignments | `/api/assignments` | 10 | ⬜ |

### FAZA 7 — MOLIYA (eng ehtiyotkorlik talab qiladigan)
| Modul | Manzil | E | Holat |
|---|---|---|---|
| finance | `/api/finance` | 13 | 🟡 yadro ko'chdi (`financialTransaction`, `dimensionResolver`, `money`) — marshrutlar `studentPayment`/`discount`/`groupFee` ni kutmoqda |
| deposits | `/api/deposits` | 8 | ⬜ |
| expenses | `/api/expenses` | 10 | ✅ 10/10 |
| expenseApprovals | `/api/expense-approvals`, `/api/approvals` | 10 | 🟡 8/10 (`approve`, `bulk-approve` — bajaruvchilar kutilmoqda) |
| journal | `/api/journal` | 9 | ✅ 9/9 |
| ledger | `/api/ledger` | 2 | ⬜ |
| openingBalance | `/api/opening-balance` | 3 | ⬜ |
| financeOps | `/api/finance-ops` | 8 | ✅ 8/8 |
| financeReport | `/api/finance-report` | 5 | ✅ 5/5 |

### FAZA 8 — MAOSH
| Modul | Manzil | E | Holat |
|---|---|---|---|
| teacherSalary | `/api/teacher-salary` | 15 | ✅ 15/15 |
| staffPayroll | `/api/staff-payroll` | 30 | ⬜ |

### FAZA 9 — TAHLIL / PANEL
| Modul | Manzil | E | Holat |
|---|---|---|---|
| adminDashboard | `/api/admin-dashboard` | 6 | ✅ 6/6 |
| financeAnalytics | `/api/finance-analytics` | 30 | ⬜ |
| branchAnalytics | `/api/branch-analytics` | 11 | 🟡 1/11 (`/rooms` — xona bandligi) |
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
| B10 | `UPLOAD_DIR` (ko'chirish davri) | Express `server/` dan, NestJS `server_nest/` dan yuradi; `UPLOAD_DIR` NISBIY bo'lsa ular IKKI XIL papkani ko'radi, baza esa BITTA. | ✅ **KANONIK YO'L QAROR QILINDI VA QULFLANDI.** Kanonik papka = **Express ishlab chiqarishda ishlatayotgan papka** (bu repoda `server/uploads`). Sabab: `StoredFile.relPath` bazada `UPLOAD_DIR` GA NISBATAN saqlanadi — papkani "to'g'rilash" HAR BIR mavjud yozuvni yaroqsiz qiladi. Shuning uchun NestJS Express'ga MOSLASHADI, aksincha emas; **papka o'zgartirilmadi**. ⚠ Ikkala `.env` ham `.gitignore` da, ya'ni hozirgi moslik kuzatilmaydigan faylga tayanadi va toza checkout jimgina ikkiga bo'linardi. `test/upload-dir-parity.test.mjs` ikkala stekning HAQIQIY yechimini (muhit → `.env` ustunligi bilan) qayta hisoblab, `realpath` bo'yicha tenglikni, mutlaqlikni va bazadagi fayllar shu papkada topilishini o'lchaydi. `server/.env.example` da qaror yozildi. |
| B11 | Fayl o'chirilganda faqat `assignment.fileId` nollanadi | `StoredFile` ga `Expense.receipt`, `JournalEntry.attachment`, `Refund.receipt` ham ishora qiladi, lekin `runCleanup`/`removeFileById` FAQAT `assignment` havolasini uzadi. | Yumshoq o'chirish bo'lgani uchun FK buzilmaydi — havola o'chirilgan faylga ishora qilib turaveradi. Express xulqi AYNAN shunday; o'zgartirish moliya modullariga tegadi, ya'ni alohida qaror. |
| B12 | `npm run test:rooms` (`tests/roomUtilization.test.js`) | **4 ta tekshiruv yiqiladi** (ko'chirishdan OLDIN ham). Sabab: test o'zi yaratgan guruhlardan tashqari SEED guruhlarini ham hisobga oladigan servisga qarshi yozilgan — "faol kunlar" dushanba–juma deb kutiladi, seed'da esa SHANBA darslari ham bor (6 kun). Shu sababli maxraj 60 emas 72 chiqadi va bandlik 100% o'rniga 83.3%. | ⚠ TEST IZOLYATSIYASI kamchiligi, MAHSULOT xatosi emas: `getRoomUtilization` butun filial bo'yicha hisoblaydi, test esa faqat o'z fixture'lari borday taxmin qiladi. `roomUtilization` `branchAnalytics` bilan birga ko'chiriladi — o'shanda test fixture'lari izolyatsiya qilinadi. Jimgina "tuzatilmadi": maxrajni o'zgartirish bandlik foizini, u esa xona rejalashtirish qarorlarini o'zgartiradi. |
| B23 | `leadRouting.create` | `const sourceKey = isFallback ? null : …` ternari `sourceKey` ni ALLAQACHON nullaydi, shuning uchun keyingi `if (isFallback && sourceKey) throw 400` HECH QACHON bajarilmaydi — **O'LIK KOD**. Haqiqiy xulq: zaxira qoidada `sourceKey` JIMGINA e'tiborsiz qoldiriladi va qoida YARATILADI (201, `sourceKey=null`). | Zararsiz (zaxira qoidada manba baribir ishlatilmaydi), lekin xato XABARI hech qachon ko'rinmaydi. Ko'chirishda AYNAN takrorlandi. `test/leads-parity.test.mjs` haqiqiy natijani (201 + null) qulflaydi — "400 kutiladi" deb YOZILMAGAN, aks holda yorliq yolg'on bo'lardi. |
| B24 | `GET /admin-dashboard/retention`, `GET /admin-dashboard/churned-students` | **FILIAL KO'LAMI UMUMAN YO'Q EDI** — `retention.service` da ko'lam helperi 0 marta ishlatilardi (qo'shnisida 18 marta). Filial direktori BUTUN TASHKILOTNING chiqib ketgan o'quvchilarini (ism, familiya, **login**, guruh, o'qituvchi) ko'rardi. | ✅ **IKKALA STEKDA TUZATILDI.** O'LCHANGAN: filialga biriktirilgan direktor `churned-students` dan **46** ta qator olardi — owner bilan AYNAN bir xil. Endi qo'shni `adminDashboard.service` ishlatadigan AYNI `branchGroupFilter('groupId')` qo'llanadi. TASDIQLANDI: direktor o'z filialining **0** tasini (bazadan mustaqil hisoblangan son), owner 46 tasini oladi. ⚠ **KLIENT RAQAMLARI O'ZGARDI** — filial direktorining retention foizi va churn ro'yxati endi faqat o'z filialiga tegishli. `test/branch-scope-security.test.mjs` (sabotaj bilan tekshirilgan, ikkala stek alohida o'lchanadi). |
| B25 | UMUMIY TEZLIK CHEGARASI (butun API) | Express `app.js:50` da `generalLimiter` **GLOBAL** (200 so'rov / 60s). NestJS'da `common/middleware/rate-limit.ts` da e'lon qilingan, lekin **ULANMAGAN** edi. | ✅ **TUZATILDI.** O'LCHANGAN: bitta IP'dan 230 so'rov — express 201-so'rovda 429, nest 230/230 ta 200. `main.ts` da `app.use(generalLimiter)` `enableCors()` DAN KEYIN ulandi (Express tartibi: cors → … → generalLimiter, ya'ni preflight byudjetni yemaydi). Kalit `req.ip` — `trust proxy: 1` ga tayanadi. TASDIQLANDI: ikkala stek ham 201-so'rovda 429, tana va `ratelimit-limit` AYNAN bir xil. `test/rate-limit-parity.test.mjs` musbat (chegara ishlaydi) + manfiy (boshqa IP ta'sirlanmaydi) shoxlarni o'lchaydi; sabotaj bilan tekshirilgan. |
| B26 | ✅ **TUZATILDI (ikkala stekda)** — `finance-analytics/discounts` → `byKind` | `const bc = branchClause('d."studentId"', null) === Prisma.empty ? Prisma.empty : Prisma.empty;` — ternarning IKKALA TARMOG'I ham bo'sh, ya'ni ko'lam natijasi TASHLAB YUBORILARDI; ustun nomi ham xato edi. Aniq `?branchId=` berilmasa kesim BUTUN TASHKILOT chegirmalarini qaytarardi. | ✅ Endi bitta `EXISTS` ikkala holatni ham qamraydi (`Discount` da `branchId` yo'q — u guruh orqali filialga bog'lanadi). Aniq filial ham, ALS ko'lami ham `branchClause('g2."branchId"', branchId)` dan keladi. `finance-analytics-parity`: 164/164. |
| B27 | ✅ **TUZATILDI (ikkala stekda)** — `finance-analytics/budget` | Faktik summa `journalWhere` orqali ko'lamda qolardi, byudjet esa `findFirst` bilan BUTUN TASHKILOTDAN olinardi — plan va fakt TURLI filialga tegishli bo'lishi mumkin edi. | ✅ `budgetBranchScope()`: ALS ko'lamidagi filiallar VA markaziy (`branchId: null`) byudjet. ⚠ `null` ATAYLAB QO'SHILDI — sxema izohida `NULL = butun markaz bo'yicha byudjet` deb yozilgan; uni chiqarib tashlash markaziy byudjetni har bir filial ekranidan yo'qotardi. Saralash `branchId: "asc"` — Postgres'da NULL'lar oxirida, ya'ni FILIALGA XOS byudjet markaziysidan USTUN (ilgari qaysi biri tanlanishi ANIQ EMAS edi). |
| B28 | ✅ **TUZATILDI (ikkala stekda)** — `expenses/breakdown` | Non-operating tur ro'yxati SQL ichida QO'LDA takrorlangan edi. | ✅ `NON_OPERATING_ENTRY_KINDS` ishlatiladi. Ilgari `constants/ledger` ga yangi tur qo'shilsa, u barcha hisobotdan chiqarilardi-yu AYNAN SHU kesimga kirib qolardi. |
| B29 | ✅ **YOPILDI — AI KO'PRIGI ULANDI** | `ExplanationService.narrationPort` `null` edi (AI moduli ko'chirilmagani uchun): `?explain=true` va kesh bo'sh bo'lganda NestJS `deterministic`, Express esa `ai` qaytarardi. | ✅ Port `AiModule` EKSPORT QILGAN AYNI nusxalarga ulangan (`GeminiService` + `AiBudgetService`) — ikkinchi nusxa oylik AI limitini ikki joyda alohida sanardi. ⚠ `spend()` ATAYLAB bo'sh: sarf `gemini.service` ichida ALLAQACHON yoziladi (`recordUsage`). ⚠ **BU MUHITDA `GEMINI_API_KEY` BO'SH**, ya'ni ikkala stek ham `deterministic` qaytaradi va paritet "mos keldi" deydi — bu AI YO'LI ISHLADI degani EMAS. Shuning uchun ko'prik ALOHIDA o'lchanadi: `test/ai-explain-wiring.probe.mjs` soxta kalit bilan ikkala stekni LLM shoxiga kirishga majburlaydi va `AiUsageLog` yozuvi paydo bo'lishini tekshiradi (ikkalasida ham `ok=false`, `kind=narration` — ko'prik ULANGAN). |
| B30 | ⚠ **OPERATSION — KOD NUQSONI EMAS (O'LCHANDI)** — `finance-analytics/intelligence*` | `collectContext()` BITTA so'rovda 12 ta tahlil servisini `Promise.all` bilan chaqiradi. Express'da AYNAN shunday. | ⚠ **O'LCHANDI (2026-08-22):** bitta `/intelligence` so'rovi Express'da PIK **10**, NestJS'da PIK **22** faol ulanish; 6 ta parallel so'rov (ikkala stek) — PIK **33**, 71 ms, 6/6 × 200. `max_connections=100`, yukdan keyin jami **82**. ⚠ **SERIALIZATSIYA QILINMADI** — kod to'g'ri va tez; xavf HOVUZ SHIFTIDA. **CUTOVER TAVSIYASI:** har stek `DATABASE_URL` iga OCHIQ `connection_limit` qo'yilsin (yig'indisi `max_connections` dan past bo'lsin; `pgboss` 10 ta ulanishni oladi). ⚠ `.env` `.gitignore` da — bu KOD emas, JOYLASHTIRISH qarori. |
| B13 | `GET /groups/:id/history` | Guruh TUGAGAN bo'lsa **400** ("Kurs tugagan..."), 200 EMAS. Sabab: handler `ensureGroup()` dan o'tadi, u esa YOZUV amallari uchun mo'ljallangan. Natijada arxivlangan guruhning a'zolik TARIXINI umuman ko'rib bo'lmaydi. | ⚠ ANIQ ZIDDIYAT: `GET /groups/:id` AYNI arxivlangan guruh uchun 200 beradi. Jimgina tuzatilmadi — javob 400 → 200 ga o'zgarardi, ya'ni bu ko'chirish ishi emas, alohida qaror. `test/groups-read-parity.test.mjs` QULFLAB turadi. |
| B14 | `POST /groups/me/removal-notice/seen` | Express **200** qaytaradi (`res.json`), NestJS `POST` standarti esa **201**. `@HttpCode(200)` bilan tenglashtirildi. | KO'CHIRISHDA TOPILGAN VA TUZATILGAN paritet xatosi. Xulosa: HAR BIR ko'chirilgan `POST` marshrutida status OCHIQ tekshirilishi shart. |
| B15 | `GET /groups/:id/available-teachers` | Express marshrutida `validate()` CHAQIRILMAGAN — ID sxemadan o'tmaydi, yaroqsiz ID 400 emas **404** beradi. | Ataylab takrorlandi: validator qo'shilsa status jimgina o'zgarardi. |
| B16 | `attendance.service::consecutiveAbsences()` | **HAR CHAQIRUVDA YIQILADI.** Prisma'ga MONGO filtri uzatiladi: `{ student: id, isDeleted: { $ne: true }, dateKey: { $lte: … } }` → `PrismaClientValidationError` ("Argument `student`: Invalid value provided"). Xato `notifyConsecutiveAbsences` da `.catch()` bilan yutiladi. NATIJA: ketma-ket qoldirish ogohlantirishi `consecutiveAbsencesAlert = 3` bo'lsa ham **HECH QACHON yuborilmaydi**. Tekshirib ko'rilgan (ikkala shox ham yiqiladi). | ⚠ HAQIQIY XATO, ATAYLAB EMAS (Mongo qoldig'i). NestJS'da `consecutiveAbsences()` TO'G'RI yozilgan (bila turib buzuq kod ko'chirilmaydi), lekin ogohlantirish `EXPRESS_NOTIFICATION_IS_DEAD` bayrog'i bilan ATAYLAB o'chirilgan — aks holda ko'chirish paytida egalarga kutilmagan xabarlar oqimi ketardi. **Yoqish alohida qaror**: Express ham tuzatilib, ikkalasi BIR VAQTDA yoqilishi kerak. `test/attendance-parity.test.mjs` 3 marta ketma-ket "absent" dan keyin `notifications` jadvali O'SMASLIGINI qulflab turadi. |
| B17 | `attendance.service::getDashboardStats()` — `groupBreakdown` | `groupMemberships` `select: { groupId, studentId, student }` bilan olinadi (`joinedAt`/`leftAt` SO'RALMAGAN), keyin esa `m.joinedAt` / `m.leftAt` o'qiladi — ikkalasi ham `undefined`. `computeClassDays` da `undefined > from` HAR DOIM `false` → `effFrom = from`, `effTo = to`. Ya'ni **har bir o'quvchi butun oraliq davomida a'zo deb hisoblanadi** va oraliq o'rtasida qo'shilgan/chiqqan o'quvchining dars kunlari SHISHIRILADI. | ⚠ HAQIQIY XATO: `GET /attendance/groups/:id/summary` AYNI ma'lumot uchun BOSHQA son beradi. TypeScript ko'chirishda buni ushlab qoldi. `select` ga ikki maydon qo'shilsa dashboard raqamlari O'ZGARADI — bu ko'chirish ishi emas, alohida qaror. NestJS Express xatti-harakatini AYNAN takrorlaydi (`as never` bilan). |
| B18 | `getGroupMonthly` / `getGroupSummary` javobidagi `group._id` | Express `{ _id: group._id, … }` yozadi, lekin `ensureGroup()` Prisma qatorini qaytaradi va unda `_id` YO'Q (faqat `id`). `_id` `undefined` bo'lgani uchun `JSON.stringify` kalitni butunlay TASHLAB KETADI — javobda `group: { name, schedule }` qoladi va **klient guruh ID'sini bu yerdan ola olmaydi**. | Zararsiz, lekin shartnomaning bir qismi. `group.id` ga o'zgartirilsa javobga YANGI kalit qo'shilardi. `listForGroupOnDate` esa `_id: group.id` yozadi — ya'ni bir modul ichida ikki xil. Ataylab saqlandi. |
| B19 | `teacherAbsence.service::setPresent()` | `setAbsent()` dan farqli: guruh MAVJUDLIGI tekshirilmaydi (`loadGroup` chaqirilmaydi) va kelajak-kun to'sig'i YO'Q. Mavjud bo'lmagan guruh uchun ham `{ removed: false }` (200) qaytadi, 404 EMAS. | Ataylab takrorlandi — "belgini olib tashlash" idempotent amal. |
| B20 | ⚠️ **JIDDIY** — `teacherSalary.applyPaidDelta()` TRANZAKSIYADAN CHIQIB KETARDI | Imzo `tx` ni QABUL QILIB, uni JIMGINA TASHLAB YUBORARDI; xom `UPDATE` GLOBAL klientda, tranzaksiyadan tashqarida bajarilardi. | ✅ **IKKALA STEKDA TUZATILDI.** QAYTA O'LCHANDI (musbat nazorat bilan): tranzaksiya ICHIDA `paidAmount=50000`, ROLLBACK'DAN KEYIN ham **50000** — yozuv omon qolardi. Endi `{ capToRemaining, tx }` qabul qilinadi va `tx` berilsa xom SQL HAM, keyingi o'qish HAM o'sha tranzaksiyada bajariladi (`tx` berilmasa xatti-harakat avvalgidek). TASDIQLANDI: rollback'dan keyin `paidAmount=0`, ikkala stekda. `test/money-atomicity.test.mjs` (sabotaj bilan tekshirilgan). **QAYTA TEKSHIRILDI (yakuniy faza):** `studentPayment.applyPaidDelta` `tx` ni ALLAQACHON hurmat qilardi (ikkala stekda) — nuqson u yerda YO'Q edi. `staffPayroll` da esa BOR edi va **ENDI IKKALA STEKDA TUZATILDI**: `applyPaidDelta({ capToRemaining, tx })` va chaqiruvchi `staffSalaryTransaction.writeTransaction` `tx` ni uzatadi. `test/money-atomicity.test.mjs` uchala yo'lni × ikki stekni (6 o'lchov) qamraydi va sabotaj bilan tekshirilgan: Express `staffPayroll` da `db = tx || prisma` → `db = prisma` qilinganda test QIZIL bo'ldi (`paidAmount=50000` rollback'dan omon qoldi). |
| B21 | ✅ **HAL QILINDI — STORNO** | To'lov/chiqim bekor qilinganda jurnal TEGILMAY qolardi va bekor qilingan chiqim P&L da ABADIY chiqim, bekor qilingan to'lov esa ABADIY daromad bo'lib turardi (kassa qoldig'i ham yolg'on). | ✅ **QAROR: STORNO, QAYTARIM EMAS.** Qaytarim (`postRefund`) — "to'lov BO'LGAN, keyin pul qaytarildi"; bekor qilish esa "operatsiya UMUMAN BO'LMAGAN". `journal.reverse` allaqachon mavjud edi, LEKIN uni birorta biznes yo'li chaqirmasdi. Endi: `reverse(entryId, { postingKey, tx })` IDEMPOTENT (unique indeks; poyga P2002 bilan ushlanadi) va chaqiruvchi TRANZAKSIYASIDA; `financialTransaction.reverseByRef` manba hujjatning BARCHA yozuvlarini teskari aylantiradi (`findMany` — bitta hujjat ataylab bir nechta yozuv tug'dirishi mumkin). BESHTA yo'l ATOMAR: o'qituvchi maoshi, xodim maoshi, chiqim, depozit amali, o'quvchi to'lovi (batch bo'ylab). ⚠ **ESKI MA'LUMOT TUZATILMADI** — ilgari bekor qilingan yozuvlar uchun alohida backfill kerak (ONGLI qaror + tarixiy hisobotlarni qayta hisoblash). `test/journal-storno.test.mjs` (28/28): storno yaratiladi, ASL yozuv o'zgarmaydi, debet=kredit, FILIAL SOF QOLDIG'I NOLGA qaytadi (musbat nazorat bilan), takroriy `reverse()` ikkinchi yozuv yaratmaydi. |
| B22 | `TeacherSalary` da `isDeleted` ustuni YO'Q | `SalaryTransaction` da BOR — filtrlar assimetrik. | ✅ **TEKSHIRILDI — NUQSON EMAS, O'ZGARTIRILMADI.** O'LCHANDI: (1) sxemada `TeacherSalary.isDeleted` yo'q, `SalaryTransaction.isDeleted` bor; (2) ikkala stekdagi kodda `teacherSalary` so'roviga `isDeleted` filtri qo'llash urinishi **0 marta**. Ya'ni assimetriya hech qayerda xatoga olib kelmaydi. `TeacherSalary` — HOSILA jadval: u o'chirilmaydi, `recalcStatus` bilan qayta hisoblanadi, shuning uchun unda soft-delete ustuni bo'lishi NOTO'G'RI bo'lardi. |
| B31 | ⬜ (raqam ishlatilmagan) | — | — |
| B32 | ✅ **TUZATILDI (ikkala stekda)** — `GET /lesson-cancellations` | Ro'yxatga FILIAL KO'LAMI qo'llanmagan edi: ko'lamlangan xodim BUTUN TASHKILOTNING bekor qilingan darslarini ko'rardi. | ✅ `branchGroupFilter('groupId')` qo'shildi. Sabotaj bilan tekshirilgan regressiya testi bor. |
| B33 | ✅ **TUZATILDI (Express)** — `POST /leads/:id/convert` | `getById(lead._id)` — Prisma qatorida `_id` YO'Q, ya'ni chaqiruv HAR DOIM 500 berardi. ⚠ **ISH BAJARILGANDAN KEYIN**: lid allaqachon o'quvchiga aylantirilgan bo'lardi, klient esa xato ko'rardi va qayta urinardi. | ✅ `getById(lead.id)`. NestJS ko'chirmasi to'g'ri edi — bu Express tomonidagi yolg'iz nuqson. |
| B34 | ✅ **TUZATILDI (ikkala stekda)** — `groupInsight` DETEKTORLARI O'LIK EDI | `String(group._id)` = `"undefined"` (Prisma qatorida `_id` yo'q) → `size` HAR DOIM nol, `complaints.get()` HAR DOIM `undefined`. Ya'ni **`group_underfilled` va `group_complaints` insight'lari HECH QACHON yaratilmagan**. | ✅ `group.id ?? group._id`. ⚠ **XULQ O'ZGARADI**: bu ikki detektor endi HAQIQATAN ishlaydi va yangi insight'lar paydo bo'ladi — bu kutilgan natija, kodning O'Z niyati. |
| B35 | ✅ **TUZATILDI (ikkala stekda)** — `courseInsight` NOTO'G'RI TALAB RAQAMI | `demandByCourse` kaliti `String(course._id)` = `"undefined"` → butun jadval BITTA kalitga yig'ilardi va **HAR BIR kurs OXIRGI yo'nalishning talab raqamini olardi**. Jimgina NOTO'G'RI ma'lumot. | ✅ `course.id ?? course._id`. |
| B36 | ✅ **TUZATILDI (ikkala stekda)** — `teacherInsight` DETEKTORLARI O'LIK EDI | `const tid = String(teacher._id)` = `"undefined"` → `signals.get(tid)` `undefined` → sikl HAR BIR o'qituvchida `continue` qilardi. Ya'ni **uchala o'qituvchi insight'i (`attendance_issue`, `low_load`, `top_performer`) HECH QACHON yaratilmagan**. Bundan tashqari `loadMonthlyByTeacher` ham `"undefined"` kalitiga yozardi. | ✅ `teacher.id ?? teacher._id` (5 joyda). ⚠ **XULQ O'ZGARADI** — B34 bilan bir xil sabab. |
| B37 | ✅ **TUZATILDI (NestJS)** — `EntitlementsService` IKKI NUSXA BO'LARDI | U `JobsModule` da e'lon qilingan edi. AI moduli ham unga tayangach IKKINCHI nusxa paydo bo'lardi: heartbeat javobi BIR nusxaga yozilib, tarif darvozasi BOSHQASINI o'qirdi — u esa har doim bo'sh, ya'ni `isFeatureEnabled` har doim "ha" (ochiq yiqilish). **Paywall JIMGINA o'chib qolardi.** | ✅ `CommonModule` (`@Global`) ga ko'chdi — YAGONA nusxa. `JobsModule` uni endi provayder qilmaydi. |
| B38 | ⚠️ **JIDDIY — TUZATILDI (ikkala stekda)** — PARALLEL BEKOR QILISH BALANSNI MANFIYGA TUSHIRARDI | `findFirst({ isDeleted: false })` va keyingi `update` ORASIDA poyga: o'nta so'rov ham qatorni "bekor qilinmagan" deb o'qib, o'ntasi ham manfiy deltani qo'llardi. Prisma tranzaksiyasi TO'SMAYDI (Postgres standarti READ COMMITTED). **O'LCHANDI: bitta to'lovga 10 ta parallel `DELETE` → `paidAmount` = −27 000 000.** Ko'chirish kiritgan narsa EMAS — `applyPaidDelta(-amount)` guardsiz holda anchadan beri turardi. | ✅ SHARTLI-ATOMIK "band qilish": `update` → `updateMany({ where: { id, isDeleted: false } })`, `count === 0` bo'lsa 404. Faqat shartni YUTGAN so'rov balansga tegadi. Beshta yo'lda ham. ⚠ O'quvchi to'lovida yutmagan so'rov o'sha BO'LAKNI jimgina o'tkazib yuboradi — batch'ning qolgan bo'laklari boshqa so'rovga tegishli bo'lishi mumkin. `test/money-concurrency.test.mjs` (31/31). |
| B39 | ✅ **TUZATILDI (ikkala stekda)** — `GET /finance/student-payments` SARALASH BARQARORLIGI | `orderBy: { createdAt: "desc" }` — `createdAt` YAGONA EMAS (oylik generatsiya bir necha planni AYNI millisekundda yaratadi). Postgres tie holatida tartibni KAFOLATLAMAYDI: sahifalashda qator TUSHIB QOLISHI yoki TAKRORLANISHI mumkin. | ✅ `{ id: "desc" }` ikkinchi kalit. O'LCHANDI: shu sababdan `finance-core-parity` tasodifan qizil bo'lgan; tuzatishdan keyin uch marta ketma-ket 51/51 yashil. ⚠ B9 (`notification-templates`) da AYNI naqsh HAMON bor va u ATAYLAB tegilmagan — o'sha yerdagi izohga qarang. |
| B40 | ⚠️ **TUZATILDI (NestJS)** — `POST /auth/register-user` da VALIDATSIYA va TARIF CHEGARASI YO'Q EDI | (a) Express `validate(registerUserSchema)` qo'llaydi, NestJS `@Body()` ni XOM holda servisga uzatardi. O'LCHANDI: bo'sh tana → Express `400 VALIDATION_ERROR` + `details[].path`, NestJS `400 "Noto'g'ri rol"` (kod yo'q) — klient QAYSI maydon xato ekanini ko'rsata olmasdi. (b) Express `enforceUserLimit` bilan tarif chegarasini tekshiradi (`max_students`/`max_users`), NestJS'da bu YO'Q edi — **NestJS orqali limitdan ORTIQ foydalanuvchi yaratish mumkin edi (paywall teshigi)**. | ✅ (a) `registerUserSchema` TO'LIQ ko'chirildi (`superRefine` shoxlari bilan: `enrolledAt`/`hiredAt` majburiyligi va kelajak-kun to'sig'i). (b) `PlanLimitsService` (`CommonModule`, global) qo'shildi — yumshoq rejim, tekshiruv xatosida o'tkazish va 402 ni qayta tashlash Express bilan AYNAN bir xil. ⚠ Bu AI BYUDJETIDAN farq qiladi: byudjet YOPIQ yiqiladi (bizning pulimiz), tarif chegarasi esa MIJOZGA tegishli. |

---

## 6. KO'CHIRISHDAN KEYINGI XATO TUZATISH FAZASI (2026-08-21 … 08-22)

✅ **MARSHRUT KO'CHIRISH TUGADI: 399/399.** Bu bo'lim tuzatilgan
xatolarni va ATAYLAB o'zgartirilmagan qarorlarni qayd etadi.

⚠ **"KO'CHIRILDI" ≠ "EXPRESS O'CHIRILDI".** Kesishuv davrida NestJS
FAQAT HTTP xizmat qiladi; joblar, bot pollingi va import navbatini
EXPRESS yuritadi. Uchalasi ham OCHIQ bayroq bilan boshqariladi
(`NEST_WORKERS_ENABLED`, `NEST_BOT_POLLING`, worker ro'yxati) va
`test/jobs-infra.test.mjs` NestJS birorta cron jadvalini
yozmasligini qulflab turadi.

### 6.1 XATTI-HARAKAT O'ZGARISHLARI (klientga aytilishi SHART)

| Endpoint | Kim ta'sirlanadi | Oldin | Endi |
|---|---|---|---|
| `GET /admin-dashboard/retention` | filial direktori | butun tashkilot churn'i | faqat o'z filiali |
| `GET /admin-dashboard/churned-students` | filial direktori | **46 ta** (owner bilan bir xil) | faqat o'z filiali (o'lchovda **0 ta**) |
| `GET /activity-logs/:id` | ko'lamlangan xodim | begona filial logi **200** | **404** |
| `GET /grades/rating/students/:id` | ko'lamlangan xodim | begona o'quvchi **200** | **403** |
| `GET /groups/:id/teacher-periods` | ko'lamlangan xodim | begona guruh **200** | **404** |
| BUTUN `/api` (NestJS) | hamma | chegara YO'Q | **200 so'rov / 60s → 429** |

⚠ Birinchi beshtasi **IKKALA STEKDA BIR VAQTDA** o'zgartirildi — aks holda
paritet ataylab buzilib, tuzatish "ko'chirish regressiyasi" bo'lib
ko'rinardi.

⚠ Retention/churn raqamlarining kichrayishi **NUQSON EMAS** — ilgari
ko'rsatilgan raqam boshqa filiallarning ma'lumotini ham o'z ichiga olardi.

### 6.2 ATAYLAB O'ZGARTIRILMAGAN (ega qarori kerak)

| # | Nima | Nega tegilmadi |
|---|---|---|
| B22 | `TeacherSalary` da `isDeleted` yo'q | Nuqson emas: hosila jadval o'chirilmaydi, qayta hisoblanadi. Kodda unga `isDeleted` filtri qo'llash urinishi 0 marta. |
| B4 | `GET /notifications/stats` HAR DOIM 500 | Tuzatish javob shaklini 500 → 200 ga o'zgartiradi — ko'chirish ishi emas, mahsulot qarori. Ikkala stekda BIR XIL; test 500 ni qulflaydi. |
| B9 | `notification-templates` saralashda ikkilamchi kalit yo'q | B39 da AYNI naqsh moliya ro'yxatida tuzatildi (u yerda paritet testi buni TUTDI). Bu yerda tartib o'zgarishi klient ro'yxatini siljitadi — alohida qaror. |
| B13 | arxivlangan guruh `GET /groups/:id/history` → 400 | `GET /groups/:id` AYNI guruh uchun 200 beradi — aniq ziddiyat, lekin tuzatish javob kodini o'zgartiradi. |
| B16 | Express `consecutiveAbsences()` HAR CHAQIRUVDA yiqiladi (Mongo qoldig'i) | NestJS'da TO'G'RI yozilgan, lekin ogohlantirish `EXPRESS_NOTIFICATION_IS_DEAD` bayrog'i bilan ATAYLAB o'chirilgan — aks holda kesishuv davrida egalarga kutilmagan xabarlar oqimi ketardi. **Yoqish alohida qaror: Express ham tuzatilib, ikkalasi BIR VAQTDA yoqilishi kerak.** |
| B17 | `getDashboardStats().groupBreakdown` dars kunlarini SHISHIRADI | `select` ga `joinedAt`/`leftAt` qo'shilsa dashboard raqamlari O'ZGARADI. |
| B21 (eski) | — | ✅ **HAL QILINDI** (yuqoridagi jadvalga qarang). ⚠ **QOLGAN ISH:** ilgari bekor qilingan yozuvlar uchun jurnal backfill'i — u tarixiy hisobotlarni qayta hisoblaydi, ya'ni ONGLI qaror. |
| B30 | `intelligence` marshrutlari 12 servisni parallel chaqiradi | KOD nuqsoni EMAS (o'lchandi). **Cutover'da `connection_limit` sozlanishi kerak** — bu joylashtirish qarori. |

### 6.3 QO'SHILGAN QO'RIQCHILAR

| Test | Nimani qulflaydi |
|---|---|
| `test/route-matrix.mjs` | RO'YXATDAN o'qilgan marshrut tengligi (399/399) — manba fayllardan EMAS |
| `test/module-registration.test.mjs` | modul `AppModule` dan erishiladi — MANBADA HAM, QURILMADA HAM (60/60 modul, 52/52 kontroller) |
| `test/rate-limit-parity.test.mjs` | umumiy chegara ISHLAYDI + chelak MIJOZGA XOS + 429 tanasi/sarlavhasi paritetda |
| `test/fixture-residue.test.mjs` | to'plamlardan KEYIN bazada sinov qatori qolmagani (84 model, 27 maydon) |
| `test/db-invariants.test.mjs` | 23 ta baza invarianti: jurnal muvozanati, manfiy balans, ortiqcha to'lov, yetim qator, `StorageUsage` drifti, takrorlangan a'zolik |
| `test/upload-dir-parity.test.mjs` | ikkala stek AYNI fayl papkasini ko'rsatishi |
| `test/branch-scope-security.test.mjs` | to'rtta filial ko'lami sizishi YOPIQ (musbat + manfiy nazorat) |
| `test/money-atomicity.test.mjs` | B20 — rollback `paidAmount` ni ham qaytarishi (3 yo'l × 2 stek) |
| `test/journal-storno.test.mjs` | B21 — storno yaratiladi, ASL yozuv o'zgarmaydi, sof qoldiq NOLGA qaytadi, takroriy `reverse()` ikkinchi yozuv yaratmaydi |
| `test/money-concurrency.test.mjs` | B38 — 20 ta parallel to'lovdan bittasi; 10 ta parallel bekor qilishda BITTA storno va `paidAmount` AYNAN nol |
| `test/staff-payroll-concurrency.test.mjs` | xodim maoshi bo'yicha AYNI invariantlar (88 o'lchov) |
| `test/file-security.test.mjs` | imzo (magic bytes), kengaytma oq ro'yxati, MIME mosligi, EGALIK, kvota va disk qoldig'i |
| `test/ai-parity.test.mjs` | AI 15 marshruti + filial ko'lami + holat o'zgartirish (ko'zgu fikstura, baza holati bilan) |
| `test/ai-explain-wiring.probe.mjs` | B29 — AI ko'prigi HAQIQATAN ulanganini (soxta kalit bilan LLM shoxiga majburlab) |
| `test/jobs-infra.test.mjs` | 25/25 cron mosligi, `lockLifetime`, vaqt zonasi va **NestJS birorta cron jadvalini YOZMASLIGI** |

Har bir qo'riqchi **ATAYLAB BUZIB** tekshirildi: qo'riqchi olib
tashlanganda test QIZIL bo'lishi o'lchandi. Sabotaj har safar TOZA
`dist` dan qurildi — eski emit "bypass isbotlandi" degan YOLG'ON
natija berardi.
