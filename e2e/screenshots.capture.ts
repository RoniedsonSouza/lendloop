/**
 * Captures the README screenshots. Not part of the test run:
 *   SCREENSHOTS=1 npx playwright test --project=screenshots
 * Run it against a fresh deployment seeded with `npm run demo:seed -- lender+clerk_test@example.com`
 * so only test users and demo neighbors appear.
 */
import { test, expect } from "@playwright/test";
import { pageAs } from "./fixtures";

const OUT = "docs/screenshots";
const viewport = { width: 1280, height: 860 };

test("capture key screens", async ({ page, browser }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.getByText("Cordless drill").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/1-public.png` });

  const lender = await pageAs(browser, "lender");
  await lender.setViewportSize(viewport);
  await lender.goto("/tools");
  await expect(lender.getByRole("heading", { name: "Browse tools" })).toBeVisible();
  await expect(lender.getByText("Lent by").first()).toBeVisible();
  await lender.screenshot({ path: `${OUT}/2-browse.png` });

  await lender.goto("/incoming");
  await expect(lender.getByRole("button", { name: "Approve" }).first()).toBeVisible();
  await lender.screenshot({ path: `${OUT}/3-incoming.png` });

  await lender.goto("/requests");
  await expect(lender.getByText("Overdue").first()).toBeVisible();
  await lender.screenshot({ path: `${OUT}/4-my-requests.png` });
  await lender.context().close();

  const admin = await pageAs(browser, "admin");
  await admin.setViewportSize(viewport);
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(admin.getByText("overdue").first()).toBeVisible();
  await admin.screenshot({ path: `${OUT}/5-admin.png` });
  await admin.context().close();
});
