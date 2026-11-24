import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { setup, signIn, TOOL } from "./test.setup";

const TODAY = "2026-11-23";

describe("tools", () => {
  test("listAvailablePublic projection exposes only id, name and category of available tools", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const available = await ana.client.mutation(api.tools.create, TOOL);
    const lent = await ana.client.mutation(api.tools.create, { ...TOOL, name: "Ladder", category: "other" });
    const removed = await ana.client.mutation(api.tools.create, { ...TOOL, name: "Saw" });
    await ana.client.mutation(api.tools.remove, { toolId: removed });
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId: lent, ownerId: ana.id, borrowerId: bob.id, toolName: "Ladder",
        startDate: "2026-11-20", endDate: "2026-11-25", status: "approved",
      }),
    );
    const rows = await t.query(api.tools.listAvailablePublic, {});
    expect(rows.map((r) => r._id)).toEqual([available]);
    expect(Object.keys(rows[0]).sort()).toEqual(["_id", "category", "name"]);
    vi.useRealTimers();
  });

  test("create rejects a too-short name", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    await expect(ana.client.mutation(api.tools.create, { ...TOOL, name: "a" })).rejects.toThrow(/INVALID/);
  });

  test("update by non-owner is forbidden", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    await expect(bob.client.mutation(api.tools.update, { toolId, ...TOOL, name: "Mine now" })).rejects.toThrow(/FORBIDDEN/);
  });

  test("update by admin of someone else's tool is forbidden (moderation is removal only)", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const admin = await signIn(t, "Root", { admin: true });
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    await expect(admin.client.mutation(api.tools.update, { toolId, ...TOOL })).rejects.toThrow(/FORBIDDEN/);
  });

  test("remove by non-owner member is forbidden", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    await expect(bob.client.mutation(api.tools.remove, { toolId })).rejects.toThrow(/FORBIDDEN/);
  });

  test("remove by admin of another's tool works and is audited", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const admin = await signIn(t, "Root", { admin: true });
    const toolId = await ana.client.mutation(api.tools.create, TOOL);
    await admin.client.mutation(api.tools.remove, { toolId });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.action)).toEqual(["listing.removed"]);
  });

  test("browse filters by category and hides overdue state from third parties", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const cid = await signIn(t, "Cid");
    const drill = await ana.client.mutation(api.tools.create, TOOL);
    await ana.client.mutation(api.tools.create, { ...TOOL, name: "Rake", category: "garden" });
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId: drill, ownerId: ana.id, borrowerId: bob.id, toolName: "Cordless drill",
        startDate: "2026-11-10", endDate: "2026-11-20", status: "approved",
      }),
    );
    const page = { numItems: 24, cursor: null };
    const asCid = await cid.client.query(api.tools.browse, { today: TODAY, category: "power-tools", paginationOpts: page });
    expect(asCid.page.map((r) => r.name)).toEqual(["Cordless drill"]);
    expect(asCid.page[0].availability.state).toBe("on_loan");
    expect(asCid.page[0]).toMatchObject({ ownerFirstName: "Ana", isMine: false });
    const asAna = await ana.client.query(api.tools.browse, { today: TODAY, category: "power-tools", paginationOpts: page });
    expect(asAna.page[0].availability).toEqual({ state: "overdue", until: "2026-11-20" });
  });

  test("anonymous callers cannot browse", async () => {
    const t = setup();
    await expect(
      t.query(api.tools.browse, { today: TODAY, paginationOpts: { numItems: 24, cursor: null } }),
    ).rejects.toThrow(/UNAUTHENTICATED/);
  });
});
