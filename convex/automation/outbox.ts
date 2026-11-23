/**
 * Transactional outbox: Convex -> n8n loan notifications.
 *
 * A loan mutation inserts a `deliveries` row AND schedules its dispatch in the same
 * transaction, so a notification exists iff the state change committed. The dispatch
 * action signs and POSTs the payload; transient failures are retried with exponential
 * backoff, permanent ones (4xx) go to `dead`. A cron sweeps rows a crashed action left
 * behind and marks deliveries that stopped progressing as `stale` (visible, never resent).
 */
import { v } from "convex/values";
import { env, internalAction, internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { LoanStatus } from "../lib/domain";
import { signedHeaders } from "../lib/hmac";

export const RETRY_DELAYS_MS = [30_000, 120_000, 480_000, 1_800_000, 7_200_000];
export const MAX_DISPATCH_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const DISPATCH_TIMEOUT_MS = 10_000;
const STALE_AFTER_MS = 30 * 60_000;
const LOST_DISPATCH_AFTER_MS = 5 * 60_000;

type Recipient = { id: Id<"users">; role: "owner" | "borrower" };

/** Who hears about each transition. */
function recipientFor(loan: Doc<"loans">, status: LoanStatus): Recipient {
  const owner: Recipient = { id: loan.ownerId, role: "owner" };
  const borrower: Recipient = { id: loan.borrowerId, role: "borrower" };
  switch (status) {
    case "requested":
      return owner;
    case "cancelled":
      return loan.closedReason === "borrower" ? owner : borrower;
    default:
      return borrower;
  }
}

/** Called inside loan mutations: records the event and schedules its dispatch atomically. */
export async function enqueueLoanUpdate(ctx: MutationCtx, loan: Doc<"loans">, status: LoanStatus) {
  const recipient = recipientFor(loan, status);
  const counterpart = await ctx.db.get("users", recipient.role === "owner" ? loan.borrowerId : loan.ownerId);
  const key = `loan:${loan._id}:${status}`;
  const existing = await ctx.db
    .query("deliveries")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) return;
  const now = Date.now();
  const deliveryId = await ctx.db.insert("deliveries", {
    key,
    kind: "loan_update",
    loanId: loan._id,
    recipientId: recipient.id,
    recipientRole: recipient.role,
    // Snapshot of the event; the recipient's contact is resolved at dispatch time.
    payload: {
      type: `loan.${status}`,
      occurredAt: now,
      counterpartFirstName: counterpart?.firstName ?? "A neighbor",
      loan: { toolName: loan.toolName, startDate: loan.startDate, endDate: loan.endDate },
      path: recipient.role === "owner" ? "/incoming" : "/requests",
    },
    status: "queued",
    dispatchAttempts: 0,
    nextDispatchAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.automation.outbox.dispatch, { deliveryId, attempt: 0 });
}

export const loadForDispatch = internalQuery({
  args: { deliveryId: v.id("deliveries"), attempt: v.number() },
  returns: v.union(v.null(), v.object({ body: v.string() })),
  handler: async (ctx, { deliveryId, attempt }) => {
    const d = await ctx.db.get("deliveries", deliveryId);
    // The attempt token makes a duplicate/late scheduled run a no-op (one dispatch chain per delivery).
    if (!d || d.status !== "queued" || d.dispatchAttempts !== attempt) return null;
    const recipient = await ctx.db.get("users", d.recipientId);
    if (!recipient) return null;
    const { path, ...event } = d.payload as { path: string } & Record<string, unknown>;
    const body = JSON.stringify({
      deliveryKey: d.key,
      ...event,
      recipient: { firstName: recipient.firstName, email: recipient.email },
      link: `${env.APP_URL ?? "http://localhost:3000"}${path}`,
    });
    return { body };
  },
});

export const dispatch = internalAction({
  args: { deliveryId: v.id("deliveries"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { deliveryId, attempt }) => {
    const loaded = await ctx.runQuery(internal.automation.outbox.loadForDispatch, { deliveryId, attempt });
    if (!loaded) return null;
    const url = env.N8N_LOAN_EVENTS_URL;
    const secret = env.LENDLOOP_WEBHOOK_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.automation.outbox.recordDispatchFailure, {
        deliveryId, error: "Automation is not configured (missing env)", retryable: false,
      });
      return null;
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: await signedHeaders(secret, loaded.body, Date.now()),
        body: loaded.body,
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });
      if (res.ok) {
        await ctx.runMutation(internal.automation.outbox.markDispatched, { deliveryId });
      } else {
        const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
        await ctx.runMutation(internal.automation.outbox.recordDispatchFailure, {
          deliveryId, error: `HTTP ${res.status}`, retryable,
        });
      }
    } catch (e) {
      const error = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "network error";
      await ctx.runMutation(internal.automation.outbox.recordDispatchFailure, { deliveryId, error, retryable: true });
    }
    return null;
  },
});

