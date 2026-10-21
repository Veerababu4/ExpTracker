# Family Expenses — Design

*Version 0.5 · 2026-10-21 · M4*

A website where a family records its day-to-day expenses, looks at any month, searches between dates and
tracks a monthly budget. Built for personal/family use (non-commercial), hosted for free.

---

## 1. Stack and hosting

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere | One language for screens and server logic; compile-time type checks like Java |
| Framework | Next.js 16 (App Router), React 19 | Pages and server code in one project; Server Actions replace a separate REST backend |
| Styling | Tailwind CSS 4 | Comes with the Next.js template; fast mobile-first layouts |
| Database | PostgreSQL — Neon (cloud), Docker `postgres:17-alpine` (local) | Real SQL for date ranges and monthly totals |
| DB access | Drizzle ORM + `pg` driver, SQL migrations with `drizzle-kit` | Thin, SQL-like, typed (closest to JPA repositories + Flyway) |
| Validation | Zod 4 | Same schema checks forms on the server (and shows field errors) |
| Passwords | Argon2id (`@node-rs/argon2`) | Current recommended password hash |
| Tests | Vitest (unit + DB integration), Playwright with Edge (E2E, later) | Same approach as Vihan |
| Hosting | Vercel Hobby (app) + Neon free (DB) | ₹0; Vercel Hobby allows personal non-commercial use; no 2-minute cold start like Render |

Free-tier limits change; they are re-checked at M7 before going live.

### 1.1 How the code is organised

```
src/
  app/                    pages (routes) — server components by default
    (public)/             login, register, forgot-password
    (app)/                everything behind login (layout checks the session)
  actions/                Server Actions ("use server") — the "controllers": parse form → call service → return result
  server/                 server-only code ("import 'server-only'")
    db/                   Drizzle schema, client, migrations
    auth/                 sessions, password hashing, current user
    services/             business logic — the "@Service" classes (families, expenses, budgets…)
  lib/                    code shared by server and browser: rules (dates, alerts, money), Zod schemas, formatting
  components/             reusable UI pieces
docs/                     this design, handover notes
```

Rule: **every** Server Action re-checks the session, the family membership and the role on the server.
The browser only hides buttons; it never decides permissions.

---

## 2. Key concepts

| Term | Meaning |
|---|---|
| **User** | A person with a username and password. Can belong to several families. |
| **Family** | A group sharing one expense book. Has exactly one **head**. |
| **Membership** | A user's place in a family: role `HEAD` or `MEMBER`, status `ACTIVE` / `REMOVED` / `LEFT`, and the alert limits for that person in that family. |
| **Active family** | The family the user is currently looking at (switcher in the header). Kept in the session. |
| **Expense** | One spending entry. Belongs to one family and to the member who entered it (the *owner*). |
| **Today** | Always the date in **India time (Asia/Kolkata)**, whatever the server's or browser's clock zone. |

---

## 3. Functional requirements

### 3.1 Accounts (M1)

| ID | Requirement |
|---|---|
| A1 | Register with **username**, display name, password, confirm password, and **2 security questions** (different) with answers. **Mobile and email are optional.** |
| A2 | Username: 4–30 characters, starts with a letter, only `a–z 0–9 . _`; stored lower-case; unique (case-insensitive). |
| A3 | Password: 8–128 characters, at least one letter and one digit; must not equal the username. |
| A4 | Mobile (optional): Indian 10-digit number starting 6–9; `+91`/`0` prefix and spaces are accepted and removed. Email (optional): valid format. Neither has to be unique; neither is used to log in. |
| A5 | Login with username + password. 5 wrong passwords in a row → account locked for 15 minutes (message says so). |
| A6 | Change password (needs current password). Signs out the user's other devices. |
| A7 | **Forgot password**: enter username → answer both security questions → set new password. 5 wrong attempts → recovery locked for 1 hour. An unknown username still shows two questions (always the same two for that name) so the page does not reveal which usernames exist. |
| A8 | Change security questions/answers (needs current password). |
| A9 | Profile: edit display name, mobile, email. Username cannot be changed. |
| A10 | Logout. Sessions last 30 days, extended while the user keeps using the site. |

