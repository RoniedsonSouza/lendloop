import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { LoanStatus } from "../lib/domain";

/** Records a loan status change for notification. Dispatch is added in the outbox task. */
export async function enqueueLoanUpdate(_ctx: MutationCtx, _loan: Doc<"loans">, _status: LoanStatus) {}
