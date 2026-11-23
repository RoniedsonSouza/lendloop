/**
 * Delivery ledger: one row per automated message, with claim/complete semantics so
 * that retries (from Convex or n8n) can never send the same message twice.
 *
 *   claim(key)    -> "send" if the message is new, queued/dispatched, or previously failed
 *                 -> "skip" if it is claimed (in flight), sent, or stale
 *   complete(key) -> sent | failed; repeating it is a no-op
 *
 * Convex mutations are serializable: two concurrent claims of the same key conflict on
 * the by_key index read, Convex re-runs the loser, and it sees the first claim -> "skip".
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { appError } from "../lib/errors";
import { daysBetween } from "../lib/dates";
import { deliveryKindValidator } from "../schema";

const CLAIMABLE = new Set(["queued", "dispatched", "failed", "dead"]);

export const claim = internalMutation({
  args: { key: v.string(), kind: deliveryKindValidator, loanId: v.optional(v.id("loans")) },
  returns: v.object({ decision: v.union(v.literal("send"), v.literal("skip")), reason: v.optional(v.string()) }),
  handler: async (ctx, { key, kind, loanId }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("deliveries")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      if (!CLAIMABLE.has(existing.status)) return { decision: "skip" as const, reason: existing.status };
      await ctx.db.patch("deliveries", existing._id, { status: "claimed", claimedAt: now });
      return { decision: "send" as const };
    }
    if (kind !== "overdue_reminder" || !loanId) throw appError("NOT_FOUND", "Unknown delivery");
    const loan = await ctx.db.get("loans", loanId);
    if (!loan) throw appError("NOT_FOUND", "Unknown loan");
    const asOf = key.split(":")[2];
    if (key !== `reminder:${loanId}:${asOf}`) throw appError("INVALID", "Key does not match loan");
    // The loan may have been returned between the overdue fetch and this claim.
    if (loan.status !== "approved" || loan.endDate >= asOf) return { decision: "skip" as const, reason: "not_overdue" };
    await ctx.db.insert("deliveries", {
      key,
      kind,
      loanId,
      recipientId: loan.borrowerId,
      recipientRole: "borrower",
      status: "claimed",
      dispatchAttempts: 0,
      claimedAt: now,
    });
    return { decision: "send" as const };
  },
});

export const complete = internalMutation({
  args: { key: v.string(), outcome: v.union(v.literal("sent"), v.literal("failed")), error: v.optional(v.string()) },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, { key, outcome, error }) => {
    const d = await ctx.db
      .query("deliveries")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!d) throw appError("NOT_FOUND", "Unknown delivery");
    if (d.status === "sent") return { status: "sent" };
    const now = Date.now();
    await ctx.db.patch("deliveries", d._id, {
      status: outcome,
      completedAt: now,
      lastError: outcome === "failed" ? (error ?? "unknown").slice(0, 200) : undefined,
    });
    if (outcome === "sent" && d.kind === "overdue_reminder") {
      await ctx.db.patch("loans", d.loanId, { lastReminderAt: now });
    }
    return { status: outcome };
  },
});

/** Overdue loans still needing today's reminder, with only the fields the email needs. */
export const overdueLoans = internalQuery({
  args: { asOf: v.string() },
  returns: v.object({
    asOf: v.string(),
    loans: v.array(
      v.object({
        loanId: v.id("loans"),
        toolName: v.string(),
        endDate: v.string(),
        daysOverdue: v.number(),
        borrower: v.object({ firstName: v.string(), email: v.string() }),
        ownerFirstName: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { asOf }) => {
    const overdue = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", asOf))
      .take(500);
    const loans = [];
    for (const loan of overdue) {
      const reminder = await ctx.db
        .query("deliveries")
        .withIndex("by_key", (q) => q.eq("key", `reminder:${loan._id}:${asOf}`))
        .unique();
      if (reminder && reminder.status !== "failed") continue;
      const [borrower, owner] = await Promise.all([
        ctx.db.get("users", loan.borrowerId),
        ctx.db.get("users", loan.ownerId),
      ]);
      if (!borrower) continue;
      loans.push({
        loanId: loan._id,
        toolName: loan.toolName,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, asOf),
        borrower: { firstName: borrower.firstName, email: borrower.email },
        ownerFirstName: owner?.firstName ?? "your neighbor",
      });
    }
    return { asOf, loans };
  },
});

export const recordIncident = internalMutation({
  args: {
    executionId: v.string(),
    workflowName: v.string(),
    failedNode: v.optional(v.string()),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("incidents")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .unique();
    if (existing) return null;
    console.error(`n8n incident in ${args.workflowName} (execution ${args.executionId})`);
    await ctx.db.insert("incidents", { ...args, message: args.message.slice(0, 500) });
    return null;
  },
});
