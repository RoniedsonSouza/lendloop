import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type Availability =
  | { state: "available" }
  | { state: "on_loan"; until: string }
  | { state: "overdue"; until: string };

/**
 * Loans that have started and are not returned, keyed by tool.
 * One indexed read for a whole page instead of one per tool.
 */
export async function activeLoansByTool(ctx: QueryCtx, today: string) {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_status_start", (q) => q.eq("status", "approved").lte("startDate", today))
    .take(1000);
  return new Map<Id<"tools">, Doc<"loans">>(loans.map((l) => [l.toolId, l]));
}

/** Overdue is only disclosed to the two parties and admins; everyone else sees "on loan". */
export function availabilityFor(
  loan: Doc<"loans"> | undefined,
  today: string,
  viewer: Doc<"users">,
): Availability {
  if (!loan) return { state: "available" };
  const isParty = viewer._id === loan.ownerId || viewer._id === loan.borrowerId || viewer.role === "admin";
  if (loan.endDate < today && isParty) return { state: "overdue", until: loan.endDate };
  return { state: "on_loan", until: loan.endDate };
}
