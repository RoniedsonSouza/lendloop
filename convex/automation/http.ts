/**
 * HTTP endpoints consumed by n8n. Every request must carry a valid HMAC v1 signature
 * made with LENDLOOP_AUTOMATION_SECRET. Pipeline: verify -> size -> parse -> validate -> run.
 */
import { ConvexError } from "convex/values";
import { env, httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "../lib/hmac";
import { appTimezone, today } from "../lib/dates";

const MAX_BODY_BYTES = 16_384;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Handler = (ctx: ActionCtx, body: unknown) => Promise<unknown>;

/** Wraps a handler with signature verification and uniform error mapping. */
function signedEndpoint(handler: Handler) {
  return httpAction(async (ctx, request) => {
    const raw = await request.text();
    const secret = env.LENDLOOP_AUTOMATION_SECRET;
    const valid =
      !!secret &&
      (await verifySignature(
        secret,
        raw,
        request.headers.get(TIMESTAMP_HEADER),
        request.headers.get(SIGNATURE_HEADER),
        Date.now(),
      ));
    // Generic answer: never tell the caller why authentication failed.
    if (!valid) return json(401, { error: "unauthorized" });
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });
    let body: unknown = undefined;
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        return json(400, { error: "invalid_json" });
      }
    }
    try {
      return json(200, await handler(ctx, body));
    } catch (e) {
      if (e instanceof ConvexError) {
        const code = (e.data as { code?: string }).code;
        return json(code === "NOT_FOUND" ? 404 : 400, { error: code ?? "invalid_request" });
      }
      // Argument validation errors from internal functions are client errors.
      if (e instanceof Error && /ArgumentValidationError|Validator error|does not match validator/i.test(e.message)) {
        return json(400, { error: "invalid_request" });
      }
      console.error("automation endpoint failed", e instanceof Error ? e.message : e);
      return json(500, { error: "internal_error" });
    }
  });
}

export const overdueLoans = signedEndpoint(async (ctx) =>
  ctx.runQuery(internal.automation.deliveries.overdueLoans, { asOf: today(appTimezone()) }),
);

export const claimDelivery = signedEndpoint(async (ctx, body) =>
  ctx.runMutation(internal.automation.deliveries.claim, body as never),
);

export const completeDelivery = signedEndpoint(async (ctx, body) =>
  ctx.runMutation(internal.automation.deliveries.complete, body as never),
);

export const recordIncident = signedEndpoint(async (ctx, body) =>
  ctx.runMutation(internal.automation.deliveries.recordIncident, body as never),
);
