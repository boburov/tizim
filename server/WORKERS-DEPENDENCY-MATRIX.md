# FON ISHLARI / BOT — BOG'LIQLIK MATRITSASI

Holat sanasi: 2026-08-21. Agent 5 (workers, schedulers, jobs, Telegram bot).
Manba: `server/src/jobs`, `server/src/queues`, `server/src/bot`,
`server/src/modules/botAuth`. Maqsad: `server_nest/src`.

> **ASOSIY QOIDA:** job KO'CHIRILMAYDI, toki uning BARCHA biznes
> servislari NestJS'da tayyor bo'lmaguncha. Matritsa aynan shu qarorni
> hujjatlashtiradi — "ko'chirilmadi" degan har bir qator o'z sababini
> ko'rsatadi.

---

## 0. XULOSA

| To'plam | Soni | NestJS holati |
|---|---|---|
| pg-boss cron joblari | 23 (24 ta e'lon, `aiReports` 3 ta job beradi) | **6 ta ko'chirildi**, 17 ta BLOKLANGAN |
| Hodisaga ko'ra ishlaydigan joblar | 3 (`notification.deliver`, `notification.send`, `assignment.deliver`) | 2 ta ko'chirildi, 1 ta BLOKLANGAN |
| Boot catch-up (cron emas) | 4 (`catchUpMonthly`, `processDueGroupEnds`, `accrueToday`, `reconcileStorage`) | 1 ta ko'chirildi (`reconcileStorage`), 3 ta BLOKLANGAN |
| BullMQ navbat (Redis) | 1 (`bulk-import`) | 0 — BLOKLANGAN |
| Telegram bot (jonli yuza) | 2 buyruq + 3 hodisa + 2 yetkazish servisi | ✅ ko'chirildi (POLLING O'CHIQ) |
| Telegram autentifikatsiya | `/api/bot-auth/verify`, `/api/bot-auth/login` | ✅ ko'chirildi |

**Ikkilanish (duplicate) himoyasi:** `NEST_WORKERS_ENABLED` va
`NEST_BOT_POLLING` standart holda **`false`**. Express — yagona faol
worker va yagona poller. Batafsil: §4.

---

## 1. MATRITSA — CRON JOBLARI

Ustunlar: **Jadval** = job to'g'ridan-to'g'ri yoki servis orqali
tegadigan asosiy jadvallar. **Filial** = ALS filial konteksti.
**Yon ta'sir** = bazadan tashqari kuzatiladigan natija.

### 1.1 BILDIRISHNOMA OILASI

