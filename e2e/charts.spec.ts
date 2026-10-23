import { expect, test, type Page } from "@playwright/test";
import { formatIsoDay, formatMonth } from "../src/lib/format";
import { addMonths, monthOf, todayInIndia } from "../src/lib/rules/dates";
import { closeExtraPages, createFamily, register, shareSince, uniqueName } from "./helpers";

// M6 part 2 journeys: the month's charts (category bars on one scale with budget ticks, day by day, last 6
// months — each with a summary, links, a tooltip and a table) and the phones' bottom bar.

test.afterEach(closeExtraPages);

const today = todayInIndia();
const thisMonth = monthOf(today);
const lastMonth = addMonths(thisMonth, -1);

async function addExpense(page: Page, amount: string, options: { category?: string; date?: string } = {}) {
  await page.goto("/");
  if (options.date) await page.getByLabel("Date", { exact: true }).fill(options.date);
  await page.getByRole("textbox", { name: "Amount" }).fill(amount);
  if (options.category) await page.getByRole("combobox", { name: /^Category/ }).selectOption({ label: options.category });
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/^Added ₹/)).toBeVisible();
}

async function setBudget(page: Page, amounts: Record<string, string>) {
  await page.goto(`/family/budget?month=${thisMonth}`);
  for (const [name, value] of Object.entries(amounts)) await page.getByRole("textbox", { name, exact: true }).fill(value);
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(page.getByText(`Budget for ${formatMonth(thisMonth)} saved.`)).toBeVisible();
}

test("month charts: category bars with budget ticks, day by day and last 6 months, each with a table", async ({ page }) => {
  const head = uniqueName("ravi");
  await register(page, head, "Ravi");
  await createFamily(page, "Kumar family");
  await shareSince(head, lastMonth); // so last month's expense is in the family too (M8)
  await addExpense(page, "500", { category: "Groceries" });
  await addExpense(page, "1200", { category: "Fuel & transport" });
  await addExpense(page, "900", { date: `${lastMonth}-15` }); // the head may use the last 2 months
  await setBudget(page, { "Family total": "3000", Groceries: "600" });

  await page.goto("/month");
  const byCategory = page.getByRole("region", { name: "By category" });
  await expect(byCategory.getByRole("listitem")).toHaveCount(2);
  await expect(byCategory.locator("[data-testid=budget-tick]")).toHaveCount(1); // only Groceries has a budget

  // Day by day: summary, a column per day with spending that opens that day's search, tooltip, table.
  const daily = page.getByRole("region", { name: "Day by day" });
  await expect(daily).toContainText(`Highest: ₹1,700.00 on ${formatIsoDay(today)}`);
  const todayColumn = daily.getByRole("link", { name: `${formatIsoDay(today)}: ₹1,700.00, 2 expenses` });
  await todayColumn.hover();
  await expect(page.locator("[data-testid=chart-tip]:visible")).toHaveText(`₹1,700.00 ${formatIsoDay(today)} · 2 expenses`);
  await daily.getByText("Show as table").click();
  await expect(daily.getByRole("row", { name: `${formatIsoDay(today)} 2 ₹1,700.00` })).toBeVisible();

  // Last 6 months: this month vs last, budget in the legend and the table, earlier months open their page.
  const trend = page.getByRole("region", { name: "Last 6 months" });
  await expect(trend).toContainText(`₹1,700.00 in ${formatMonth(thisMonth)} — ₹800.00 more than ${formatMonth(lastMonth)}`);
  await expect(trend.getByRole("list", { name: "Legend" })).toContainText("Family budget");
  await trend.getByText("Show as table").click();
  await expect(trend.getByRole("row", { name: `${formatMonth(thisMonth)} ₹1,700.00 ₹3,000.00` })).toBeVisible();
  await expect(trend.getByRole("row", { name: `${formatMonth(lastMonth)} ₹900.00 —` })).toBeVisible();

  await todayColumn.click();
  await expect(page.locator("[data-testid=search-summary]:visible")).toHaveText("2 expenses · ₹1,700.00");

  await page.goto("/month");
  await page.getByRole("region", { name: "Last 6 months" }).getByRole("link", { name: `${formatMonth(lastMonth)}: ₹900.00` }).click();
  await expect(page.getByRole("heading", { name: formatMonth(lastMonth), level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Last 6 months" })).toContainText(`₹900.00 in ${formatMonth(lastMonth)}`);
});

test("phones use the bottom bar; wider screens keep the links in the header", async ({ page, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  const bottomBar = page.getByRole("navigation", { name: "Pages" });
  const header = page.getByRole("navigation", { name: "Main" });

  if ((viewport?.width ?? 1280) < 640) {
    await expect(bottomBar).toBeVisible();
    await expect(header.getByRole("link", { name: "Month", exact: true })).toHaveCount(0);
    await bottomBar.getByRole("link", { name: "Month" }).click();
    await expect(page).toHaveURL(new RegExp(`/month/${thisMonth}$`));
    await expect(bottomBar.getByRole("link", { name: "Month" })).toHaveAttribute("aria-current", "page");
    await expect(bottomBar.getByRole("link", { name: "Add" })).not.toHaveAttribute("aria-current", "page");
  } else {
    await expect(bottomBar).toBeHidden();
    await header.getByRole("link", { name: "Month", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/month/${thisMonth}$`));
  }
});

test("every main page fits a 360 px phone and nothing hides behind the bottom bar", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await addExpense(page, "23500", { category: "Utilities (power, water, gas)" }); // long name, big number
  await addExpense(page, "70");
  await setBudget(page, { "Family total": "20000", "Utilities (power, water, gas)": "15000" });

  // /month itself forwards to the current month after loading, so go straight there.
  for (const path of ["/", `/month/${thisMonth}`, "/search", "/family", "/family/budget"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Pages" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `sideways scrolling on ${path}`).toBeLessThanOrEqual(0);
  }

  // The last thing on the month page can be scrolled clear of the bar.
  await page.goto(`/month/${thisMonth}`);
  const total = page.getByRole("region", { name: "All expenses" }).getByText("Total (2 expenses)");
  await expect(total).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bar = await page.getByRole("navigation", { name: "Pages" }).boundingBox();
  const last = await total.boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(bar!.y);
});
