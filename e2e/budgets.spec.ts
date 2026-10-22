import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { formatMonth } from "../src/lib/format";
import { addMonths, monthOf, todayInIndia } from "../src/lib/rules/dates";
import { approve, askToJoin, closeExtraPages, createFamily, newUserPage, register, uniqueName } from "./helpers";

// M6 part 1 journeys: the head's budget page (family total + categories, fill in from last month, allowed
// months), budget status on the monthly view (normal / amber from 80% / red above 100%), and CSV downloads.

test.afterEach(closeExtraPages);

const thisMonth = monthOf(todayInIndia());
const lastMonth = addMonths(thisMonth, -1);

async function addExpense(page: Page, amount: string, options: { category?: string; note?: string } = {}) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Amount" }).fill(amount);
  if (options.category) await page.getByRole("combobox", { name: /^Category/ }).selectOption({ label: options.category });
  if (options.note) await page.getByLabel("Note").fill(options.note);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/^Added ₹/)).toBeVisible();
}

/** Opens the budget page for a month and waits for its form. */
async function openBudget(page: Page, month = thisMonth) {
  await page.goto(`/family/budget?month=${month}`);
  await expect(page.getByRole("heading", { name: `Budget for ${formatMonth(month)}` })).toBeVisible();
}

const box = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

async function saveBudget(page: Page, month = thisMonth) {
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(page.getByText(`Budget for ${formatMonth(month)} saved.`)).toBeVisible();
}

const monthBudget = (page: Page) => page.locator("[data-testid=month-budget]:visible");
const categoryRow = (page: Page, name: string) =>
  page.getByRole("region", { name: "By category" }).getByRole("listitem").filter({ hasText: name });

test("head sets a budget; the month shows amber from 80% and red when over; members see it", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  const code = await createFamily(page, "Kumar family");
  await addExpense(page, "500", { category: "Groceries" });
  await addExpense(page, "1200", { category: "Fuel & transport" });

  await page.goto("/month");
  await page.getByRole("link", { name: `Set a budget for ${formatMonth(thisMonth)} →` }).click();
  await expect(page.getByRole("heading", { name: `Budget for ${formatMonth(thisMonth)}` })).toBeVisible();
  await box(page, "Family total").fill("2000");
  await box(page, "Groceries").fill("600");
  await box(page, "Fuel & transport").fill("1,000");
  await box(page, "Milk & dairy").fill("300"); // budget, but nothing spent yet
  await saveBudget(page);

  await page.getByRole("link", { name: `See ${formatMonth(thisMonth)}'s spending →` }).click();
  await expect(monthBudget(page)).toHaveText("85% of ₹2,000.00 budget · ₹300.00 left");
  await expect(monthBudget(page)).toHaveAttribute("data-level", "near"); // amber
  await expect(categoryRow(page, "Fuel & transport")).toContainText("Over budget by ₹200.00");
  await expect(categoryRow(page, "Groceries")).toContainText("83% of ₹600.00 budget · ₹100.00 left");
  await expect(categoryRow(page, "Milk & dairy")).toContainText("0% of ₹300.00 budget · ₹300.00 left");
  await expect(categoryRow(page, "Milk & dairy")).toContainText("₹0.00");

  await addExpense(page, "400");
  await page.goto("/month");
  await expect(monthBudget(page)).toHaveText("Over budget by ₹100.00");
  await expect(monthBudget(page)).toHaveAttribute("data-level", "over"); // red
  await expect(page.getByRole("link", { name: "Change the budget →" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // A member sees the same status but can't set budgets.
  const member = await newUserPage(browser, baseURL, viewport);
  const memberName = uniqueName("sita");
  await register(member, memberName, "Sita");
  await askToJoin(member, code);
  await approve(page, memberName);
  await member.goto("/month");
  await expect(monthBudget(member)).toHaveText("Over budget by ₹100.00");
  await expect(member.getByRole("link", { name: "Change the budget →" })).toHaveCount(0);
  await member.goto("/family/budget");
  await expect(member.getByText("Only the family head sets budgets.")).toBeVisible();
  await expect(member.getByRole("button", { name: "Save budget" })).toHaveCount(0);
});

test("fill in from last month, a note when categories add up to more, wrong amounts, allowed months", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.goto("/family");
  await page.getByRole("link", { name: "Budget →" }).click();
  await expect(page.getByRole("heading", { name: `Budget for ${formatMonth(thisMonth)}` })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Fill in from/ })).toHaveCount(0); // last month has no budget

  await page.getByRole("link", { name: `← ${formatMonth(lastMonth)}` }).click();
  await expect(page.getByRole("heading", { name: `Budget for ${formatMonth(lastMonth)}` })).toBeVisible();
  await box(page, "Family total").fill("abc");
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(page.getByText("Enter an amount like 2500 or 2,500.50 (at most 2 decimals).")).toBeVisible();
  await box(page, "Family total").fill("5000");
  await box(page, "Groceries").fill("6000");
  await expect(page.getByText(/the category budgets add up to ₹6,000\.00, more than the family total of ₹5,000\.00/)).toBeVisible();
  await saveBudget(page, lastMonth);

  await page.getByRole("link", { name: `${formatMonth(thisMonth)} →` }).click();
  await expect(page.getByRole("heading", { name: `Budget for ${formatMonth(thisMonth)}` })).toBeVisible();
  await expect(box(page, "Family total")).toHaveValue("");
  await page.getByRole("button", { name: `Fill in from ${formatMonth(lastMonth)}` }).click();
  await expect(box(page, "Family total")).toHaveValue("5000");
  await expect(box(page, "Groceries")).toHaveValue("6000");
  await expect(page.getByText(`Filled in from ${formatMonth(lastMonth)} — not saved yet.`, { exact: false })).toBeVisible();
  await saveBudget(page);

  await page.goto("/month");
  await expect(page.getByRole("region", { name: "By category" })).toContainText(
    "Category budgets add up to ₹6,000.00, more than the family budget of ₹5,000.00.",
  );

  // Allowed months: 2 back to 12 ahead; anything else shows the current month.
  await openBudget(page, addMonths(thisMonth, 12));
  await expect(page.getByRole("link", { name: `${formatMonth(addMonths(thisMonth, 13))} →` })).toHaveCount(0);
  await page.goto(`/family/budget?month=${addMonths(thisMonth, -3)}`);
  await expect(page.getByRole("heading", { name: `Budget for ${formatMonth(thisMonth)}` })).toBeVisible();
});