| Job | Cron (Asia/Tashkent) | Servislar | NestJS modul talabi | Jadvallar | Ruxsat | Filial | Tashqi API | Yon ta'sir | Holat |
|---|---|---|---|---|---|---|---|---|---|
| `daily.holiday-greetings` | `30 8 * * *` | `holidays.getTodayHolidays/isAlreadySentToday/markSent`, `notifications.send` | **holidays** ✅, **notifications** ✅ | `holidays`, `notifications`, `notification_recipients`, `users`, `bot_users` | yo'q (tizim) | GLOBAL | Telegram | TG xabar (barcha o'quvchi+o'qituvchi) | ✅ **KO'CHIRILDI** |
| `daily.attendance-unmarked` | `0 20 * * *` | `attendance.listForGroupOnDate`, `notifications.send` | **attendance** ✅, **notifications** ✅ | `groups`, `group_schedules`, `attendance`, `group_memberships`, `notifications`, `users` | yo'q | GLOBAL | Telegram | TG xabar (o'qituvchi + owner digest) | ✅ **KO'CHIRILDI** |
| `daily.lesson-reminder` | `0 6 * * *` | `notifications.send`, `holidays.holidayKeySetForRange`, **`lessonCancellation.helper`**, `studentFreeze.helper`, `attendance.helper` | holidays ✅, notifications ✅, studentFreeze ✅, attendance helper ✅ — **YETISHMAYDIGANI: `lessonCancellations`** | `groups`, `group_schedules`, `group_memberships`, `holidays`, `lesson_cancellations`, `student_freezes`, `users`, `notifications` | yo'q | GLOBAL | Telegram | TG xabar (har o'quvchiga) | ⛔ BLOKLANGAN — `loadCancelledLessonKeys`/`isCancelledSession` yo'q. Ularsiz BEKOR QILINGAN darsga eslatma ketardi |
| `weekly.low-attendance` | `30 9 * * 1` | `attendance.getDashboardStats`, `notifications.send` | **attendance** ✅, **notifications** ✅ | `attendance`, `groups`, `attendance_settings`, `users`, `notifications` | yo'q | GLOBAL | Telegram | TG xabar (owner) | ✅ **KO'CHIRILDI** |
| `notification.deliver` | hodisaga ko'ra (`scheduler.now`), qulf 5 daq | `notifications.deliverNotification` → `bot/notificationDeliver` | **notifications** ✅ | `notifications`, `notification_recipients`, `bot_users` | yo'q | GLOBAL | Telegram | TG xabar | ✅ **KO'CHIRILDI** |
| `notification.send` | `scheduler.at(when)`, qulf 5 daq | `notifications.dispatchScheduled` | **notifications** ✅ | `notifications`, `notification_recipients` | yo'q | GLOBAL | Telegram | TG xabar | ✅ **KO'CHIRILDI** |
| `assignment.deliver` | hodisaga ko'ra (`scheduler.now`) | `assignments.deliverAssignment` → `bot/assignmentDeliver` | **assignments**, **storage** | `assignments`, `assignment_recipients`, `bot_users`, fayl tizimi | yo'q | GLOBAL | Telegram | TG hujjat | ⛔ BLOKLANGAN (bot yetkazish qatlami ✅ tayyor) |

**Idempotentlik kaliti:** `notifications.send` dagi `dedupeKey`
(`holiday:<id>:<audience>:<dayKey>`, `att-unmarked:<teacherId>:<dayKey>`,
`lesson-reminder:<studentId>:<dayKey>`, `low-attendance-owner:<dayKey>`,
`ai-digest:<branchId>:<dayKey>`). `deliverNotification` faqat
`botDeliveredAt IS NULL` oluvchilarni uradi; `deliverAssignment` faqat
`status="pending"` ni uradi. **Bu ikkisi ko'chirishda AYNAN saqlanishi shart.**

### 1.2 LID OILASI

| Job | Cron | Servislar | NestJS modul talabi | Jadvallar | Ruxsat | Filial | Tashqi API | Yon ta'sir | Holat |
|---|---|---|---|---|---|---|---|---|---|
| `lead.followup-reminders` | `*/5 * * * *` | `leads.dueReminders/markReminderNotified`, **`leadNotify.notifyLeadReminder`**, `systemNotifications.create` | leads ✅, notifications ✅, systemNotifications ✅ — **YETISHMAYDIGANI: `leads/leadNotify.service` (119 qator)** | `leads`, `notifications`, `system_notifications`, `users`, `bot_users` | yo'q | GLOBAL | Telegram | TG xabar + panel bildirishnomasi; `markReminderNotified` FAQAT yuborilgandan KEYIN | ⛔ BLOKLANGAN |
| `lead.daily-digest` | `0 9 * * *` | `leads.remindersUpTo`, **`leadNotify.sendDailyDigest`** | leads ✅, notifications ✅ — **YETISHMAYDIGANI: `leads/leadNotify.service`** | `leads`, `notifications`, `users` | yo'q | GLOBAL | Telegram | TG digest (xodim bo'yicha) | ⛔ BLOKLANGAN |

### 1.3 MOLIYA / MAOSH OILASI  ⚠ PUL YOZADI

