# Frontend - Bayyina (client/)

Vite + React 19 + Redux Toolkit + TanStack Query + shadcn/ui + Tailwind. **Based on FSD**, each role is split internally into `features/`.

## Folder structure

```
client/src/
├─ main.jsx
├─ app/                     # app level (routes, store, query-client)
├─ shared/                  # Everything used GLOBALLY
│  ├─ api/                  # http.js (axios + interceptors), endpoints.js
│  ├─ components/
│  │  ├─ shadcn/            # Used ONLY inside shared
│  │  ├─ ui/                # ModalWrapper, Pagination, ... (wrappers over shadcn)
│  │  ├─ guards/            # AuthGuard, GuestGuard, RoleGuard, PermissionGuard
│  │  ├─ layout/            # AppHeader, AppSidebar, ...
│  │  └─ bg/
│  ├─ hooks/                # useModal, useMediaQuery, useAuth, usePermissions, ...
│  ├─ helpers/              # role.helpers, market.helpers, grade.helpers
│  ├─ utils/                # cn, date, formatPhone, sounds
│  ├─ data/                 # static data
│  ├─ layouts/              # DashboardLayout, AuthLayout
│  ├─ lib/query/            # TanStack helpers (keys, ...)
│  ├─ store/                # global redux slices (modal, auth)
│  └─ constants/            # roles, permissions, modals
├─ features/                # role-independent global features
│  └─ auth/
├─ owner/                   # ADMIN PANEL (/owner/*) - the operational panel
│  ├─ features/<feature>/   # api, hooks, components, pages, store, utils, index.js
│  ├─ routes/index.jsx
│  ├─ navigation/sidebar.config.js   # THIS PANEL OWNS ITS MENU
│  └─ index.js
├─ superadmin/              # SUPER ADMIN PANEL (/org/*) - separate app shell
│  ├─ layout/               # SuperAdminLayout + Header (MOLIYA) + Sidebar (3 items)
│  ├─ navigation/           # nav.config.js, drilldown.js
│  ├─ pages/                # Asosiy, Moliya, Filiallar, BranchDetail, TizimTahlili
│  ├─ sections/ components/ api/ hooks/
│  └─ routes/index.jsx
├─ teacher/                 # TEACHER panel (same structure)
├─ student/                 # STUDENT panel (same structure)
└─ workspaces/              # /work (staff) + /me (student) landing screens only
   ├─ work/pages/ me/pages/
   └─ routes.jsx
```

## Two panels: Super Admin and Admin

| | `/owner/*` — **Admin panel** | `/org/*` — **Super Admin panel** |
|---|---|---|
| Layout | `OperationalLayout` (shadcn `SidebarProvider`) | `SuperAdminLayout` — **its own shell** |
| Header | `AppHeader` (mobile only) | `SuperAdminHeader`, full width, **MOLIYA** lives here |
| Menu | `owner/navigation/sidebar.config.js`, ~12 groups | `superadmin/navigation/nav.config.js`, **exactly 3**: Asosiy · Filiallar · Tizim tahlili |
| Who | branch **directors** and staff | owner / org-level authority |
| Scope | the user's assigned branch(es) | the whole organization |
| Guarded by | `AdminPanelGuard` — org-level users are sent to `/org` | `SuperAdminGuard` — everyone else is sent to their own panel |

**The wall is two-way and there is no link across it.** A Super Admin cannot open
`/owner/*`; a director cannot open `/org/*`. Neither shell renders a link to the
other, because a link that always bounces is a false door — it costs more trust
than the missing shortcut saves.

Consequences to keep in mind when adding a screen:

- Anything the owner needs must exist **inside `/org`**. `/owner/settings`,
  `/owner/catalog` and the operational lists are director territory.
- Deep links into `/owner/*` from analysis cards are switched off centrally by
  `useDrilldown()` (`owner/features/systemAnalysis/navigation/drilldown.js`):
  it returns an all-`null` map for org-level users, and `DashboardSection`
  renders no link when `to` is falsy. Never re-add a hardcoded `/owner/...`
  `<Link>` inside `superadmin/`.

