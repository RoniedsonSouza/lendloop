import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { adminMutation, adminQuery } from "./lib/functions";
import { loanStatusValidator } from "./schema";
import { recentActivity, loanView } from "./loans";
import { internalMutation } from "./_generated/server";
import { appError } from "./lib/errors";
import { recordAudit } from "./lib/audit";

/** Out-of-band admin bootstrap: `npx convex run admin:grantAdmin '{"email":"..."}'`. No UI path. */
export const grantAdmin = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) throw appError("NOT_FOUND", "No user with that email has signed in yet");
    await ctx.db.patch("users", user._id, { role: "admin" });
    await recordAudit(ctx, undefined, "user.admin_granted", "users", user._id, "via CLI");
    return null;
  },
});

// ---------- admin console (all role-checked in adminQuery/adminMutation) ----------

const pageOf = <T extends ReturnType<typeof v.object>>(item: T) =>
  v.object({
    page: v.array(item),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  });

const adminLoan = v.object({
  _id: v.id("loans"),
  toolName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  status: loanStatusValidator,
  isOverdue: v.boolean(),
  ownerName: v.string(),
  borrowerName: v.string(),
  activity: loanView.fields.activity,
});

export const loans = adminQuery({
  args: { today: v.string(), status: v.optional(loanStatusValidator), paginationOpts: paginationOptsValidator },
  returns: pageOf(adminLoan),
  handler: async (ctx, { today, status, paginationOpts }) => {
    const base = status
      ? ctx.db.query("loans").withIndex("by_status_start", (q) => q.eq("status", status))
      : ctx.db.query("loans");
    const result = await base.order("desc").paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (l) => {
        const [owner, borrower] = await Promise.all([ctx.db.get("users", l.ownerId), ctx.db.get("users", l.borrowerId)]);
        return {
          _id: l._id,
          toolName: l.toolName,
          startDate: l.startDate,
          endDate: l.endDate,
          status: l.status,
          isOverdue: l.status === "approved" && l.endDate < today,
          ownerName: owner?.name ?? "Unknown",
          borrowerName: borrower?.name ?? "Unknown",
          activity: await recentActivity(ctx, l._id),
        };
      }),
    );
    return { ...result, page };
  },
});

export const members = adminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: pageOf(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      email: v.string(),
      role: v.union(v.literal("member"), v.literal("admin")),
      isTrustedLender: v.boolean(),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db.query("users").order("desc").paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map(({ _id, name, email, role, isTrustedLender }) => ({ _id, name, email, role, isTrustedLender })),
    };
  },
});

export const setTrustedLender = adminMutation({
  args: { userId: v.id("users"), value: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, value }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) throw appError("NOT_FOUND", "User not found");
    if (user.isTrustedLender === value) return null;
    await ctx.db.patch("users", userId, { isTrustedLender: value });
    await recordAudit(ctx, ctx.user._id, value ? "user.trusted_set" : "user.trusted_unset", "users", userId);
    return null;
  },
});

/** Everything that went wrong in the automation, so failures are visible in the product. */
export const automationIssues = adminQuery({
  args: {},
  returns: v.object({
    deliveries: v.array(
      v.object({
        _id: v.id("deliveries"),
        kind: v.string(),
        status: v.string(),
        toolName: v.string(),
        recipientRole: v.string(),
        lastError: v.optional(v.string()),
        at: v.number(),
      }),
    ),
    incidents: v.array(
      v.object({ _id: v.id("incidents"), workflowName: v.string(), failedNode: v.optional(v.string()), message: v.string(), at: v.number() }),
    ),
  }),
  handler: async (ctx) => {
    const rows = [];
    for (const status of ["dead", "failed", "stale"] as const) {
      rows.push(
        ...(await ctx.db
          .query("deliveries")
          .withIndex("by_status_next", (q) => q.eq("status", status))
          .order("desc")
          .take(50)),
      );
    }
    rows.sort((a, b) => b._creationTime - a._creationTime);
    const deliveries = await Promise.all(
      rows.slice(0, 50).map(async (d) => ({
        _id: d._id,
        kind: d.kind,
        status: d.status,
        toolName: (await ctx.db.get("loans", d.loanId))?.toolName ?? "Unknown",
        recipientRole: d.recipientRole,
        lastError: d.lastError,
        at: d.completedAt ?? d._creationTime,
      })),
    );
    const incidents = (await ctx.db.query("incidents").order("desc").take(50)).map((i) => ({
      _id: i._id, workflowName: i.workflowName, failedNode: i.failedNode, message: i.message, at: i._creationTime,
    }));
    return { deliveries, incidents };
  },
});

export const auditLog = adminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: pageOf(
    v.object({ _id: v.id("auditLog"), at: v.number(), actorName: v.string(), action: v.string(), target: v.string() }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db.query("auditLog").order("desc").paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (a) => {
        const actor = a.actorId ? await ctx.db.get("users", a.actorId) : null;
        let target = `${a.targetTable}/${a.targetId}`;
        if (a.targetTable === "users") {
          const id = ctx.db.normalizeId("users", a.targetId);
          target = (id && (await ctx.db.get("users", id))?.name) || target;
        } else if (a.targetTable === "tools") {
          const id = ctx.db.normalizeId("tools", a.targetId);
          target = (id && (await ctx.db.get("tools", id))?.name) || target;
        }
        return { _id: a._id, at: a._creationTime, actorName: actor?.name ?? "CLI", action: a.action, target };
      }),
    );
    return { ...result, page };
  },
});
