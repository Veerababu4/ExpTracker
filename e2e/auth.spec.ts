import { hash } from "@node-rs/argon2";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

// M1 journeys: register, logout/login, lockout, forgot password, account changes, first login.
// Next.js keeps recently visited pages mounted but hidden, so prefer role-based locators (they skip hidden
// elements) over getByLabel for fields that appear on several pages.

const PASSWORD = "secret123";

function uniqueName(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

async function register(page: Page, username: string, displayName = "Ravi Kumar") {
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
  await expect(page.getByRole("heading", { name: `Hello, ${displayName}` })).toBeVisible();
}

async function login(page: Page, username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("register, log out, log back in", async ({ page }) => {
  const username = uniqueName("ravi");
  await register(page, username);
  await logout(page);
  await login(page, username.toUpperCase()); // usernames are not case-sensitive
  await expect(page.getByRole("heading", { name: "Hello, Ravi Kumar" })).toBeVisible();
});

test("register shows field errors and keeps what was typed", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("textbox", { name: "Username" }).fill("ab");
  await page.getByLabel("Your name").fill("Sita");
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByLabel("Confirm password", { exact: true }).fill("secret999");
  await page.getByLabel("Mobile number").fill("12345");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Username must be at least 4 characters.")).toBeVisible();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();
  await expect(page.getByText("Enter a 10-digit Indian mobile number.")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Sita");
  await expect(page.getByRole("textbox", { name: "Username" })).toHaveAttribute("aria-invalid", "true");
});

test("a taken username is refused", async ({ page }) => {
  const username = uniqueName("taken");
  await register(page, username);
  await logout(page);
  await page.goto("/register");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByLabel("Your name").fill("Someone");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Question 1").selectOption("nickname");
  await page.getByLabel("Answer 1").fill("chinnu");
  await page.getByLabel("Question 2").selectOption("first_pet");
  await page.getByLabel("Answer 2").fill("tommy");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("This username is taken. Try another.")).toBeVisible();
});

test("five wrong passwords lock the account", async ({ page }) => {
  const username = uniqueName("lock");
  await register(page, username);
  await logout(page);
  for (let i = 0; i < 4; i++) {
    await login(page, username, "wrong-pass1");
    await expect(page.getByText(/Wrong username or password/)).toBeVisible();
  }
  await login(page, username, "wrong-pass1");
  await expect(page.getByText(/this account is locked until/)).toBeVisible();
  await login(page, username); // right password, still locked
  await expect(page.getByText(/this account is locked until/)).toBeVisible();
});

test("forgot password with security questions", async ({ page }) => {
  const username = uniqueName("forgot");
  await register(page, username);
  await logout(page);

  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("What was the name of your first school?")).toBeVisible();

  await page.getByLabel("What was the name of your first school?").fill("wrong school");
  await page.getByLabel("What was your first pet's name?").fill("tommy");
  await page.getByLabel("New password", { exact: true }).fill("newpass123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("newpass123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText(/The answers don't match/)).toBeVisible();

  await page.getByLabel("What was the name of your first school?").fill("  zp   HIGH school ");
  await page.getByLabel("What was your first pet's name?").fill("Tommy");
  await page.getByLabel("New password", { exact: true }).fill("newpass123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("newpass123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Ravi Kumar" })).toBeVisible();

  await logout(page);
  await login(page, username, "newpass123");
  await expect(page.getByRole("heading", { name: "Hello, Ravi Kumar" })).toBeVisible();
});

test("unknown username still shows two questions", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("textbox", { name: "Username" }).fill(uniqueName("ghost"));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Set new password" })).toBeVisible();
  await expect(page.locator("input[name=answer1]")).toBeVisible();
  await expect(page.locator("input[name=answer2]")).toBeVisible();
});

test("account page: profile, password and questions", async ({ page }) => {
  const username = uniqueName("acct");
  await register(page, username);
  await page.getByRole("link", { name: "Ravi Kumar" }).click();
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();

  const profile = page.locator("section", { has: page.getByRole("heading", { name: "Profile" }) });
  await profile.getByLabel("Your name").fill("Ravi K");
  await profile.getByLabel("Mobile number").fill("+91 98480 12345");
  await profile.getByRole("button", { name: "Save profile" }).click();
  await expect(profile.getByText("Profile saved.")).toBeVisible();
  await expect(profile.getByLabel("Mobile number")).toHaveValue("+91 98480 12345");

  const pw = page.locator("section", { has: page.getByRole("heading", { name: "Change password" }) });
  await pw.getByLabel("Current password", { exact: true }).fill("wrong-pass1");
  await pw.getByLabel("New password", { exact: true }).fill("changed123");
  await pw.getByLabel("Confirm new password", { exact: true }).fill("changed123");
  await pw.getByRole("button", { name: "Change password" }).click();
  await expect(pw.getByText("Current password is wrong.")).toBeVisible();
  await pw.getByLabel("Current password", { exact: true }).fill(PASSWORD);
  await pw.getByLabel("New password", { exact: true }).fill("changed123");
  await pw.getByLabel("Confirm new password", { exact: true }).fill("changed123");
  await pw.getByRole("button", { name: "Change password" }).click();
  await expect(pw.getByText(/Password changed/)).toBeVisible();

  const qs = page.locator("section", { has: page.getByRole("heading", { name: "Security questions" }) });
  await qs.getByLabel("Question 1").selectOption("nickname");
  await qs.getByLabel("Answer 1").fill("chinnu");
  await qs.getByLabel("Question 2").selectOption("first_trip_city");
  await qs.getByLabel("Answer 2").fill("Hyderabad");
  await qs.getByLabel("Current password", { exact: true }).fill("changed123");
  await qs.getByRole("button", { name: "Update questions" }).click();
  await expect(qs.getByText("Security questions updated.")).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Current: “What was your childhood nickname/)).toBeVisible();
  await logout(page);
  await login(page, username, "changed123");
  await expect(page.getByRole("heading", { name: "Hello, Ravi K" })).toBeVisible();
});

test("pages behind login redirect to the login page", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("temporary password must be replaced at first login", async ({ page }) => {
  // The head-created account flow arrives in M2; here the account is created directly in the test database.
  const username = uniqueName("kid");
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await pool.query(
    "insert into users (username, display_name, password_hash, must_change_password) values ($1, 'Kiran', $2, true)",
    [username, await hash("temp1234", { memoryCost: 19_456, timeCost: 2, parallelism: 1 })],
  );
  await pool.end();

  await login(page, username, "temp1234");
  await expect(page).toHaveURL(/\/first-login$/);
  await page.goto("/account"); // can't skip it
  await expect(page).toHaveURL(/\/first-login$/);

  await page.getByLabel("New password", { exact: true }).fill("kiran-own1");
  await page.getByLabel("Confirm new password", { exact: true }).fill("kiran-own1");
  await page.getByLabel("Question 1").selectOption("first_school");
  await page.getByLabel("Answer 1").fill("Little Flower");
  await page.getByLabel("Question 2").selectOption("nickname");
  await page.getByLabel("Answer 2").fill("Kittu");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Kiran" })).toBeVisible();
});

test("no sideways scrolling on the register page", async ({ page }) => {
  await page.goto("/register");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
