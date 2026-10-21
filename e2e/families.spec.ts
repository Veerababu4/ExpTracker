import { expect, test } from "@playwright/test";
import { askToJoin, closeExtraPages, createFamily, expectHome, login, logout, memberRow, newUserPage, register, uniqueName } from "./helpers";

// M2 journeys: create a family, join with a code and approval, head-created logins, password reset,
// head transfer, remove/leave, and switching between families.

test.afterEach(closeExtraPages);

test("create a family, join with the code, head approves", async ({ page, browser, baseURL, viewport }) => {
  const headName = uniqueName("ravi");
  await register(page, headName, "Ravi");
  await expect(page.getByRole("heading", { name: "Welcome, Ravi" })).toBeVisible();
  const code = await createFamily(page, "Kumar family");
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const member = await newUserPage(browser, baseURL, viewport);
  const memberName = uniqueName("sita");
  await register(member, memberName, "Sita");
  await askToJoin(member, "WRONGCDE");
  await expect(member.getByText(/No family has this code|Family codes have 8/)).toBeVisible();
  await askToJoin(member, code);
  await expect(member.getByText("Request sent to “Kumar family”.", { exact: false })).toBeVisible();
  await expect(member.getByText("Waiting for approval")).toBeVisible();
  await member.goto("/");
  await expect(member).toHaveURL(/\/welcome$/); // no access yet

  await page.goto("/family");
  const request = memberRow(page, memberName);
  await expect(request).toContainText("Sita");
  await request.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No pending requests.")).toBeVisible();
  await expect(memberRow(page, memberName)).toContainText("Joined");

  await member.goto("/");
  await expectHome(member, "Kumar family");
  await member.goto("/family");
  await expect(member.getByTestId("join-code")).toHaveCount(0); // members don't see the code
  await expect(member.getByRole("button", { name: "Remove" })).toHaveCount(0);
});

test("head rejects a request; the user can cancel and ask again", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  const code = await createFamily(page, "Rao family");

  const member = await newUserPage(browser, baseURL, viewport);
  const memberName = uniqueName("anil");
  await register(member, memberName, "Anil");
  await askToJoin(member, code);
  await page.goto("/family");
  await memberRow(page, memberName).getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("No pending requests.")).toBeVisible();

  await member.reload();
  await expect(member.getByText("Not approved")).toBeVisible();
  await askToJoin(member, code);
  await expect(member.getByText("Waiting for approval")).toBeVisible();
  await member.getByRole("button", { name: "Cancel" }).click();
  await expect(member.getByText("Cancelled").first()).toBeVisible();
});

test("head creates a login; the member sets their own password at first login", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.getByRole("link", { name: "+ Create a login for a family member" }).click();

  const kid = uniqueName("kiran");
  await page.getByRole("textbox", { name: "Username" }).fill(kid);
  await page.getByLabel("Their name").fill("Kiran");
  await page.getByRole("button", { name: "Suggest one" }).click();
  const temp = await page.getByLabel("Temporary password").inputValue();
  expect(temp).toMatch(/^[a-z]{6}[2-9]{4}$/);
  await page.getByRole("button", { name: "Create login" }).click();
  await expect(page.getByText(`Login created for Kiran.`, { exact: false })).toBeVisible();

  const member = await newUserPage(browser, baseURL, viewport);
  await login(member, kid, temp);
  await expect(member).toHaveURL(/\/first-login$/);
  await member.getByLabel("New password", { exact: true }).fill("kiran-own1");
  await member.getByLabel("Confirm new password", { exact: true }).fill("kiran-own1");
  await member.getByLabel("Question 1").selectOption("nickname");
  await member.getByLabel("Answer 1").fill("Kittu");
  await member.getByLabel("Question 2").selectOption("first_school");
  await member.getByLabel("Answer 2").fill("Little Flower");
  await member.getByRole("button", { name: "Save and continue" }).click();
  await expectHome(member, "Kumar family");
});