Security questions (pick 2 different):
first school name · town where your mother was born · first pet's name · childhood best friend's name ·
first mobile phone brand · street you grew up on · childhood nickname · first city you travelled to by train or flight.
Answers are compared after trimming, lower-casing and collapsing spaces, and stored only as Argon2id hashes.

### 3.2 Families and members (M2)

| ID | Requirement |
|---|---|
| F1 | Any logged-in user can **create a family** (name 2–60 chars). The creator becomes its **head** and an active member. |
| F2 | Each family has a **join code** shown to the head, 8 characters as `XXXX-XXXX` (no look-alike characters 0/O/1/I/L). The head can generate a new code; the old one stops working. |
| F3 | A user **requests to join** with a join code. The request is `PENDING` until the head **approves** or **rejects** it. One pending request per user per family; after a rejection the user may ask again. The user sees the status of their requests and can cancel a pending one. |
| F4 | The head sees pending requests (with display name, username, mobile/email if given, request date) and approves/rejects. |
| F5 | The head can **create a login for a member**: username, display name, temporary password (mobile/email optional). The new user is an active member straight away. At first login they must set a new password and their security questions. |
| F6 | The head can **reset a member's password** to a new temporary password (same first-login rule). This is also the way back in for a member who forgot answers. |
| F7 | A user can be in **several families**. After login: no family → "Create or join a family" page; one → that family; several → last used family. Header has a family switcher. |
| F8 | The head can **transfer the head role** to another active member (confirmation step). The old head becomes a member. Always exactly one head. |
| F9 | The head can **remove** a member; a member can **leave**. Their past expenses stay in the family and show "(former member)". They may later ask to join again. The head cannot leave or be removed without transferring the role first. |
| F10 | Family members list visible to all members: name, role, joined date. |

### 3.3 Expenses (M3)

| ID | Requirement |
|---|---|
| E1 | Add expense fields: **date** (default today, editable), **amount** (required), **currency INR** (shown, not editable), **category** (dropdown, optional → "Uncategorised"), **payment mode** (optional: Cash, UPI, Card, Net banking, Other), **note** (optional, ≤ 200 chars), **receipt** photo or PDF (optional, §3.7). |
| E2 | Amount: ₹1.00 – ₹10,00,000.00, at most 2 decimals; commas allowed while typing. |
| E3 | Date: not in the future; inside the user's **date window** (§4.1). |
| E4 | **High-value alerts** under the amount field while typing (§4.2). Warning only; never blocks saving. |
| E5 | Members can edit/delete **only their own** expenses, inside the member window. The head can edit/delete **any** family expense inside the head window. |
| E6 | Delete is a soft delete (hidden, kept in the database and the change log), with a confirmation step. |
| E7 | Every add/edit/delete is written to the change log: who, when, old and new values. The head can see the log of an expense. |
| E8 | "Today" list on the add page: the user's entries for the chosen date, for a quick check. |

### 3.4 Categories (M3)

| ID | Requirement |
|---|---|
| C1 | A new family starts with: Groceries, Vegetables & fruits, Milk & dairy, Subscriptions, Health & medicines, Online shopping, Utilities (power, water, gas), Mobile & internet, Rent / EMI, Fuel & transport, Education, Dining out, Household & repairs, Personal care, Gifts & festivals, Travel, Other. |
| C2 | The head can add a category (2–40 chars, unique within the family, case-insensitive), rename it, and hide/unhide any category. Hidden categories disappear from the dropdown but stay on old expenses and in reports. |

### 3.5 Search and monthly view (M5)

| ID | Requirement |
|---|---|
| S1 | **Search between two dates**: From and To required; From ≤ To; To not after today; range at most 1 year (366 days); dates from 2000-01-01. Clear messages for each failure. |
| S2 | Optional filters: member, category (incl. Uncategorised), payment mode. |
| S3 | Results: newest first, 50 per page, with **count and total** for the whole result. Rows above the owner's very-high limit show a red **High** tag. |
| S4 | **Monthly view** for any month up to the current one: total, budget status, totals by category, by member and by payment mode, and the list. Previous/next month buttons. |
| S5 | All members see all of the family's expenses (who added each one is shown). |

### 3.6 Budgets, charts, export (M6)

