import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { setup, signIn } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 202 }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("demo seed", () => {
  test("refuses to run unless ALLOW_SEED is true", async () => {
    const t = setup();
    await signIn(t, "Me");
    await expect(t.mutation(internal.seed.demo, { email: "me@example.com" })).rejects.toThrow(/FORBIDDEN/);
  });

  test("creates neighbors, tools, an overdue loan for the given user and a pending request to them", async () => {
    vi.stubEnv("ALLOW_SEED", "true");
    const t = setup();
    const me = await signIn(t, "Me");
    await t.mutation(internal.seed.demo, { email: "me@example.com" });
    const { tools, loans, deliveries } = await t.run(async (ctx) => ({
      tools: await ctx.db.query("tools").collect(),
      loans: await ctx.db.query("loans").collect(),
      deliveries: await ctx.db.query("deliveries").collect(),
    }));
    expect(tools.length).toBeGreaterThanOrEqual(8);
    expect(loans.some((l) => l.borrowerId === me.id && l.status === "approved" && l.endDate < "2026-11-23")).toBe(true);
    expect(loans.some((l) => l.ownerId === me.id && l.status === "requested")).toBe(true);
    expect(deliveries.some((d) => d.recipientId === me.id && d.key.endsWith(":requested"))).toBe(true);
  });
});
