import { expect, test, type Page } from "@playwright/test";
import { addDays, editWindow, todayInIndia } from "../src/lib/rules/dates";
import { approve, askToJoin, closeExtraPages, createFamily, newUserPage, register, uniqueName } from "./helpers";

// M3 journeys: add expenses, live high-value alerts, edit/delete with the date windows, head powers,
// categories and per-member alert limits.

test.afterEach(closeExtraPages);

const today = todayInIndia();

// Next.js keeps the previous page mounted but hidden, so locate visible fields only.
function amountBox(page: Page) {
  return page.getByRole("textbox", { name: "Amount" });
}
function dateBox(page: Page) {
  return page.locator("input[name=expenseDate]:visible");
}
function categoryBox(page: Page) {
  return page.getByRole("combobox", { name: /^Category/ });
}
function modeBox(page: Page) {
  return page.getByRole("combobox", { name: /^Payment mode/ });
}

async function addExpense(page: Page, amount: string, options: { category?: string; mode?: string; note?: string; date?: string } = {}) {
  await page.goto(options.date ? `/?date=${options.date}` : "/");
  if (options.date) await dateBox(page).fill(options.date);
  await amountBox(page).fill(amount);
  if (options.category) await categoryBox(page).selectOption({ label: options.category });
  if (options.mode) await modeBox(page).selectOption({ label: options.mode });
  if (options.note) await page.getByLabel("Note").fill(options.note);
  await page.getByRole("button", { name: "Save expense" }).click();
}

/** Head + approved member, each in their own browser session. */
async function familyOfTwo(page: Page, browser: Parameters<typeof newUserPage>[0], baseURL?: string, viewport?: { width: number; height: number } | null) {
  await register(page, uniqueName("ravi"), "Ravi");
  const code = await createFamily(page, "Kumar family");
  const member = await newUserPage(browser, baseURL, viewport ?? null);
  const memberName = uniqueName("sita");
  await register(member, memberName, "Sita");
  await askToJoin(member, code);
  await approve(page, memberName);
  return { member, memberName };
}

test("add an expense and see it in today's list", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.getByRole("link", { name: "Add", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();
  await expect(dateBox(page)).toHaveValue(today);
  await expect(page.getByLabel("Currency")).toHaveValue("INR");
  await expect(page.getByLabel("Currency")).toHaveAttribute("readonly", "");

  await addExpense(page, "1,250.50", { category: "Groceries", mode: "UPI", note: "DMart" });
  await expect(page.getByText(/^Added ₹1,250\.50 on /)).toBeVisible();
  await expect(amountBox(page)).toHaveValue(""); // ready for the next one
  await expect(dateBox(page)).toHaveValue(today); // date kept

  const list = page.locator("#day-title").locator("..");
  await expect(list.getByText("Groceries")).toBeVisible();
  await expect(list.getByText("UPI · DMart")).toBeVisible();
  await expect(list.getByText("Total (1 expense)")).toBeVisible();

  await addExpense(page, "100");
  await expect(list.getByText("Uncategorised")).toBeVisible();
  await expect(list.getByText("Total (2 expenses)")).toBeVisible();
  await expect(list.getByText("₹1,350.50")).toBeVisible();
});

test("high-value alerts appear while typing", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.goto("/");
  const alert = page.locator("[data-alert-level]");

  await amountBox(page).fill("2000");
  await expect(alert).toHaveAttribute("data-alert-level", "none");
  await amountBox(page).fill("2,000.01");
  await expect(page.getByText("⚠ This is a high-value expense.")).toBeVisible();
  await amountBox(page).fill("20000");
  await expect(page.getByText("⚠ This is a high-value expense.")).toBeVisible(); // exactly ₹20,000 is not "very high"
  await amountBox(page).fill("25000");
  const veryHigh = page.getByText("⚠ Very high expense — ₹25,000.00. Please double-check before saving.");
  await expect(veryHigh).toBeVisible();
  await expect(veryHigh).toHaveClass(/alert-blink/);
  await expect(page.getByText("This is a high-value expense.")).toHaveCount(0);
  await amountBox(page).fill("");
  await expect(alert).toHaveAttribute("data-alert-level", "none");

  // Saving is never blocked; the saved expense carries a "High" tag.
  await amountBox(page).fill("25000");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/^Added ₹25,000\.00/)).toBeVisible();
  await expect(page.getByText("High", { exact: true })).toBeVisible();
});