| ID | Requirement |
|---|---|
| B1 | The head sets a **monthly family budget** and optionally a budget **per category**, for any month from 2 months back to 12 months ahead. "Copy from last month" button. |
| B2 | Spending may exceed the budget. Display: below 80% normal; 80–100% **amber**; above 100% **red** "Over budget by ₹X". Same per category. If category budgets add up to more than the family total, show a note (not an error). |
| B3 | Charts on the monthly view: spend by category, daily spend for the month, last 6 months trend. |
| B4 | CSV export of search results and of a month (opens correctly in Excel; values starting with `= + - @` are escaped). |

### 3.7 Receipts (M4)

| ID | Requirement |
|---|---|
| R1 | Attach one receipt per expense: JPG/PNG/WebP photo or PDF, up to 5 MB as picked. Photos are shrunk in the browser (longest side 1600 px, JPEG) before upload; PDFs up to 2 MB. Can be attached while adding, or later on the expense page. |
| R2 | Only members of that family can open a receipt (served through an authorised route, never a public link). Add/replace/remove follows the expense edit rules (window + ownership). Deleting an expense removes its receipt for good (frees the space). |
| R3 | Storage: a `receipts` table in PostgreSQL (Neon free = 1 GB per project, Oct 2026). **All receipts of all families together may use at most 500 MB**; when full, new receipts are refused with a message and adding expenses keeps working. |
| R4 | **Site admin** (usernames in the `ADMIN_USERNAMES` setting — not a family role) has a `/admin` page: receipt space used (total, per family — sizes only), the whole database size, and an **on/off switch** for new receipts (takes effect at once, logged). While off, saved receipts can still be opened and removed. |

---

## 4. Business rules

### 4.1 Date windows (who can add/edit which dates)

`today` = current date in Asia/Kolkata. No role can use a date after `today`.

| Role | Allowed expense dates | Example on **21 Oct 2026** | Example on **3 Nov 2026** |
|---|---|---|---|
| Member | date ≥ **today − 6 days** *OR* date ≥ **1st of the current month** | 1 Oct – 21 Oct | 28 Oct – 3 Nov |
| Head | date ≥ **1st of the month two months before** | 1 Aug – 21 Oct | 1 Sep – 3 Nov |

- "Last one week" = today and the 6 days before it (7 calendar days).
- **Editing** checks both the expense's current date *and* the new date. **Deleting** checks the current date.
  So a member cannot move an old expense into the window, and nobody can push one outside their window.
- Outside the window the edit/delete buttons are not shown, and the server refuses with
  "You can only change expenses dated from 1 Oct 2026 to 21 Oct 2026."
- Rules follow the person's role *now* (after a head transfer, the new head gets the head window).
- These rules live in one file, `src/lib/rules/dates.ts`, with unit tests for month and year boundaries.

### 4.2 High-value alerts

Each membership has two limits (defaults ₹2,000 and ₹20,000). The limits of the expense's **owner** are used.

| Amount | Under the amount field |
|---|---|
| ≤ high limit | nothing |
| > high limit and ≤ very-high limit | red text: "⚠ This is a high-value expense." |
| > very-high limit | red, bold, blinking: "⚠ Very high expense — ₹25,000. Please double-check before saving." |

- Blinking about once a second; with the device's "reduce motion" setting it stays solid red.
- Message is announced to screen readers (`aria-live="polite"`).
- The head edits limits per member (including self) per family on **Family → Alert limits**; "Reset to default".
  Validation: ₹1 ≤ high < very-high ≤ ₹10,00,000. Members see their own limits read-only. Changes are logged.

### 4.3 Money

- Stored as **whole paise** in a `bigint` column (₹2,500.50 → `250050`), so there are no rounding errors.
- Currency column fixed to `INR` (kept so other currencies could be added later).
- Displayed in Indian format: ₹1,25,000.00.

---

## 5. Database (PostgreSQL)

All ids are UUIDs; all tables have `created_at`; times are `timestamptz` (UTC); expense dates are `date`.