**They are different shells on purpose.** `/org/*` is mounted *outside*
`OperationalLayout` in `app/routes.jsx` — it has to be: `OperationalLayout` wraps
everything in `SidebarProvider` and `AppHeader` calls `useSidebar()`, so "hiding"
the sidebar from inside is impossible. Sharing one shell and swapping the menu
array is exactly what makes a Super Admin panel read as "the Admin panel with
extra buttons"; `panelAcceptance.mjs` asserts `[data-sidebar]` is **absent** on
`/org`.

**The same concept can exist in both panels — the difference is scope, not code.**
Rooms, finance and system analysis each have **one** implementation used twice:

| Concept | Super Admin | Admin | Shared component |
|---|---|---|---|
| Rooms | `/org/filiallar/:id?tab=rooms` | `/owner/rooms` | `owner/features/rooms/components/RoomsGrid` |
| Finance | `/org/moliya` | `/owner/finance` | `financeAnalytics/pages/FinanceCommandPage` |
| System analysis | `/org/tahlil` | `/owner/tahlil` | `systemAnalysis/SystemAnalysisTabs` (6 tabs, identical in both) |

Scope is a **filter applied by the server**, never a second screen. Writing a
"branch version" of a finance screen produces two numbers for one fact.

> `workspaces/` is what remains of an earlier four-workspace abstraction that
> computed every panel's shell from permissions. It replaced the Admin panel's
> own navigation and produced a second, half-finished branch panel (`/branch/*`).
> Only `/work` and `/me` survive; `/branch/*` redirects into `/owner/*`.

### Dashboard components and the data contract

`shared/components/dashboard/` holds the reusable pieces: `KpiTile`, `ChartCard`,
`InsightCard`, `DataState`, `SectionGrid` (`DashboardSection` / `KpiGrid` /
`SplitRow`).

They are **data-source agnostic**: they take `{ status, data, error, onRetry }`,
never a query. `dataStatus.js` is the contract:

```js
const overview = useOverviewData(params);   // -> { status, data, error, refetch }

<KpiTile label="Bu oy tushum" isMoney
         value={overview.data?.revenueThisMonth}
         status={overview.status} error={overview.error}
         onRetry={overview.refetch} />
```

`DATA_STATUS`: `idle | loading | error | empty | not_connected | ready`.

**A number is rendered only when `status === "ready"` AND the value is a finite
number.** `DataState` takes its children as a *render prop*, so `data` simply does
not exist outside the ready branch - fabricating a value would take deliberate
effort rather than a stray `|| 0`.

Rules that follow from this, and why:

- **Never write `|| 0` / `?? 0` on a metric.** A failed request would render a
  confident "0 so'm". The server distinguishes these: `attendanceGauge.rate` is
  `null` when no lesson was scheduled - that is "not measured", not "0%".
- `not_connected` is **separate from** `empty`. "No payments this month" is a
  business fact; "the payments module is not migrated yet" is a technical state.
  It is detected from **HTTP 501 only** (`MODULE_NOT_MIGRATED`, the server's
  contract - see server `config/legacyMongoose.js`), never a hardcoded list, so a
  section lights up on its own once its endpoint ships.
- **404 is an error, not `not_connected`.** A 404 means the route is not mounted,
  which is almost always a wrong URL on our side. Treating it as a calm
  "not connected" state hid exactly that bug once (`/finance-report` instead of
  `/finance-report/summary`). Opt in per call with `notConnectedOn: [404, 501]`
  if a specific endpoint really needs it.
- **Never re-derive the endpoint contract from a filename.** Read the route file,
  the zod validator and the service signature. `/branch-analytics/pnl` takes
  `from`/`to` (not `year`/`month`) and returns `{ items, totals }` (not an array);
  guessing produced both a silently-ignored filter and an app-crashing
  `rows.map is not a function`.
- Use `narrow(source, selector, { emptyWhen })` when one response feeds several
  blocks and a sub-field can be missing while the request itself succeeded.
- **Do not re-compute on the client what the server already computes**
  (`netGrowth`, attendance `rate`). Two formulas drift into two different numbers.
- Drill-down targets live **only** in `superadmin/navigation/drilldown.js`, verified
  against `owner/routes/index.jsx`. A 404 from a Super Admin card destroys trust in
  the numbers next to it. The universal number→journal chain is a separate registry:
  `shared/drill/drillNodes.js`.

