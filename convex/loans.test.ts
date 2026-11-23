import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { setup, signIn, TOOL, type T } from "./test.setup";

// Server clock: 2026-11-23 12:00 in America/Sao_Paulo.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function scenario(t: T) {
  const ana = await signIn(t, "Ana"); // owner
  const bob = await signIn(t, "Bob"); // borrower
  const toolId = await ana.client.mutation(api.tools.create, TOOL);
  return { ana, bob, toolId };
}

describe("loan requests", () => {
  test("cannot request own tool", async () => {
    const t = setup();
    const { ana, toolId } = await scenario(t);
    await expect(
      ana.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  test("cannot start in the past", async () => {
    const t = setup();
    const { bob, toolId } = await scenario(t);
    await expect(
      bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-22", endDate: "2026-11-25" }),
    ).rejects.toThrow(/INVALID/);
  });

  test("cannot exceed 30 days", async () => {
    const t = setup();
    const { bob, toolId } = await scenario(t);
    await expect(
      bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-12-24" }),
    ).rejects.toThrow(/INVALID/);
  });

  test("one open request per tool per borrower", async () => {
    const t = setup();
    const { bob, toolId } = await scenario(t);
    await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    await expect(
      bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-27", endDate: "2026-11-28" }),
    ).rejects.toThrow(/CONFLICT/);
  });

  test("sixth pending request is rejected", async () => {
    const t = setup();
    const { ana, bob } = await scenario(t);
    for (let i = 0; i < 5; i++) {
      const id = await ana.client.mutation(api.tools.create, { ...TOOL, name: `Tool ${i}` });
      await bob.client.mutation(api.loans.request, { toolId: id, startDate: "2026-11-24", endDate: "2026-11-25" });
    }
    const sixth = await ana.client.mutation(api.tools.create, { ...TOOL, name: "Tool 6" });
    await expect(
      bob.client.mutation(api.loans.request, { toolId: sixth, startDate: "2026-11-24", endDate: "2026-11-25" }),
    ).rejects.toThrow(/CONFLICT/);
  });
});

describe("decisions", () => {
  test("approve rejects overlap and auto-declines overlapping pending requests", async () => {
    const t = setup();
    const { ana, bob, toolId } = await scenario(t);
    const cid = await signIn(t, "Cid");
    const first = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-26" });
    const second = await cid.client.mutation(api.loans.request, { toolId, startDate: "2026-11-26", endDate: "2026-11-28" });
    await ana.client.mutation(api.loans.approve, { loanId: first });
    const loan2 = await t.run((ctx) => ctx.db.get("loans", second));
    expect(loan2).toMatchObject({ status: "declined", closedReason: "dates_unavailable" });
    await expect(ana.client.mutation(api.loans.approve, { loanId: second })).rejects.toThrow(/CONFLICT/);
  });

  test("approve rejects a request overlapping an existing approved loan", async () => {
    const t = setup();
    const { ana, bob, toolId } = await scenario(t);
    const cid = await signIn(t, "Cid");
    const second = await cid.client.mutation(api.loans.request, { toolId, startDate: "2026-11-26", endDate: "2026-11-28" });
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name,
        startDate: "2026-11-27", endDate: "2026-11-29", status: "approved",
      }),
    );
    await expect(ana.client.mutation(api.loans.approve, { loanId: second })).rejects.toThrow(/CONFLICT/);
  });

  test("borrower cannot decline", async () => {
    const t = setup();
    const { bob, toolId } = await scenario(t);
    const id = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    await expect(bob.client.mutation(api.loans.decline, { loanId: id })).rejects.toThrow(/FORBIDDEN/);
  });

  test("admin has no special power over others' requests", async () => {
    const t = setup();
    const { bob, toolId } = await scenario(t);
    const admin = await signIn(t, "Root", { admin: true });
    const id = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    await expect(admin.client.mutation(api.loans.approve, { loanId: id })).rejects.toThrow(/FORBIDDEN/);
  });

  test("markReturned before start is a conflict, after start works", async () => {
    const t = setup();
    const { ana, bob, toolId } = await scenario(t);
    const id = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    await ana.client.mutation(api.loans.approve, { loanId: id });
    await expect(ana.client.mutation(api.loans.markReturned, { loanId: id })).rejects.toThrow(/CONFLICT/);
    vi.setSystemTime(new Date("2026-11-24T15:00:00Z"));
    await ana.client.mutation(api.loans.markReturned, { loanId: id });
    expect((await t.run((ctx) => ctx.db.get("loans", id)))?.status).toBe("returned");
  });

  test("borrower can cancel an approved loan before it starts but not the owner", async () => {
    const t = setup();
    const { ana, bob, toolId } = await scenario(t);
    const id = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    await ana.client.mutation(api.loans.approve, { loanId: id });
    await expect(ana.client.mutation(api.loans.cancel, { loanId: id })).rejects.toThrow(/FORBIDDEN/);
    await bob.client.mutation(api.loans.cancel, { loanId: id });
    expect((await t.run((ctx) => ctx.db.get("loans", id)))?.status).toBe("cancelled");
  });

  test("remove cancels open loans but keeps the active one", async () => {
    const t = setup();
    const { ana, bob, toolId } = await scenario(t);
    const cid = await signIn(t, "Cid");
    const pending = await cid.client.mutation(api.loans.request, { toolId, startDate: "2026-12-10", endDate: "2026-12-11" });
    const active = await t.run((ctx) =>
      ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name, startDate: "2026-11-20", endDate: "2026-11-25", status: "approved" }),
    );
    const future = await t.run((ctx) =>
      ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name, startDate: "2026-12-01", endDate: "2026-12-02", status: "approved" }),
    );
    await ana.client.mutation(api.tools.remove, { toolId });
    const statuses = await t.run(async (ctx) =>
      Promise.all([pending, active, future].map(async (id) => (await ctx.db.get("loans", id))?.status)),
    );
    expect(statuses).toEqual(["cancelled", "approved", "cancelled"]);
  });
});

describe("views", () => {
  test("incoming hides counterpart email until approved", async () => {
    const t = setup();
    const { ana, bob, toolId } = await scenario(t);
    const id = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    let [row] = await ana.client.query(api.loans.incoming, { today: "2026-11-23" });
    expect(row.counterpart).toEqual({ firstName: "Bob" });
    await ana.client.mutation(api.loans.approve, { loanId: id });
    [row] = await ana.client.query(api.loans.incoming, { today: "2026-11-23" });
    expect(row.counterpart).toEqual({ firstName: "Bob", name: "Bob Test", email: "bob@example.com" });
  });

  test("myRequests flags overdue loans", async () => {
    const t = setup();
    const { ana, bob, toolId } = await scenario(t);
    await t.run((ctx) =>
      ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name, startDate: "2026-11-10", endDate: "2026-11-20", status: "approved" }),
    );
    const [row] = await bob.client.query(api.loans.myRequests, { today: "2026-11-23" });
    expect(row).toMatchObject({ status: "approved", isOverdue: true, toolName: TOOL.name });
  });
});