test("with 'reduce motion' the very-high warning doesn't blink", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.goto("/");
  await amountBox(page).fill("50000");
  const veryHigh = page.getByText(/Very high expense/);
  await expect(veryHigh).toBeVisible();
  expect(await veryHigh.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("edit and delete; the head sees the change log", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await addExpense(page, "250", { category: "Milk & dairy" });
  await page.getByRole("link", { name: /Milk & dairy/ }).click();
  await expect(page.getByRole("heading", { name: "₹250.00" })).toBeVisible();
  await expect(page).toHaveURL(/\/expenses\//);

  await amountBox(page).fill("300");
  await modeBox(page).selectOption({ label: "Cash" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/^Saved: ₹300\.00/)).toBeVisible();
  const log = page.locator("#log-title").locator("..");
  await expect(log.getByText("Amount: ₹250.00 → ₹300.00")).toBeVisible();
  await expect(log.getByText("Payment mode: Not specified → Cash")).toBeVisible();
  await expect(log.getByText("Added", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete expense" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("Expense deleted.")).toBeVisible();
  await expect(page.getByText("Nothing added for this date yet.")).toBeVisible();
});

test("members change only their own; the head can change a member's", async ({ page, browser, baseURL, viewport }) => {
  const { member } = await familyOfTwo(page, browser, baseURL, viewport);

  // The head's expense is read-only for the member.
  await addExpense(page, "999", { category: "Travel" });
  await page.getByRole("link", { name: /Travel/ }).click();
  await expect(page).toHaveURL(/\/expenses\//);
  const headsExpenseUrl = page.url();
  await member.goto(headsExpenseUrl);
  await expect(member.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(member.getByText("Only the person who added it (or the family head) can change it.")).toBeVisible();
  await expect(member.getByRole("button", { name: "Save changes" })).toHaveCount(0);

  // The member's expense can be fixed by the head; it stays the member's.
  await addExpense(member, "450", { category: "Dining out" });
  await member.getByRole("link", { name: /Dining out/ }).click();
  await expect(member).toHaveURL(/\/expenses\//);
  await page.goto(member.url());
  await expect(page.getByText("You're changing Sita's expense as family head.", { exact: false })).toBeVisible();
  await amountBox(page).fill("540");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/^Saved: ₹540\.00/)).toBeVisible();
  await expect(page.getByText(/· added by Sita$/)).toBeVisible(); // the subtitle, not the change log's "Added by"

  await member.reload();
  await expect(member.getByRole("heading", { name: "₹540.00" })).toBeVisible();
  await expect(member.getByRole("heading", { name: "Change log" })).toHaveCount(0); // head only
});

test("dates outside the person's window are refused", async ({ page, browser, baseURL, viewport }) => {
  const { member } = await familyOfTwo(page, browser, baseURL, viewport);
  const memberWindow = editWindow("MEMBER", today);
  const headWindow = editWindow("HEAD", today);

  await member.goto("/");
  await expect(dateBox(member)).toHaveAttribute("min", memberWindow.from);
  await expect(dateBox(member)).toHaveAttribute("max", today);

  // Typed past the date picker's limits, the server still refuses.
  await dateBox(member).fill(addDays(memberWindow.from, -1));
  await amountBox(member).fill("100");
  await member.getByRole("button", { name: "Save expense" }).click();
  await expect(member.getByText(/You can only add or change expenses dated from/)).toBeVisible();

  await dateBox(member).fill(addDays(today, 1));
  await amountBox(member).fill("100");
  await member.getByRole("button", { name: "Save expense" }).click();
  await expect(member.getByText("The date can't be in the future.")).toBeVisible();

  // The head reaches back further (current month + 2 before).
  await page.goto("/");
  await expect(dateBox(page)).toHaveAttribute("min", headWindow.from);
  await dateBox(page).fill(headWindow.from);
  await amountBox(page).fill("100");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/^Added ₹100\.00/)).toBeVisible();
});

test("head adds and hides categories", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.getByRole("link", { name: "Categories →" }).click();

  await page.getByLabel("Category name").fill("School fees");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Added “School fees”.")).toBeVisible();
  await page.getByLabel("Category name").fill("school FEES");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("There's already a category with this name.")).toBeVisible();

  const groceries = page.getByTestId("category-row").filter({ hasText: /^Groceries/ });
  await groceries.getByRole("button", { name: "Hide" }).click();
  await expect(groceries.getByText("Hidden")).toBeVisible();

  await page.goto("/");
  const options = categoryBox(page).locator("option");
  await expect(options.filter({ hasText: "School fees" })).toHaveCount(1);
  await expect(options.filter({ hasText: /^Groceries$/ })).toHaveCount(0);
});

test("head sets a member's alert limits", async ({ page, browser, baseURL, viewport }) => {
  const { member } = await familyOfTwo(page, browser, baseURL, viewport);
  await page.goto("/family/limits");
  const sita = page.getByRole("form", { name: "Alert limits for Sita" });
  await sita.getByLabel("High-value limit (₹)").fill("500");
  await sita.getByLabel("Very-high limit (₹)").fill("400");
  await sita.getByRole("button", { name: "Save limits" }).click();
  await expect(sita.getByText("The very-high limit must be more than the high-value limit.")).toBeVisible();
  await sita.getByLabel("Very-high limit (₹)").fill("5,000");
  await sita.getByRole("button", { name: "Save limits" }).click();
  await expect(sita.getByText("Saved.")).toBeVisible();

  await member.goto("/");
  await amountBox(member).fill("600");
  await expect(member.getByText("⚠ This is a high-value expense.")).toBeVisible();
  await amountBox(member).fill("6000");
  await expect(member.getByText(/Very high expense — ₹6,000\.00/)).toBeVisible();

  await member.goto("/family/limits");
  await expect(member.getByText("above ₹500.00")).toBeVisible();
  await expect(member.getByRole("button", { name: "Save limits" })).toHaveCount(0);

  // Reset brings back the defaults.
  await sita.getByRole("button", { name: "Reset to default" }).click();
  await expect(sita.getByText("Back to the default limits.")).toBeVisible();
  await expect(sita.getByLabel("High-value limit (₹)")).toHaveValue("2000");
  await expect(sita.getByRole("button", { name: "Reset to default" })).toHaveCount(0);

  // The head's own limits are still the defaults.
  await page.goto("/");
  await amountBox(page).fill("6000");
  await expect(page.getByText("⚠ This is a high-value expense.")).toBeVisible();
});

test("add page fits a phone screen", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.goto("/");
  await amountBox(page).fill("99999");
  await expect(page.getByText(/Very high expense/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
