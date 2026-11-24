/**
 * Captures the README screenshots. Not part of the test run:
 *   SCREENSHOTS=1 npx playwright test --project=screenshots
 * Run it against a fresh deployment seeded with `npm run demo:seed -- lender+clerk_test@example.com`
 * so only test users and demo neighbors appear.
 */
import { test, expect, type Page } from "@playwright/test";
import { pageAs } from "./fixtures";

const OUT = "docs/screenshots";
const viewport = { width: 1280, height: 860 };

async function shoot(page: Page, file: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // dev-mode badge
  await page.screenshot({ path: `${OUT}/${file}` });
}

test("capture key screens", async ({ page, browser }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.getByText("Hedge trimmer").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to lend or borrow" })).toBeVisible();
  await shoot(page, "1-public.png");

  const borrower = await pageAs(browser, "borrower"); // non-admin view of Browse
  await borrower.setViewportSize(viewport);
  await borrower.goto("/tools");
  await expect(borrower.getByRole("heading", { name: "Browse tools" })).toBeVisible();
  await expect(borrower.getByText("Lent by").first()).toBeVisible();
  await shoot(borrower, "2-browse.png");
  await borrower.context().close();

  const lender = await pageAs(browser, "lender");
  await lender.setViewportSize(viewport);

  await lender.goto("/incoming");
  await expect(lender.getByRole("button", { name: "Approve" }).first()).toBeVisible();
  await shoot(lender, "3-incoming.png");

  await lender.goto("/requests");
  await expect(lender.getByText("Overdue").first()).toBeVisible();
  await shoot(lender, "4-my-requests.png");
  await lender.context().close();

  const admin = await pageAs(browser, "admin");
  await admin.setViewportSize(viewport);
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(admin.getByText("overdue").first()).toBeVisible();
  await shoot(admin, "5-admin.png");
  await admin.context().close();
});
