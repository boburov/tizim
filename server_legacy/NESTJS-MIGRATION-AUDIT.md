# PHASE 0 — PROJECT AUDIT

**Scope:** `server/` (Bayyina ERP backend) → NestJS + Prisma + PostgreSQL
**Date:** 2026-08-20 · **Baseline commit:** `6766c13` · **No code was modified.**

---

## 0. Executive summary — read this before anything else

Four findings change the shape of the migration plan. Each is verified against
the code, not the docs.

### 0.1 `MIGRATION.md` was STALE — the runtime was already 100% Prisma. ✅ **Stage A now complete.**

`MIGRATION.md` claims 110 files remain on Mongoose and that `/leads`,
`/expenses`, `/attendance`, `/ai`, `/imports`, `/exports`, `/ledger` etc.
return `501`. **This is no longer true.**

Verified by exhaustive grep across `modules/ helpers/ jobs/ bot/ middleware/
queues/ utils/ config/`:

| Check | Result |
|---|---|
| Module files importing a Mongoose model as a query object | **0** |
| Mongoose query idioms (`.lean()`, `.populate()`, `.countDocuments()`, `.aggregate([...])`) on the runtime path | **0** — every grep hit is a *comment* documenting the old Mongo equivalent |
| Files importing `config/prisma.js` | **158** |
| `prisma.*.aggregate(` call sites | 19+ (all Prisma) |

The only surviving Mongoose references are:

1. `src/models/**` — 74 dead schema files. Still imported by **5 modules**, but
   only for **exported constants**, never for queries:
   `DEFAULT_THRESHOLDS` (ai ×6), `GROUP_DAYS` (ai), `AI_REPORT_PERIODS` (ai),
   `STAFF_SALARY_TYPES` (imports), `CLEANUP_FREQUENCIES` (storage).
2. `src/seeds/**` — 22 seed/backfill scripts, genuinely still on Mongoose.
3. `config/legacyMongoose.js` + `middleware/errorHandler.js` — the `501
   MODULE_NOT_MIGRATED` shim, now **dead code that can never fire**.

> **UPDATE (Stage A done):** `src/models/`, `config/legacyMongoose.js`, the
> `errorHandler` Mongoose branches, the `501 MODULE_NOT_MIGRATED` contract and
> the `mongoose` dependency have all been removed; 8 seeds ported to Prisma and
> 14 obsolete Mongo-era one-off seeds deleted. All 816 files in `src/` parse and
> every relative import resolves. **Remaining:** 27 legacy Mongo test files
> (already non-functional before this work) — see §Stage A note below.

**Consequence:** the "gradual dual-stack" transition strategy in Phase 14 of the
brief is aimed at a problem that no longer exists. We are migrating a
single-ORM, working application — which is *much* safer, but it also means the
`501` safety net is gone: a NestJS module that silently returns wrong data will
not announce itself.

### 0.2 The single hardest architectural constraint is `AsyncLocalStorage`

`helpers/branchContext.helper.js` holds branch scope in an ALS store, entered
**inside `requireAuth`**:

```js
runWithBranchContext({ branchId, allowedBranchIds, canSeeAllBranches, userId },
                     () => next());
```

**80 files** read from that store. Every service `where` clause is built from
`branchFilter()`, which is **fail-closed**: no context ⇒ `{ branchId: { in: [] } }`.

This does not map onto a NestJS **Guard**. A guard returns `boolean`; it cannot
wrap downstream execution inside `als.run()`. If auth becomes a guard and the
ALS entry is lost, `branchFilter()` returns `{}` (no context) — and
**`{}` means "no filter", i.e. every branch's data leaks**, silently, with a
200 response. This is the highest-severity failure mode in the entire migration.

Two viable solutions, both preserving semantics exactly:
- **(A) Auth as NestJS middleware** — `use(req, res, next)` can wrap `next()` in
  `als.run()`, identical to today. Recommended.
- **(B) `nestjs-cls`** — purpose-built, `ClsMiddleware` + guard populating the
  store.

Decision required before Phase 3. Detail in §5.

### 0.3 `admin_server/` is already NestJS — a working in-house precedent

Same repo, same deploy pipeline, NestJS 10 + Prisma + **ESM** (`"type":
"module"`, `module: NodeNext`, `.js` import suffixes) + passport-jwt + global
`ValidationPipe`. 85 files, ports 4000. Its `PrismaService`, guards
(`jwt-auth.guard`, `roles.guard`), and `@CurrentUser()` decorator are directly
reusable patterns.

**But note its `PrismaService` is the naive 8-line version.** The ERP's Prisma
client is *not* naive (§4.3) and cannot use that shape as-is.

### 0.4 Three places where the brief's default would degrade the system

| Brief says | Reality | Recommendation |
|---|---|---|
| Phase 3: "Prefer DTO-based validation" (class-validator) | 388 endpoints validated by ~120 **Zod** schemas. Error contract is `{ code: "VALIDATION_ERROR", details: [{path, message}] }`, consumed by the client. | **Keep Zod**, wrap in a `ZodValidationPipe`. Rewriting 120 schemas into class-validator changes error shapes and risks silent validation gaps for zero architectural gain. |
| Phase 6: "use NestJS scheduling" | Jobs run on **pg-boss** (persistent, Postgres-backed, distributed, exactly-once) behind an Agenda-compatible adapter. | **Keep pg-boss.** `@nestjs/schedule` is in-process cron with no persistence and no locking — moving to it would *lose* exactly-once guarantees on monthly payroll generation. Wrap pg-boss in a NestJS module instead. |
| Phase 10: "Controller → Service → Prisma" | Already exactly this. Handlers are 1-file-per-endpoint, thin, and services own logic. | Architecture is already NestJS-shaped. This is a **mechanical port**, not a redesign — which is good news for risk. |

