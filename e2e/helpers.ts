import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";

export const PASSWORD = "secret123";

export function uniqueName(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** Registers through the form. New users have no family yet, so they land on the welcome page. */
export async function register(page: Page, username: string, displayName = "Ravi Kumar") {
  await page.goto("/register");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByLabel("Your name").fill(displayName);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Question 1").selectOption("first_school");
  await page.getByLabel("Answer 1").fill("ZP High School");
  await page.getByLabel("Question 2").selectOption("first_pet");
  await page.getByLabel("Answer 2").fill("Tommy");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: `Welcome, ${displayName}` })).toBeVisible();
}

export async function login(page: Page, username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const extraContexts: BrowserContext[] = [];

/** A second, separate browser session (e.g. the family head and a member side by side). */
export async function newUserPage(browser: Browser, baseURL: string | undefined, viewport: { width: number; height: number } | null) {
  const context = await browser.newContext({ baseURL, viewport: viewport ?? undefined });
  extraContexts.push(context);
  return context.newPage();
}

/** Call in afterEach: leftover sessions pile up in memory and eventually stall the browser. */
export async function closeExtraPages() {
  await Promise.all(extraContexts.splice(0).map((c) => c.close()));
}

// ── Families ──

/**
 * Creates a family. `include` ticks "Include my expenses in this family" (M8) — on by default here, so the older
 * journeys keep seeing the head's expenses in the family.
 */
export async function createFamily(page: Page, name: string, include = true): Promise<string> {
  await page.goto("/welcome");
  await page.getByLabel("Family name").fill(name);
  if (include) await page.locator("#create-title ~ div").getByRole("checkbox", { name: /Include my expenses/ }).check();
  await page.getByRole("button", { name: "Create family" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("Family created.")).toBeVisible();
  return (await page.getByTestId("join-code").innerText()).trim();
}

/** Asks to join; `include` ticks "Include my expenses in this family" (on by default here, see createFamily). */
export async function askToJoin(page: Page, code: string, include = true) {
  await page.goto("/welcome");
  await page.getByLabel("Family code").fill(code.toLowerCase()); // codes aren't case-sensitive
  if (include) await page.locator("#join-title ~ div").getByRole("checkbox", { name: /Include my expenses/ }).check();
  await page.getByRole("button", { name: "Ask to join" }).click();
}

/** The add-expense page of the given book (a family or "My expenses") is showing. */
export async function expectHome(page: Page, bookName: string) {
  await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();
  await expect(page.getByText(`${bookName} · you can use dates from`)).toBeVisible();
}

export function memberRow(page: Page, username: string) {
  return page.getByRole("listitem").filter({ hasText: `@${username}` });
}

/**
 * Test set-up: the user's expenses have been in their (only) family since `month` ("2026-09"), as if they had
 * ticked "include" back then. The app itself only switches from the current month (M8, DESIGN §3.8 P2).
 */
export async function shareSince(username: string, month: string) {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await pool.query(
      `insert into expense_sharing (user_id, from_month, family_id)
       select u.id, $2::date, m.family_id
       from users u
       join family_members m on m.user_id = u.id and m.status = 'ACTIVE'
       join families f on f.id = m.family_id and f.kind = 'FAMILY'
       where u.username = $1
       on conflict (user_id, from_month) do update set family_id = excluded.family_id`,
      [username, `${month}-01`],
    );
  } finally {
    await pool.end();
  }
}

/** Head approves a pending join request on the family page. */
export async function approve(head: Page, username: string) {
  await head.goto("/family");
  await memberRow(head, username).getByRole("button", { name: "Approve" }).click();
  await expect(head.getByText("No pending requests.")).toBeVisible();
}
