import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { memberMutation, memberQuery } from "./lib/functions";
import { LIMITS, nextStatus, type LoanAction } from "./lib/domain";
import { appError } from "./lib/errors";
import { addDays, daysBetween, isIsoDate, rangesOverlap, today as todayIn } from "./lib/dates";
import { appTimezone } from "./lib/config";
import { enqueueLoanUpdate } from "./automation/outbox";
import { deliveryKindValidator, loanStatusValidator, recipientRoleValidator } from "./schema";

function serverToday() {
  return todayIn(appTimezone());
}

async function loadLoan(ctx: MutationCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get("loans", loanId);
  if (!loan) throw appError("NOT_FOUND", "Loan not found");
  return loan;
}

/** Applies a state-machine transition, persists it and queues the notification. */
async function transition(ctx: MutationCtx, loan: Doc<"loans">, action: LoanAction, extra: Partial<Doc<"loans">> = {}) {
  const status = nextStatus(loan.status, action);
  const patch = { status, ...extra };
  await ctx.db.patch("loans", loan._id, patch);
  await enqueueLoanUpdate(ctx, { ...loan, ...patch }, status);
}

async function approvedLoansForTool(ctx: QueryCtx, toolId: Id<"tools">) {
  return ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .take(500);
}

export const request = memberMutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  returns: v.id("loans"),
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const tool = await ctx.db.get("tools", toolId);
    if (!tool || tool.status !== "active") throw appError("NOT_FOUND", "Listing not found");
    if (tool.ownerId === ctx.user._id) throw appError("FORBIDDEN", "You cannot borrow your own tool");
    const today = serverToday();
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) throw appError("INVALID", "Dates must be YYYY-MM-DD");
    if (startDate < today) throw appError("INVALID", "The loan cannot start in the past");
    if (startDate > addDays(today, LIMITS.maxStartDaysAhead)) {
      throw appError("INVALID", `The loan must start within ${LIMITS.maxStartDaysAhead} days`);
    }
    if (endDate < startDate) throw appError("INVALID", "The end date must be on or after the start date");
    if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
      throw appError("INVALID", `Loans can last at most ${LIMITS.maxLoanDays} days`);
    }

    const myPending = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.user._id).eq("status", "requested"))
      .take(LIMITS.maxPendingRequestsPerBorrower + 1);
    if (myPending.some((l) => l.toolId === toolId)) {
      throw appError("CONFLICT", "You already have an open request for this tool");
    }
    if (myPending.length >= LIMITS.maxPendingRequestsPerBorrower) {
      throw appError("CONFLICT", `You can have at most ${LIMITS.maxPendingRequestsPerBorrower} pending requests`);
    }
    const approved = await approvedLoansForTool(ctx, toolId);
    if (approved.some((l) => rangesOverlap(startDate, endDate, l.startDate, l.endDate))) {
      throw appError("CONFLICT", "The tool is already booked for those dates");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      ownerId: tool.ownerId,
      borrowerId: ctx.user._id,
      toolName: tool.name,
      startDate,
      endDate,
      status: "requested",
    });
    const loan = (await ctx.db.get("loans", loanId))!;
    await enqueueLoanUpdate(ctx, loan, "requested");
    return loanId;
  },
});

/**
 * Owner approves. Runs as one serializable transaction: two concurrent approvals of
 * overlapping requests cannot both commit (OCC re-runs the loser, which then sees the conflict).
 */
export const approve = memberMutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const loan = await loadLoan(ctx, loanId);
    if (loan.ownerId !== ctx.user._id) throw appError("FORBIDDEN", "Only the owner can approve");
    const today = serverToday();
    if (loan.status === "requested" && loan.startDate < today) {
      throw appError("CONFLICT", "This request's start date has passed; decline it instead");
    }
    const approved = await approvedLoansForTool(ctx, loan.toolId);
    if (approved.some((l) => l.endDate < today)) {
      throw appError("CONFLICT", "The tool has not come back from an overdue loan yet");
    }
    if (approved.some((l) => rangesOverlap(loan.startDate, loan.endDate, l.startDate, l.endDate))) {
      throw appError("CONFLICT", "Those dates overlap an approved loan");
    }
    await transition(ctx, loan, "approve", { decidedAt: Date.now() });

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "requested"))
      .take(500);
    for (const other of pending) {
      if (rangesOverlap(loan.startDate, loan.endDate, other.startDate, other.endDate)) {
        await transition(ctx, other, "decline", { decidedAt: Date.now(), closedReason: "dates_unavailable" });
      }
    }
    return null;
  },
});

export const decline = memberMutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const loan = await loadLoan(ctx, loanId);
    if (loan.ownerId !== ctx.user._id) throw appError("FORBIDDEN", "Only the owner can decline");
    await transition(ctx, loan, "decline", { decidedAt: Date.now() });
    return null;
  },
});

