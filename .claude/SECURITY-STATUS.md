# Security Work — Status

**Last updated:** 2026-09-05 (second pass) · Working tree has the final round of fixes

---

## TL;DR

| | |
|---|---|
| **Fully done & verified** | 2 critical bugs + ~51 branch-isolation fixes + 3 DEV SYSTEM fixes + **all 5 follow-ups** |
| **Needs your decision** | 3 items (behaviour changes already applied — review them) |
| **Left for you** | 2 items that need YOUR environment (production DB / live server) |
| **Build / tests** | `server` ✅ · `admin_server` ✅ · CI suite **8/8** · provisioning contract test **11/11** |

---

## ✅ DONE — verified, nothing left to do

### Critical (P0)

| # | Bug | How it was proven fixed |
|---|---|---|
| 1 | **Any director could become Owner.** `PATCH /api/roles/:value {"roleType":"owner"}` — `roles.update` is branch-local so every director has it. `RolesGuard` treats `roleType: owner` as owner. | Guard added to `create` + `update`. **Mutation-tested**: disable the guard → 7 test failures. Exploit chain re-checked against the live DB. |
| 2 | **Audit trail was dead.** `activityLog.create` appeared **0 times** in the code. Writer was deleted with Express on 2026-08-22. | Writer restored as global middleware. **Proven at runtime**: row count 14861 → 14862, first new row in 15 days. |

> ⚠️ **Bonus finding while fixing #2:** the original sanitizer only matched exact keys, so `currentPassword` / `newPassword` were **never redacted** — `POST /auth/change-password` wrote plaintext passwords into `activity_logs`. Fixed going forward. **Old rows still contain them — see "Not done" #3.**

### Branch isolation — ~51 fixes

The pattern was always the same: `list()` correctly scoped, its `:id` sibling not.

