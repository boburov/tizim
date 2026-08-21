# PHASE 2 AUDIT — Auth · Users · Roles · Permissions · Branch authorization

**Read-only audit.** No code was modified. Baseline: `8b6b4d7`.

---

## 1. Scope

| Area | Files | Endpoints | Service LOC |
|---|---|---|---|
| `modules/auth` | 7 handlers, 1 service, 4 validators | 7 | 480 |
| `modules/users` | 14 handlers, 1 service, 7 validators | 14 | 1,573 |
| `modules/roles` | 7 handlers, 1 service, 4 validators | 7 | 451 (module) |
| `modules/botAuth` | 2 handlers, 1 service | 2 | 276 (module) |
| **Total endpoints** | | **30** | |

**Supporting layer** (not endpoints, but load-bearing):

| File | LOC | Role |
|---|---|---|
| `helpers/branchContext.helper.js` | 507 | AsyncLocalStorage + 19 exported scope tools |
| `helpers/branchAccess.helper.js` | 335 | scope resolution, main-branch cache, escalation guards |
| `helpers/roles.helper.js` | — | 13 exports: role assignability, grant guards |
| `helpers/permission.helper.js` | 121 | role cache, `hasPermission`, implication hierarchy |
| `helpers/credentialScope.helper.js` | 95 | password-endpoint scope (deliberately stricter) |
| `helpers/branchIntent.guard.js` | 65 | `x-branch-context` write confirmation |
| `middleware/auth.js` | 126 | `requireAuth` — JWT + scope + ALS entry |
| 6 authorization middlewares | ~180 | permission/role guards |
| `utils/jwt.js`, `hashToken.js`, `cookie.helper.js`, `password.helper.js` | — | tokens, cookies, passwords |

**Prisma models:** `User`, `UserBranchAssignment`, `Role`, `Permission`,
`RefreshToken`, `Branch`, and the implicit `_RolePermissions` join table.

**Blast radius:** `requireAuth` appears **373 times** across **45 route files**.
Every module in the system depends on this layer.

---

## 2. Authentication flow — exact behaviour

### `POST /api/auth/login`
1. Trim login; if it looks like a phone, normalise it. Query is
   `OR: [{username: lowercased}, {phone}]` **plus `isDeleted: false, isActive: true`**.
2. **`orderBy: { createdAt: "asc" }` is load-bearing, not cosmetic.** Phone is
   deliberately non-unique (a parent and child share one number). Without a
   stable sort, Postgres row order follows the planner — and every
   `lastLoginAt` UPDATE moves the row to the heap tail, so the *next* login
   could match a different person and reject a correct password.
3. `omit: { passwordHash: false }` — the only read of the hash column.
4. `comparePassword` = **plain string equality** (see §7).
5. Frozen role → **403** (with reason if set).
6. `issueTokens` → access (15m) + refresh (7d, `jti` for uniqueness).
7. `lastLoginAt` updated **here only** — deliberately not in `issueTokens`,
   or refresh would turn it into "last activity".
8. Returns `{ accessToken, user, roleMeta }`; refresh goes to an httpOnly
   signed cookie.

### `POST /api/auth/refresh`
Race-safe by construction: `updateMany({ tokenHash, revokedAt: null,
expiresAt: { gt: now } })` and require `count === 1`. Two parallel refreshes
⇒ exactly one wins. Frozen role → **401** (session ends; old token already
revoked).

### `POST /api/auth/logout`
Revoke by hash. No-op when no cookie.

### `GET /api/auth/me`
The heaviest contract in the system. Returns `user`, effective `role`,
`baseRole`, `permissions`, `branches[]`, `canSeeAllBranches`, `multiBranch`,
`branchCount`, `homeBranchId`, `roleMeta{value,label,roleType,defaultPath,isSystem,permissionsVersion}`,
`profile`. It also **self-heals a branchless database** by calling
`ensureMainBranch()` when `branchCount === 0`.

Effective role comes from `requireAuth`, not recomputed — the client builds
its UI from these permissions, so they must match the server's *actual*
permissions or buttons appear that 403 on click.

### `POST /api/auth/change-password`
`$transaction([ update password, revoke all refresh tokens ])`. Atomic by
design — previously two statements, where a failure between them left
"password changed, old sessions alive".

### `POST /api/auth/register-user`
Guarded by `users.create` + `enforceLimit` (tariff: `max_students` /
`max_users`). Role must be `teacher|student`. **Branch is mandatory**;
`assertCanAssignBranch` blocks a director from creating users in another
branch. Two side effects are **deliberately best-effort, outside any
transaction**: teacher compensation (logged warning on failure) and opening
balance (returns `openingBalanceError` in the payload so money is never
silently lost).

### `botAuth` (2 endpoints, public)
Telegram `initData` HMAC verification, then reuses `issueTokens`. Separate
rate limiter (40/min).

---

## 3. RBAC model