---

## 1. Current architecture

### Entry point and boot order

`src/index.js`:

```
connectDB()            ← Prisma $connect + SELECT 1 liveness probe
ensureMainBranch()     ← guarantees ≥1 branch exists (write-path invariant)
app.listen(PORT)       ← PORT OPENS FIRST — deliberate
  └─ startBackgroundServices()   (fire-and-forget, each individually caught)
       reconcileStorage()        ← reconciles quota counter against disk
       startJobs()               ← pg-boss: 23 job definitions, 26 cron schedules
       startImportWorker()       ← BullMQ/Redis; no-op when REDIS_URL empty
       startBot()                ← Telegram long-polling
```

Port-before-background is intentional and documented: `bot.startPolling()` can
hang for tens of seconds on Telegram `409 Conflict`, which would make login
return "Network Error" while the server is actually healthy.

Graceful shutdown on SIGINT/SIGTERM: `server.close → bot → jobs → importWorker →
redis → prisma`, in that order (worker before Redis, or jobs hang in `running`).

### Layering

```
routes/index.js  →  modules/<m>/<m>.routes.js  →  handlers/<action>.handler.js  →  services/  →  prisma
                       │                              │
                       └── middleware chain           └── asyncHandler wrapper, thin
                           requireAuth
                           requirePermission(...)
                           validate(zodSchema)
```

This is already Controller → Service → Data. Handlers contain no business logic.

### Directory inventory

| Path | Files | Role |
|---|---|---|
| `src/modules/` | 47 modules | Feature slices: routes + handlers + services + validators |
| `src/helpers/` | 25 | Cross-cutting domain logic (branch scope, permissions, periods, cascade) |
| `src/middleware/` | 17 | auth, 6 RBAC variants, validate, errorHandler, rateLimiter, 2× multer, auditLog |
| `src/config/` | 8 | env, prisma, logger, scheduler (pg-boss), redis, entitlements, db, legacyMongoose |
| `src/constants/` | 24 | permissions (582 lines, 331 keys), roles, enums, treasury, ledger |
| `src/utils/` | 10 | ApiError, ApiResponse, jwt, money, pagination, **serialize** (`_id` alias), phone, sendXlsx |
| `src/jobs/` | 24 | 22 job files + `index.js` + `catchUpMonthly.js` |
| `src/bot/` | 21 | Telegram bot: router, handlers, keyboards, delivery services |
| `src/queues/` | 1 | BullMQ import queue |
| `src/seeds/` | 25 | Seeds + one-off backfills — **22 still on Mongoose** |
| `src/models/` | 75 | **DEAD** Mongoose schemas; 5 constant exports still imported |
| `tests/` | 55 | Node-native `.test.js` scripts against a real Postgres + 2 HTTP audit suites |

### Scale

| Metric | Value |
|---|---|
| HTTP endpoints (`router.<verb>(`) | **388** |
| Business modules | **47** |
| Service LOC | ~42,000 |
| Prisma models / enums | **84 / 86** |
| SQL migrations applied | 9 |
| `$transaction` call sites | 29 across 16 files |
| `$queryRaw` / `$executeRaw` call sites | 74 across 22 files |

---

## 2. Complete module list

Discovered from the codebase, **not assumed**. `E` = endpoints, `L` = LOC.

### Identity & access (4)
| Module | E | L | Notes |
|---|---|---|---|
| `auth` | 7 | 859 | login/refresh/logout/me/changePassword/updateProfile/register |
| `botAuth` | 2 | 276 | Telegram WebApp `initData` → JWT |
| `roles` | 7 | 451 | Dynamic roles, permission matrix, freeze, migrate-users |
| `users` | 14 | 2186 | **Everyone** — students, teachers, staff live in one `User` table |

> **There is no separate `students` or `teachers` module.** Both are `User` rows
> discriminated by `role`. The brief's suggested `students/` + `teachers/`
> modules must **not** be created.

### Organisation (5)
`branches` (8/1048) · `courses` (9/757, incl. price-inheritance chain) ·
`rooms` (5/355) · `holidays` (7/645) · `archiveReasons` (6/332)

### Academic (9)
`groups` (24/3821) · `attendance` (11/2074) · `attendanceExemptions` (4/333) ·
`attendanceSettings` (2/99) · `teacherAttendance` (2/260) · `grades` (8/897) ·
`assignments` (10/1075) · `lessonCancellations` (3/229) · `studentFreeze` (3/339)

### Finance — the money path (12)
| Module | E | L | Notes |
|---|---|---|---|
| `finance` | 13 | 4016 | groupFee, studentPayment, discount, financialTransaction, financeTxn |
| `financeAnalytics` | 30 | 4424 | Read-only; 9 raw-SQL services |
| `financeOps` | 8 | 613 | Refunds, transfers, owner draws, budgets |
| `financeReport` | 5 | 782 | P&L reporting |
| `deposits` | 8 | 999 | Student deposit balances |
| `expenses` | 10 | 892 | + expense categories |
| `expenseApprovals` | 10 | 1169 | **Approval gate for the entire money path** |
| `journal` | 9 | 1643 | Double-entry ledger, shifts, cash transfers, verification |
| `ledger` | 2 | 620 | Read-only per-person financial history |
| `openingBalance` | 3 | 893 | Opening balances |
| `teacherSalary` | 15 | 3230 | rateResolver, compensation, salary, transactions, adjustments |
| `staffPayroll` | 30 | 3808 | Non-teacher payroll + KPI engine |

