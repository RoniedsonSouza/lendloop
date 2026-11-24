import { test, expect } from "@playwright/test";
import { createListing, pageAs, runId } from "./fixtures";
import { USERS } from "./users";

test("public page shows tagline, CTA and tools with name/category only", async ({ page, browser }) => {
  const name = `Public paint roller ${runId}`;
  const lender = await pageAs(browser, "lender");
  await createListing(lender, name, "Painting");
  await lender.context().close();

  await page.goto("/");
  await expect(page.getByText("Borrow what you need. Lend what you don't.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to lend or borrow" })).toBeVisible();
  const item = page.locator("li").filter({ hasText: name });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Painting");
  await expect(item).not.toContainText("Created by the E2E suite");
  const body = await page.locator("body").innerText();
  expect(body).not.toContain(USERS.lender.firstName);
  expect(body).not.toContain(USERS.lender.email);
  expect(body).not.toContain("Lent by");
});

for (const path of ["/tools", "/listings", "/requests", "/incoming", "/admin"]) {
  test(`unauthenticated ${path} redirects to sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).not.toHaveURL(new RegExp(`localhost:\\d+${path}$`));
    await expect(page).toHaveURL(/sign-in/);
  });
}
