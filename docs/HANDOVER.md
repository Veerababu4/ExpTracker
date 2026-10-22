# Handover — Family Expenses

*Updated 2026-10-22 (M5 in PR #5; M6 part 1 committed `0898b23`; M6 part 2 — charts, phone bottom bar — built on `feature/m6-budgets`, not committed, waiting for review). Read this first when resuming; requirements and rules are in
[`DESIGN.md`](DESIGN.md).*

## 0. Resume in one minute

1. Start Docker Desktop (`C:\Users\Veera\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`) — the database
   container `family-pg` starts with it.
2. `cd C:\Veera\Work\family-expenses`, `git fetch`, `git status`, check the PRs below.
3. `npm run dev` → http://localhost:3000 (development database `family`).
4. Next work: the user reviews **M6 part 2** (DESIGN §10.7) → commit when asked → M6 PR (ask before pushing); then
   **M7** deploy (§5). PR #5 (M5) waits for the user to merge. `feature/m6-budgets` starts from `feature/m5-search`
   (`1d48bd0`): when PR #5 is merged, the M6 PR must target `main` (`gh pr create --base main`; if it was opened on
   the M5 branch, `gh pr edit <n> --base main`).

## 1. Status

**Milestones 6/8 done** (M0–M5; M5 in PR #5; M6 built: part 1 committed, part 2 waiting for review). Work milestone by milestone: build → tests → browser check → summary → the user
reviews → commit only when asked → ask before every push.

| # | Milestone | Commit | Branch | GitHub |
|---|---|---|---|---|
| M0 | Design + setup | `1862912` | `main` | on `main` |
| M1 | Accounts | `55404e9` | `feature/m1-accounts` | PR #1 merged |
| M2 | Families | `0fc7b66` | `feature/m2-families` | PR #2 merged |
| M3 | Expenses | `a763aad` | `feature/m3-expenses` | PR #3 merged → `main` = `fdbf15b` |
| M4 | Receipts + site admin | `883b51e` | `feature/m4-receipts` | PR #4 merged → `main` = `c89e096` |
| M5 | Search + monthly view | `c2763c3` | `feature/m5-search` (from `c89e096`) | PR #5 open |
| M6 | Budgets, charts, CSV | part 1 `0898b23`; part 2 not committed | `feature/m6-budgets` (from `1d48bd0`) | not pushed |
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
| `npm test` | Vitest: unit + database tests (rebuilds `family_test`) | 182/182 |
| `npm run e2e` | build + Playwright in Microsoft Edge, desktop + 390 px phone, `next start -p 3100` on `family_test` | 86/86 (~7 min) |
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
src/lib/                  shared pure code: rules (dates, alerts, join-code, receipts, budget), money, csv, charts,
                          validation (Zod), formatting
src/components/           UI pieces incl. expense-form, receipt-picker (browser-side photo shrinking), column-chart +
                          chart-tips (tooltip), budget-status (bars), bottom-nav (phones)
e2e/                      Playwright specs + helpers
```

Key rules live in pure, unit-tested files: `src/lib/rules/dates.ts` (India "today", edit windows),
`src/lib/rules/alerts.ts`, `src/lib/rules/receipts.ts` (limits, file-type sniffing), `src/lib/rules/budget.ts`
(allowed months, 80% / 100% status), `src/lib/csv.ts` (Excel-safe CSV), `src/lib/money.ts` (paise).

## 5. Next: M7 — deploy to Vercel + Neon (DESIGN §10, §7)

M6 is built (DESIGN §10.6 part 1, §10.7 part 2). Plan for M7, to confirm with the user before starting:

1. Neon project (free tier) → production `DATABASE_URL`; run the migrations 0000–0004 against it.
2. Vercel project from the GitHub repo (Hobby); env vars `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAMES`.
3. Security headers / CSP (note: the budget and admin bars use inline `style` widths — see §7), `npm audit`.
4. Re-check the free tiers (Neon storage vs the 500 MB receipt limit, Vercel function limits) and the health check.
5. Smoke test on the live site (register, family, expense, receipt, budget, month charts, CSV) on a phone.

## 6. Open questions for the user

- **Blinking**: the very-high warning blinks 5 times (~5 s) then stays solid red (accessibility rule WCAG 2.2.2). Offer
  continuous blinking if they prefer.
- **Password reset in two families**: the head of either family can reset that person's password (as specified). Keep, or
  limit?
- **"Family created" banner** stays on the family page until you navigate away (minor).
- **Members' header after approval**: a member's header updates on their next full page load after the head approves
  them (layouts are kept during in-app navigation).
- **M6 part 2 choices** (confirm in review): the charts are drawn from HTML boxes (not SVG shapes) by our own server
  components — still no chart library, as agreed; the 6-month chart shows the page's month in teal and earlier months
  grey; the daily chart labels only the highest day; on phones the four page links moved from the header to the
  bottom bar (wider screens unchanged).
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
- `/month` forwards to `/month/<yyyy-mm>` only after the page has loaded (a redirect inside a streamed page), so a
  test that measures or scrolls the page must open `/month/<yyyy-mm>` directly ("Execution context was destroyed").
- Full-page screenshots draw the fixed bottom bar where the viewport was, mid-page — that's the screenshot, not a bug.
- Budget boxes on `/family/budget` are controlled inputs (React state), so they survive the form action's reset and
  "Fill in from …" can set them; the form is keyed by month so each month starts fresh.
- Screenshot helpers (session scratchpad): `start-3200.ps1` (`next start -p 3200` on `family_test`, reads
  `TEST_DATABASE_URL` without printing it) + `shots-m5.mjs` / `shots-m6a.mjs`. Stop the 3200 server before `npm test`.

## 8. Decisions so far

See DESIGN §11. Highlights: Next.js + Neon + Vercel (no cold starts); username login, optional mobile/email, security
questions; member window 7 days OR current month, head window current + 2 months; alert limits ₹2,000 / ₹20,000 per
member, head can change; money in paise; "today" = India time; English only; receipts in PostgreSQL with a 500 MB
shared limit and a site-admin on/off switch; budgets (head, family total + optional per category, overspend allowed) in M6.
