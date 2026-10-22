# Handover — Family Expenses

*Updated 2026-10-22 (M5 in PR #5; M6 part 1 — budgets, status, CSV — built on `feature/m6-budgets`, not committed, waiting for review). Read this first when resuming; requirements and rules are in
[`DESIGN.md`](DESIGN.md).*

## 0. Resume in one minute

1. Start Docker Desktop (`C:\Users\Veera\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`) — the database
   container `family-pg` starts with it.
2. `cd C:\Veera\Work\family-expenses`, `git fetch`, `git status`, check the PRs below.
3. `npm run dev` → http://localhost:3000 (development database `family`).
4. Next work: the user reviews **M6 part 1** (DESIGN §10.6) → commit when asked; then **M6 part 2** (§5: charts +
   phone bottom bar). PR #5 (M5) waits for the user to merge. `feature/m6-budgets` starts from `feature/m5-search`
   (`1d48bd0`): when PR #5 is merged, the M6 PR must target `main` (`gh pr create --base main`; if it was opened on
   the M5 branch, `gh pr edit <n> --base main`).

## 1. Status

**Milestones 6/8 done** (M0–M5; M5 in PR #5; M6 part 1 built). Work milestone by milestone: build → tests → browser check → summary → the user
reviews → commit only when asked → ask before every push.

| # | Milestone | Commit | Branch | GitHub |
|---|---|---|---|---|
| M0 | Design + setup | `1862912` | `main` | on `main` |
| M1 | Accounts | `55404e9` | `feature/m1-accounts` | PR #1 merged |
| M2 | Families | `0fc7b66` | `feature/m2-families` | PR #2 merged |
| M3 | Expenses | `a763aad` | `feature/m3-expenses` | PR #3 merged → `main` = `fdbf15b` |
| M4 | Receipts + site admin | `883b51e` | `feature/m4-receipts` | PR #4 merged → `main` = `c89e096` |
| M5 | Search + monthly view | `c2763c3` | `feature/m5-search` (from `c89e096`) | PR #5 open |
| M6 | Budgets, charts, CSV | part 1 not committed | `feature/m6-budgets` (from `1d48bd0`) | part 1 built, waiting for review |
| M7 | Deploy (Vercel + Neon) | — | — | |

- Repo: https://github.com/Veerababu4/ExpTracker (**public**). PRs: https://github.com/Veerababu4/ExpTracker/pulls
- The repo has `delete_branch_on_merge=false`: stacked PRs need `gh pr edit <n> --base main` after the lower one
  merges. After a merge, `git fetch origin main:main` (fast-forward local `main`).
- Local `main` = `origin/main` = `c89e096` (checked with `git rev-parse main origin/main`).

## 2. Running it

| What | Command / place |
|---|---|
| Dev server | `npm run dev` → http://localhost:3000 |
| Health | http://localhost:3000/api/health → `{"status":"ok","database":"ok"}` |
| Database | Docker `family-pg` (postgres:17-alpine), port **5434**, volume `family-pg-data`, user `family_app`, databases `family` (dev) and `family_test` (tests). Not `vihan-pg` (5432). |
| Secrets | `.env.local` (git-ignored): `DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_PASSWORD`, `SESSION_SECRET`, optional `ADMIN_USERNAMES`. Never print them. |
| Site admin | `ADMIN_USERNAMES=<your username>` in `.env.local` (comma-separated) → header link **Admin** → `/admin`. Not set yet locally; in production set it in Vercel (M7). |
| Migrations | edit `src/server/db/schema.ts` → `npm run db:generate` → review the SQL → `npm run db:migrate` (dev DB). Tests rebuild `family_test` from the migration files each run. Dev DB is at `0004_budgets`. |
| Logins | none seeded — register in the browser. Dev DB has no users/families. |

## 3. Tests and checks (all must pass before reporting a milestone)

| Command | What | Last result |
|---|---|---|
| `npm test` | Vitest: unit + database tests (rebuilds `family_test`) | 172/172 |
| `npm run e2e` | build + Playwright in Microsoft Edge, desktop + 390 px phone, `next start -p 3100` on `family_test` | 80/80 (~6 min) |
| `npm run lint` · `npm run typecheck` · `npm run build` | | clean |

- **Never run `npm test` and the E2E suite at the same time** — both use `family_test` and the Vitest setup drops it.
- **Laptop sleep breaks E2E runs** (Modern Standby suspends the network). Run long suites through a keep-awake
  wrapper (`SetThreadExecutionState`), e.g. a scratchpad `run-e2e-awake.ps1`:
  `Add-Type` a `kernel32 SetThreadExecutionState`, call it with `0x80000001`, run `npx.cmd playwright test`, reset
  with `0x80000000` in `finally`.
- If a run is interrupted, a `next start -p 3100` or Playwright `node` process can be left behind → "port 3100 is already
  used". Find it with `Get-NetTCPConnection -LocalPort 3100` and stop that process.
- Playwright wipes `test-results/` at start — write run logs elsewhere (e.g. the session scratchpad).
- One Vitest run right after an E2E run took 5+ minutes and had 3 failures; two reruns passed 128/128 in 23 s. If it
  happens again, look at which tests failed before re-running (don't filter the output away).
- `npx playwright test …` alone does **not** rebuild — run `npm run build` first after code changes (`npm run e2e` does both).
- E2E site admins: `playwright.config.ts` passes `ADMIN_USERNAMES=admin.desktop,admin.phone` to the test server;
  `receipts.spec.ts` turns receipts off and always back on (keep that test last in its file).

## 4. How the code is organised

```
src/app/(public)/…        login, register, forgot-password
src/app/(app)/…           behind login: / (add expense), /expenses/[id], /search, /month/[month], /welcome, /family,
                          /family/add-member, /family/categories, /family/limits, /family/budget, /account,
                          /first-login, /admin; layout = header + switcher
src/app/receipts/[id]     Route Handler serving a receipt file to members of its family
src/app/export/expenses   Route Handler: CSV download of a search or a month (same filters as /search)
src/actions/*.ts          Server Actions ("controllers"): parse form → service → FormState
src/server/services/*.ts  business rules ("@Service"): accounts, families, expenses, expense-access (shared
                          permission checks), receipts, reports (search + month + export), categories, alert-limits,
                          budgets, audit
src/server/auth/*.ts      session cookie, requireUser(), requireFamily(), isSiteAdmin()
src/server/db/            Drizzle schema, client, SQL migrations 0000–0004
src/lib/                  shared pure code: rules (dates, alerts, join-code, receipts, budget), money, csv,
                          validation (Zod), formatting
src/components/           UI pieces incl. expense-form, receipt-picker (browser-side photo shrinking)
e2e/                      Playwright specs + helpers
```

Key rules live in pure, unit-tested files: `src/lib/rules/dates.ts` (India "today", edit windows),
`src/lib/rules/alerts.ts`, `src/lib/rules/receipts.ts` (limits, file-type sniffing), `src/lib/rules/budget.ts`
(allowed months, 80% / 100% status), `src/lib/csv.ts` (Excel-safe CSV), `src/lib/money.ts` (paise).

## 5. Next: M6 part 2 — charts and phone polish (DESIGN §3.6 B3)

Part 1 (budgets, budget status, CSV) is built — see DESIGN §10.6. Agreed with the user (2026-10-22): **inline SVG
charts** drawn by our own server components (no chart library), and M6 in two parts with a review between.

1. **Charts (B3)** on the monthly view: spend by category (horizontal bars, budget mark where set), daily spend for
   the month (columns, one per day), last 6 months trend (columns or line, with the family budget where set). **Load
   the `dataviz` skill before writing any chart code.** Needs a service for daily totals and 6-month totals
   (`reports.ts`). Text alternatives: each chart has a title and a short summary / table for screen readers.
2. **Mobile polish**: bottom bar on phones (Add · Month · Search · Family) instead of the top links; check 360 px on
   every page (budget page, month page with charts).
3. Tests: unit tests for chart maths (scales, ticks, bar sizes), DB tests for the new report queries, E2E for the
   charts' presence/summaries and the bottom bar, phone-width overflow checks.

After M6: M7 deploy (Vercel + Neon, security headers/CSP, `npm audit`, `ADMIN_USERNAMES` on Vercel, re-check free tiers).

## 6. Open questions for the user

- **Blinking**: the very-high warning blinks 5 times (~5 s) then stays solid red (accessibility rule WCAG 2.2.2). Offer
  continuous blinking if they prefer.
- **Password reset in two families**: the head of either family can reset that person's password (as specified). Keep, or
  limit?
- **"Family created" banner** stays on the family page until you navigate away (minor).
- **Members' header after approval**: a member's header updates on their next full page load after the head approves
  them (layouts are kept during in-app navigation).
- **M6 part 1 choices** (confirm in review): "Fill in from last month" fills the boxes without saving (the head checks,
  then presses Save); budgets up to ₹1,00,00,000; members who open `/family/budget` see a note, not the amounts (they see
  the status on the month page); categories with a budget but nothing spent show at ₹0; the CSV has one row per expense
  (no total row) so Excel can sort and filter, amounts as plain numbers, dates as YYYY-MM-DD.
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
- Links from a month to the search must stop at today (the search refuses future dates).
- `getByTestId` also matches the hidden previous page → use `locator("[data-testid=…]:visible")`.
- Playwright `isVisible()` doesn't wait — on a streaming page wait for an element with `expect(...).toBeVisible()` first.
- Zod 4 cross-field checks: `superRefine(fn, { when: () => true })` so all field errors show at once.
- E2E tests that open extra browser sessions must close them (`closeExtraPages` in `afterEach`) or Edge stalls.
- React form actions reset uncontrolled inputs after every submit; controlled fields (the amount) and the picked receipt
  are kept in React state and cleared in the `useActionState` wrapper.
- Windows/Git Bash: run git from the project folder; shell `cd` resets between calls. Multi-line edits via Bash
  heredocs can break on quotes — write a script to the scratchpad and run it.
- **For M7 (CSP)**: the budget bars (`components/budget-status.tsx`) and the admin storage bar set their width with an
  inline `style` attribute — the Content-Security-Policy must allow it (`style-src 'unsafe-inline'`, which Next.js
  needs anyway) or those bars must move to SVG `width` attributes.
- Budget boxes on `/family/budget` are controlled inputs (React state), so they survive the form action's reset and
  "Fill in from …" can set them; the form is keyed by month so each month starts fresh.
- Screenshot helpers (session scratchpad): `start-3200.ps1` (`next start -p 3200` on `family_test`, reads
  `TEST_DATABASE_URL` without printing it) + `shots-m5.mjs` / `shots-m6a.mjs`. Stop the 3200 server before `npm test`.

## 8. Decisions so far

See DESIGN §11. Highlights: Next.js + Neon + Vercel (no cold starts); username login, optional mobile/email, security
questions; member window 7 days OR current month, head window current + 2 months; alert limits ₹2,000 / ₹20,000 per
member, head can change; money in paise; "today" = India time; English only; receipts in PostgreSQL with a 500 MB
shared limit and a site-admin on/off switch; budgets (head, family total + optional per category, overspend allowed) in M6.