export const markDispatched = internalMutation({
  args: { deliveryId: v.id("deliveries") },
  returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    const d = await ctx.db.get("deliveries", deliveryId);
    // n8n may already have claimed it (its callback can beat our response): never move backwards.
    if (!d || d.status !== "queued") return null;
    await ctx.db.patch("deliveries", deliveryId, {
      status: "dispatched",
      dispatchAttempts: d.dispatchAttempts + 1,
      dispatchedAt: Date.now(),
      nextDispatchAt: undefined,
    });
    return null;
  },
});

export const recordDispatchFailure = internalMutation({
  args: { deliveryId: v.id("deliveries"), error: v.string(), retryable: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { deliveryId, error, retryable }) => {
    const d = await ctx.db.get("deliveries", deliveryId);
    if (!d || d.status !== "queued") return null;
    const attempts = d.dispatchAttempts + 1;
    if (!retryable || attempts >= MAX_DISPATCH_ATTEMPTS) {
      console.error(`delivery ${deliveryId} dead after ${attempts} attempt(s): ${error}`);
      await ctx.db.patch("deliveries", deliveryId, {
        status: "dead", dispatchAttempts: attempts, lastError: error, nextDispatchAt: undefined,
      });
      return null;
    }
    const jitter = 0.8 + Math.random() * 0.4;
    const delay = Math.round(RETRY_DELAYS_MS[attempts - 1] * jitter);
    await ctx.db.patch("deliveries", deliveryId, {
      dispatchAttempts: attempts, lastError: error, nextDispatchAt: Date.now() + delay,
    });
    await ctx.scheduler.runAfter(delay, internal.automation.outbox.dispatch, { deliveryId, attempt: attempts });
    return null;
  },
});

/** Cron: recover dispatches a crashed action lost; flag deliveries that stopped progressing. */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const lost = await ctx.db
      .query("deliveries")
      .withIndex("by_status_next", (q) => q.eq("status", "queued").lt("nextDispatchAt", now - LOST_DISPATCH_AFTER_MS))
      .take(100);
    for (const d of lost) {
      await ctx.db.patch("deliveries", d._id, { nextDispatchAt: now });
      await ctx.scheduler.runAfter(0, internal.automation.outbox.dispatch, {
        deliveryId: d._id,
        attempt: d.dispatchAttempts,
      });
    }
    for (const status of ["dispatched", "claimed"] as const) {
      const rows = await ctx.db
        .query("deliveries")
        .withIndex("by_status_next", (q) => q.eq("status", status))
        .take(500);
      for (const d of rows) {
        const since = status === "claimed" ? d.claimedAt : d.dispatchedAt;
        if (since !== undefined && since < now - STALE_AFTER_MS) {
          console.error(`delivery ${d._id} stale in ${status}`);
          await ctx.db.patch("deliveries", d._id, { status: "stale" });
        }
      }
    }
    return null;
  },
});

/** Cron: data minimization — drop completed delivery records and incidents after 90 days. */
export const purgeOld = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 90 * 86_400_000;
    for (const status of ["sent", "failed", "dead", "stale"] as const) {
      const rows = await ctx.db
        .query("deliveries")
        .withIndex("by_status_next", (q) => q.eq("status", status))
        .take(500);
      for (const d of rows) if (d._creationTime < cutoff) await ctx.db.delete("deliveries", d._id);
    }
    const incidents = await ctx.db.query("incidents").order("asc").take(500);
    for (const i of incidents) if (i._creationTime < cutoff) await ctx.db.delete("incidents", i._id);
    return null;
  },
});
