import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { monthOf, todayInIndia } from "../src/lib/rules/dates";
import { createFamily, register, uniqueName } from "./helpers";

// M7: the security headers from next.config.ts (DESIGN §7) are sent, and no page breaks its own
// Content-Security-Policy (the browser logs "Refused to …" for anything the policy blocks).

test("pages send the security headers; receipts keep their own", async ({ request }) => {
  const page = await request.get("/login");
  const headers = page.headers();
  const csp = headers["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).not.toContain("unsafe-eval"); // production build
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["strict-transport-security"]).toContain("max-age=");

  // The receipt route: no page CSP (it would stop the PDF viewer), but the other headers stay.
  const receipt = await request.get(`/receipts/${randomUUID()}`);
  expect(receipt.status()).toBe(401); // not logged in
  expect(receipt.headers()["content-security-policy"]).toBeUndefined();
  expect(receipt.headers()["x-frame-options"]).toBe("DENY");
});

test("no page breaks the Content-Security-Policy", async ({ page }) => {
  const refused: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) refused.push(`${page.url()}: ${message.text()}`);
  });

  await register(page, uniqueName("ravi"), "Ravi");
  await createFamily(page, "Kumar family");
  await page.goto("/");
  await page.getByRole("textbox", { name: "Amount" }).fill("450");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/^Added ₹/)).toBeVisible();
  // /month/<yyyy-mm> directly: /month forwards after loading and would cut off the next page load.
  const month = `/month/${monthOf(todayInIndia())}`;
  for (const path of [month, "/search?from=2026-01-01&to=2026-01-31", "/family", "/family/budget", "/family/limits", "/account"]) {
    await page.goto(path);
    await page.waitForLoadState("load");
  }
  expect(refused).toEqual([]);
});