- **87 permission keys** across 29 namespaces (`users.*`, `finance.*`,
  `salary.*`, `payroll.*`, `leads.*`, …). Matches the 87 rows in the DB.
  *(Phase 0 reported 331 — that was a miscount of colons in the file.)*
- `Role` ⇄ `Permission` many-to-many; roles are **dynamic** (created at
  runtime), `User.role` is a plain string referencing `Role.value` — **not**
  a foreign key.
- **`resolveRole` caches per role value for 5 minutes** in an in-memory `Map`,
  invalidated by `invalidateRoleCache()` from 5 call sites in `roles.service`.
- **Owner gets `["*"]` unconditionally**, even if the DB row is missing or
  corrupted — explicit lockout protection.
- **`PERMISSION_IMPLIES`** — a deliberately *one-way* hierarchy so that
  splitting a coarse permission doesn't strip existing roles:
  `leads.manage → leads.create|update`, `expenses.* → finance.*`,
  `finance.manage → manage_accounts|manage_refunds`,
  `finance.pay → manage_transfers`. The reverse must never hold.

### Guard inventory (usage across all route files)

| Guard | Uses | Semantics |
|---|---|---|
| `requireAuth` | 373 | JWT + user + role + branch scope + ALS |
| `requirePermission(...keys)` | 262 | OR across keys, plus implication hierarchy |
| `requireRole(...roles)` | 32 | role name **or** `roleType`; `owner` also satisfied by `system.admin_access` |
| `requireAnyPermission(...)` | 10 | broad route gate; precise check in-service |
| `requirePermissionOrSelf(key, extractId)` | 5 | permission, or a student reading their own record |
| `requireImporterPermission()` | 8 | key from the importer registry (write permission, not read) |
| `requireDatasetPermission()` | 1 | key from the export registry |
| `enforceLimit(feature, countFn)` | 1 | tariff limit before create |

---

## 4. Branch authorization — the system's central invariant

### `requireAuth` performs five ordered steps

1. Verify access JWT → 401.
2. Load user **including `branchAssignments`** (omitting this silently
   collapses every multi-branch employee to their home branch).
3. Resolve **base role** → 401 if frozen (401, not 403 — the client
   interceptor routes 401 to login).
4. `resolveBranchScope({ user, permissions, requestedBranchId: x-branch-id })`,
   then `assertBranchIntent(req, scope)`.
5. Resolve **branch-specific role** (`branchAssignments[].role`) → 403 if that
   role is frozen. A person can be director in A and teacher in B.

Then it enters the ALS context and calls `next()`.

**The ordering is load-bearing.** Scope is computed with *base-role*
permissions because the branch role can't be known before the branch is —
resolving them the other way round is circular.

### `resolveBranchScope` decision table

| Condition | Result |
|---|---|
| Single-branch mode (DB-derived, not env) | collapse to main branch, **intersected with the user's own allowed list** (a B-only director must not see main) |
| `x-branch-id: all` + `branches.view_all` | cross-branch, `branchId = null` |
| Explicit branch **in** allowed list | that branch |
| Explicit branch **not** allowed | **ignored, not 403** — a stale `localStorage` id would otherwise lock the user out of `/auth/me` permanently |
| No header + `view_all` | cross-branch |
| No header, exactly one branch | that branch |
| otherwise | cross-branch within own list |

### Service-layer tools (19 exports from `branchContext`)

`branchFilter` (**fail-closed**: unassigned ⇒ `{ in: [] }`), `branchMatchStage`,
`branchGroupFilter`, `branchUserFilter`, `userBranchCondition`,
`resolveBranchForWrite`, `isBranchAllowed`, `assertBranchInScope`,
`assertUserInBranchScope`, `requireActiveBranchId`, …

`userBranchCondition()` is the user-specific rule:
`OR: [{ homeBranchId }, { branchAssignments: { some: { branchId } } }]`.
Branchless users are visible only to `view_all` holders — fail-closed.

### Two guards that exist because of real incidents

- **`assertBranchIntent`** — the client sends `x-branch-context` (what it
  *believes*); if the server resolved something else, mutations get **409**.
  Reads are exempt on purpose. Missing header ⇒ skipped (bots, jobs, old
  clients).
- **`credentialScope`** — for password endpoints, `branches.view_all` is
  deliberately **not** a bypass, and the actor's real branches are re-read
  from the DB rather than trusted from `req.allowedBranchIds` (because
  `view_all` inflates that list). Without this, `view_all` +
  `system.admin_access` let a director read another branch's staff password.

---

## 5. Contracts that must survive the migration

- Success `{ success, data, message?, meta? }`; error
  `{ success, message, code?, details? }`.
- `withLegacyId` adds `_id` alongside `id`, recursively — applied
  **per-handler in 61 files**, *not* globally.
- Refresh cookie: name `refreshToken`, `httpOnly`, **signed**,
  `path=/api/auth`, `sameSite` `none` in prod / `lax` in dev, `domain` from
  `COOKIE_DOMAIN`, 7-day max-age.