| Table | Main columns | Notes |
|---|---|---|
| `users` | id, username (unique), display_name, mobile?, email?, password_hash, must_change_password, failed_logins, locked_until, recovery_failures, recovery_locked_until, last_family_id? | username stored lower-case |
| `security_answers` | user_id, slot (1/2), question_code, answer_hash | PK (user_id, slot); question codes differ |
| `sessions` | id (= SHA-256 of the cookie token), user_id, active_family_id?, expires_at, last_seen_at | cookie holds the random token, DB only its hash |
| `families` | id, name, join_code (unique), created_by | |
| `family_members` | family_id, user_id, role, status, joined_at, left_at?, high_alert_paise?, very_high_alert_paise? | PK (family_id, user_id); partial unique index → one active HEAD per family; null limit = default |
| `join_requests` | id, family_id, user_id, status (PENDING/APPROVED/REJECTED/CANCELLED), decided_by?, decided_at? | partial unique index → one PENDING per (family, user) |
| `categories` | id, family_id, name, hidden, sort_order | unique (family_id, lower(name)); defaults copied in when a family is created |
| `expenses` | id, family_id, owner_id, expense_date, amount_paise, currency, category_id?, payment_mode?, note?, created_by, updated_by?, updated_at?, deleted_at?, deleted_by? | index (family_id, expense_date) where not deleted; check amount 100..100000000 |
| `budgets` | family_id, month (1st of month), category_id? (null = family total), amount_paise, set_by, updated_at | unique (family_id, month, category_id) `NULLS NOT DISTINCT` |
| `receipts` | id, family_id, expense_id (unique), content_type, size_bytes, data (bytea), created_by | one per expense; checks: type is JPG/PNG/WebP/PDF, 1 B – 2 MB, size = length of data |
| `app_settings` | key, value jsonb, updated_by?, updated_at | site switches, e.g. `receipts_enabled` (missing = on) |
| `audit_log` | id, family_id?, actor_id, action, entity_type, entity_id, before jsonb?, after jsonb?, at | expense changes, approvals, role/limit/category/budget changes, password resets |

Migrations: `drizzle-kit generate` writes SQL files to `src/server/db/migrations` (committed, reviewed like Flyway
scripts); `npm run db:migrate` applies them.

---

## 6. Screens (routes)

| Route | Who | Content |
|---|---|---|
| `/login`, `/register`, `/forgot-password` | everyone | M1 |
| `/first-login` | user with temporary password | set new password + security questions |
| `/welcome` | user without a family | create a family / join with code / my requests |
| `/expenses/new` | member | add form + the day's entries (home page after login) |
| `/expenses/[id]` | member | view / edit / delete / receipt / change log (head) |
| `/receipts/[id]` | member of that family | the receipt file (Route Handler; others get "not found") |
| `/month/[yyyy-mm]` | member | monthly view (budget, totals, charts, list) |
| `/search` | member | date range search |
| `/family` | member | members, join code (head), requests (head), create member login (head), transfer head, leave/remove |
| `/family/limits` | head (members read own) | alert limits |
| `/family/categories` | head | categories |
| `/family/budget` | head | budgets |
| `/account` | user | profile, change password, security questions, my families, logout |
| `/admin` | site admin | receipt space, receipts on/off |

Layout: mobile first (most entries happen on phones). Bottom bar on phones: **Add · Month · Search · Family**; top bar
with family switcher and account menu. Works from 360 px wide with no sideways scrolling.

---

## 7. Security

- Argon2id for passwords and security answers; plain values are never logged or stored.
- Session cookie: random 32 bytes, `HttpOnly`, `Secure` (production), `SameSite=Lax`, 30 days sliding.
  Database keeps only the hash. Password change/reset deletes the user's other sessions.
- Authorisation in one place (`src/server/auth` + services): every action loads the membership from the database
  and checks role + date window. Requests for another family's data return "not found".
- Next.js Server Actions already reject cross-site posts (origin check). All input validated with Zod on the server.
- Security headers (CSP, frame-ancestors none, referrer policy, etc.) set in `next.config.ts`.
- Lockouts for login and recovery (A5, A7). Errors shown to users never include stack traces or SQL.
- Receipts: the file type is read from the file's first bytes (not its name or the browser's label); served with
  the stored type, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, and photos with
  `Content-Security-Policy: sandbox`. Server Action uploads are capped at 3 MB (`serverActions.bodySizeLimit`).