### Finance: four entry points, one journal

The `Moliya` sidebar group opens with four items, each answering a different
question. They are pages, not tabs of one screen — a daily task should not sit
three clicks inside an analysis dashboard.

| Menu item | Route | Question | Main source |
|---|---|---|---|
| Umumiy | `/owner/finance` | how are we doing, and what happened? | `/finance-analytics/summary`, `/entries` |
| Chiqimlar | `/owner/finance/expenses` | write an expense, list today's | `/expenses` |
| Pul oqimi | `/owner/finance/cash-flow` | in / out / net, over time | `/finance-analytics/cash-flow*` |
| Kassa va hisoblar | `/owner/finance/accounts` | how much is in each account, today | `/finance-analytics/cash-flow/accounts` |

Rules that hold across all four:

- **The UI never derives a sign.** `entries[].amount` is total debit and is always
  positive; `entries[].cashDelta` is the *signed* treasury movement and is
  computed server-side. It has to be: a bank→cash transfer is negative for cash
  and positive for bank — one entry, two signs. When an account filter is set,
  `cashDelta` is scoped to that account; with no filter an internal transfer is
  `0`, which is the truth (total cash did not move) and renders neutral with an
  "ichki" tag rather than as `+0`.
- **`/cash-flow/trend` carries `inflow`/`outflow` next to `change`.** Internal
  transfers are excluded from the two bars (they would inflate both sides) but
  not from `change`, so `inflow − outflow === change` still holds exactly and the
  bars can never contradict the balance line.
- **`expenses.read` is not implied by `finance.read`.** The server guards the
  expense module with the old key; `PERMISSION_IMPLIES` has no rule for it. Both
  the sidebar entry and the route use `expenses.read`.
- **Branch stays global.** `FinanceFilterBar` has no branch selector — the
  sidebar switcher owns `x-branch-id`. The one exception is `superadmin/`
  (`/org/*`), whose shell has no switcher at all: `BranchFilter` renders there
  and only there.
- **Receipts come from the journal.** `shared/components/finance/TransactionReceipt`
  takes an already-fetched `/finance-analytics/entries/:id` object and formats it;
  it computes nothing. It is mounted once, inside `shared/drill/TransactionDetail`,
  so student payment / expense / salary / refund all print the same document.
  Printing is `window.print()` plus the `.print-receipt` / `.print-hide` rules in
  `styles/index.css` — no PDF library.

### Page headers: subtitle is information, not explanation

`PageHeader`'s `subtitle` used to be "recommended", and the result was a line
under almost every `<h1>` restating the title in different words. Those were
removed. A subtitle now earns its place only when it carries something the screen
cannot show by itself: context data (branch code, scope, period), a consequence
("a change reaches everyone with this role immediately"), or how to read a number
("central costs are not allocated to branches"). Warnings on destructive and
financial actions are untouched.

### Room occupancy: one computation, three screens

"How busy is this room?" is asked in three places — the branch comparison, the
system-analysis Rooms tab, and Finance → Profitability → Rooms. All three read
`server/src/helpers/roomOccupancy.helper.js`. Never compute it again locally.

Two bugs are fixed there, and both were invisible until the numbers were compared:

- **Occupied time is the *union* of intervals.** Two groups booked into one room
  at the same hour do not make it busy for two hours. A raw `SUM(end - start)`
  pushed utilization past 100% (103.35% was caught in a test). The double
  booking is not lost — it surfaces separately as `conflicts`.
- **The denominator is *active days*, read from the schedule**, not 7. A room
  booked solid Mon–Fri showed 74%, so the system said "there is room" when
  there was none.

The API always states its own basis (`window.note`, `availableHoursBasis`), and
the UI prints it. A percentage whose denominator is unstated cannot be checked.

### Creating records: one registry, two shells

`shared/components/create/` is the single source of "what can be created":

- `createRegistry.js` — the item list (`key`, `icon`, `label`, `hint`,
  `permission`/`permissions`, `modal`, `data`), sliced by permission.
- `CreateSplitButton.jsx` — a **split** button: the left half opens the
  remembered type in **one** click, the chevron changes it. The choice is kept
  in `localStorage` under `create:lastType` and re-validated against
  permissions on every render (a role change must not leave the button
  pointing at a modal the user can no longer open).
