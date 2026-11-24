import { test, expect } from "@playwright/test";
import { createListing, pageAs, runId, toolCard } from "./fixtures";
import { USERS } from "./users";

test("non-admin cannot see or open the admin console", async ({ browser }) => {
  const page = await pageAs(browser, "borrower");
  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: "Browse tools" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByText("Admins only")).toBeVisible();
  await page.context().close();
});

test("admin marks a Trusted Lender and removes a listing", async ({ browser }) => {
  const name = `E2E admin-removal ${runId}`;
  const lender = await pageAs(browser, "lender");
  await createListing(lender, name, "Other");

  const admin = await pageAs(browser, "admin");
  await admin.goto("/admin");
  await admin.getByRole("tab", { name: "Members" }).click();
  const row = admin.locator("li").filter({ hasText: USERS.lender.email });
  const trusted = row.getByRole("checkbox", { name: "Trusted Lender" });
  // The checkbox is controlled by server state, so click and wait for the round-trip.
  if (await trusted.isChecked()) {
    await trusted.click(); // start from a known state on re-runs
    await expect(trusted).not.toBeChecked();
  }
  await trusted.click();
  await expect(trusted).toBeChecked();

  await admin.goto("/tools");
  const card = toolCard(admin, name);
  await expect(card).toContainText("Trusted Lender");
  admin.once("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: "Remove" }).click();
  await expect(card).toHaveCount(0);

  await lender.goto("/listings");
  await expect(toolCard(lender, name)).toHaveCount(0);
  await lender.context().close();
  await admin.context().close();
});
