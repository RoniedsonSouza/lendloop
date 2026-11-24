import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { storageState, type Role } from "./users";

/** Opens a page already signed in as one of the test users. */
export async function pageAs(browser: Browser, role: Role): Promise<Page> {
  const context = await browser.newContext({ storageState: storageState(role) });
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  return page;
}

/** Unique per run so the suite can be re-run against the same deployment. */
export const runId = `${Date.now().toString(36)}`;

export const toolCard = (page: Page, name: string) => page.locator("li").filter({ has: page.getByRole("heading", { name, exact: true }) });

export async function createListing(page: Page, name: string, category: string) {
  await page.goto("/listings");
  await page.getByRole("button", { name: "+ List a tool" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Category").selectOption({ label: category });
  await dialog.getByLabel("Short description").fill("Created by the E2E suite.");
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect(toolCard(page, name)).toBeVisible();
}

export { base as test, expect };