| Job | Cron | Servislar | NestJS modul talabi | Jadvallar | Ruxsat | Filial | Tashqi API | Yon ta'sir | Holat |
|---|---|---|---|---|---|---|---|---|---|
| `monthly.generate-finance` | `5 0 1 * *` | `finance/report.regenerate(year,month)` | **finance** | `student_payments`, `group_payments`, `group_memberships`, `groups` | yo'q | GLOBAL | — | To'lov qatorlari YARATILADI (mavjudi tegilmaydi) | ⛔ BLOKLANGAN |
| `monthly.generate-salary` | `6 0 1 * *` | `teacherSalary/salaryReport.regenerate` | **teacherSalary** | `teacher_salaries`, `group_teacher_periods`, `attendance` | yo'q | GLOBAL | — | Maosh qatorlari YARATILADI | ⛔ BLOKLANGAN |
| `monthly.generate-staff-payroll` | `7 0 1 * *` | `staffPayroll.generateMonth` | **staffPayroll** (Nest'da faqat `payroll-audit` ✅) | `staff_payrolls`, `users` | yo'q | GLOBAL | — | Draft payroll qatorlari | ⛔ BLOKLANGAN |
| `daily.accrue-finance` | `20 0 * * *` | `finance/studentPayment.accrueMonth`, `deposits.autoApplyForMonth` | **finance**, **deposits** | `student_payments`, `group_memberships`, `student_freezes`, `deposits`, `ledger_entries` | yo'q | GLOBAL | — | Qarz snapshot QAYTA HISOBLANADI + depozitdan avto-qoplash (PUL KO'CHADI) | ⛔ BLOKLANGAN |
| *boot* `catchUpMonthly` | startupda (cron emas) | `finance/report.regenerate`, `teacherSalary/salaryReport.regenerate` | **finance**, **teacherSalary** | yuqoridagilar | yo'q | GLOBAL | — | O'tkazib yuborilgan oylik generatsiya | ⛔ BLOKLANGAN |
| *boot* `accrueToday` | startupda | = `daily.accrue-finance` | **finance**, **deposits** | yuqoridagilar | yo'q | GLOBAL | — | = yuqoridagi | ⛔ BLOKLANGAN |

> ⚠ **IKKILANISH XAVFI ENG YUQORI SHU YERDA.** `autoApplyForMonth`
> depozitdan qarzga pul ko'chiradi. Ikki jarayon bir vaqtda ishlasa
> idempotentlik faqat `student_payments` snapshot darajasida kafolatlanadi,
> depozit harakati esa EMAS. Bu oila NestJS'ga faqat Express worker
> **butunlay to'xtatilgandan keyin** o'tadi.

### 1.4 GURUH / TA'LIM OILASI

| Job | Cron | Servislar | NestJS modul talabi | Jadvallar | Ruxsat | Filial | Tashqi API | Yon ta'sir | Holat |
|---|---|---|---|---|---|---|---|---|---|
| `daily.auto-end-groups` | `10 0 * * *` | `groups.processDueGroupEnds` | **groups** | `groups`, `group_teacher_periods`, `group_memberships` | yo'q | GLOBAL | — | Guruh arxivlanadi, davrlar/a'zoliklar yopiladi | ⛔ BLOKLANGAN |
| *boot* `processDueGroupEnds` | startupda | = yuqoridagi | **groups** | yuqoridagilar | yo'q | GLOBAL | — | = yuqoridagi | ⛔ BLOKLANGAN |

### 1.5 AI OILASI

