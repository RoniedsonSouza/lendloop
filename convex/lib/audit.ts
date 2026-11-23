import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type AuditAction =
  | "listing.removed"
  | "user.trusted_set"
  | "user.trusted_unset"
  | "user.admin_granted";

export async function recordAudit(
  ctx: MutationCtx,
  actorId: Id<"users"> | undefined,
  action: AuditAction,
  targetTable: string,
  targetId: string,
  details?: string,
) {
  await ctx.db.insert("auditLog", { actorId, action, targetTable, targetId, details });
}
