/**
 * The ONLY place raw query/mutation builders are used. Every public Convex
 * function is built from one of these, so authorization is never optional
 * (enforced by the no-restricted-imports lint rule).
 */
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { appError } from "./errors";

export async function currentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Sign in required");
  const user = await currentUser(ctx);
  if (!user) throw appError("UNAUTHENTICATED", "Account not provisioned yet");
  return user;
}

async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw appError("FORBIDDEN", "Admins only");
  return user;
}

/** Callable by anyone, including anonymous visitors. Must return minimal projections. */
export const publicQuery = query;
/** Raw authenticated mutation (identity checked by the handler itself). */
export const identityMutation = mutation;

export const memberQuery = customQuery(query, customCtx(async (ctx) => ({ user: await requireUser(ctx) })));
export const memberMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);
export const adminQuery = customQuery(query, customCtx(async (ctx) => ({ user: await requireAdmin(ctx) })));
export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireAdmin(ctx) })),
);