- Rate limits: auth 20 / 5 min · bot-verify 40 / min · general 200 / min.
- Status codes: frozen role 403 on login but **401** on refresh; out-of-scope
  branch 403; branch-intent mismatch 409; duplicate username 409.

---

## 6. Risks

| # | Risk | Severity |
|---|---|---|
| 1 | **ALS lost if auth becomes a Guard** — `branchFilter()` returns `{}` = *no filter*, leaking every branch with a 200 | 🔴 Critical |
| 2 | **`resolveRole` cache is per-process.** With Express and NestJS both live, a role edit in one does **not** invalidate the other → up to 5 minutes of stale permissions in the other process. *This risk is new — created by running two stacks.* | 🔴 Critical |
| 3 | `requireAuth`'s five-step ordering (scope before branch role; intent check before any write) | 🟠 High |
| 4 | `login`'s `orderBy: createdAt asc` — silently breaks logins if dropped | 🟠 High |
| 5 | Owner `["*"]` bypass — removing it can lock the owner out | 🟠 High |
| 6 | `PERMISSION_IMPLIES` must stay one-way | 🟠 High |
| 7 | Plaintext passwords must be preserved (project requirement, §7) | 🟠 High |
| 8 | `registerUser` side effects are intentionally non-transactional | 🟡 Medium |
| 9 | `withLegacyId` is per-handler — making it global would add `_id` where it is absent today | 🟡 Medium |

### §7 — Passwords are stored in plaintext, deliberately
`hashPassword` returns the input unchanged; `comparePassword` is string
equality. The column is named `passwordHash` for historical reasons. This is
a documented project requirement and **must be carried over unchanged**.
`GET /users/:id/password` returns the stored value and is gated by the
`users.password` permission **and** `credentialScope`.

---

## 7. Proposed NestJS architecture

```
server_nest/src/
  common/
    als/branch-context.ts            ← port of branchContext.helper (19 exports)
    errors/api-error.ts              ← port of ApiError
    filters/all-exceptions.filter.ts ← port of errorHandler mapping
    pipes/zod-validation.pipe.ts     ← runs the EXISTING zod schemas
    decorators/  current-user · roles · permissions · permission-or-self · public
    guards/      roles.guard · permissions.guard · permission-or-self.guard
    utils/       jwt · hash-token · password · phone · serialize(withLegacyId)
  middleware/
    auth.middleware.ts               ← requireAuth: JWT + scope + als.run(next)
  modules/
    auth/    auth.controller · auth.service · dto(zod)
    roles/   roles.controller · roles.service
    users/   users.controller · users.service
    bot-auth/
```

### Decisions carried over from the Phase 0 approvals

1. **Auth is middleware, never a guard** — middleware can wrap `next()` inside
   `als.run()`; a guard returns a boolean and cannot. Guards then only *read*
   `req.user` / `req.permissions`.
2. **Zod kept**, wrapped in a `ZodValidationPipe` — the existing schema files
   are reused verbatim, so the `details: [{path, message}]` error contract is
   preserved exactly.
3. **`withLegacyId` stays per-handler**, not a global interceptor.

### New decision needed — risk #2 (dual-process role cache)

Three options:
- **(a) Single writer** — role mutations (`POST/PATCH/DELETE /roles`,
  `PATCH /users/:id/role`) stay on Express until Phase 2 cutover; NestJS
  serves reads only. Simplest, zero new infrastructure. **Recommended.**
- **(b) Shorten the TTL** to ~30s in both processes during transition — cheap,
  but adds DB load on every request and only narrows the window.
- **(c) Redis pub/sub invalidation** — correct, but adds a hard Redis
  dependency to a path that currently has none (`REDIS_URL` is optional).

### Migration order inside Phase 2

| Step | Content | Verification |
|---|---|---|
| 2.1 | `ApiError`, exception filter, `ZodValidationPipe`, serialize/jwt/password/hash utils | unit + error-shape parity |
| 2.2 | ALS branch-context port (19 exports) + `AuthMiddleware` + guards/decorators | ALS leak test (see below) |
| 2.3 | `auth` module — 7 endpoints | `test:auth-prisma` equivalent + response parity |
| 2.4 | `roles` module — 7 endpoints | matrix/freeze/migrate parity |
| 2.5 | `users` module — 14 endpoints | `test:users-prisma` equivalent (49 checks) |
| 2.6 | `bot-auth` — 2 endpoints | initData HMAC parity |

### Verification strategy

- **Parity harness**: same database, same JWT, request each endpoint against
  Express (5000) and NestJS (5001), diff status + body. This is the only way
  to prove a 30-endpoint contract is unchanged.
- **The branch-leak audits are the gate**: `tests/workspaceSecurityAudit.mjs`
  and `financeSecurityAudit.mjs` must be run against the NestJS port **before
  any traffic moves**. They are the only automated defence against risk #1,
  and they carry positive controls so an empty result can't pass as a green.
- Traffic stays on Express for the whole of Phase 2.

---

*Audit complete. No code modified. Awaiting approval of the architecture and
plan above before implementation.*
