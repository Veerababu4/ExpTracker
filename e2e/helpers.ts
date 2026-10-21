import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

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

export async function createFamily(page: Page, name: string): Promise<string> {
  await page.goto("/welcome");
  await page.getByLabel("Family name").fill(name);
  await page.getByRole("button", { name: "Create family" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("Family created.")).toBeVisible();
  return (await page.getByTestId("join-code").innerText()).trim();
}

export async function askToJoin(page: Page, code: string) {
  await page.goto("/welcome");
  await page.getByLabel("Family code").fill(code.toLowerCase()); // codes aren't case-sensitive
  await page.getByRole("button", { name: "Ask to join" }).click();
}

/** The add-expense home page of the given family is showing. */
export async function expectHome(page: Page, familyName: string) {
  await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();
  await expect(page.getByText(`${familyName} · you can use dates from`)).toBeVisible();
}

export function memberRow(page: Page, username: string) {
  return page.getByRole("listitem").filter({ hasText: `@${username}` });
}

/** Head approves a pending join request on the family page. */
export async function approve(head: Page, username: string) {
  await head.goto("/family");
  await memberRow(head, username).getByRole("button", { name: "Approve" }).click();
  await expect(head.getByText("No pending requests.")).toBeVisible();
}