- Secrets only in environment variables (`.env.local` locally, Vercel settings in production); never in git or chat.

---

## 8. Testing

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | date windows, alert levels, money parsing/formatting, join code, validation schemas |
| Integration | Vitest + local Docker PostgreSQL (`family_test` database) | services: permissions, windows, approvals, budgets, audit rows |
| End-to-end | Playwright + Edge | main journeys per milestone, phone (390 px) and desktop widths |
| Checks | `npm run lint`, `npm run typecheck`, `npm run build` | must be clean before each milestone is reported |

---

## 9. Environments

| | Local | Production (M7) |
|---|---|---|
| App | `npm run dev` → http://localhost:3000 | Vercel Hobby, `*.vercel.app` (custom domain optional) |
| Database | Docker container `family-pg` (postgres:17-alpine, port **5434**, volume `family-pg-data`) — separate from `vihan-pg` | Neon free, region near India |
| Config | `.env.local` (git-ignored); template in `.env.example` | Vercel environment variables |
| Site admin | `ADMIN_USERNAMES` in `.env.local` | `ADMIN_USERNAMES` in Vercel settings |

---

## 10. Milestones

| # | Milestone | Status |
|---|---|---|
| M0 | Design doc + project setup (Next.js, DB container, Drizzle, Vitest, lint/typecheck) | ✅ `1862912` |
| M1 | Register, login, logout, lockout, security questions, forgot/change password, first-login flow | ✅ `55404e9` |
| M2 | Families: create, join code, requests + approval, head-created logins, password reset by head, switcher, transfer head, remove/leave | ✅ `0fc7b66` |
| M3 | Expenses: add/edit/delete with date windows, categories, payment mode, note, high-value alerts + per-member limits, change log | ✅ `a763aad` |
| M4 | Receipt photos and PDFs (in PostgreSQL, 500 MB shared limit), site admin page with receipts on/off | ✅ `883b51e` |
| M5 | Search between dates + monthly view with totals | ⏳ |
| M6 | Budgets, charts, CSV export, mobile polish | ⏳ |
| M7 | Deploy to Vercel + Neon, production checks | ⏳ |

Each milestone: build → tests → browser check → summary → user reviews → commit only when asked.

---

### 10.1 As built — M1 (accounts)

- Tables `users`, `security_answers`, `sessions` (migration `0000_accounts.sql`).
- Layers: forms (`src/app/(public)`, `src/app/(app)`) → Server Actions `src/actions/auth.ts` → service
  `src/server/services/accounts.ts` (no cookies; takes `now` so tests can move the clock) → Drizzle.
  Cookie handling and `requireUser()` live in `src/server/auth/session.ts`.
- Session cookie `fe_session`; `src/proxy.ts` only pushes its expiry forward on page GETs (no database).
  The database extends a session at most once an hour.
- Cache Components is on (Next 16 default): every session read is behind a `loading.tsx`/`<Suspense>` boundary and
  calls `connection()` first, because session checks read the clock. No user data is cached.
- Forms report **all** field problems at once (Zod cross-field checks run with `when: () => true`).
- Forgot password for an unknown username shows two decoy questions chosen by a keyed hash of the name.
- Not in M1: security headers / CSP (M7), per-IP rate limiting (only per-account lockouts for now).
- Tests: 48 unit + database tests (Vitest, `family_test`), 10 browser journeys × desktop and 390 px phone
  (Playwright + Edge, production build on port 3100 against `family_test`).

### 10.2 As built — M2 (families)

- Tables `families`, `family_members`, `join_requests`, `audit_log` + enums (migration `0001_families.sql`).
  A partial unique index (`family_one_head`) makes "exactly one active head" a database rule, not just code.
- Service `src/server/services/families.ts`: every change checks the caller's role itself
  (`NotAllowedError` → the friendly `(app)/error.tsx` page). Actions take the family id from the form, so an old
  tab can't act on a different family after a switch.
- Active family = this browser's choice (`sessions.active_family_id`) → last used anywhere (`users.last_family_id`)
  → oldest membership. No family → `/welcome`.
- Pages: `/welcome` (create, join, my requests, my families), `/family` (code, requests, members, head actions,
  leave), `/family/add-member`. Header: family switcher (when in 2+ families), Home, Family.
