import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { CATEGORIES, CONDITIONS, LOAN_STATUSES } from "./lib/domain";

export const categoryValidator = v.union(...CATEGORIES.map((c) => v.literal(c)));
export const conditionValidator = v.union(...CONDITIONS.map((c) => v.literal(c)));
export const loanStatusValidator = v.union(...LOAN_STATUSES.map((s) => v.literal(s)));
export const recipientRoleValidator = v.union(v.literal("owner"), v.literal("borrower"));
export const deliveryStatusValidator = v.union(
  v.literal("queued"),
  v.literal("dispatched"),
  v.literal("claimed"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("dead"),
  v.literal("stale"),
);
export const deliveryKindValidator = v.union(v.literal("loan_update"), v.literal("overdue_reminder"));

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    firstName: v.string(),
    email: v.string(),
    role: v.union(v.literal("member"), v.literal("admin")),
    isTrustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    status: v.union(v.literal("active"), v.literal("removed")),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    // Two indexes on purpose: by_status gives newest-first browsing, by_status_category the filter.
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes
    .index("by_status", ["status"])
    .index("by_status_category", ["status", "category"])
    .index("by_owner", ["ownerId", "status"]),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    toolName: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    closedReason: v.optional(
      v.union(v.literal("dates_unavailable"), v.literal("listing_removed"), v.literal("borrower")),
    ),
    lastReminderAt: v.optional(v.number()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId", "status"])
    .index("by_owner", ["ownerId", "status"])
    .index("by_status_start", ["status", "startDate"])
    .index("by_status_end", ["status", "endDate"]),

  deliveries: defineTable({
    key: v.string(),
    kind: deliveryKindValidator,
    loanId: v.id("loans"),
    recipientId: v.id("users"),
    recipientRole: recipientRoleValidator,
    payload: v.optional(v.any()),
    status: deliveryStatusValidator,
    dispatchAttempts: v.number(),
    nextDispatchAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    dispatchedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"])
    .index("by_status_next", ["status", "nextDispatchAt"]),

  incidents: defineTable({
    executionId: v.string(),
    workflowName: v.string(),
    failedNode: v.optional(v.string()),
    message: v.string(),
  }).index("by_execution", ["executionId"]),

  auditLog: defineTable({
    actorId: v.optional(v.id("users")),
    action: v.string(),
    targetTable: v.string(),
    targetId: v.string(),
    details: v.optional(v.string()),
  }),
});
