import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setup, signIn, TOOL } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 202 }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("final review fixes", () => {
  test("active loans stay visible even with a long history", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    await t.run(async (ctx) => {
      await ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: "Active", startDate: "2026-11-20", endDate: "2026-11-30", status: "approved" });
      for (let i = 0; i < 205; i++) {
        await ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: `Old ${i}`, startDate: "2026-01-01", endDate: "2026-01-02", status: "returned" });
      }
    });
    const rows = await bob.client.query(api.loans.myRequests, { today: "2026-11-23" });
    expect(rows.some((r) => r.toolName === "Active")).toBe(true);
  });

  test("cannot approve while a previous loan is overdue (tool not back)", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const cid = await signIn(t, "Cid");
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    await t.run((ctx) =>
      ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name, startDate: "2026-11-10", endDate: "2026-11-20", status: "approved" }),
    );
    const req = await cid.client.mutation(api.loans.request, { toolId, startDate: "2026-11-25", endDate: "2026-11-26" });
    await expect(ana.client.mutation(api.loans.approve, { loanId: req })).rejects.toThrow(/CONFLICT/);
  });

  test("cannot approve a request whose start date has passed", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    const req = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    vi.setSystemTime(new Date("2026-11-25T15:00:00Z"));
    await expect(ana.client.mutation(api.loans.approve, { loanId: req })).rejects.toThrow(/CONFLICT/);
  });

  test("reminder claim is skipped once the loan was returned", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name, startDate: "2026-11-10", endDate: "2026-11-20", status: "returned" }),
    );
    const res = await t.mutation(internal.automation.deliveries.claim, { key: `reminder:${loanId}:2026-11-23`, kind: "overdue_reminder", loanId });
    expect(res.decision).toBe("skip");
  });
});
