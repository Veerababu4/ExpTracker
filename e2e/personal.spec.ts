import { expect, test, type Page } from "@playwright/test";
import { formatMonth } from "../src/lib/format";
import { monthOf, todayInIndia } from "../src/lib/rules/dates";
import { approve, askToJoin, closeExtraPages, createFamily, expectHome, memberRow, newUserPage, register, uniqueName } from "./helpers";

// M8 journeys (DESIGN §3.8): the home page for visitors, My expenses for everyone, and sharing with a family
// month by month.

test.afterEach(closeExtraPages);

const thisMonth = formatMonth(monthOf(todayInIndia()));

async function addExpense(page: Page, amount: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Amount" }).fill(amount);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/^Added ₹/)).toBeVisible();
}

async function monthTotal(page: Page) {
  await page.goto(`/month/${monthOf(todayInIndia())}`);
  return page.getByTestId("month-total");
}

test("visitors get the home page with quotes and the savings calculator", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: /Track your personal or family expenses/, level: 1 })).toBeVisible();

  const quotes = page.getByRole("region", { name: "Money wisdom" });
  const first = await quotes.locator("blockquote").innerText();
  await quotes.getByRole("button", { name: "Next quote" }).click();
  await expect(quotes.locator("blockquote")).not.toHaveText(first);
  await quotes.getByRole("button", { name: "Previous quote" }).click();
  await expect(quotes.locator("blockquote")).toHaveText(first);

  await page.getByRole("slider", { name: /Save every day/ }).fill("50");
  await expect(page.getByTestId("calc-month")).toHaveText("₹1,500");
  await expect(page.getByTestId("calc-year")).toHaveText("₹18,250");

  await page.getByRole("link", { name: "Start for free" }).click();
  await expect(page).toHaveURL(/\/register$/);
});

test("a new account has My expenses: add, see the month, a thought for today", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await expect(page.getByText("Your own book, My expenses, is ready", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Start adding my expenses →" }).click();
  await expect(page.getByTestId("saves-to")).toContainText("Saves to My expenses — only you can see it.");
  await expect(page.getByTestId("daily-quote")).toContainText("Thought for today");

  await addExpense(page, "250");
  await expect(await monthTotal(page)).toHaveText("₹250.00");
  await expect(page.getByRole("heading", { name: "By member" })).toHaveCount(0); // just me
});

test("sharing: personal by default, include from this month (it moves along), then stop", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  const code = await createFamily(page, "Kumar family", false);
  const member = await newUserPage(browser, baseURL, viewport);
  const memberName = uniqueName("sita");
  await register(member, memberName, "Sita");
  await askToJoin(member, code, false);
  await approve(page, memberName);
  await expect(memberRow(page, memberName).getByTestId("member-sharing")).toHaveText("Personal only");

  // Unticked: Sita's expense stays in My expenses; the family sees nothing.
  await addExpense(member, "400");
  await expect(member.getByTestId("saves-to")).toContainText("Saves to My expenses");
  await expect(await monthTotal(page)).toHaveText("₹0.00");

  // Sita includes her expenses: this month's one moves into the family.
  await member.goto("/family");
  await expect(member.getByTestId("sharing-status")).toContainText(`In ${thisMonth} your expenses are personal only`);
  await member.getByRole("button", { name: "Include my expenses in Kumar family" }).click();
  await expect(member.getByText(`1 expense (₹400.00) from ${thisMonth} moves too.`, { exact: false })).toBeVisible();
  await member.getByRole("button", { name: "Yes, include them" }).click();
  await expect(member.getByTestId("sharing-status")).toContainText(`In ${thisMonth} your expenses go to Kumar family`);
  await expect(await monthTotal(page)).toHaveText("₹400.00");
  await page.goto("/family");
  await expect(memberRow(page, memberName).getByTestId("member-sharing")).toHaveText(`Sharing since ${thisMonth}`);

  await addExpense(member, "100");
  await expect(member.getByTestId("saves-to")).toContainText("Saves to Kumar family");
  await expect(await monthTotal(page)).toHaveText("₹500.00");

  // My expenses still shows all of hers — kept in the family this month (P8).
  await member.locator("#family-switcher").selectOption({ label: "My expenses" });
  await expectHome(member, "My expenses");
  await expect(await monthTotal(member)).toHaveText("₹500.00");
  await expect(member.getByRole("region", { name: "Where" })).toContainText("Kumar family");

  // From My expenses, she stops sharing: both move back.
  await member.goto("/family");
  await member.getByRole("button", { name: "Stop including my expenses in Kumar family" }).click();
  await member.getByRole("button", { name: "Yes, personal only" }).click();
  await expect(member.getByTestId("sharing-status")).toContainText("personal only");
  await expect(await monthTotal(page)).toHaveText("₹0.00");
  await expect(await monthTotal(member)).toHaveText("₹500.00");
  await page.goto("/family");
  await expect(memberRow(page, memberName).getByTestId("member-sharing")).toHaveText(`Personal only since ${thisMonth}`);
});