- Audit actions so far: FAMILY_CREATED, JOIN_CODE_CHANGED, JOIN_REQUESTED, JOIN_APPROVED, JOIN_REJECTED,
  MEMBER_LOGIN_CREATED, PASSWORD_RESET_BY_HEAD, HEAD_TRANSFERRED, MEMBER_REMOVED, MEMBER_LEFT.
- Note: a person in two families can have their password reset by the head of either family (F6 as specified).
  They chose to join each family, and every reset is audited.
- A head who is the only member can't leave (no "delete family" in v1).

### 10.3 As built — M3 (expenses)

- Migration `0002_expenses.sql`: `categories`, `expenses` (+ `payment_mode` enum, checks: amount ₹1–₹10,00,000,
  currency = INR, note ≤ 200), alert-limit columns on `family_members`. It also copies the default categories into
  families created before M3; `createFamily` seeds them for new ones.
- Services: `expenses.ts` (add/edit/delete with the §4.1 windows; edit checks the current and new date; members
  only their own; soft delete; change log with only the changed fields), `categories.ts`, `alert-limits.ts`.
- Pages: `/` = Add expense (date min/max = the person's window; changing the date shows that day's entries),
  `/expenses/[id]` (edit/delete or read-only with the reason; change log for the head), `/family/categories`,
  `/family/limits`. Header link "Add".
- High-value warning (§4.2): live under the amount; the very-high one blinks **5 times (~5 s) then stays solid red**
  — accessibility guidelines (WCAG 2.2.2) don't allow endless blinking — and doesn't blink with "reduce motion".
  The amount's owner's limits are used (the head editing Sita's expense sees Sita's alerts).
- Hidden categories: not offered for new expenses; an expense that already has one keeps it ("(hidden)").

### 10.4 As built — M4 (receipts)

- Migration `0003_receipts.sql`: `receipts` (bytea, unique `expense_id`, type/size checks) and `app_settings`.
- Service `receipts.ts`: `storeReceipt` runs inside the caller's transaction (so "add expense + receipt" is all or
  nothing), takes an advisory lock, then checks on/off and the 500 MB limit. Replacing deletes the old row and inserts
  a new one (new id → browsers can't show a stale picture). Permission checks shared with expenses through
  `expense-access.ts`. Change log: `RECEIPT_ADDED/REPLACED/REMOVED`, "Added with receipt"; site switch:
  `RECEIPTS_TURNED_ON/OFF`.
- Browser: `components/receipt-picker.tsx` checks type/size, shrinks photos with a canvas (1600 px, JPEG 0.8, then
  0.6 if still over 2 MB; transparent parts become white), shows a preview chip. The prepared file is kept in React
  state and added to the form data on submit (React clears file inputs after each submit). The input stays disabled
  until the page is hydrated, so a file picked during loading isn't lost.
- Pages: add form has the receipt field; `/expenses/[id]` has a Receipt card (photo inline / PDF link, add, replace,
  remove); lists show "📎 Receipt"; `/admin` (header link "Admin" for site admins only; others get "not found").

## 11. Decision log

| Date | Decision |
|---|---|
| 2026-10-21 | Stack: Next.js + TypeScript + PostgreSQL (Neon) on Vercel, over Spring Boot on Render (cold starts). |
| 2026-10-21 | Login by username; mobile/email optional; recovery by security questions; head can reset members. |
| 2026-10-21 | Member window = last 7 days OR current month; head window = current + 2 previous months. |
| 2026-10-21 | Alert limits default ₹2,000 / ₹20,000, head overrides per member per family. |
| 2026-10-21 | Budgets: head sets family total + optional per category; overspending allowed and highlighted. |
| 2026-10-21 | English only. Money stored in paise. "Today" = India time. |
| 2026-10-21 | Keep Next.js Cache Components on; read the session per request, cache nothing per user. Database sessions (hashed token) so password changes can sign out other devices. |
| 2026-10-21 | Receipts stored in PostgreSQL (not Vercel Blob): one system, private, transactional. Shared limit 500 MB of Neon's 1 GB; site admin (`ADMIN_USERNAMES`) can switch new receipts off on `/admin`. Deleting an expense removes its receipt. |
