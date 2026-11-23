import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { setup, signIn, TOOL, type T } from "../test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 202 }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function overdueLoan(t: T) {
  const ana = await signIn(t, "Ana");
  const bob = await signIn(t, "Bob");
  const toolId = await ana.client.mutation(api.tools.create, TOOL);
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name, startDate: "2026-11-10", endDate: "2026-11-20", status: "approved" }),
  );
  return { ana, bob, toolId, loanId };
}

describe("delivery ledger", () => {
  test("claim is idempotent for reminders", async () => {
    const t = setup();
    const { loanId } = await overdueLoan(t);
    const key = `reminder:${loanId}:2026-11-23`;
    const args = { key, kind: "overdue_reminder" as const, loanId };
    expect(await t.mutation(internal.automation.deliveries.claim, args)).toEqual({ decision: "send" });
    expect(await t.mutation(internal.automation.deliveries.claim, args)).toMatchObject({ decision: "skip" });
    const rows = await t.run((ctx) => ctx.db.query("deliveries").collect());
    expect(rows).toHaveLength(1);
  });

  test("a failed delivery can be claimed again", async () => {
    const t = setup();
    const { loanId } = await overdueLoan(t);
    const key = `reminder:${loanId}:2026-11-23`;
    await t.mutation(internal.automation.deliveries.claim, { key, kind: "overdue_reminder", loanId });
    await t.mutation(internal.automation.deliveries.complete, { key, outcome: "failed", error: "smtp" });
    expect(await t.mutation(internal.automation.deliveries.claim, { key, kind: "overdue_reminder", loanId })).toEqual({ decision: "send" });
  });

  test("completing sent twice changes nothing and records the reminder on the loan", async () => {
    const t = setup();
    const { loanId } = await overdueLoan(t);
    const key = `reminder:${loanId}:2026-11-23`;
    await t.mutation(internal.automation.deliveries.claim, { key, kind: "overdue_reminder", loanId });
    await t.mutation(internal.automation.deliveries.complete, { key, outcome: "sent" });
    const first = await t.run((ctx) => ctx.db.get("loans", loanId));
    vi.setSystemTime(new Date("2026-11-23T15:05:00Z"));
    await t.mutation(internal.automation.deliveries.complete, { key, outcome: "sent" });
    const second = await t.run((ctx) => ctx.db.get("loans", loanId));
    expect(first?.lastReminderAt).toBeDefined();
    expect(second?.lastReminderAt).toBe(first?.lastReminderAt);
  });

  test("a loan update claimed by n8n before markDispatched is never moved backwards", async () => {
    const t = setup();
    const { ana, bob, toolId } = await overdueLoan(t);
    void ana;
    await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-12-01", endDate: "2026-12-02" });
    const [d] = await t.run((ctx) => ctx.db.query("deliveries").collect());
    expect(await t.mutation(internal.automation.deliveries.claim, { key: d.key, kind: "loan_update" })).toEqual({ decision: "send" });
    await t.mutation(internal.automation.outbox.markDispatched, { deliveryId: d._id });
    expect((await t.run((ctx) => ctx.db.get("deliveries", d._id)))?.status).toBe("claimed");
  });

  test("overdue list excludes loans already reminded today", async () => {
    const t = setup();
    const { loanId } = await overdueLoan(t);
    let res = await t.query(internal.automation.deliveries.overdueLoans, { asOf: "2026-11-23" });
    expect(res.loans).toEqual([
      { loanId, toolName: TOOL.name, endDate: "2026-11-20", daysOverdue: 3, borrower: { firstName: "Bob", email: "bob@example.com" }, ownerFirstName: "Ana" },
    ]);
    const key = `reminder:${loanId}:2026-11-23`;
    await t.mutation(internal.automation.deliveries.claim, { key, kind: "overdue_reminder", loanId });
    res = await t.query(internal.automation.deliveries.overdueLoans, { asOf: "2026-11-23" });
    expect(res.loans).toEqual([]);
  });

  test("incidents are idempotent by execution id", async () => {
    const t = setup();
    const args = { executionId: "42", workflowName: "LendLoop · Loan notifications", message: "SMTP down" };
    await t.mutation(internal.automation.deliveries.recordIncident, args);
    await t.mutation(internal.automation.deliveries.recordIncident, args);
    expect(await t.run((ctx) => ctx.db.query("incidents").collect())).toHaveLength(1);
  });
});