/** Borrower withdraws a pending request, or an approved booking that has not started. */
export const cancel = memberMutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const loan = await loadLoan(ctx, loanId);
    if (loan.borrowerId !== ctx.user._id) throw appError("FORBIDDEN", "Only the borrower can cancel");
    if (loan.status === "approved" && loan.startDate <= serverToday()) {
      throw appError("CONFLICT", "The loan has already started; ask the owner to mark it returned");
    }
    await transition(ctx, loan, "cancel", { decidedAt: Date.now(), closedReason: "borrower" });
    return null;
  },
});

/** Owner confirms the tool came back (also closes a loan that was never picked up). */
export const markReturned = memberMutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const loan = await loadLoan(ctx, loanId);
    if (loan.ownerId !== ctx.user._id) throw appError("FORBIDDEN", "Only the owner can confirm a return");
    if (loan.status === "approved" && loan.startDate > serverToday()) {
      throw appError("CONFLICT", "The loan has not started yet");
    }
    await transition(ctx, loan, "return", { returnedAt: Date.now() });
    return null;
  },
});

// ---------- views ----------

const activityValidator = v.object({
  kind: deliveryKindValidator,
  status: v.union(v.literal("sent"), v.literal("failed")),
  recipientRole: recipientRoleValidator,
  event: v.optional(v.string()),
  at: v.number(),
});

export const loanView = v.object({
  _id: v.id("loans"),
  toolId: v.id("tools"),
  toolName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  status: loanStatusValidator,
  closedReason: v.optional(v.string()),
  isOverdue: v.boolean(),
  hasStarted: v.boolean(),
  counterpart: v.object({ firstName: v.string(), name: v.optional(v.string()), email: v.optional(v.string()) }),
  activity: v.array(activityValidator),
});

/** Recent automation activity for a loan (bonus feature), newest first. */
export async function recentActivity(ctx: QueryCtx, loanId: Id<"loans">) {
  const rows = await ctx.db
    .query("deliveries")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(20);
  return rows
    .filter((d): d is typeof d & { status: "sent" | "failed" } => d.status === "sent" || d.status === "failed")
    .slice(0, 3)
    .map((d) => ({
      kind: d.kind,
      status: d.status,
      recipientRole: d.recipientRole,
      event: d.kind === "loan_update" ? d.key.split(":")[2] : undefined,
      at: d.completedAt ?? d._creationTime,
    }));
}

/** Contact details are revealed only once the owner has approved. */
export async function toLoanView(ctx: QueryCtx, loan: Doc<"loans">, counterpartId: Id<"users">, today: string) {
  const other = await ctx.db.get("users", counterpartId);
  const reveal = loan.status === "approved" || loan.status === "returned";
  return {
    _id: loan._id,
    toolId: loan.toolId,
    toolName: loan.toolName,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    closedReason: loan.closedReason,
    isOverdue: loan.status === "approved" && loan.endDate < today,
    hasStarted: loan.startDate <= today,
    counterpart: reveal
      ? { firstName: other?.firstName ?? "Neighbor", name: other?.name, email: other?.email }
      : { firstName: other?.firstName ?? "Neighbor" },
    activity: await recentActivity(ctx, loan._id),
  };
}

/**
 * The index is [userId, status], so each status is read separately: open loans are never
 * crowded out by a long history (history is capped per status).
 */
async function listFor(ctx: QueryCtx, index: "by_borrower" | "by_owner", userId: Id<"users">) {
  const field = index === "by_borrower" ? "borrowerId" : "ownerId";
  const limits = { requested: 200, approved: 200, returned: 50, declined: 25, cancelled: 25 } as const;
  const groups = await Promise.all(
    (Object.keys(limits) as (keyof typeof limits)[]).map((status) =>
      ctx.db
        .query("loans")
        .withIndex(index, (q) => q.eq(field, userId).eq("status", status))
        .order("desc")
        .take(limits[status]),
    ),
  );
  return groups.flat().sort((a, b) => b._creationTime - a._creationTime);
}

export const myRequests = memberQuery({
  args: { today: v.string() },
  returns: v.array(loanView),
  handler: async (ctx, { today }) => {
    const loans = await listFor(ctx, "by_borrower", ctx.user._id);
    return Promise.all(loans.map((l) => toLoanView(ctx, l, l.ownerId, today)));
  },
});

export const incoming = memberQuery({
  args: { today: v.string() },
  returns: v.array(loanView),
  handler: async (ctx, { today }) => {
    const loans = await listFor(ctx, "by_owner", ctx.user._id);
    return Promise.all(loans.map((l) => toLoanView(ctx, l, l.borrowerId, today)));
  },
});