| Job | Cron | Servislar | NestJS modul talabi | Jadvallar | Ruxsat | Filial | Tashqi API | Yon ta'sir | Holat |
|---|---|---|---|---|---|---|---|---|---|
| `daily.ai-lifecycle` | `40 0 * * *` | `ai/lifecycle.runLifecycle` | **ai** | `insights`, `ai_runs` | yo'q | GLOBAL (texnik tozalash) | — | Insight YOPILADI/o'chiriladi, natija (outcome) belgilanadi | ⛔ BLOKLANGAN |
| `daily.ai-recompute` | `0 1 * * *` | `ai/recompute.recomputeAll({scope:"full"})` | **ai** + **groups**, **attendance**, **finance**, **leads**, **teacherSalary** | `insights`, `ai_runs`, + barcha domen jadvallari | yo'q | **HAR FILIAL** (`runWithBranchContext`) | — | Insight yaratiladi/yangilanadi | ⛔ BLOKLANGAN |
| `intraday.ai-refresh` | `0 9,12,15,18,21 * * *` | `recomputeAll({scope:"fast"})` | = yuqoridagi | = yuqoridagi | yo'q | **HAR FILIAL** | — | Faqat FAST_PIPELINE detektorlari | ⛔ BLOKLANGAN |
| `daily.ai-report` | `0 7 * * *` | `ai/report.buildReportsForAll("daily")` | **ai** | `ai_reports`, `insights`, domen jadvallari | yo'q | **HAR FILIAL** | — | Hisobot SAQLANADI (qayta hisoblanmaydi) | ⛔ BLOKLANGAN |
| `weekly.ai-report` | `10 7 * * 1` | `buildReportsForAll("weekly")` | **ai** | = yuqoridagi | yo'q | **HAR FILIAL** | — | = yuqoridagi | ⛔ BLOKLANGAN |
| `monthly.ai-report` | `20 7 1 * *` | `buildReportsForAll("monthly")` | **ai** | = yuqoridagi | yo'q | **HAR FILIAL** | — | = yuqoridagi | ⛔ BLOKLANGAN |
| `daily.ai-morning-digest` | `0 8 * * *` | `notifications.send`, `insightWriter.fmtMoney`, `pulse.localDayKey` | **ai**, **notifications** | `insights`, `ai_reports`, `branches`, `users`, `notifications` | yo'q | **HAR FILIAL** | Telegram | TG digest owner'ga (`dedupeKey: ai-digest:<branch>:<day>`) | ⛔ BLOKLANGAN |
| `hourly.ai-narration` | `25 * * * *` | `ai/narrationQueue.runNarrationQueueLogged` | **ai** | `insights`, `ai_usage_logs`, `ai_runs` | yo'q | GLOBAL | **Gemini API** | Insight matni yoziladi; byudjet/usage hisobi | ⛔ BLOKLANGAN |

