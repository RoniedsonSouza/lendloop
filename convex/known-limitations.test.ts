import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signIn, TOOL, type T } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function delivery(t: T, status: "queued" | "claimed" | "sent" | "failed", key = "loan:x:approved") {
  const ana = await signIn(t, "Ana");
  const bob = await signIn(t, "Bob");
  const toolId = await ana.client.mutation(api.tools.create, TOOL);
  return t.run(async (ctx) => {
    const loanId = await ctx.db.insert("loans", {
      toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name,
      startDate: "2026-11-20", endDate: "2026-11-25", status: "approved",
    });
    await ctx.db.insert("deliveries", { key, kind: "loan_update", loanId, recipientId: bob.id, recipientRole: "borrower", status, dispatchAttempts: 0 });
    return loanId;
  });
}

describe("deliveries.complete requires a claim", () => {
  test("rejects completing a delivery that was never claimed", async () => {
    const t = setup();
    await delivery(t, "queued");
    await expect(t.mutation(internal.automation.deliveries.complete, { key: "loan:x:approved", outcome: "sent" })).rejects.toThrow(/CONFLICT/);
    const [row] = await t.run((ctx) => ctx.db.query("deliveries").collect());
    expect(row.status).toBe("queued");
  });

  test("completes a claimed delivery, and repeating the same outcome is a no-op", async () => {
    const t = setup();
    await delivery(t, "claimed");
    expect(await t.mutation(internal.automation.deliveries.complete, { key: "loan:x:approved", outcome: "failed", error: "smtp" })).toEqual({ status: "failed" });
    expect(await t.mutation(internal.automation.deliveries.complete, { key: "loan:x:approved", outcome: "failed", error: "smtp" })).toEqual({ status: "failed" });
  });
});

describe("listAvailablePublic computes today on the server", () => {
  test("takes no date argument and hides a tool once its loan has started", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const free = await ana.client.mutation(api.tools.create, TOOL);
    const lent = await ana.client.mutation(api.tools.create, { ...TOOL, name: "Ladder" });
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId: lent, ownerId: ana.id, borrowerId: bob.id, toolName: "Ladder",
        startDate: "2026-11-25", endDate: "2026-11-27", status: "approved",
      }),
    );
    expect((await t.query(api.tools.listAvailablePublic, {})).map((r) => r._id).sort()).toEqual([free, lent].sort());
    vi.setSystemTime(new Date("2026-11-25T15:00:00Z")); // loan has started (server clock, app timezone)
    expect((await t.query(api.tools.listAvailablePublic, {})).map((r) => r._id)).toEqual([free]);
  });
});

describe("purgeOld paginates", () => {
  test("deletes every old record across batches and keeps recent ones", async () => {
    const t = setup();
    const loanId = await delivery(t, "sent", "seed");
    const bobId = await t.run(async (ctx) => (await ctx.db.get("loans", loanId))!.borrowerId);
    await t.run(async (ctx) => {
      for (let i = 0; i < 230 /* > 2 × PURGE_BATCH */; i++) {
        await ctx.db.insert("deliveries", { key: `old:${i}`, kind: "loan_update", loanId, recipientId: bobId, recipientRole: "borrower", status: "sent", dispatchAttempts: 1 });
        await ctx.db.insert("incidents", { executionId: `e${i}`, workflowName: "w", message: "m" });
      }
    });
    vi.setSystemTime(new Date("2027-03-01T15:00:00Z")); // > 90 days later
    await t.run((ctx) => ctx.db.insert("deliveries", { key: "recent", kind: "loan_update", loanId, recipientId: bobId, recipientRole: "borrower", status: "sent", dispatchAttempts: 1 }));
    await t.mutation(internal.automation.outbox.purgeOld, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const keys = await t.run(async (ctx) => (await ctx.db.query("deliveries").collect()).map((d) => d.key));
    expect(keys).toEqual(["recent"]);
    expect(await t.run((ctx) => ctx.db.query("incidents").collect())).toHaveLength(0);
  });
});