- `CreateModals.jsx` — the modals, mounted **once per shell**
  (`AppSidebar` for `/owner/*`, `SuperAdminLayout` for `/org/*`). Never mount a
  `ModalWrapper` with the same `name` at page level too — one `openModal`
  would open two dialogs. Context reaches the form through the modal payload:
  `openModal(MODAL.ROOM_CREATE, { branchId })` arrives as a prop, which is how
  the branch page pins the room to its branch without a second mount.

Permission keys here must match the **server route**, not the folder name:
rooms are guarded by `classes.create`, and branch creation needs
`system.admin_access` **and** `branches.create` (`branches.create` alone would
be a privilege-escalation path — see the comment in `branches.routes.js`).

> Watch out for `Input`'s `DEFAULT_MAX_LENGTH = 20`: every text field is capped
> at 20 characters unless `maxLength` is passed explicitly. A branch name
> silently lost its last characters this way.

## Feature rules

Each feature has its own **"public API"** (`<feature>/index.js`). External code imports only from this file. Internal working files stay inside.

```js
// owner/features/students/index.js
export { default as StudentsListPage } from "./pages/StudentsListPage";
export { useStudentsQuery } from "./hooks/useStudentsQuery";
```

```
<feature>/
├─ api/<feature>.api.js     # pure axios request functions
├─ hooks/use*Query.js       # TanStack Query
├─ hooks/use*Mutation.js    # TanStack Mutation
├─ components/              # list, table, card, modals
│  └─ modals/               # modals using ModalWrapper
├─ pages/                   # page files bound to routes
├─ store/                   # (if needed) redux slice
├─ utils/                   # feature-specific helpers
└─ index.js                 # public API
```

## Roles and protection

- `shared/constants/roles.js` - `ROLES.OWNER | TEACHER | STUDENT`.
- `shared/constants/permissions.js` - all permission keys (e.g. `"students.create"`).
- `<RoleGuard role="owner">` - if `me.role` does not match, redirects to `/`.
- `<PermissionGuard required="students.create">` - owner always passes.
- `useAuth()` - returns `{ user, role, isOwner, permissions }`.
- `usePermissions()` - `has(key) -> boolean`.

## Modal management

1. Add a constant to `shared/constants/modals.js`:
   ```js
   export const MODAL = Object.freeze({
     STUDENT_CREATE: "student:create",
     // ...
   });
   ```
2. Create the modal component: `feature/components/modals/StudentCreateModal.jsx` - write only the main form inside it (not `ModalWrapper`); `ModalWrapper` wraps it at the page level.
3. Render it on the page:
   ```jsx
   <ModalWrapper name={MODAL.STUDENT_CREATE} title="Talaba qo'shish">
     <StudentCreateModal />
   </ModalWrapper>
   ```
4. Open it:
   ```js
   const { openModal } = useModal();
   openModal(MODAL.STUDENT_CREATE, { someData });
   ```

## API rules

- Pure axios calls live in `feature/api/<name>.api.js` and **return a Promise only**:
  ```js
  // owner/features/students/api/students.api.js
  import http from "@/shared/api/http";
  export const studentsAPI = {
    list: (params) => http.get("/students", { params }),
    create: (body) => http.post("/students", body),
  };
  ```
- Use it via a hook:
  ```js
  // owner/features/students/hooks/useStudentsQuery.js
  import { useQuery } from "@tanstack/react-query";
  import { qk } from "@/shared/lib/query/keys";
  import { studentsAPI } from "../api/students.api";

  export const useStudentsQuery = (params) =>
    useQuery({
      queryKey: qk.students.list(params),
      queryFn: () => studentsAPI.list(params).then((r) => r.data.data),
    });
  ```
- `qk` - global query key registry (`shared/lib/query/keys.js`). **Do not invent keys out of thin air**, always go through this registry.

## State management (strict)

If a component holds **more than 1 state** - instead of multiplying `useState` calls, **use `useObjectState`**:

```js
// ❌
const [phone, setPhone] = useState("");
const [name, setName] = useState("");

// ✅
const { phone, name, setField } = useObjectState({ phone: "", name: "" });
```

