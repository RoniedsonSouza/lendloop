/**
 * Demo data for local evaluation (`npx convex run seed:demo '{"email":"you@example.com"}'`).
 * Guarded by ALLOW_SEED=true, which only `npm run setup` sets on the local deployment.
 */
import { v } from "convex/values";
import { env, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appError } from "./lib/errors";
import { addDays, appTimezone, today as todayIn } from "./lib/dates";
import type { Category, Condition } from "./lib/domain";
import { enqueueLoanUpdate } from "./automation/outbox";

const NEIGHBORS = [
  { first: "Ana", last: "Lima" },
  { first: "Bruno", last: "Costa" },
  { first: "Carla", last: "Dias" },
];
const TOOLS: [string, Category, Condition, string][] = [
  ["Cordless drill", "power-tools", "good", "18V with two batteries."],
  ["Circular saw", "power-tools", "fair", "Blade is a bit worn."],
  ["Hedge trimmer", "garden", "good", "Electric, 50 cm blade."],
  ["Wheelbarrow", "garden", "worn", "Still rolls fine."],
  ["Stand mixer", "kitchen", "new", "Includes dough hook."],
  ["4-person tent", "camping", "good", "Waterproof, easy setup."],
  ["Pressure washer", "cleaning", "good", "Great for patios."],
  ["Paint roller kit", "painting", "new", "Tray, two rollers, extension pole."],
];

export const demo = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    if (env.ALLOW_SEED !== "true") throw appError("FORBIDDEN", "Seeding is disabled on this deployment");
    const me = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!me) throw appError("NOT_FOUND", "Sign in once with that email before seeding");

    const neighbors: Id<"users">[] = [];
    for (const n of NEIGHBORS) {
      neighbors.push(
        await ctx.db.insert("users", {
          tokenIdentifier: `seed|${n.first.toLowerCase()}`,
          name: `${n.first} ${n.last}`,
          firstName: n.first,
          email: `${n.first.toLowerCase()}@example.com`,
          role: "member",
          isTrustedLender: n.first === "Ana",
        }),
      );
    }
    const toolIds: Id<"tools">[] = [];
    for (const [i, [name, category, condition, description]] of TOOLS.entries()) {
      toolIds.push(
        await ctx.db.insert("tools", {
          ownerId: neighbors[i % neighbors.length], name, category, condition, description, status: "active",
        }),
      );
    }
    const myLadder = await ctx.db.insert("tools", {
      ownerId: me._id, name: "Aluminium ladder", category: "other", condition: "good",
      description: "3 m, foldable.", status: "active",
    });

    const today = todayIn(appTimezone());
    // You borrowed Ana's drill and it is 3 days overdue -> the daily reminder targets you.
    await ctx.db.insert("loans", {
      toolId: toolIds[0], ownerId: neighbors[0], borrowerId: me._id, toolName: TOOLS[0][0],
      startDate: addDays(today, -10), endDate: addDays(today, -3), status: "approved", decidedAt: Date.now(),
    });
    // Carla asks to borrow your ladder -> you get a "new request" notification via n8n.
    const requestId = await ctx.db.insert("loans", {
      toolId: myLadder, ownerId: me._id, borrowerId: neighbors[2], toolName: "Aluminium ladder",
      startDate: addDays(today, 2), endDate: addDays(today, 4), status: "requested",
    });
    await enqueueLoanUpdate(ctx, (await ctx.db.get("loans", requestId))!, "requested");
    return null;
  },
});
