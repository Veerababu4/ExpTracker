import { expect, test, type Page } from "@playwright/test";
import { formatMonth } from "../src/lib/format";
import { addDays, addMonths, firstOfMonth, monthOf, todayInIndia } from "../src/lib/rules/dates";
import { approve, askToJoin, closeExtraPages, createFamily, newUserPage, register, uniqueName } from "./helpers";

// M5 journeys: search between dates with filters (count + total for the whole result), date checks, and the
// monthly view with totals by category / member / payment mode and month-to-month navigation.

test.afterEach(closeExtraPages);

const today = todayInIndia();
const thisMonth = monthOf(today);

async function addExpense(page: Page, amount: string, options: { category?: string; mode?: string } = {}) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Amount" }).fill(amount);
  if (options.category) await page.getByRole("combobox", { name: /^Category/ }).selectOption({ label: options.category });
  if (options.mode) await page.getByRole("combobox", { name: /^Payment mode/ }).selectOption({ label: options.mode });
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/^Added ₹/)).toBeVisible();
}

/** Head with three expenses today: ₹500 Groceries (UPI), ₹1,200 Fuel (Card), ₹70 uncategorised. */
async function familyWithExpenses(page: Page) {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await addExpense(page, "500", { category: "Groceries", mode: "UPI" });
  await addExpense(page, "1200", { category: "Fuel & transport", mode: "Card" });
  await addExpense(page, "70");
}

function field(page: Page, name: "from" | "to") {
  return page.locator(`input[name=${name}]:visible`);
}

async function search(page: Page, filters: { from?: string; to?: string; category?: string; member?: string } = {}) {
  if (filters.from) await field(page, "from").fill(filters.from);
  if (filters.to) await field(page, "to").fill(filters.to);
  if (filters.category) await page.getByRole("combobox", { name: /^Category/ }).selectOption({ label: filters.category });
  if (filters.member) await page.getByRole("combobox", { name: /^Member/ }).selectOption({ label: filters.member });
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

// Next.js keeps the previous page mounted but hidden, so look at the visible copy only.
const summary = (page: Page) => page.locator("[data-testid=search-summary]:visible");
const monthTotal = (page: Page) => page.locator("[data-testid=month-total]:visible");

test("search between dates, filter by category; count and total for the whole result", async ({ page }) => {
  await familyWithExpenses(page);
  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
  await expect(field(page, "from")).toHaveValue(firstOfMonth(today));
  await expect(field(page, "to")).toHaveValue(today);
  await expect(summary(page)).toHaveCount(0); // nothing until "Search"

  await search(page, { from: addDays(today, -7) });
  await expect(summary(page)).toHaveText("3 expenses · ₹1,770.00");
  await expect(page).toHaveURL(/\/search\?from=.*&to=/);

  await search(page, { category: "Groceries" });
  await expect(summary(page)).toHaveText("1 expense · ₹500.00");
  await search(page, { category: "Uncategorised" });
  await expect(summary(page)).toHaveText("1 expense · ₹70.00");

  await page.goBack(); // the filters are in the address, so Back shows the previous search
  await expect(summary(page)).toHaveText("1 expense · ₹500.00");

  await page.getByRole("link", { name: "Clear" }).click();
  await expect(summary(page)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /^Category/ })).toHaveValue("");
});

test("wrong dates are explained", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.goto("/search");

  await search(page, { from: today, to: addDays(today, -1) });
  await expect(page.getByText("To must be on or after From.")).toBeVisible();
  await search(page, { from: today, to: addDays(today, 1) });
  await expect(page.getByText("To can't be after today.")).toBeVisible();
  await search(page, { from: addDays(today, -366), to: today });
  await expect(page.getByText("Search at most one year (366 days) at a time.")).toBeVisible();
  await expect(summary(page)).toHaveCount(0);

  await search(page, { from: addDays(today, -365), to: today }); // exactly 366 days is fine
  await expect(summary(page)).toHaveText("0 expenses · ₹0.00");
  await expect(page.getByText("No expenses match this search.")).toBeVisible();
});

test("everyone sees the family's expenses; filter by member", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  const code = await createFamily(page, "Kumar family");
  const member = await newUserPage(browser, baseURL, viewport);
  const memberName = uniqueName("sita");
  await register(member, memberName, "Sita");
  await askToJoin(member, code);
  await approve(page, memberName);

  await addExpense(page, "800");
  await addExpense(member, "250");

  await member.goto("/search");
  await search(member);
  await expect(summary(member)).toHaveText("2 expenses · ₹1,050.00"); // the head's expense too
  await search(member, { member: "Ravi" });
  await expect(summary(member)).toHaveText("1 expense · ₹800.00");
  await expect(member.getByRole("region", { name: "Results" }).getByText("Ravi")).toBeVisible();
});

test("monthly view: totals by category, member and payment mode; move between months", async ({ page }) => {
  await familyWithExpenses(page);
  await page.getByRole("link", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/month/${thisMonth}$`));
  await expect(page.getByRole("heading", { name: formatMonth(thisMonth), level: 1 })).toBeVisible();
  await expect(monthTotal(page)).toHaveText("₹1,770.00");

  const byCategory = page.getByRole("region", { name: "By category" });
  const rows = byCategory.getByRole("listitem");
  await expect(rows).toHaveCount(3); // Fuel, Groceries, Uncategorised — biggest first
  await expect(rows.nth(0)).toContainText("Fuel & transport");
  await expect(rows.nth(0)).toContainText("₹1,200.00");
  await expect(rows.nth(0)).toContainText("68%");
  await expect(rows.nth(2)).toContainText("Uncategorised");
  await expect(page.getByRole("region", { name: "By member" })).toContainText("₹1,770.00");
  await expect(page.getByRole("region", { name: "By payment mode" })).toContainText("Not specified");
  await expect(page.getByRole("region", { name: "All expenses" }).getByText("Total (3 expenses)")).toBeVisible();

  // A breakdown row opens the matching search.
  await byCategory.getByRole("link", { name: "Groceries" }).click();
  await expect(summary(page)).toHaveText("1 expense · ₹500.00");

  // Previous month is empty; the current month has no "next".
  await page.goto(`/month/${thisMonth}`);
  await expect(page.getByRole("link", { name: `${formatMonth(addMonths(thisMonth, 1))} →` })).toHaveCount(0);
  await page.getByRole("link", { name: `← ${formatMonth(addMonths(thisMonth, -1))}` }).click();
  await expect(page.getByRole("heading", { name: formatMonth(addMonths(thisMonth, -1)), level: 1 })).toBeVisible();
  await expect(monthTotal(page)).toHaveText("₹0.00");
  await expect(page.getByText(`No expenses in ${formatMonth(addMonths(thisMonth, -1))}.`)).toBeVisible();
  await page.getByRole("link", { name: "This month" }).click();
  await expect(monthTotal(page)).toHaveText("₹1,770.00");

  // Jump to a month with the picker.
  const target = addMonths(thisMonth, -5);
  await page.getByLabel("Go to month").fill(target);
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByRole("heading", { name: formatMonth(target), level: 1 })).toBeVisible();

  // Future months don't exist.
  await page.goto(`/month/${addMonths(thisMonth, 1)}`);
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
});

test("month page fits a phone screen", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await addExpense(page, "23500", { category: "Utilities (power, water, gas)", mode: "Net banking" }); // long names
  await page.goto("/month");
  await expect(monthTotal(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