`useObjectState` returns: `...state`, `state`, `setField(key, value)`, `setFields({ ... })`, `resetState()`.

Exceptions (only these three cases):
1. A single primitive state, nothing else (`useState(false)`).
2. Inside another hook implementation (`useObjectState` itself lives there).
3. When lazy init is needed (rare).

Details - `.claude/skills/useobjectstate-bilan-state-boshqarish/SKILL.md`.

## Theming (light / dark)

The theme works **automatically from the OS setting** (`defaultTheme="system"`), and the user can override it (Light / Dark / System). The choice is stored in `localStorage` under the `theme` key.

- `shared/components/theme/ThemeProvider.jsx` - wraps `next-themes` (mounted in `main.jsx`).
- `shared/components/theme/ThemeToggle.jsx` - `variant="menu"` (3 options) or `variant="switch"` (single button).
- `shared/hooks/useTheme.js` - `{ theme, resolvedTheme, isDark, isSystem, setTheme, toggleTheme }`.
- `index.html` has a synchronous script that applies the theme **before first paint** (prevents FOUC). It reads the same `theme` key - do not rename it.

### Colour rules - IMPORTANT

**Never write hardcoded colours** (`bg-white`, `text-gray-500`, `border-slate-200`). They do not adapt to dark mode. Use semantic tokens:

| Instead of | Use |
|---|---|
| `bg-white` | `bg-card` |
| `bg-gray-50` / `bg-gray-100` | `bg-muted` |
| `bg-gray-200` | `bg-accent` |
| `text-gray-900` / `700` | `text-foreground` |
| `text-gray-500` / `400` | `text-muted-foreground` |
| `border-gray-200` | `border-border` |
| `text-white` on `bg-primary` | `text-primary-foreground` |

Status tokens also exist: `success`, `warning`, `info`, `destructive` (each with a `-foreground` pair).

This rule is **enforced by ESLint** (`no-restricted-syntax` in `eslint.config.js`) - neutral palette classes fail the lint. Two deliberate exemptions:

- `bg-*-500` / `border-*-500` neutrals (e.g. `bg-slate-500`) are allowed. That mid-neutral clears 4.5:1 against white text in **both** themes, so it is the correct choice for surfaces that always carry white text (status knobs, rank chips) where no token works - a token would flip lightness and hide the text. `text-*-500` is still blocked.
- `bg-black/NN` scrims stay black in both themes.

> Beware `bg-muted-foreground` behind white text: it is dark in light mode but **light in dark mode**, so the text disappears. Use the fixed neutral instead.

**Status colours** (green = ok, red = error) carry meaning, so they are not converted to tokens - instead give them a `dark:` variant:

```jsx
<span className="bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" />
```

Modal overlays / scrims stay `bg-black/40` - they must be dark in both themes.

### Brand colour from `.env`

Colours are given as **HSL channels without the `hsl()` wrapper**: `"<hue> <saturation>% <lightness>%"`.

| Variable | Mode | Required |
|---|---|---|
| `VITE_APP_PRIMARY` | light | no |
| `VITE_APP_BACKGROUND` | light | no |
| `VITE_APP_PRIMARY_DARK` | dark | no - derived if absent |
| `VITE_APP_BACKGROUND_DARK` | dark | no - derived if absent |

`shared/constants/app.js` → `applyAppTheme()` injects a `<style>` tag scoped as `:root:not(.dark)` / `:root.dark`. Token generation lives in `shared/lib/theme/brandTokens.js`.

**If the dark values are omitted** they are derived from the light ones: the hue is kept and the lightness is raised until contrast reaches at least 4.5:1 against the dark background.

**If the dark values are given** they are used as-is; only contrast is enforced (lightness may be nudged, the hue never changes).

> Careful with a **black** brand colour (`0 0% 0%`). Black cannot be shown on a dark background, so the automatic mode turns it into a grey. To keep the brand look, set `VITE_APP_PRIMARY_DARK` yourself.

When `VITE_APP_BACKGROUND_DARK` is supplied, all the other dark surfaces (`card`, `muted`, `accent`, `border`, `input`, `sidebar`) are stepped off **that** value, so a custom dark background stays tonally consistent.

