import { execFileSync } from "node:child_process";
import { test as setup, expect } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import { USERS, storageState, type Role } from "./users";

setup.describe.configure({ mode: "serial" });

setup("clerk testing token", async () => {
  if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY missing (put your Clerk dev keys in .env.local)");
  await clerkSetup();
});

setup("test users exist", async () => {
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  for (const u of Object.values(USERS)) {
    const { data } = await client.users.getUserList({ emailAddress: [u.email] });
    if (data.length === 0) {
      await client.users.createUser({
        emailAddress: [u.email],
        firstName: u.firstName,
        lastName: u.lastName,
        skipPasswordRequirement: true,
      });
    }
  }
});

for (const role of Object.keys(USERS) as Role[]) {
  setup(`sign in ${role}`, async ({ page }) => {
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: USERS[role].email });
    await page.goto("/tools");
    // The app creates the Convex user row on first visit (UserGate).
    await expect(page.getByRole("heading", { name: "Browse tools" })).toBeVisible();
    await page.context().storageState({ path: storageState(role) });
  });
}

setup("grant admin", async () => {
  execFileSync("npx", ["convex", "run", "admin:grantAdmin", JSON.stringify({ email: USERS.admin.email })], { stdio: "ignore" });
});
