import { test, expect, type Page } from "@playwright/test";
import { createListing, pageAs, runId, toolCard } from "./fixtures";
import { USERS } from "./users";

const MAILPIT = process.env.MAILPIT_API_URL ?? "http://localhost:8025/api/v1";

test.describe.configure({ mode: "serial" });

const drill = `E2E drill ${runId}`;
const rake = `E2E rake ${runId}`;
let lender: Page;
let borrower: Page;

test.beforeAll(async ({ browser }) => {
  lender = await pageAs(browser, "lender");
  borrower = await pageAs(browser, "borrower");
});
test.afterAll(async () => {
  await lender.context().close();
  await borrower.context().close();
});

test("lender creates listings", async () => {
  await createListing(lender, drill, "Power tools");
  await createListing(lender, rake, "Garden");
  await expect(toolCard(lender, drill)).toContainText("Available");
});

test("browse shows availability and filters by category", async () => {
  await borrower.goto("/tools");
  await expect(toolCard(borrower, drill)).toContainText("Available");
  await expect(toolCard(borrower, drill)).toContainText(`Lent by ${USERS.lender.firstName}`);
  await borrower.getByRole("button", { name: "Garden", exact: true }).click();
  await expect(borrower).toHaveURL(/category=garden/);
  await expect(toolCard(borrower, rake)).toBeVisible();
  await expect(toolCard(borrower, drill)).toHaveCount(0);
  await borrower.getByRole("button", { name: "Power tools", exact: true }).click();
  await expect(toolCard(borrower, drill)).toBeVisible();
  await expect(toolCard(borrower, rake)).toHaveCount(0);
});

test("borrower requests a date range", async () => {
  await borrower.goto("/tools");
  await toolCard(borrower, drill).getByRole("button", { name: "Request" }).click();
  const dialog = borrower.getByRole("dialog");
  const from = dialog.getByLabel("From");
  const today = (await from.getAttribute("min"))!; // the app's "today" in its timezone
  await from.fill(today);
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(borrower.getByText("Request sent to the owner")).toBeVisible();

  await borrower.goto("/requests");
  await expect(toolCard(borrower, drill)).toContainText("Pending");
});

test("lender approves the request in Incoming", async () => {
  await lender.goto("/incoming");
  const card = toolCard(lender, drill);
  await expect(card).toContainText(`Requested by ${USERS.borrower.firstName}`);
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card).toContainText("On loan");
  // Contact details are shared only after approval.
  await expect(card).toContainText(USERS.borrower.email);
});

test("borrower receives the approval email via n8n (Mailpit)", async ({ request }) => {
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search`, { params: { query: `to:"${USERS.borrower.email}" subject:"${drill}"` } });
        const json = (await res.json()) as { messages: { Subject: string }[] };
        return json.messages.map((m) => m.Subject).join("\n");
      },
      { timeout: 60_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toContain(drill);
});

test("borrower sees the approved loan with the owner's contact", async () => {
  await borrower.goto("/requests");
  const card = toolCard(borrower, drill);
  await expect(card).toContainText("On loan");
  await expect(card).toContainText(USERS.lender.email);
});

test("lender marks the tool returned", async () => {
  await lender.goto("/incoming");
  const card = toolCard(lender, drill);
  await card.getByRole("button", { name: "Mark returned" }).click();
  await expect(card).toContainText("Returned");
  await lender.goto("/listings");
  await expect(toolCard(lender, drill)).toContainText("Available");
});
