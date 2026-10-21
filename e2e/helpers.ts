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
