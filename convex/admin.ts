import { v } from "convex/values";
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