**AI da SAQLANISHI SHART bo'lgan invariantlar** (ko'chirish paytida tekshiriladi):
insight taksonomiyasi (`stance` × `severity` × `status`), deduplikatsiya
(subyekt+detektor kaliti), byudjet (`resolveCallCap()` = `MIN(tarif, env)`),
usage hisobi (`calls` faqat `ok:true`, `costUsd` HAMMASI), snapshot'lar
(`ai_reports` qayta hisoblanmaydi), reyting (`priority` bo'yicha tartib),
hisobot davrlari (O'TGAN TUGAGAN davr, joriy EMAS).

### 1.6 TIZIM / INFRATUZILMA OILASI

| Job | Cron | Servislar | NestJS modul talabi | Jadvallar | Ruxsat | Filial | Tashqi API | Yon ta'sir | Holat |
|---|---|---|---|---|---|---|---|---|---|
| `daily.ttl-cleanup` | `15 3 * * *` | — (faqat Prisma) | **YO'Q** | `caches`, `refresh_tokens`, `ai_runs`, `ai_usage_logs` | yo'q | GLOBAL | — | Eskirgan qatorlar O'CHIRILADI (90d / 400d / `expiresAt`) | ✅ **KO'CHIRILDI** |
| `storage.cleanup` | `30 2 * * *`, qulf 30 daq | `storageAdmin.runScheduledCleanup` | **storage** ✅ | `storage_settings`, `assignments`, fayl tizimi | yo'q | GLOBAL | — | FAYL O'CHIRADI (diskdan, qaytmaydi) | ✅ **KO'CHIRILDI** |
| `usage.heartbeat` | `*/15 * * * *` (+1 marta startupda) | `aiBudget.monthlyUsage` (bitta raw SQL), `entitlements.setEntitlements` | **YO'Q** (leaf bog'liqliklar birga ko'chirildi) | `users`, `groups`, `ai_usage_logs`, `pg_database_size()` | yo'q | GLOBAL | **Admin panel API** | POST heartbeat; javobdan entitlements keshi to'ldiriladi | ✅ **KO'CHIRILDI** |
| *boot* `reconcileStorage` | startupda (`runOnBoot`) | `storage.reconcile` | **storage** ✅ | `storage_usage` + disk | yo'q | GLOBAL | — | Kvota hisoblagichi tekislanadi (idempotent) | ✅ **KO'CHIRILDI** |

---

## 2. NAVBAT (BullMQ / Redis)

| Navbat | Trigger | Servislar | NestJS modul talabi | Jadvallar | Ruxsat | Filial | Holat |
|---|---|---|---|---|---|---|---|
| `bulk-import` | `POST /api/imports/...` → `enqueueImport` | `imports/registry`, `importEngine.commitRows`, `runWithBranchContext` | **imports** + har bir importer tegadigan modul (users, groups, leads, finance…) | `import_jobs` + importer maqsadli jadvallari | `requireImporterPermission` (importer kaliti bo'yicha) | **jobdagi `scope`** (`runWithBranchContext`) | ⛔ BLOKLANGAN |

Qulf: `importJob.updateMany({ where: { status: "queued" } })` — atomik
da'vo (claim). `attempts: 1` (qayta urinish YO'Q), `jobId: import:<id>`
(BullMQ darajasida dublikat yaratmaydi). Redis sozlanmagan bo'lsa
import SINXRON bajariladi.

---

## 3. TELEGRAM

### 3.1 Bot ish vaqti (runtime)

| Qism | Express | Bog'liqlik | NestJS holati |
|---|---|---|---|
| Bot nusxasi (`bot.instance`) | `node-telegram-bot-api`, `polling:false` | env | ✅ `bot/telegram-bot.service.ts` |
| Polling qulfi (`bot_locks` id=`poller`, TTL 90s, heartbeat 30s, fail-open) | Prisma | `bot_locks` | ✅ `bot/bot-poll-lock.service.ts` |
| `/start` | matn + WebApp inline tugma | `APP_NAME`, `TELEGRAM_BOT_WEBAPP_URL` | ✅ |
| `/help` | matn | `APP_NAME` | ✅ |
| Boshqa matn → "Tizimga kirish uchun /start ni bosing." | — | — | ✅ |
| `polling_error` / `webhook_error` / `error` hodisalari | logger | — | ✅ |
| `setMyCommands` (start, help) | Telegram API | — | ✅ |
| `deliverToChat` (bildirishnoma yetkazish, 429 retry, 403→blok) | `bot_users` | — | ✅ (iste'molchisi = `notifications`, hali BLOKLANGAN) |
| `deliverAssignmentToChat` (hujjat, caption 1024, `file_id` keshi) | `bot_users` | — | ✅ (iste'molchisi = `assignments`, hali BLOKLANGAN) |
| `markBlocked` | `bot_users` | — | ✅ |
| `handlers/myAttendance`, `myGroup(s)`, `schedule`, `teacherAttendance`, `groupStudents`, `contact`, `cancel`, `feedbackBot` | **`bot.router.js` da ULANMAGAN — Express'da O'LIK KOD** | — | ⛔ ATAYLAB ko'chirilmadi |
| `botUser.upsertFromTelegram / linkByPhone / getLinkedUser / flowState` | faqat yuqoridagi o'lik handlerlar chaqiradi | — | ⛔ ATAYLAB ko'chirilmadi |

### 3.2 Telegram autentifikatsiya

| Marshrut | Himoya | Servislar | Jadvallar | NestJS holati |
|---|---|---|---|---|
| `POST /api/bot-auth/verify` | OCHIQ + `botVerifyLimiter` (40/1min) — initData HMAC ning O'ZI autentifikatsiya | `verifyInitData`, `issueTokens`, `sanitizeUser`, `resolveRole` | `bot_users`, `users`, `refresh_tokens`, `roles` | ✅ |
| `POST /api/bot-auth/login` | OCHIQ + `authLimiter` (20/5min) | `verifyInitData`, parol tekshiruvi, `linkTelegram`, `issueTokens` | `users`, `bot_users`, `refresh_tokens`, `roles` | ✅ |

Saqlangan xatti-harakat: HMAC 4 variantli check-string (`signature`
bor/yo'q × dekodlangan/xom), `auth_date` 24 soat, ko'p-akkaunt bog'lash
(`(telegramId, userId)` juftligi bo'yicha upsert — eski bog'lanish
UZILMAYDI), `viaBot` belgisi, muzlatilgan rol tekshiruvi.

> ⚠ **EXPRESS'DA TOPILGAN BUZILISH** (§5 ga qarang): Express
> `botAuth.service.js` mavjud bo'lmagan sxemaga murojaat qiladi
> (`user.password`, `login` maydoni, `include: { role, branches }`) va
> `issueTokens` ni NOTO'G'RI imzo bilan chaqiradi. Ya'ni ikkala marshrut
> ham hozir Express'da 500 beradi. NestJS versiyasi buzilishni EMAS,
> **maqsadni** ko'chirdi.

---

## 4. IKKILANISHNING OLDINI OLISH (duplicate execution)

### 4.1 ⚠ PRODUSER ≠ ISHCHI — eng muhim farq

| Rol | Nima qiladi | Ikkilanish beradimi | NestJS'da |
|---|---|---|---|
| **PRODUSER** | Navbatga ish QO'YADI (`scheduler.now` / `at`) | **YO'Q** — bitta HTTP so'rov → bitta yozuv | ✅ HAR DOIM yoqiq |
| **ISHCHI (worker)** | Navbatdan ish OLADI va bajaradi | **HA** | ⛔ `NEST_WORKERS_ENABLED` bilan yopiq |
| **CRON SOATI** | Jadval bo'yicha ish YARATADI | **HA — eng xavflisi** | ⛔ pg-boss `schedule: false` |

NestJS produser sifatida ishlashi SHART: `notifications` moduli
ko'chirilgan va u `notification.deliver` ni navbatga qo'yadi. Agar
qo'ya olmasa, NestJS orqali yuborilgan xabar Telegram'ga UMUMAN
yetmasdi. Qo'ygan ishni **Express'ning ishchisi** oladi — zanjir
uzilmaydi va hech narsa ikki marta bajarilmaydi.

Shuning uchun produser rejimida pg-boss ATAYLAB cheklangan holda ulanadi:

```
supervise: false      texnik xizmatni Express bajaradi
schedule:  false      ⚠ CRON SOATI YURITILMAYDI — busiz Express
                      ro'yxatga olgan 22 ta cron NestJS tomonidan HAM
                      ishga tushardi (kuniga ikki marta accrual)
migrate / createSchema: false
                      `pgboss` sxemasi Express'niki; ikkinchi ilova
                      uni ko'chirmaydi
```

### 4.2 Bayroqlar — ikkalasi ham standart holda YOPIQ

1. **`NEST_WORKERS_ENABLED` (standart `false`)** — `JobsModule` navbat
   yaratmaydi, `boss.work()` chaqirmaydi va cron jadvalini YOZMAYDI.
   Express — yagona ishchi va yagona cron egasi.
2. **`NEST_BOT_POLLING` (standart `false`)** — bot nusxasi yaratiladi
   (yuborish uchun), lekin `startPolling()` chaqirilmaydi. Yoqilgan
   taqdirda ham `bot_locks` jadvalidagi `poller` qulfi Express bilan
   BIR XIL (id, TTL, holder shakli) — ikkinchi poller qulfni ololmay
   "faqat yuborish" rejimida qoladi. Telegram 409 Conflict bo'lmaydi.

`NEST_WORKERS_ENABLED=true` bo'lsa ham FAQAT `NEST_WORKER_JOBS`
ro'yxatidagi joblar ro'yxatga olinadi (izolyatsiya rejimi); bo'sh
ro'yxat — hech biri (fail-closed), noma'lum nom esa jimgina emas,
XATO bilan loglanadi. Ya'ni "hammasini birdan yoqib yuborish" tasodifan
sodir bo'lmaydi.

Kesib o'tish (cutover) tartibi, oila bo'yicha:
`Express STOP → Nest START`. HECH QACHON ikkalasi birga emas, chunki
idempotentlik yuqoridagi jadvallarda faqat `dedupeKey` va status
o'tishlari darajasida kafolatlangan; depozit ko'chirish va Telegram
yuborish esa kafolatlanmagan.

---

## 5. EXPRESS'DA TOPILGAN BUZILISHLAR (ko'chirishda ko'chirilMADI)

| Joy | Muammo | Natija | NestJS'da |
|---|---|---|---|
| `botAuth.service.js:loginAndLink` | `where: { login: ... }` — `User` da `login` maydoni YO'Q (`username`) | Prisma validatsiya xatosi → 500 | `username` ishlatiladi |
| `botAuth.service.js` (2 joy) | `include: { role: true, branches: true }` — `role` SKALYAR, `branches` relation nomi `branchAssignments` | Prisma validatsiya xatosi → 500 | `resolveRole(user.role)` |
| `botAuth.service.js` | `comparePassword(password, c.password)` — maydon `passwordHash` va u global `omit` bilan yashirilgan | bcrypt xatosi | `omit: { passwordHash: false }` |
| `botAuth.service.js` | `issueTokens({ userId, permissions, ... })` — haqiqiy imzo `issueTokens(user, { userAgent, ip })` | `payload.sub = undefined` | To'g'ri imzo |
| `verify.handler.js` / `login.handler.js` | `{ accessToken, refreshToken, user, roleMeta }` kutiladi, servis `{ linked, user, tokens }` qaytaradi | `refreshToken = undefined` cookie'ga yoziladi | Servis to'g'ri shakl qaytaradi |

Ya'ni **Telegram orqali kirish hozir Express'da ishlamaydi**. NestJS
porti uni tiklaydi; Express tomonini tuzatish bu agentning ko'lamidan
tashqarida (marshrut trafigi hamon Express'da) — lekin bu yerda ochiq
qayd etildi.

---

## 6. KEYINGI QADAMLAR — BOG'LIQLIK TARTIBIDA

Har bir qator: "bu modullar tayyor bo'lgach, bu joblar oilasi ko'chadi".

| Kutilayotgan NestJS modullari / servislar | Ochiladigan job oilasi |
|---|---|
| `groups.processDueGroupEnds` (groups hozir FAQAT O'QISH) | `daily.auto-end-groups` + boot catch-up |
| `leads/leadNotify.service` (119 qator, leads egasiga tegishli) | `lead.followup-reminders`, `lead.daily-digest` |
| `lessonCancellations` helperlari | `daily.lesson-reminder` |
| `finance/report.regenerate` + `finance/studentPayment.accrueMonth` + `deposits` | `monthly.generate-finance`, `daily.accrue-finance` + boot catch-up'lar |
| `teacherSalary/salaryReport.regenerate` | `monthly.generate-salary`, boot `catchUpMonthly` |
| `staffPayroll.generateMonth` (hozir faqat `payroll-audit`) | `monthly.generate-staff-payroll` |
| `notifications` + `attendance` + `groups` | `daily.attendance-unmarked`, `weekly.low-attendance` |
| `notifications` + `holidays` + `lessonCancellations` + `groups` | `daily.lesson-reminder` |
| `notifications` + `leads` + `systemNotifications` | `lead.followup-reminders`, `lead.daily-digest` |
| `assignments` + `storage` | `assignment.deliver`, `storage.cleanup` + boot reconcile |
| `finance` + `deposits` | `daily.accrue-finance`, `monthly.generate-finance` + catch-up |
| `teacherSalary` | `monthly.generate-salary` |
| `staffPayroll` | `monthly.generate-staff-payroll` |
| `ai` (+ domen modullari) | 8 ta AI job |
| `imports` | `bulk-import` navbati |
