# Handover — Family Expenses

*Updated 2026-10-21 (M4 committed, PR #4 open). Read this first when resuming; requirements and rules are in
[`DESIGN.md`](DESIGN.md).*

## 0. Resume in one minute

1. Start Docker Desktop (`C:\Users\Veera\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`) — the database
   container `family-pg` starts with it.
2. `cd C:\Veera\Work\family-expenses`, `git fetch`, `git status`, check the PRs below.
3. `npm run dev` → http://localhost:3000 (development database `family`).
4. Next work: **M5 search + monthly view** (§5).

## 1. Status

**Milestones 5/8 done** (M0–M4). Work milestone by milestone: build → tests → browser check → summary → the user
reviews → commit only when asked → ask before every push.

| # | Milestone | Commit | Branch | GitHub |
|---|---|---|---|---|
| M0 | Design + setup | `1862912` | `main` | on `main` |
| M1 | Accounts | `55404e9` | `feature/m1-accounts` | PR #1 merged |
| M2 | Families | `0fc7b66` | `feature/m2-families` | PR #2 merged |
| M3 | Expenses | `a763aad` | `feature/m3-expenses` | PR #3 merged → `main` = `fdbf15b` |
| M4 | Receipts + site admin | `883b51e` | `feature/m4-receipts` (from `main`) | **PR #4** open → `main` |
| M5 | Search + monthly view | — | — | next |
| M6 | Budgets, charts, CSV | — | — | |
| M7 | Deploy (Vercel + Neon) | — | — | |

- Repo: https://github.com/Veerababu4/ExpTracker (**public**). PRs: https://github.com/Veerababu4/ExpTracker/pulls
- The repo has `delete_branch_on_merge=false`: stacked PRs need `gh pr edit <n> --base main` after the lower one
  merges. After a merge, `git fetch origin main:main` (fast-forward local `main`).
- Start M5 from `feature/m4-receipts` (or from `main` once M4 is merged): branch `feature/m5-search`.

## 2. Running it

| What | Command / place |
|---|---|
| Dev server | `npm run dev` → http://localhost:3000 |
| Health | http://localhost:3000/api/health → `{"status":"ok","database":"ok"}` |
| Database | Docker `family-pg` (postgres:17-alpine), port **5434**, volume `family-pg-data`, user `family_app`, databases `family` (dev) and `family_test` (tests). Not `vihan-pg` (5432). |
| Secrets | `.env.local` (git-ignored): `DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_PASSWORD`, `SESSION_SECRET`, optional `ADMIN_USERNAMES`. Never print them. |
| Site admin | `ADMIN_USERNAMES=<your username>` in `.env.local` (comma-separated) → header link **Admin** → `/admin`. Not set yet locally; in production set it in Vercel (M7). |
| Migrations | edit `src/server/db/schema.ts` → `npm run db:generate` → review the SQL → `npm run db:migrate` (dev DB). Tests rebuild `family_test` from the migration files each run. Dev DB is at `0003_receipts`. |
| Logins | none seeded — register in the browser. Dev DB has no users/families. |

## 3. Tests and checks (all must pass before reporting a milestone)

| Command | What | Last result |
|---|---|---|
| `npm test` | Vitest: unit + database tests (rebuilds `family_test`) | 128/128 |
| `npm run e2e` | build + Playwright in Microsoft Edge, desktop + 390 px phone, `next start -p 3100` on `family_test` | 64/64 (~6 min) |
| `npm run lint` · `npm run typecheck` · `npm run build` | | clean |

- **Never run `npm test` and the E2E suite at the same time** — both use `family_test` and the Vitest setup drops it.
- **Laptop sleep breaks E2E runs** (Modern Standby suspends the network). Run long suites through a keep-awake
  wrapper (`SetThreadExecutionState`), e.g. a scratchpad `run-e2e-awake.ps1`:
  `Add-Type` a `kernel32 SetThreadExecutionState`, call it with `0x80000001`, run `npx.cmd playwright test`, reset
  with `0x80000000` in `finally`.
- If a run is interrupted, a `next start -p 3100` or Playwright `node` process can be left behind → "port 3100 is already
  used". Find it with `Get-NetTCPConnection -LocalPort 3100` and stop that process.
- Playwright wipes `test-results/` at start — write run logs elsewhere (e.g. the session scratchpad).
- `npx playwright test …` alone does **not** rebuild — run `npm run build` first after code changes (`npm run e2e` does both).
- E2E site admins: `playwright.config.ts` passes `ADMIN_USERNAMES=admin.desktop,admin.phone` to the test server;
  `receipts.spec.ts` turns receipts off and always back on (keep that test last in its file).

## 4. How the code is organised

```
src/app/(public)/…        login, register, forgot-password
src/app/(app)/…           behind login: / (add expense), /expenses/[id], /welcome, /family, /family/add-member,
                          /family/categories, /family/limits, /account, /first-login, /admin; layout = header + switcher
src/app/receipts/[id]     Route Handler serving a receipt file to members of its family
src/actions/*.ts          Server Actions ("controllers"): parse form → service → FormState
src/server/services/*.ts  business rules ("@Service"): accounts, families, expenses, expense-access (shared
                          permission checks), receipts, categories, alert-limits, audit
src/server/auth/*.ts      session cookie, requireUser(), requireFamily(), isSiteAdmin()
src/server/db/            Drizzle schema, client, SQL migrations 0000–0003
src/lib/                  shared pure code: rules (dates, alerts, join-code, receipts), money, validation (Zod), formatting
src/components/           UI pieces incl. expense-form, receipt-picker (browser-side photo shrinking)
e2e/                      Playwright specs + helpers
```

Key rules live in pure, unit-tested files: `src/lib/rules/dates.ts` (India "today", edit windows),
`src/lib/rules/alerts.ts`, `src/lib/rules/receipts.ts` (limits, file-type sniffing), `src/lib/money.ts` (paise).

## 5. Next: M5 search + monthly view (DESIGN §3.5)

Plan to confirm with the user before building:

1. `/search`: From/To (required; From ≤ To; To ≤ today; ≤ 366 days; from 2000-01-01) + optional member, category
   (incl. Uncategorised), payment mode. Validation in a pure Zod schema with unit tests; query in a service.
2. Results newest first, 50 per page, count + total for the whole result (one SQL aggregate), "High" tag (S3),
   "📎 Receipt" marker (already in `ExpenseList`). Filters in the URL (`?from=…&to=…&page=2`) so results can be shared
   and the back button works.
3. `/month/[yyyy-mm]` (any month up to the current one): total, totals by category / member / payment mode, the list,
   previous/next buttons. Budget status comes in M6.
4. Header links: Add · Month · Search · Family (bottom bar on phones, DESIGN §6).
5. Tests: service (filters, family isolation, totals, paging), schema unit tests, E2E for both pages on phone + desktop.

After M5: M6 budgets/charts/CSV, M7 deploy (+ security headers/CSP, re-check `npm audit`, set `ADMIN_USERNAMES` on Vercel).

## 6. Open questions for the user

- **Blinking**: the very-high warning blinks 5 times (~5 s) then stays solid red (accessibility rule WCAG 2.2.2). Offer
  continuous blinking if they prefer.
- **Password reset in two families**: the head of either family can reset that person's password (as specified). Keep, or
  limit?
- **"Family created" banner** stays on the family page until you navigate away (minor).
- **Members' header after approval**: a member's header updates on their next full page load after the head approves
  them (layouts are kept during in-app navigation).
- **M4 choices made without asking** (confirm in review): deleting an expense removes its receipt for good (frees
  space); while receipts are off, saved ones can still be opened and removed; the admin page shows family names and
  sizes, never the receipts.

## 7. Gotchas learned (Next.js 16 and this setup)

- `node_modules/next/dist/docs/` is the source of truth for Next 16 (AGENTS.md). Middleware is now `src/proxy.ts`.
- **Cache Components is on**: every session read sits behind `loading.tsx`/`<Suspense>`, and `getCurrentUser()` calls
  `connection()` first (reading the clock during prerender is an error). Nothing per-user is cached.
- After a Server Action changes data on the same page, call `refresh()` (`next/cache`). When the **header/layout** must
  change too (family created/left/switched), call `revalidatePath("/", "layout")` before `redirect()`.
- **Never call a function exported from a `"use client"` file in a server component** (e.g. a class-name helper): the
  build passes, runtime fails. Shared helpers go in plain modules (`components/button-class.ts`).
- Every export of a `"use server"` file is a public endpoint — keep only actions there.
- Next 16 keeps the previous page mounted but hidden → in E2E use role-based locators (they skip hidden elements),
  `:visible` CSS, and wait for the new page's heading after clicking a link; `getByLabel` can match the hidden copy and
  the PasswordField "Show …" buttons (use `exact: true`).
- **Streamed pages answer HTTP 200 even when they call `notFound()`** (the status is sent before the boundary
  resolves) — E2E checks the "This page could not be found." heading, not the status. Route Handlers return real codes.
- `RouteContext<"/receipts/[id]">` types come from `next typegen` (or dev/build); run it before `npm run typecheck` after
  adding a route.
- Server Action body limit is `experimental.serverActions.bodySizeLimit` (default 1 MB; set to 3 MB for receipts).
- Lint rule `react-hooks/set-state-in-effect` is on: for a blob preview use a ref callback with cleanup (React 19), for
  "hydrated yet?" use `useSyncExternalStore(() => () => {}, () => true, () => false)`.
- A file input picked before hydration loses the file (no listener yet) → the picker is disabled until hydrated, and E2E
  waits for `toBeEnabled()` before `setInputFiles`.
- Playwright `isVisible()` doesn't wait — on a streaming page wait for an element with `expect(...).toBeVisible()` first.
- Zod 4 cross-field checks: `superRefine(fn, { when: () => true })` so all field errors show at once.
- E2E tests that open extra browser sessions must close them (`closeExtraPages` in `afterEach`) or Edge stalls.
- React form actions reset uncontrolled inputs after every submit; controlled fields (the amount) and the picked receipt
  are kept in React state and cleared in the `useActionState` wrapper.
- Windows/Git Bash: run git from the project folder; shell `cd` resets between calls. Multi-line edits via Bash
  heredocs can break on quotes — write a script to the scratchpad and run it.

## 8. Decisions so far

See DESIGN §11. Highlights: Next.js + Neon + Vercel (no cold starts); username login, optional mobile/email, security
questions; member window 7 days OR current month, head window current + 2 months; alert limits ₹2,000 / ₹20,000 per
member, head can change; money in paise; "today" = India time; English only; receipts in PostgreSQL with a 500 MB
shared limit and a site-admin on/off switch; budgets (head, family total + optional per category, overspend allowed) in M6.
