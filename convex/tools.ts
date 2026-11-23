import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { memberMutation, memberQuery, publicQuery } from "./lib/functions";
import { categoryValidator, conditionValidator } from "./schema";
import { LIMITS } from "./lib/domain";
import { appError } from "./lib/errors";
import { activeLoansByTool, availabilityFor } from "./lib/availability";
import { today as todayIn } from "./lib/dates";
import { appTimezone } from "./lib/config";
import { recordAudit } from "./lib/audit";
import { cancelOpenLoansForTool } from "./lib/loanRules";

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

const availabilityValidator = v.union(
  v.object({ state: v.literal("available") }),
  v.object({ state: v.literal("on_loan"), until: v.string() }),
  v.object({ state: v.literal("overdue"), until: v.string() }),
);

const toolView = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
  ownerFirstName: v.string(),
  ownerIsTrusted: v.boolean(),
  isMine: v.boolean(),
  availability: availabilityValidator,
});

function validateFields(f: { name: string; description: string }) {
  const name = f.name.trim();
  if (name.length < LIMITS.toolNameMin || name.length > LIMITS.toolNameMax) {
    throw appError("INVALID", `Name must be ${LIMITS.toolNameMin}-${LIMITS.toolNameMax} characters`);
  }
  if (f.description.length > LIMITS.descriptionMax) {
    throw appError("INVALID", `Description must be at most ${LIMITS.descriptionMax} characters`);
  }
  return { name, description: f.description.trim() };
}

async function getActiveTool(ctx: MutationCtx, toolId: Id<"tools">) {
  const tool = await ctx.db.get("tools", toolId);
  if (!tool || tool.status !== "active") throw appError("NOT_FOUND", "Listing not found");
  return tool;
}

/** Public landing page: available tools only, name + category only (no owner data). */
export const listAvailablePublic = publicQuery({
  args: { today: v.string() },
  returns: v.array(v.object({ _id: v.id("tools"), name: v.string(), category: categoryValidator })),
  handler: async (ctx, { today }) => {
    const onLoan = await activeLoansByTool(ctx, today);
    const recent = await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(LIMITS.publicListMax + onLoan.size);
    return recent
      .filter((t) => !onLoan.has(t._id))
      .slice(0, LIMITS.publicListMax)
      .map(({ _id, name, category }) => ({ _id, name, category }));
  },
});

async function toView(
  ctx: Parameters<typeof activeLoansByTool>[0],
  tools: Doc<"tools">[],
  today: string,
  viewer: Doc<"users">,
) {
  const active = await activeLoansByTool(ctx, today);
  const owners = await Promise.all(tools.map((t) => ctx.db.get("users", t.ownerId)));
  return tools.map((t, i) => ({
    _id: t._id,
    name: t.name,
    category: t.category,
    condition: t.condition,
    description: t.description,
    ownerFirstName: owners[i]?.firstName ?? "Neighbor",
    ownerIsTrusted: owners[i]?.isTrustedLender ?? false,
    isMine: t.ownerId === viewer._id,
    availability: availabilityFor(active.get(t._id), today, viewer),
  }));
}

export const browse = memberQuery({
  args: { today: v.string(), category: v.optional(categoryValidator), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(toolView),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx, { today, category, paginationOpts }) => {
    const query = category
      ? ctx.db
          .query("tools")
          .withIndex("by_status_category", (q) => q.eq("status", "active").eq("category", category))
      : ctx.db.query("tools").withIndex("by_status", (q) => q.eq("status", "active"));
    const result = await query.order("desc").paginate(paginationOpts);
    return { ...result, page: await toView(ctx, result.page, today, ctx.user) };
  },
});

export const mine = memberQuery({
  args: { today: v.string() },
  returns: v.array(v.object({ ...toolView.fields, pendingRequests: v.number() })),
  handler: async (ctx, { today }) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id).eq("status", "active"))
      .order("desc")
      .take(200);
    const views = await toView(ctx, tools, today, ctx.user);
    const pending = await Promise.all(
      tools.map((t) =>
        ctx.db
          .query("loans")
          .withIndex("by_tool_status", (q) => q.eq("toolId", t._id).eq("status", "requested"))
          .take(50),
      ),
    );
    return views.map((view, i) => ({ ...view, pendingRequests: pending[i].length }));
  },
});

export const create = memberMutation({
  args: toolFields,
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const { name, description } = validateFields(args);
    return ctx.db.insert("tools", {
      ownerId: ctx.user._id,
      name,
      description,
      category: args.category,
      condition: args.condition,
      status: "active",
    });
  },
});

export const update = memberMutation({
  args: { toolId: v.id("tools"), ...toolFields },
  returns: v.null(),
  handler: async (ctx, { toolId, ...fields }) => {
    const tool = await getActiveTool(ctx, toolId);
    if (tool.ownerId !== ctx.user._id) throw appError("FORBIDDEN", "Only the owner can edit a listing");
    const { name, description } = validateFields(fields);
    await ctx.db.patch("tools", toolId, { name, description, category: fields.category, condition: fields.condition });
    return null;
  },
});

/** Owner removes their listing; admins can remove any listing (audited). Soft delete. */
export const remove = memberMutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    const tool = await getActiveTool(ctx, toolId);
    const isOwner = tool.ownerId === ctx.user._id;
    if (!isOwner && ctx.user.role !== "admin") {
      throw appError("FORBIDDEN", "Only the owner or an admin can remove a listing");
    }
    await ctx.db.patch("tools", toolId, { status: "removed", removedAt: Date.now(), removedBy: ctx.user._id });
    await cancelOpenLoansForTool(ctx, toolId, todayIn(appTimezone()));
    if (!isOwner) await recordAudit(ctx, ctx.user._id, "listing.removed", "tools", toolId);
    return null;
  },
});
