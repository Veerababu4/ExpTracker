import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { closeExtraPages, createFamily, logout, newUserPage, register, uniqueName } from "./helpers";

// M4 journeys: attach a receipt while adding (photos are shrunk in the browser), view it, replace it with a
// PDF, remove it; only the family can open it; the site admin turns receipts off and on.

test.afterEach(closeExtraPages);

/** A plain-colour PNG of any size (big pictures with tiny files, to check the shrinking). */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x60)]);
  const pixels = Buffer.concat(new Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

/** The file input; it's enabled once the page's script is running (a file picked earlier would be lost). */
async function picker(page: Page) {
  const input = page.getByLabel("Attach photo or PDF");
  await expect(input).toBeEnabled();
  return input;
}

async function addWithReceipt(page: Page, amount: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Amount" }).fill(amount);
  await (await picker(page)).setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: png(3000, 2000) });
  await expect(page.getByTestId("picked-receipt")).toContainText("made smaller for upload");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(new RegExp(`^Added ₹${amount}\\.00 on .* with receipt\\.$`))).toBeVisible();
}

/** Opens the expense from today's list and returns the receipt's address. */
async function openExpense(page: Page, amount: string): Promise<string> {
  await page.getByRole("link", { name: new RegExp(`₹${amount}`) }).click();
  await expect(page.getByRole("heading", { name: `₹${amount}.00` })).toBeVisible();
  const photo = page.getByRole("img", { name: "Receipt photo" });
  await expect(photo).toBeVisible();
  return (await photo.getAttribute("src"))!;
}

test("attach a photo while adding: shrunk in the browser, shown on the expense", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await addWithReceipt(page, "450");
  await expect(page.getByTestId("picked-receipt")).toHaveCount(0); // a fresh form for the next one
  await expect(page.getByText("📎 Receipt")).toBeVisible();

  const src = await openExpense(page, "450");
  const photo = page.getByRole("img", { name: "Receipt photo" });
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1600, 1067]);

  const response = await page.request.get(src);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/jpeg");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test("only the family can open a receipt", async ({ page, browser, baseURL, viewport }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await addWithReceipt(page, "300");
  const src = await openExpense(page, "300");

  const stranger = await newUserPage(browser, baseURL, viewport);
  await register(stranger, uniqueName("gopal"), "Gopal");
  await createFamily(stranger, "Rao family");
  expect((await stranger.request.get(src)).status()).toBe(404);

  await logout(page);
  expect((await page.request.get(src)).status()).toBe(401);
});

test("replace with a PDF, then remove; the head's change log shows both", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await addWithReceipt(page, "120");
  await openExpense(page, "120");

  const card = page.getByRole("region", { name: "Receipt", exact: true });
  await expect(card.getByLabel("Attach photo or PDF")).toBeEnabled();
  await card.getByLabel("Attach photo or PDF").setInputFiles({ name: "bill.pdf", mimeType: "application/pdf", buffer: PDF });
  await card.getByRole("button", { name: "Save receipt" }).click();
  await expect(card.getByText("Receipt saved.")).toBeVisible();
  const link = card.getByRole("link", { name: /^Open receipt \(PDF, \d+ B\)$/ });
  await expect(link).toBeVisible();
  const response = await page.request.get((await link.getAttribute("href"))!);
  expect(response.headers()["content-type"]).toBe("application/pdf");

  await card.getByRole("button", { name: "Remove receipt" }).click();
  await card.getByRole("button", { name: "Yes, remove" }).click();
  await expect(card.getByText("No receipt attached.")).toBeVisible();
  await expect(card.getByText("Receipt removed.")).toBeVisible();

  const log = page.getByRole("region", { name: "Change log", exact: true });
  await expect(log.getByText("Receipt replaced (PDF,")).toBeVisible();
  await expect(log.getByText("Receipt removed (PDF,")).toBeVisible();
  await expect(log.getByText("Added with receipt")).toBeVisible();
});

test("files that aren't photos or PDFs are refused before upload", async ({ page }) => {
  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.goto("/");
  await (await picker(page)).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "Choose a JPG, PNG or WebP photo, or a PDF." })).toBeVisible();
  await expect(page.getByTestId("picked-receipt")).toHaveCount(0);
});

// Last in the file: it switches receipts off for everyone (and always back on).
test("the site admin turns receipts off and on; others can't open the admin page", async ({ page, browser, baseURL, viewport }) => {
  const other = await newUserPage(browser, baseURL, viewport);
  await register(other, uniqueName("sita"), "Sita");
  await expect(other.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await other.goto("/admin"); // streamed page, so the status is already sent; check what it shows
  await expect(other.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await expect(other.getByRole("heading", { name: "Site admin" })).toHaveCount(0);

  // playwright.config.ts lists admin.desktop and admin.phone in ADMIN_USERNAMES.
  await register(page, `admin.${test.info().project.name}`, "Site Admin");
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Site admin" })).toBeVisible();
  await expect(page.getByTestId("receipts-state")).toHaveText("New receipts are on.");
  try {
    await page.getByRole("button", { name: "Turn receipts off" }).click();
    await expect(page.getByTestId("receipts-state")).toHaveText("New receipts are off.");

    await createFamily(other, "Kumar family");
    await other.goto("/");
    await expect(other.getByText("Receipts are turned off at the moment.")).toBeVisible();
    await expect(other.getByLabel("Attach photo or PDF")).toHaveCount(0);
  } finally {
    await page.goto("/admin");
    const state = page.getByTestId("receipts-state");
    await expect(state).toBeVisible(); // the page streams in; isVisible() alone wouldn't wait
    if ((await state.textContent())?.includes("off")) await page.getByRole("button", { name: "Turn receipts on" }).click();
    await expect(state).toHaveText("New receipts are on.");
  }
  await other.goto("/");
  await picker(other);
  await expect(page.getByTestId("receipts-used")).not.toHaveText("0 B"); // receipts from the tests above
});