| Area | Examples |
|---|---|
| **Money (worst)** | expense approvals (approve/reject/bulk on other branches), deposits, discounts, budgets, KPI rules, staff + teacher compensation, salary settlement, payroll `generate()` |
| **Data** | `users/:id`, leads, feedback, teacher attendance, attendance exemptions, notifications, holidays, groups `undelete`, imports, `branches/:id` (was readable by **any user incl. students**) |
| **Found by route audit, then fixed** | `teacher-group-period` write path (rewrote other branches' payroll), `notifications/:id/cancel`, AI config + recompute, `market/products/:id`, `courses/resolve/:groupId` |

### DEV SYSTEM

| # | Bug | Impact |
|---|---|---|
| 1 | **Every provisioned tenant had NO background processing.** 4 worker/bot env vars were never written. Defaults assumed Express was the worker — Express is deleted. | No payroll/fee generation, no attendance or AI jobs, no TTL cleanup, Telegram bot silent, **imports stuck in `queued` forever with no error**. Fixed + verified by rendering a real tenant's `.env`. |
| 2 | **Branch-limit changes left tenant `.env` stale.** | Downgrade 10→2 branches, tenant restarts before next heartbeat → **old limit of 10 back in force**. Fixed; DI container booted to prove no circular dependency. |
| 3 | **GitHub PAT leaked to every npm `postinstall`.** Token with org-wide repo write was inherited by every tenant dependency's install script. | Scoped away with `env -u GIT_TOKEN` in all 3 provisioning scripts. |

### Infrastructure

- **CI added** (`.github/workflows/security.yml`) — typecheck + build + 6 security tests. Previously **no tests ran at all**. `deploy.yml` untouched.
- **Resource-scope registry drift fixed** — 6 missing models classified by real semantics. Test went red → **8/8 green**.

---

## ⚠️ APPLIED — but please review (real behaviour changes)

| # | Change | What changed for users |
|---|---|---|
| 1 | **Cash transfer** now requires the destination branch to be authorised (your spec §16 said to do this) | A **single-branch director can no longer send cash at all** — they can't "see" the destination. Cross-branch transfer is now an owner-level action. **This is the one most likely to generate a support ticket.** |
| 2 | **Org-wide (null-branch) expenses** — only cross-branch actors can edit/delete | A branch director can no longer edit head-office rent. Exempted: background jobs, and single-branch mode (or owners would lock themselves out). |
| 3 | **Teacher absence** no longer propagates to branches you can't see | A teacher working in 2 branches must be marked absent in each. Chose "absence not recorded" over "another branch's salary silently cut". |

---

## ✅ FOLLOW-UPS — now also done

| # | Item | Result |
|---|---|---|
| 3 | **Plaintext passwords in old audit rows** | **CLEANED.** Found exactly 48 rows containing 96 plaintext password values (`currentPassword` + `newPassword` — the two keys the old sanitizer missed). Backed up, redacted, verified **0 exposed secrets remain**. Script: `npm run redact:audit-secrets` (dry-run by default, `--apply` to write). Reuses the *same* `sanitize()` the middleware uses, so the rules can't drift. Idempotent. |
| 4 | **Bot token in clone URL** | **FIXED.** Switched to `GIT_ASKPASS` (the pattern `reconfigure.sh` already used), so the token never appears in process arguments. Helper verified: mode 0700, correct responses. *Correction: the token was already scrubbed from `.git/config`, so the real risk was narrower than first reported — visible via `ps` during clone.* |
| 5 | **Test exit codes** | **Was a wrong claim.** `constants-parity` already had `process.exit(R.fail ? 1 : 0)`; `feature-graph` uses bare `assert`, which throws and exits 1. Both verified and **added to CI — now 8 tests**. |
| 1 | **Provisioning verification** | **Contract test added** (`npm run test:provisioned-env`, 11/11). It renders a real tenant's `.env` through `admin_server` and validates it against the tenant's own zod schema — catching "generated config won't boot" without creating infrastructure. Mutation-tested: break the fix → test fails. |

---

## ⏳ LEFT FOR YOU — needs your environment, not code

| # | Item | What to run |
|---|---|---|
| A | **Production role-drift check** | `psql "$TENANT_DB_URL" -f server/scripts/role-drift-check.sql` — read-only, safe on production. Your local DB is clean; production tenants have separate DBs I can't reach. |
| B | **Clean audit secrets on production tenants** | `npm run redact:audit-secrets` (dry-run first), then `-- --apply`. Same 48-row problem likely exists per tenant. **Take a DB backup first — redaction is irreversible by design.** |
| C | **Live provisioning run** | Still worth doing once on a throwaway domain. Creates a real DB, PM2 process, nginx config and GitHub repo — that's why I didn't run it. The contract test above covers the config-correctness half. |

## 🚫 Checked and found NOT to be bugs — don't re-audit these

Roughly a third of reported "bugs" were wrong. Verified before touching anything:

- `NEST_PORT` **is** provisioned (claim said it wasn't — would have been a fleet-wide outage if I'd "fixed" it)
- `BRANCHES_ENABLED` / `BRANCH_LIMIT` **are** provisioned
- `GIT_PUSH_OK` marker is **not** truncated away (log keeps the tail; marker is last)
- `permissions.seed` does **not** delete coin permissions (`ALL_KEYS` includes them)
- `permissions.seed` `update: {}` on director is **deliberate** — overwriting would wipe customer role customisations fleet-wide
- Owner-only permission grant guard was **already correct** (both registries merged)
- `branchFilter()` fail-closed for zero-branch users is **deliberate and documented**
- Audit **read** endpoints were **already** branch-scoped
- 24 further findings refuted by verification agents

---

## Next actions (your call)

1. **Review the 3 behaviour changes above** — especially cash transfer (a single-branch director can no longer send cash).
2. Run A and B above on your production tenants.
3. When convenient: a live provisioning run on a throwaway domain (item C).