### Sales (2)
`leads` (16/1971, incl. routing rules) · `leadOptions` (4/191)

### Communication (6)
`notifications` (11/1375) · `systemNotifications` (5/190) ·
`notificationTemplates` (5/292) · `feedback` (9/612) · `feedbackTypes` (5/221) ·
`storage` (7/799)

### Analytics & AI (5)
`adminDashboard` (6/1041) · `branchAnalytics` (11/2280) · `ai` (15/**11,636**) ·
`activityLogs` (3/330) · `activityHistory` (2/496)

### Data movement (3)
`imports` (11/3602) · `exports` (2/679) · `search` (1/267)

---

## 3. Dependency graph

Computed from cross-module imports. Arrow = "depends on".

### Leaf modules — zero outbound dependencies (17, migrate first)
```
systemNotifications  storage   search    rooms    roles    journal
financeReport  feedbackTypes  courses  branches  archiveReasons
attendanceSettings  attendanceExemptions  ai  adminDashboard
activityLogs  activityHistory  notificationTemplates  leadOptions
```

### Hub modules — most depended upon
```
finance            ← users, imports, expenseApprovals, groups, teacherSalary,
                     lessonCancellations, exports, expenses, deposits,
                     studentFreeze, staffPayroll, financeOps      (12 dependents)
expenseApprovals   ← users, finance, groups, teacherSalary, expenses,
                     deposits, staffPayroll                        (7 dependents)
teacherSalary      ← users, imports, finance, expenseApprovals, groups,
                     lessonCancellations, auth                     (7 dependents)
groups             ← imports, finance, expenseApprovals, teacherSalary,
                     leads, attendance                             (6 dependents)
```

### Highest fan-out
```
users             → archiveReasons, expenseApprovals, finance, openingBalance,
                    staffPayroll, studentFreeze, systemNotifications, teacherSalary   (8)
imports           → auth, finance, groups, openingBalance, staffPayroll,
                    teacherSalary, users                                              (7)
finance           → courses, deposits, expenseApprovals, holidays, journal,
                    systemNotifications, teacherSalary                                (7)
expenseApprovals  → deposits, expenses, finance, groups, staffPayroll,
                    teacherSalary, users                                              (7)
```

### Confirmed cycles — `forwardRef` will be required

```
finance  ⇄  expenseApprovals  ⇄  teacherSalary  ⇄  finance
   ⇅              ⇅                    ⇅
 groups   ⇄   deposits            staffPayroll  ⇄  finance
   ⇅
 users    ⇄  expenseApprovals / finance / staffPayroll / teacherSalary
```

This is a **6-node strongly connected component**:
`finance · expenseApprovals · teacherSalary · groups · staffPayroll · deposits`
(+ `users` attached).

Per the brief's Phase 11, `forwardRef` everywhere is the wrong first answer. The
cycle is real and load-bearing, but its cause is identifiable: **`expenseApprovals`
is an approval *gate* that every money module calls, and which itself calls
back into those modules to execute an approved action** (`executeApproved*`).

Recommended decomposition, to be validated in Phase 4:
- Extract `approvals-core` (request/decide/state machine) — depends on nothing.
- Keep `executeApproved*` **in the owning module**, registered into
  `approvals-core` via a token-based registry (`APPROVAL_EXECUTORS`).
- That single change breaks 5 of the 6 cycle edges without `forwardRef`.

---

## 4. Prisma / database overview

### 4.1 Schema

- **84 models**, **86 enums**, 3,668 lines, 9 applied SQL migrations.
- **Primary keys: 24-char hex strings**, generated by a Postgres function
  `gen_object_id()` — *not* `cuid()`. Chosen because ~14 Zod validators and the
  frontend both assert `/^[0-9a-fA-F]{24}$/`. **Do not change this.**
- **Money columns: `numeric(18,2)`** (migration `20260819090000_money_float_to_decimal`).
- **35 partial unique indexes** (`CREATE UNIQUE INDEX ... WHERE`) replacing
  Mongo `partialFilterExpression`. These are the money-safety guards.
- **27 `CHECK` constraints across 14 tables** (`20260816090000_validation_invariants`)
  — recreated Mongoose `pre("validate")` hooks that were dropped in the Mongo→PG
  move. `errorHandler` maps SQLSTATE `23514` → `400 CHECK_VIOLATION`.
- **`RESTRICT` foreign keys** enforce delete ordering that Mongo never had:
  `payment_transactions → student_payments`, `salary_transactions →
  teacher_salaries`, `deposit_transactions → student_deposits`.

### 4.2 Model groups
```
Identity     User UserBranchAssignment Role Permission RefreshToken
Org          Branch Course CoursePrice Room
Academic     Group GroupScheduleItem GroupMembership Attendance
             AttendanceExemption AttendanceSettings Grade LessonCancellation
             TeacherAbsence TeacherAttendance StudentFreeze
Money-in     StudentPayment PaymentTransaction StudentDeposit
             DepositTransaction Discount GroupFee DebtWriteOff
             DebtWriteOffBreakdown Refund
Money-out    ExpenseCategory Expense RecurringExpense
             RecurringExpenseOccurrence Approval Budget BudgetLine
Payroll      TeacherCompensation TeacherGroupPeriod TeacherSalary
             SalaryTransaction StaffCompensation KpiRule StaffKpiAssignment
             StaffPayroll StaffPayrollItem StaffPayrollAdjustment
             StaffSalaryTransaction PayrollAuditLog
Ledger       Account JournalEntry JournalLine Shift CashTransfer
             OpeningBalance FinancialAuditLog
Sales        Lead LeadOption LeadRoutingRule
Comms        Notification NotificationRecipient NotificationTemplate
             SystemNotification Feedback FeedbackType Assignment
             AssignmentRecipient
Files        StoredFile StorageSettings StorageUsage
Bot          BotUser BotLock
System       ActivityLog ArchiveReason ArchiveLog Holiday ImportJob
             Cache RatingSettings
AI           AiConfig Insight AiRanking AiReport AiRun AiUsageLog
```

### 4.3 ⚠️ `config/prisma.js` is NOT a plain `PrismaClient`

This is the most important Phase 2 constraint. The exported client carries
**four** behaviours that must survive verbatim:

1. **Constructor `omit: { user: { passwordHash: true } }`** — `passwordHash`
   never returns unless explicitly requested (`omit: { passwordHash: false }`).
   This is the Mongoose `select: false` equivalent. Losing it leaks hashes into
   every user response.
2. **`$extends` "decimal-to-number"** — recursively converts every `Decimal` in
   every result to `number`. Without it, `a.amount + b.amount` **string-concatenates**
   (`"700000" + "300000" = "700000300000"`) with no error, across ~26 files of
   financial arithmetic. Note: the Decimal check uses `Prisma.Decimal.isDecimal()`
   because Prisma minifies the class name to `i` — a `constructor.name` check
   silently disables the whole guard.
3. **`$extends` "journal-immutability"** — throws `409 JOURNAL_IMMUTABLE` on any
   `update`/`updateMany`/`upsert` against `JournalEntry`/`JournalLine`. Corrections
   must go through `journal.reverse()` (storno).
4. **`globalThis` caching of both the base and the extended client** — prevents
   connection-pool exhaustion under nodemon/test reloads and prevents proxy-chain
   growth.

**Implication for `PrismaService`:** the `admin_server` pattern
(`class PrismaService extends PrismaClient`) **cannot work here**, because
`$extends` returns a *new* object rather than mutating `this`. The extended
client is not an instance of the service class.

Required approach (to implement in Phase 2):

```ts
// prisma.service.ts — provide the EXTENDED client, not the class instance
const base = new PrismaClient({ omit: {...}, log: [...] });
const extended = withJournalImmutability(withDecimalNormalization(base));
export type ExtendedPrismaClient = typeof extended;

// Provider registered by factory + token, lifecycle hooks bound to `base`.
```

Injecting `PrismaService` as a subclass would **silently drop all four
behaviours** — types would still compile, tests would still pass, and money
arithmetic would start producing wrong numbers. This is a Phase 2 blocker, not
a Phase 10 refactor.

> `$queryRaw` bypasses the decimal extension. Existing raw-SQL services already
> wrap results in `Number(...)`. Any new raw query must do the same.

### 4.4 TTL is a job, not a database feature

Postgres has no `expireAfterSeconds`. `jobs/ttlCleanup.job.js` runs daily at
03:15 and prunes `caches`, `refresh_tokens`, `ai_runs` (90d), `ai_usage_logs`
(400d). **If this job is not carried over, four tables grow without bound.**

---

## 5. Authentication / RBAC architecture

### 5.1 Auth flow
- `POST /api/auth/login` → `{ login, password }` → access token (body) + refresh
  token (httpOnly cookie).
- `POST /api/auth/refresh` → cookie → new access + **rotated** refresh.
- `POST /api/auth/logout` → refresh row deleted + cookie cleared.
- `GET /api/auth/me` → `{ user, role, permissions }`.
- Refresh tokens stored hashed (`utils/hashToken.js`), `tokenHash` unique, with a
  `jti` in the payload to prevent same-second duplicates.

### 5.2 ⚠️ Passwords are stored in PLAINTEXT — deliberately

`helpers/password.helper.js`: `hashPassword` returns the input unchanged;
`comparePassword` is string equality. The column is still named `passwordHash`
for historical reasons. This is an explicit project requirement, documented in
`CLAUDE.md`, and it powers `GET /users/:id/password` (retrieval, not reset),
gated by *two* layers: the `users.password` permission **and** branch scope —
where `branches.view_all` is deliberately **not** a bypass
(`helpers/credentialScope.helper.js`), so a branch director cannot read another
branch's staff credentials.

**Phase 12 must not "fix" this.** It is a business decision, not an oversight.
Flagged here so it is a conscious carry-over, and so Phase 12's "password
hashing" checklist item is explicitly marked N/A.

### 5.3 `requireAuth` does five things

Per request, in strict order:

1. Verify access JWT → `401` on failure.
2. Load `User` **including `branchAssignments`** (omitting this silently reduces
   every multi-branch employee to their home branch).
3. Resolve **base role** → `401` if frozen (not 403 — the client interceptor
   routes 401 to the login page).
4. `resolveBranchScope({ user, permissions, requestedBranchId: headers["x-branch-id"] })`,
   then `assertBranchIntent(req, scope)` — verifies the branch the client
   *believes* it is acting on matches what the server resolved, **before any
   write**.
5. Resolve **branch-specific role** — a user can be `director` in branch A and
   `teacher` in branch B; permissions come from the branch role.

Then it enters the ALS context and calls `next()`.

`requireAuth` is attached **per route**, not globally — deliberate, so that
"authenticated" and "branch-scoped" can never diverge.

### 5.4 Branch scope — the system's central invariant

Three service-layer tools:

| Tool | When | Behaviour |
|---|---|---|
| `branchFilter(field?)` | **every** read | adds branch condition; unassigned user ⇒ `{ in: [] }` (**fail-closed**) |
| `isBranchAllowed(id)` | when a branch is requested | `403` if outside scope |
| `resolveBranchForWrite()` | every write | server decides the branch; `403` if requested one is out of scope |

**Query parameters may only NARROW scope, never widen it.** Every endpoint
accepting `?branchId=` must call `isBranchAllowed` first. `CLAUDE.md` records a
real past leak: `branchId` was missing from the `/rooms` validator, and
"Branch A → Rooms" showed every branch's rooms with no error.

Enforced by `tests/workspaceSecurityAudit.mjs`, which makes real HTTP requests
against a running server. Every leak test runs under a **positive control** — if
the *allowed* side also finds nothing, the check reports "not measured" rather
than a false green.

### 5.5 The six authorization middlewares

| Middleware | Semantics |
|---|---|
| `requirePermission(...keys)` | OR across keys; `PERMISSION_IMPLIES` hierarchy in `permission.helper.js` |
| `requireRole(...roles)` | role name **or** `roleType` match; `owner` also satisfied by `system.admin_access` |
| `requireAnyPermission(...)` | broad route gate; narrow category check happens in-service (`assertCanDecide`) |
| `requirePermissionOrSelf(key, extractId)` | permission, **or** a student requesting their own record |
| `requireDatasetPermission` / `requireImporterPermission` | per-report / per-importer permission keys |

Plus `attendanceScope.js` (177 lines) — resource-level scoping for attendance.

**Owner always has every permission** — hard-coded rule.
331 permission keys in `constants/permissions.js`.

### 5.6 NestJS mapping — and the one real hazard

| Express | NestJS |
|---|---|
| `requireAuth` | **Middleware** (not a Guard) — must wrap `next()` in ALS |
| `requirePermission(...)` | `@Permissions(...)` + `PermissionsGuard` |
| `requireRole(...)` | `@Roles(...)` + `RolesGuard` |
| `requirePermissionOrSelf` | `@PermissionOrSelf()` guard reading a param key |
| `req.user` | `@CurrentUser()` decorator |
| `errorHandler` | `AllExceptionsFilter` |
| `validate(zodSchema)` | `ZodValidationPipe` |
| `auditLog` middleware | `AuditLogInterceptor` |
| `generalLimiter` | `@nestjs/throttler` or keep `express-rate-limit` |

> **Hazard restated:** if `requireAuth` becomes a Guard, the ALS context is lost,
> `branchFilter()` returns `{}`, and **every branch's data is returned with a
> 200**. No test that only checks status codes will catch this. The
> workspace/finance HTTP audits are the only automated defence — they must run
> against the NestJS build **before any endpoint is cut over**.

---

## 6. Critical business logic

### 6.1 Transaction boundaries — 29 sites, 16 files

| File | Sites |
|---|---|
| `finance/studentPayment.service.js` | 4 |
| `teacherSalary/teacherSalary.service.js` | 3 |
| `teacherSalary/teacherCompensation.service.js` | 3 |
| `staffPayroll/staffCompensation.service.js` | 3 |
| `journal/cashTransfer.service.js` | 3 |
| `grades`, `attendance` | 2 each |
| `kpiRule`, `leads`, `shift`, `budget`, `financeTxn.helper`, `deposit`, `coursePrice`, `studentTransfer`, `auth` | 1 each |

`finance/financeTxn.helper.js → runFinanceTxn()` is the shared wrapper. **Every
transaction boundary must be preserved byte-for-byte.** NestJS DI adds a
temptation to split a transaction across injected services — that would break
atomicity invisibly.

### 6.2 Two concurrency-safety patterns that must not regress

Mongo wrote `paidAmount`/`status`/`overpaidAmount` in one atomic aggregation
update pipeline. Postgres has no equivalent, so it was replaced by two
mechanisms:

1. **`applyPaidDelta`** → a single **raw `UPDATE`** where the right-hand column
   reference yields the pre-update value (exactly Mongo's `"$paidAmount"`).
   `capToRemaining` makes the row update conditionally — if the new amount
   exceeds the remainder, **zero rows are touched**.
   *Raw SQL bypasses Prisma's `@updatedAt`, so `"updatedAt" = NOW()` is written
   explicitly.*
2. **`recalc` / `recalcStatus`** → `$transaction` + `SELECT ... FOR UPDATE`.

> **Never** refactor either into read → compute → save. That is a lost update.
> `tests/paymentRace.test.js` and `tests/moneyProperty.test.js` guard this.

### 6.3 Double-entry journal
`journal.service.js → post()` enforces: debits = credits; no line with both
sides; no zero line; no zero-amount entry. Backed by CHECK constraints
(`journal_lines_single_side_check`, `journal_lines_nonzero_check`) **and** the
client-level immutability extension (§4.3). Corrections only via `reverse()`.

### 6.4 Salary rate resolution hierarchy
`teacherSalary/rateResolver.helper.js`: **period rate → `TeacherCompensation`
contract → default**. `hasOwnRate()` decides. A period with
`salaryType:"fixed", fixedAmount:0` counts as "has own rate" and shadows the
contract — this caused a real 0-salary bug (fixed in `1c4bd00`, forward-only;
historical rows still carry it, see §8 of `MIGRATION.md` §5b).

### 6.5 Approval gate
`expenseApprovals` sits between every money-mutating action and its execution.
Route-level check is broad (`requireAnyPermission`); the authoritative
category check is `assertCanDecide()` inside the service. **Do not "clean this
up" by moving the check to the route** — the two layers are not redundant.

### 6.6 Other business-critical chains
- **Branch P&L with elimination** (`branchAnalytics/branchPnl.service.js`) —
  inter-branch accounts, raw SQL.
- **KPI engine** (`staffPayroll/kpiEngine.service.js`) — attendance-fed triggers.
- **Course price inheritance** (`courses/coursePrice.service.js`) — group →
  branch → course fallback chain.
- **Lead routing** (`leads/leadRouting.service.js`) — invariant: *a lead is never
  lost*; fallback rule always assigns a branch.
- **Storage quota** — atomic `reserve` + boot-time reconciliation against disk.

---

## 7. High-risk modules

| Rank | Module | LOC | Why |
|---|---|---|---|
| 1 | `finance` | 4016 | 12 dependents, 4 transactions, `applyPaidDelta` raw SQL, in the cycle |
| 2 | `staffPayroll` | 3808 | 30 endpoints, 9 services, KPI engine, **no controllers today** |
| 3 | `teacherSalary` | 3230 | 7 dependents, rate hierarchy, known historical data bug |
| 4 | `groups` | 3821 | 24 endpoints, teacher-period write paths, membership → payment fan-out |
| 5 | `expenseApprovals` | 1169 | The cycle's hub; execute-approved callbacks into 7 modules |
| 6 | `imports` | 3602 | Writes to **every** service, bypasses Zod, BullMQ worker, double-charge risk |
| 7 | `journal` | 1643 | Immutability extension + CHECK constraints + shift/cash-transfer transactions |
| 8 | `attendance` | 2074 | Feeds KPI + hourly salary; `attendanceScope.js` resource guard |
| 9 | `ai` | 11,636 | Largest by far, but **read-mostly and off the money path** — low risk, high volume |
| 10 | `financeAnalytics` | 4424 | 30 endpoints, 9 raw-SQL services — decimal handling must be exact |

### Cross-cutting risks

| Risk | Severity | Mitigation |
|---|---|---|
| **ALS branch context lost in Guard** (§0.2) | 🔴 Critical | Auth as middleware; HTTP audit suites gate every cutover |
| **Prisma `$extends` dropped in `PrismaService`** (§4.3) | 🔴 Critical | Factory provider + token, never `extends PrismaClient` |
| **Decimal→string concatenation** if extension lost | 🔴 Critical | Same as above; property test `test:money-prop` |
| **Transaction boundary split by DI** (§6.1) | 🔴 Critical | Port service bodies verbatim; no cross-service splitting |
| `omit: { passwordHash }` dropped | 🟠 High | Assert in a boot-time smoke test |
| `withLegacyId` (`_id`) applied **per-handler in 61 files**, not globally | 🟠 High | Do **not** convert to a global interceptor — it would add `_id` where it is absent today |
| Zod → class-validator rewrite changing error contract | 🟠 High | Keep Zod (§0.4) |
| `ttlCleanup` job not carried over | 🟠 High | Unbounded table growth; include in Phase 6 checklist |
| ~~**`SET NULL` FKs collide with invariants**~~ ✅ **FIXED** (migration `20260820120000`) | 🟢 Resolved | `teacher_salaries.groupId` SET NULL breaks `teacher_salaries_kind_group_check` — a group with salary rows **cannot be deleted at all**. `journal_entries.{studentId,teacherId,groupId}` SET NULL **silently mutates the "immutable" ledger**, bypassing the `$extends` guard entirely (it blocks `update`, the FK acts inside the DB). Both pre-existing. Now `RESTRICT` on all five ownership FKs; regression test `npm run test:fk-restrict`. See `MIGRATION.md`. |
| Dual-run duplicate cron | 🟡 Medium | **Low in practice**: pg-boss schedules are name-keyed and workers compete, so exactly-once holds. Monthly generators are additionally upsert-idempotent. |
| ESM + TypeScript + decorators friction | 🟡 Medium | `admin_server` proves the setup works; copy its `tsconfig.json` |
| JS → TS conversion of 42k service LOC | 🟡 Medium | `allowJs: true`; convert controllers/DTOs first, services incrementally |

---

## 8. Recommended migration order

Derived from §3, **not** from the brief's generic list. Two departures:
`students`/`teachers` do not exist as modules (they are `users`), and
`expenseApprovals` must precede the finance modules because it gates them.

**Stage A — Prerequisite cleanup** ✅ **DONE (2026-08-20)**
> Single-ORM baseline reached. 12 constants re-pointed out of `models/`
> (7 already had homes in `constants/`; `AI_REPORT_PERIODS` and 3 insight
> constants were added). 8 seeds ported; 14 obsolete Mongo-era one-offs deleted;
> `src/models/`, `legacyMongoose.js`, the 501 contract and the `mongoose`
> dependency removed. Verified: 0 mongoose refs in `src/`, 816/816 files parse,
> 0 unresolved imports, 0 missing named exports.
>
> **Not included — needs a decision:** 27 legacy Mongo test files in `tests/`
> (+ `helpers/branchGuard.js`) and their ~27 dead `package.json` scripts. They
> were already non-functional (they connect to a MongoDB that does not exist).
> No working Prisma test depends on them. Deleting vs. porting them is a test-
> coverage decision, not a cleanup one.
>
> **Also found (pre-existing, unrelated):** `npm run lint` is broken — ESLint 9
> requires `eslint.config.js` and the repo has none.

**Stage B — Foundation** (Phases 1–3)
`main.ts` · `app.module.ts` · `ConfigModule` · `PrismaModule` (§4.3) ·
`CommonModule` (ALS, ApiError, serialize, pagination, money) ·
`ZodValidationPipe` · `AllExceptionsFilter` · auth middleware + guards + decorators

**Stage C — Leaves** (17 modules, zero inbound deps — safe warm-up)
`branches` → `roles` → `courses` → `rooms` → `archiveReasons` →
`feedbackTypes` → `leadOptions` → `notificationTemplates` →
`attendanceSettings` → `systemNotifications` → `storage` → `search` →
`activityLogs` → `activityHistory` → `holidays` → `journal` → `adminDashboard`

**Stage D — Identity** `auth` → `botAuth` → `users` → `studentFreeze`

**Stage E — Academic** `groups` → `attendance` → `attendanceExemptions` →
`teacherAttendance` → `grades` → `lessonCancellations` → `assignments`

**Stage F — The cycle** (single unit of work; decompose `approvals-core` first)
`expenseApprovals` → `finance` → `deposits` → `openingBalance` →
`teacherSalary` → `staffPayroll` → `expenses`

**Stage G — Derived finance (read-only)**
`ledger` → `financeReport` → `financeOps` → `financeAnalytics` → `branchAnalytics`

**Stage H — Sales & comms** `leads` → `notifications` → `feedback`

**Stage I — Heavy & independent** `ai` → `imports` → `exports`

**Stage J — Infrastructure** pg-boss module + 23 jobs → Telegram bot module →
BullMQ import worker → storage/files module

**Stage K — Cleanup** (Phase 15) remove Express app, `routes/`, old middleware,
`asyncHandler`, unused deps.

---

## 9. Estimated migration stages

| Stage | Modules | Endpoints | Risk | Est. |
|---|---|---|---|---|
| A — Mongo cleanup | — | 0 | 🟢 Low | 1 day |
| B — Foundation | — | 0 | 🔴 Critical | 3–4 days |
| C — Leaves | 17 | ~95 | 🟢 Low | 5–7 days |
| D — Identity | 4 | 26 | 🟠 High | 3–4 days |
| E — Academic | 7 | 61 | 🟠 High | 6–8 days |
| F — The cycle | 7 | 89 | 🔴 Critical | 10–14 days |
| G — Derived finance | 5 | 56 | 🟠 High | 5–7 days |
| H — Sales & comms | 3 | 36 | 🟡 Medium | 3–4 days |
| I — Heavy | 3 | 28 | 🟡 Medium | 5–7 days |
| J — Infrastructure | jobs/bot/queue | — | 🟠 High | 4–6 days |
| K — Cleanup | — | — | 🟢 Low | 1–2 days |
| | **47** | **388** | | **~46–64 working days** |

Estimates assume: contract-preserving port (no redesign), the 55 existing tests
plus the 2 HTTP audit suites run against every stage, and each module lands as
its own commit.

---

## 10. Exact first implementation step

**Nothing in Phase 1 should be written until two decisions are made** (§0.2,
§0.4). Both change the foundation, and the foundation is what the other 47
modules are built on.

### Decisions required from you

1. **ALS strategy** — auth as NestJS **middleware** (recommended: identical
   semantics to today), or adopt **`nestjs-cls`**?
2. **Validation** — keep **Zod** behind a `ZodValidationPipe` (recommended:
   preserves the error contract, zero rewrite risk), or convert ~120 schemas to
   class-validator DTOs as the brief's Phase 3 suggests?
3. **Stage A** — do the ~1-day Mongoose cleanup first (recommended), or start
   NestJS on the current mixed baseline?
4. **Target layout** — new `server_nest/` alongside the running `server/`, or
   convert `server/` in place on a branch?

### Then, the first implementation step (Phase 1 + 2)

Create the NestJS skeleton and the Prisma module — **nothing else**, no business
modules:

```
src/
  main.ts                    ← helmet, cookieParser, CORS (port from env),
                               global prefix "api", ZodValidationPipe,
                               AllExceptionsFilter, boot order matching index.js
  app.module.ts              ← ConfigModule.forRoot({ isGlobal: true }) + PrismaModule
  config/
    env.validation.ts        ← port of config/env.js, same required/optional split
  prisma/
    prisma.module.ts
    prisma.service.ts        ← FACTORY PROVIDER returning the EXTENDED client:
                               omit passwordHash · decimal→number · journal
                               immutability · lifecycle hooks (§4.3)
    prisma.types.ts
```

**Acceptance criteria for step 1** (each is a concrete, checkable assertion):

1. `nest build` succeeds under ESM (`module: NodeNext`), copying
   `admin_server/tsconfig.json`.
2. `GET /api/health` returns `{ success: true, message: "Server ishlayapti" }` —
   byte-identical to today.
3. A boot smoke test asserts, against the real database:
   - `prisma.user.findFirst()` result has **no** `passwordHash` key;
   - a `numeric` money column comes back as `typeof === "number"`, and
     `a + b` is arithmetic, not concatenation;
   - `prisma.journalEntry.update(...)` throws `409 JOURNAL_IMMUTABLE`.
4. **No business module is registered.** No Express route is touched.
   `server/` keeps running production traffic untouched.

Only after criterion 3 passes do we proceed to Phase 3 (global infrastructure)
and then Stage C.

---

## Appendix — configuration & integrations inventory

### Environment variables (from `config/env.js`, all validated at boot)

**Required** (`need()` — throws on boot): `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `COOKIE_SECRET`

**Optional with defaults:** `NODE_ENV`, `PORT` (5000), `APP_NAME` ("Bayyina"),
`JWT_ACCESS_TTL` (15m), `JWT_REFRESH_TTL` (7d), `COOKIE_DOMAIN`, `CLIENT_URL`
(comma-separated; `*` ⇒ reflect origin), `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_BOT_TOKEN_2`, `TELEGRAM_BOT_ENABLED`, `TELEGRAM_BOT_WEBAPP_URL`,
`ADMIN_API_URL`, `TENANT_ID`, `HEARTBEAT_SECRET`, `ENFORCE_LIMITS`,
`GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_MONTHLY_CALL_CAP` (4000),
`STORAGE_QUOTA_GB` (5), `MAX_UPLOAD_MB` (5), `UPLOAD_DIR`, `REDIS_URL`,
`REDIS_PREFIX`, `IMPORT_SYNC_MAX_ROWS` (50), `IMPORT_QUEUE_CONCURRENCY` (1),
`TZ_NAME` (Asia/Tashkent)

Note the `positiveNumber()` helper: `STORAGE_QUOTA_GB=0` falls back to the
default rather than rejecting every upload.

### External integrations → NestJS modules

| Integration | Current location | Target |
|---|---|---|
| Telegram Bot (`node-telegram-bot-api`) | `src/bot/**` (21 files) | `TelegramModule` |
| Google Gemini | `modules/ai/services/gemini.service.js` (only `fetch` in modules) | `GeminiModule` |
| Admin panel heartbeat | `jobs/usageHeartbeat.job.js` | `HeartbeatModule` |
| Local disk file storage | `middleware/uploadAttachment.js`, `uploadSheet.js` (multer), `UPLOAD_DIR` | `FilesModule` |
| Redis / BullMQ | `config/redis.js`, `queues/importQueue.js` | `QueueModule` |
| pg-boss scheduler | `config/scheduler.js` (Agenda-compatible adapter) | `SchedulerModule` |
| Excel (`exceljs`) | `utils/sendXlsx.js`, `modules/exports`, `modules/imports` | `ExcelModule` |

**No S3, no Bunny.net, no SMTP, no SMS, no payment provider.** Files are on local
disk — `UPLOAD_DIR` must be a Docker volume or attachments are lost on rebuild.

### Scheduled jobs — 23 definitions, 26 cron schedules (all `Asia/Tashkent`)

```
00:10  autoEndGroups          00:20  dailyAccrueFinance     00:40  aiLifecycle
01:00  aiNightlyRecompute     02:30  storageCleanup         03:15  ttlCleanup
06:00  lessonReminders        07:00  aiDailyReport          08:00  aiMorningDigest
08:30  holidayGreetings       20:00  attendanceReminders
Mon 09:30  lowAttendanceDigest        Mon 07:10  aiWeeklyReport
09:00  leadDailyDigest        */5m   leadFollowupReminders
*/15m  usageHeartbeat (only if ADMIN_API_URL set)
:25 hourly  aiNarration        09,12,15,18,21  aiIntradayRefresh
1st 00:05  monthlyFinance   1st 00:06  monthlySalary   1st 00:07  monthlyStaffPayroll
1st 07:20  aiMonthlyReport
```

**The ordering is load-bearing and documented in `jobs/index.js`** — e.g. AI
lifecycle must close stale insights *before* recompute creates new ones, or the
new ones are immediately closed as expired. Preserve the schedule verbatim.

Boot catch-up (fire-and-forget, all `.catch()`-wrapped):
`catchUpMonthlyGeneration()`, `processDueGroupEnds()`, `accrueToday()`.

### API response contract — must be preserved byte-for-byte

```jsonc
// success
{ "success": true, "data": {...}, "message": "...",
  "meta": { "page": 1, "limit": 20, "total": 100 } }

// error
{ "success": false, "message": "...", "code": "ERR_CODE", "details": [...] }
```

- Messages to users are **Uzbek**; code and technical values are **English**.
- `withLegacyId()` adds `_id` alongside `id`, **recursively** into included
  relations. Applied in **61 files** — per-handler, not globally. 201 client
  files reference `_id`.
- `errorHandler` status mapping: Zod → 400 · `P2002` → 409 · `P2003` → 409 ·
  `P2011/P2012` → 400 · `P2000` → 400 · SQLSTATE `23514` → 400 CHECK_VIOLATION ·
  Mongo-unavailable → 501 (now unreachable) · everything else → 500.
  `P1xxx`, `P2021`, `P2025` deliberately stay 500.

### Test suites to run at every stage

```bash
npm run test:money-prop      # money property tests
npm run test:race            # payment race condition
npm run test:invariants      # 27 CHECK constraints
npm run test:salary-chain    # 31 tests
npm run test:groups-chain    # 33 tests
npm run test:staff-payroll   # 47 tests
npm run test:users-prisma    # 49 tests
npm run test:auth-prisma     # 16 tests

# BOUNDARY AUDITS — real HTTP against a running server (required before cutover)
node tests/fixtures/qaUsers.mjs   # needs 2 branches
npm run audit:workspace           # branch/role boundary
npm run audit:finance             # finance permissions
node tests/fixtures/qaUsers.mjs --clean
```

---

*Phase 0 complete. No files under `src/` were modified. Awaiting the four
decisions in §10 before starting Phase 1.*
