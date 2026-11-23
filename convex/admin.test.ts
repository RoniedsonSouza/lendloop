import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signIn, TOOL } from "./test.setup";

const PAGE = { numItems: 20, cursor: null };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 202 }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("admin console", () => {
  test("members cannot list all loans", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    await expect(ana.client.query(api.admin.loans, { today: "2026-11-23", paginationOpts: PAGE })).rejects.toThrow(/FORBIDDEN/);
  });

  test("admin sees every loan, filterable by status", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const admin = await signIn(t, "Root", { admin: true });
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    const all = await admin.client.query(api.admin.loans, { today: "2026-11-23", paginationOpts: PAGE });
    expect(all.page).toHaveLength(1);
    expect(all.page[0]).toMatchObject({ ownerName: "Ana Test", borrowerName: "Bob Test", status: "requested" });
    const approved = await admin.client.query(api.admin.loans, { today: "2026-11-23", status: "approved", paginationOpts: PAGE });
    expect(approved.page).toHaveLength(0);
  });

  test("setTrustedLender flips the flag and is audited", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const admin = await signIn(t, "Root", { admin: true });
    await admin.client.mutation(api.admin.setTrustedLender, { userId: ana.id, value: true });
    expect((await ana.client.query(api.users.me, {}))?.isTrustedLender).toBe(true);
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.action)).toEqual(["user.trusted_set"]);
  });

  test("members cannot set trusted lender", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    await expect(ana.client.mutation(api.admin.setTrustedLender, { userId: ana.id, value: true })).rejects.toThrow(/FORBIDDEN/);
  });

  test("automation issues lists failed deliveries and incidents", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const admin = await signIn(t, "Root", { admin: true });
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    const loanId = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    const key = `loan:${loanId}:requested`;
    await t.mutation(internal.automation.deliveries.claim, { key, kind: "loan_update" });
    await t.mutation(internal.automation.deliveries.complete, { key, outcome: "failed", error: "smtp down" });
    await t.mutation(internal.automation.deliveries.recordIncident, { executionId: "9", workflowName: "WF", message: "boom" });
    const issues = await admin.client.query(api.admin.automationIssues, {});
    expect(issues.deliveries.map((d) => [d.status, d.toolName, d.lastError])).toEqual([["failed", TOOL.name, "smtp down"]]);
    expect(issues.incidents.map((i) => i.message)).toEqual(["boom"]);
  });
});