> Do not use `documentElement.style.setProperty()` for this - an inline style beats `.dark { ... }` rules and dark mode would silently stop working.

### Contrast check

```bash
npm run check:contrast   # WCAG AA (4.5:1) - CSS tokens + .env derived values
```

Run it after changing any colour token; it exits non-zero on failure.

It also **range-checks the raw `.env` values first**. This matters: `parseHsl` silently clamps out-of-range input, so `VITE_APP_PRIMARY=4 2% 115%` became lightness `100%` - a pure white brand. The derived tokens were still mutually contrastful, so every contrast assertion passed while the UI rendered white cards in dark mode. Contrast alone cannot catch this; the range check can.

The same validation (`validateHsl` in `shared/utils/color.js`) logs a `console.warn` in dev via `applyAppTheme()`. It deliberately does not throw - a bad colour should not take down a running panel.

> A lightness of `0%` or `100%` is *in* range but still unusable as `--primary`. In light mode `ensureContrast` pushes it back to a readable value, but in dark mode a white brand stays white. If a brand surface looks wrong, check the raw `.env` value before suspecting the token maths.

## Language rules

- UI text - Uzbek (`"Saqlash"`, `"Bekor qilish"`, `"Talabalar ro'yxati"`).
- Code values - English (`role: "owner"`, `MODAL.STUDENT_CREATE`, route `/students`, query key `["students", "list"]`).

## Aliases (jsconfig.json)

- `@/` -> `client/src/`
- `@/components/*` -> `client/src/shared/components/*` (additional alias)

## Commands

```bash
npm run dev                  # on port 5173
npm run build
npm run lint
npm run check:contrast         # WCAG AA on colour tokens
npm run check:ai-metrics       # AI metric tone logic
npm run check:data-contract    # dashboard status contract (29 checks)
npm run check:permission-keys  # every PERMISSIONS.X resolves to a real key

# Browser acceptance (needs the dev server + API running; Playwright from npx cache)
# First: cd ../server && node tests/fixtures/qaUsers.mjs
npm run test:browser-panels    # the two panels: shells, rooms, drill-down, scope
npm run test:browser           # legacy shell checks, redirects, mobile
npm run test:browser-create    # create split button + branch cross-section
npm run test:browser-branch    # create a branch -> multi-branch mode -> compare
npm run test:a11y              # landmarks, focus, contrast on key screens

# Safari: the same suites on the WebKit engine (BROWSER=chromium|webkit|firefox)
BROWSER=webkit npm run test:browser-panels
npm run test:safari            # panels + a11y, both under WebKit
```

`BROWSER` is read by `tests/_engine.mjs`. **WebKit is Safari's engine, not
Safari.app** - Playwright cannot drive Safari.app at all (that needs
`safaridriver` + Selenium, which has no headless mode). It does catch the
engine-level differences: CSS grid/flex, `Date` parsing, `:has()`, IndexedDB,
scroll behaviour. It does not catch ITP/cookie policy, extensions or the PWA
install flow.

**A check that fails only under WebKit is not automatically an app bug.** Run the
same suite under chromium and compare before reporting it - Safari platform
defaults (Tab not moving to links, for one) look exactly like a broken app.
An unknown `BROWSER` value exits 2 rather than silently falling back to chromium,
because a green run on the wrong engine is worse than no run.

A check that cannot run for lack of data is reported as **⏭️ tekshirilmadi**, not
as a pass. An empty database makes a leak assertion ("branch B sees nothing")
vacuously green, so those assertions sit behind a **positive control**: if the
allowed side finds nothing either, the whole check is declared unverified.

`check:permission-keys` exists because a typo'd key **fails silently**:
`PERMISSIONS.ROOMS_CREATE` (no such key) is `undefined`, and `has(undefined)`
returns `true` for the owner but `false` for everyone else — so the developer
never sees the button disappear for receptionists. In
`CreatableSelectField` the same `undefined` skips the check entirely, which
fails the other way. Both shapes shipped in this codebase before the check
existed.

`check:data-contract` guards `shared/components/dashboard/dataStatus.js`. A bug
there does not crash - it puts a **confident wrong number** on an executive screen,
which nobody double-checks. Run it after touching that file.