test("head resets a member's password, signing them out", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  const code = await createFamily(page, "Kumar family");
  const member = await newUserPage(browser, baseURL, viewport);
  const memberName = uniqueName("sita");
  await register(member, memberName, "Sita");
  await askToJoin(member, code);
  await page.goto("/family");
  await memberRow(page, memberName).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No pending requests.")).toBeVisible();

  const row = memberRow(page, memberName);
  await row.getByRole("button", { name: "Reset password" }).click();
  await row.getByLabel("Temporary password for Sita").fill("reset1234");
  await row.getByRole("button", { name: "Reset password" }).last().click();
  await expect(row.getByText("Password reset.", { exact: false })).toBeVisible();

  await member.goto("/family");
  await expect(member).toHaveURL(/\/login$/); // signed out everywhere
  await login(member, memberName, "reset1234");
  await expect(member).toHaveURL(/\/first-login$/);
  await expect(member.getByLabel("Question 1")).toHaveCount(0); // already has questions
  await member.getByLabel("New password", { exact: true }).fill("sita-new12");
  await member.getByLabel("Confirm new password", { exact: true }).fill("sita-new12");
  await member.getByRole("button", { name: "Save and continue" }).click();
  await expectHome(member, "Kumar family");
});

test("transfer head, then the old head can leave; head removes a member", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  const code = await createFamily(page, "Kumar family");
  const sita = await newUserPage(browser, baseURL, viewport);
  const sitaName = uniqueName("sita");
  await register(sita, sitaName, "Sita");
  await askToJoin(sita, code);
  await page.goto("/family");
  await memberRow(page, sitaName).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No pending requests.")).toBeVisible();

  await expect(page.getByText("As the head you can't leave directly.", { exact: false })).toBeVisible();
  const row = memberRow(page, sitaName);
  await row.getByRole("button", { name: "Make head" }).click();
  await row.getByRole("button", { name: "Yes, make head" }).click();
  await expect(page.getByText("You are a member")).toBeVisible();

  await sita.goto("/family");
  await expect(sita.getByText("You are the family head")).toBeVisible();
  await expect(sita.getByTestId("join-code")).toBeVisible();

  // The old head (now a member) leaves.
  await page.getByRole("button", { name: "Leave family" }).click();
  await page.getByRole("button", { name: "Yes, leave" }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  // New head removes nobody else is left but herself — invite and remove a third person.
  const anil = await newUserPage(browser, baseURL, viewport);
  const anilName = uniqueName("anil");
  await register(anil, anilName, "Anil");
  await askToJoin(anil, code);
  await sita.goto("/family");
  await memberRow(sita, anilName).getByRole("button", { name: "Approve" }).click();
  await expect(sita.getByText("No pending requests.")).toBeVisible();
  const anilRow = memberRow(sita, anilName);
  await anilRow.getByRole("button", { name: "Remove" }).click();
  await anilRow.getByRole("button", { name: "Yes, remove" }).click();
  await expect(memberRow(sita, anilName)).toHaveCount(0);
  await anil.goto("/");
  await expect(anil).toHaveURL(/\/welcome$/);
});

test("one person in two families switches between them", async ({ page, browser, baseURL, viewport }) => {
  const sitaName = uniqueName("sita");
  await register(page, sitaName, "Sita");
  await createFamily(page, "Parents");

  const ravi = await newUserPage(browser, baseURL, viewport);
  await register(ravi, uniqueName("ravi"), "Ravi");
  const code = await createFamily(ravi, "Ravi & Sita");
  await askToJoin(page, code);
  await ravi.goto("/family");
  await memberRow(ravi, sitaName).getByRole("button", { name: "Approve" }).click();
  await expect(ravi.getByText("No pending requests.")).toBeVisible();

  await page.goto("/");
  const switcher = page.getByLabel("Family", { exact: true });
  await expect(switcher).toBeVisible();
  await switcher.selectOption({ label: "Ravi & Sita" });
  await expectHome(page, "Ravi & Sita");
  await page.getByLabel("Family", { exact: true }).selectOption({ label: "Parents" });
  await expectHome(page, "Parents");

  // The choice is remembered after logging in again.
  await page.getByLabel("Family", { exact: true }).selectOption({ label: "Ravi & Sita" });
  await expectHome(page, "Ravi & Sita");
  await logout(page);
  await login(page, sitaName);
  await expectHome(page, "Ravi & Sita");
});

test("members can't open head-only pages", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  const code = await createFamily(page, "Kumar family");
  const member = await newUserPage(browser, baseURL, viewport);
  const memberName = uniqueName("sita");
  await register(member, memberName, "Sita");
  await askToJoin(member, code);
  await page.goto("/family");
  await memberRow(page, memberName).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No pending requests.")).toBeVisible();

  await member.goto("/family/add-member");
  await expect(member.getByText("Only the family head can create logins")).toBeVisible();
  await expect(member.getByRole("button", { name: "Create login" })).toHaveCount(0);
});

test("family page fits a phone screen", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "A family with a fairly long name");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
