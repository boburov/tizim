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
| `middleware/rateLimiter.js` | ✅ `common/middleware/rate-limit.ts` |
| `middleware/auditLog.middleware.js` | ⬜ FAZA 2.7 |
| `middleware/attendanceScope.js` | ⬜ FAZA 6 |
| `middleware/enforceLimit.js` | ⬜ |
| `middleware/uploadAttachment.js`, `uploadSheet.js` | ⬜ FAZA 10 (multer) |
| `middleware/requireDatasetPermission.js` | ⬜ FAZA 9 (exports) |
| `middleware/requireImporterPermission.js` | ⬜ FAZA 10 (imports) |
| `helpers/branchAccess.helper.js` | ✅ `common/rbac/branch-access.service.ts` |
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
| `helpers/userRelations.helper.js`, `cascadeDelete.helper.js` | ⬜ FAZA 2.5 |
| `helpers/group.helper.js`, `membership.helper.js`, `period.helper.js` | ⬜ FAZA 6 |
| `helpers/attendance.helper.js`, `lessonCancellation.helper.js` | ⬜ FAZA 6 |
| `helpers/studentFreeze.helper.js` | ⬜ FAZA 4 |
| `helpers/roomOccupancy.helper.js` | ⬜ FAZA 3 |
| `constants/delegation.js` | ✅ `common/constants/delegation.ts` |
| `constants/payrollAudit.js` | ✅ `common/constants/payroll-audit.ts` |
| `helpers/selfSalary.guard.js` | ⬜ FAZA 8 |
| `helpers/correlationCache.js`, `configMetrics.helper.js` | ⬜ FAZA 9 |
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
| 2.5b | users (hayot sikli) | `/api/users` | 4/14 | ⬜ FAZA 7/8 dan keyin |
| 2.6 | botAuth | `/api/bot-auth` | 2 | ⬜ |
| 2.7 | activityLogs + auditLog middleware | `/api/activity-logs` | 3 | ⬜ |

### FAZA 3 — TASHKILIY TUZILMA
| Modul | Manzil | E | Holat |
|---|---|---|---|
| branches | `/api/branches` | 8 | ✅ 8/8 |
| rooms | `/api/rooms` | 5 | ⬜ **KEYINGI** |
| courses | `/api/courses` | 9 | ⬜ |
| holidays | `/api/holidays` | 7 | ⬜ |
| archiveReasons | `/api/archive-reasons` | 6 | ⬜ |
| leadOptions | `/api/lead-options` | 4 | ⬜ |
| feedbackTypes | `/api/feedback-types` | 5 | ⬜ |
| attendanceSettings | `/api/attendance-settings` | 2 | ⬜ |

### FAZA 4 — O'QUVCHILAR
| Modul | Manzil | E | Holat |
|---|---|---|---|
| leads | `/api/leads` | 16 | ⬜ |
| studentFreeze | `/api/student-freezes` | 3 | ⬜ |
| activityHistory | `/api/activity-history` | 2 | ⬜ |
| search | `/api/search` | 1 | ⬜ |

> O'quvchi/o'qituvchi **alohida jadval emas** — `User` + `role`/`roleType`.
> Shuning uchun "students" va "teachers" modullari `users` ichida (2.5).

### FAZA 5–6 — GURUHLAR / TA'LIM
| Modul | Manzil | E | Holat |
|---|---|---|---|
| groups | `/api/groups` | 24 | ⬜ |
| attendance | `/api/attendance` | 11 | ⬜ |
| teacherAttendance | `/api/teacher-attendance` | 2 | ⬜ |
| attendanceExemptions | `/api/attendance-exemptions` | 4 | ⬜ |
| lessonCancellations | `/api/lesson-cancellations` | 3 | ⬜ |
| grades | `/api/grades` | 8 | ⬜ |
| assignments | `/api/assignments` | 10 | ⬜ |

### FAZA 7 — MOLIYA (eng ehtiyotkorlik talab qiladigan)
| Modul | Manzil | E | Holat |
|---|---|---|---|
| finance | `/api/finance` | 13 | ⬜ |
| deposits | `/api/deposits` | 8 | ⬜ |
| expenses | `/api/expenses` | 10 | ⬜ |
| expenseApprovals | `/api/expense-approvals`, `/api/approvals` | 10 | ⬜ |
| journal | `/api/journal` | 9 | ⬜ |
| ledger | `/api/ledger` | 2 | ⬜ |
| openingBalance | `/api/opening-balance` | 3 | ⬜ |
| financeOps | `/api/finance-ops` | 8 | ⬜ |
| financeReport | `/api/finance-report` | 5 | ⬜ |

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
| notifications | `/api/notifications` | 11 | ⬜ |
| systemNotifications | `/api/system-notifications` | 5 | ⬜ |
| notificationTemplates | `/api/notification-templates` | 5 | ⬜ |
| feedback | `/api/feedback` | 9 | ⬜ |
| storage | `/api/storage` | 7 | ⬜ |
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

**2.5b (FAZA 7/8 dan keyin)** — hayot sikli, moliyaga tegadigan 4 marshrut:
`POST /staff`, `DELETE /:id`, `POST /:id/restore`, `DELETE /:id/permanent`.

### Meros qilib olingan cheklov (Faza 2.3 dan)

`buildUserProfile` O'QUVCHI/O'QITUVCHI uchun NestJS'da 501
(`PROFILE_NOT_MIGRATED`). Ta'sir qiladigan marshrutlar: `/auth/me`,
`GET /users/:id`, `PATCH /users/:id/role`, `PATCH /users/:id/branches`.
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
