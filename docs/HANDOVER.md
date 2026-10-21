# Handover — Family Expenses

*Updated 2026-10-21, end of session (M3 done). Read this first when resuming; requirements and rules are in
[`DESIGN.md`](DESIGN.md).*

## 0. Resume in one minute

1. Start Docker Desktop (`C:\Users\Veera\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`) — the database
   container `family-pg` starts with it.
2. `cd C:\Veera\Work\family-expenses`, `git fetch`, `git status`, check the PRs below.
3. `npm run dev` → http://localhost:3000 (development database `family`).
4. Next work: **M4 receipts** (§5) — first decide the storage with the user.

## 1. Status

**Milestones 4/8 done** (M0–M3). Work milestone by milestone: build → tests → browser check → summary → the user
reviews → commit only when asked → ask before every push.

| # | Milestone | Commit | Branch | GitHub |
|---|---|---|---|---|
| M0 | Design + setup | `1862912` | `main` | on `main` |
| M1 | Accounts | `55404e9` | `feature/m1-accounts` | PR #1 **merged** (`main` = `1661d3a`) |
| M2 | Families | `0fc7b66` | `feature/m2-families` | **PR #2** open → `main` |
| M3 | Expenses | `a763aad` (+ this handover) | `feature/m3-expenses` | **PR #3** open → `feature/m2-families` (stacked) |
| M4 | Receipt photos | — | — | next |
| M5 | Search + monthly view | — | — | |
| M6 | Budgets, charts, CSV | — | — | |
| M7 | Deploy (Vercel + Neon) | — | — | |

- Repo: https://github.com/Veerababu4/ExpTracker (**public**). PRs: https://github.com/Veerababu4/ExpTracker/pulls
- **Merge order:** PR #2 first, then PR #3. If GitHub doesn't retarget #3 to `main` by itself after #2 merges, run
  `gh pr edit 3 --base main`. After merging, `git fetch origin main:main` (fast-forward local `main`).
- Start M4 from `feature/m3-expenses` (or from `main` once #2 and #3 are merged): branch `feature/m4-receipts`.

## 2. Running it

| What | Command / place |
|---|---|
| Dev server | `npm run dev` → http://localhost:3000 |
| Health | http://localhost:3000/api/health → `{"status":"ok","database":"ok"}` |
| Database | Docker `family-pg` (postgres:17-alpine), port **5434**, volume `family-pg-data`, user `family_app`, databases `family` (dev) and `family_test` (tests). Not `vihan-pg` (5432). |
| Secrets | `.env.local` (git-ignored): `DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_PASSWORD`, `SESSION_SECRET`. Never print them. |
| Migrations | edit `src/server/db/schema.ts` → `npm run db:generate` → review the SQL → `npm run db:migrate` (dev DB). Tests rebuild `family_test` from the migration files each run. |
| Logins | none seeded — register in the browser. Dev DB currently has no users/families (as of this handover). |

## 3. Tests and checks (all must pass before reporting a milestone)

| Command | What | Last result |
|---|---|---|
| `npm test` | Vitest: unit + database tests (rebuilds `family_test`) | 106/106 |
| `npm run e2e` | build + Playwright in Microsoft Edge, desktop + 390 px phone, `next start -p 3100` on `family_test` | 54/54 (~5 min) |
| `npm run lint` · `npm run typecheck` · `npm run build` | | clean |

- **Never run `npm test` and the E2E suite at the same time** — both use `family_test` and the Vitest setup drops it.
- **Laptop sleep breaks E2E runs** (Modern Standby suspends the network: `ERR_NETWORK_IO_SUSPENDED`, or a run stalls
  until the 15-minute `globalTimeout`). Run long suites through a keep-awake wrapper (`SetThreadExecutionState`), e.g.
  the scratchpad script `run-e2e-awake.ps1` from this session, or keep the laptop awake.
- If a run is interrupted, a `next start -p 3100` or Playwright `node` process can be left behind → "port 3100 is already
  used". Find it with `Get-NetTCPConnection -LocalPort 3100` and stop that process.
- Playwright wipes `test-results/` at start — write run logs elsewhere (e.g. the session scratchpad).

## 4. How the code is organised

```
src/app/(public)/…        login, register, forgot-password
src/app/(app)/…           behind login: / (add expense), /expenses/[id], /welcome, /family, /family/add-member,
                          /family/categories, /family/limits, /account, /first-login; layout = header + switcher
src/actions/*.ts          Server Actions ("controllers"): parse form → service → FormState
src/server/services/*.ts  business rules ("@Service"): accounts, families, expenses, categories, alert-limits, audit
src/server/auth/*.ts      session cookie, requireUser(), requireFamily()
src/server/db/            Drizzle schema, client, SQL migrations 0000–0002
src/lib/                  shared pure code: rules (dates, alerts, join-code), money, validation (Zod), formatting
e2e/                      Playwright specs + helpers
```

Key rules live in pure, unit-tested files: `src/lib/rules/dates.ts` (India "today", edit windows),
`src/lib/rules/alerts.ts`, `src/lib/money.ts` (paise).

## 5. Next: M4 receipt photos (DESIGN §3.7)

Plan to confirm with the user before building:

1. **Storage decision (ask the user):** Vercel Blob (private) vs a `receipts` table in PostgreSQL (`bytea`). Check the
   current free tiers first (Neon free storage is small; Vercel Blob free limits). Recommendation to evaluate: PostgreSQL
   for simplicity and privacy if receipts are shrunk to ~200–300 KB, otherwise Vercel Blob.
2. Migration: `receipts` table (id, family_id, content_type, size, data or storage key, created_by, created_at) and
   `expenses.receipt_id`.
3. Browser-side shrink of photos (longest side 1600 px, JPEG ~0.8); PDFs ≤ 2 MB as-is; 5 MB pick limit.
4. Authorised route `GET /receipts/[id]` (Route Handler) that checks family membership — never a public URL.
5. Add/replace/remove follows the expense edit rules (window + ownership); thumbnails/links on the expense page.
6. Tests: service (permissions, size/type limits), E2E (upload JPG, view, replace, remove; member can't see another
   family's receipt).

After M4: M5 search + monthly view, M6 budgets/charts/CSV, M7 deploy (+ security headers/CSP, re-check `npm audit`).

## 6. Open questions for the user

- **Blinking**: the very-high warning blinks 5 times (~5 s) then stays solid red (accessibility rule WCAG 2.2.2). Offer
  continuous blinking if they prefer.
- **Password reset in two families**: the head of either family can reset that person's password (as specified). Keep, or
  limit?
- **"Family created" banner** stays on the family page until you navigate away (minor).
- **Members' header after approval**: a member's header updates on their next full page load after the head approves
  them (layouts are kept during in-app navigation).

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
- Zod 4 cross-field checks: `superRefine(fn, { when: () => true })` so all field errors show at once.
- E2E tests that open extra browser sessions must close them (`closeExtraPages` in `afterEach`) or Edge stalls.
- React form actions reset uncontrolled inputs after every submit; controlled fields (the amount) are cleared in the
  `useActionState` wrapper.
- Windows/Git Bash: run git from the project folder; shell `cd` resets between calls.

## 8. Decisions so far

See DESIGN §11. Highlights: Next.js + Neon + Vercel (no cold starts); username login, optional mobile/email, security
questions; member window 7 days OR current month, head window current + 2 months; alert limits ₹2,000 / ₹20,000 per
member, head can change; money in paise; "today" = India time; English only; budgets (head, family total + optional per
category, overspend allowed) in M6.
