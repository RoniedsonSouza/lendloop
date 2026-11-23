import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { enqueueLoanUpdate } from "../automation/outbox";

/**
 * When a listing is removed: pending requests and approved-but-not-started
 * bookings are cancelled (and the borrower notified). Loans already in
 * progress are untouched so the owner can still confirm the return.
 */
export async function cancelOpenLoansForTool(ctx: MutationCtx, toolId: Id<"tools">, today: string) {
  const requested = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "requested"))
    .take(500);
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .take(500);
  const toCancel = [...requested, ...approved.filter((l) => l.startDate > today)];
  for (const loan of toCancel) {
    await ctx.db.patch("loans", loan._id, {
      status: "cancelled",
      closedReason: "listing_removed",
      decidedAt: Date.now(),
    });
    await enqueueLoanUpdate(ctx, { ...loan, status: "cancelled", closedReason: "listing_removed" }, "cancelled");
  }
  return toCancel.length;
}
