import { v } from "convex/values";
import { currentUser, identityMutation, publicQuery } from "./lib/functions";
import { appError } from "./lib/errors";

/** Upserts the signed-in user's minimal profile (name + email) from the Clerk token. */
export const store = identityMutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in required");
    const email = identity.email;
    if (!email) throw appError("INVALID", "The session token must include an email claim");
    const name = identity.name ?? identity.givenName ?? email.split("@")[0];
    const firstName = identity.givenName ?? name.split(" ")[0];
    const existing = await currentUser(ctx);
    if (existing) {
      if (existing.name !== name || existing.email !== email || existing.firstName !== firstName) {
        await ctx.db.patch("users", existing._id, { name, email, firstName });
      }
      return existing._id;
    }
    return ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      firstName,
      email,
      role: "member",
      isTrustedLender: false,
    });
  },
});

export const me = publicQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.string(),
      firstName: v.string(),
      role: v.union(v.literal("member"), v.literal("admin")),
      isTrustedLender: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const { _id, name, firstName, role, isTrustedLender } = user;
    return { _id, name, firstName, role, isTrustedLender };
  },
});