test("download a month and a search as CSV for Excel; other people can't", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await addExpense(page, "2500.50", { category: "Groceries", note: "Milk, bread" });
  await addExpense(page, "70", { note: "=HYPERLINK(1)" });

  await page.goto("/month");
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV (Excel)" }).click();
  const monthFile = await downloading;
  expect(monthFile.suggestedFilename()).toMatch(/^expenses_\d{4}-\d{2}-01_to_\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile(await monthFile.path(), "utf8");
  const lines = csv.split("\r\n");
  expect(lines[0]).toBe("﻿Date,Member,Category,Payment mode,Amount (₹),Note,Receipt");
  expect(lines).toHaveLength(4); // header, 2 expenses, final empty line
  expect(csv).toContain(',Ravi,Groceries,,2500.50,"Milk, bread",\r\n');
  expect(csv).toContain(",Ravi,Uncategorised,,70.00,'=HYPERLINK(1),\r\n"); // formula made harmless

  // A search's download has the same filters as the results.
  await page.goto("/search");
  await page.getByRole("combobox", { name: /^Category/ }).selectOption({ label: "Groceries" });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("[data-testid=search-summary]:visible")).toHaveText("1 expense · ₹2,500.50");
  const link = page.getByRole("link", { name: "Download CSV (Excel)" });
  const href = (await link.getAttribute("href"))!;
  const searchDownload = page.waitForEvent("download");
  await link.click();
  const searchCsv = await readFile(await (await searchDownload).path(), "utf8");
  expect(searchCsv.split("\r\n")).toHaveLength(3); // header, 1 expense, final empty line

  // Someone outside the family gets "not found"; a logged-out visitor is asked to log in.
  const stranger = await newUserPage(browser, baseURL, viewport);
  await register(stranger, uniqueName("arun"), "Arun");
  expect((await stranger.request.get(href)).status()).toBe(404);
  const anonymous = await newUserPage(browser, baseURL, viewport);
  expect((await anonymous.request.get(href)).status()).toBe(401);
});
