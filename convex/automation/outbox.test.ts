import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { setup, signIn, TOOL, type T } from "../test.setup";
import { verifySignature } from "../lib/hmac";

const SECRET = "test-webhook-secret";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("N8N_LOAN_EVENTS_URL", "http://n8n.test/webhook/lendloop/loan-events");
  vi.stubEnv("APP_URL", "http://app.test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function requestLoan(t: T) {
  const ana = await signIn(t, "Ana");
  const bob = await signIn(t, "Bob");
  const toolId = await ana.client.mutation(api.tools.create, TOOL);
  const loanId = await bob.client.mutation(api.loans.request, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
  return { ana, bob, toolId, loanId };
}

const deliveries = (t: T) => t.run((ctx) => ctx.db.query("deliveries").collect());

describe("outbox", () => {
  test("a request queues one delivery to the owner and dispatches a signed webhook", async () => {
    const calls: { url: string; body: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), headers: new Headers(init.headers) });
      return new Response("{}", { status: 202 });
    });
    const t = setup();
    await requestLoan(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [d] = await deliveries(t);
    expect(d).toMatchObject({ kind: "loan_update", recipientRole: "owner", status: "dispatched", dispatchAttempts: 1 });
    expect(calls).toHaveLength(1);
    const ok = await verifySignature(SECRET, calls[0].body, calls[0].headers.get("X-LendLoop-Timestamp"), calls[0].headers.get("X-LendLoop-Signature"), Date.now());
    expect(ok).toBe(true);
  });

  test("payload carries only the fields the notification needs", async () => {
    let body = "";
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      body = String(init.body);
      return new Response("{}", { status: 202 });
    });
    const t = setup();
    const { loanId } = await requestLoan(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const payload = JSON.parse(body);
    expect(Object.keys(payload).sort()).toEqual(
      ["counterpartFirstName", "deliveryKey", "link", "loan", "occurredAt", "recipient", "type"],
    );
    expect(payload).toMatchObject({
      deliveryKey: `loan:${loanId}:requested`,
      type: "loan.requested",
      recipient: { firstName: "Ana", email: "ana@example.com" },
      counterpartFirstName: "Bob",
      loan: { toolName: TOOL.name, startDate: "2026-11-24", endDate: "2026-11-25" },
      link: "http://app.test/incoming",
    });
    expect(Object.keys(payload.recipient).sort()).toEqual(["email", "firstName"]);
  });

  test("approval notifies the borrower", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 202 }));
    const t = setup();
    const { ana, loanId } = await requestLoan(t);
    await ana.client.mutation(api.loans.approve, { loanId });
    const rows = await deliveries(t);
    expect(rows.map((r) => [r.key.split(":")[2], r.recipientRole])).toEqual([
      ["requested", "owner"],
      ["approved", "borrower"],
    ]);
  });

  test("5xx is retried with backoff, then dead after six attempts", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      return new Response("down", { status: 503 });
    });
    const t = setup();
    await requestLoan(t);
    const [queued] = await deliveries(t);
    await t.action(internal.automation.outbox.dispatch, { deliveryId: queued._id, attempt: 0 });
    let [d] = await deliveries(t);
    expect(d).toMatchObject({ status: "queued", dispatchAttempts: 1 });
    expect(d.nextDispatchAt! - Date.now()).toBeGreaterThanOrEqual(24_000);
    expect(d.nextDispatchAt! - Date.now()).toBeLessThanOrEqual(36_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    [d] = await deliveries(t);
    expect(d).toMatchObject({ status: "dead", dispatchAttempts: 6 });
    expect(n).toBe(6); // the originally scheduled attempt-0 run becomes a no-op: one chain only
  });

  test("4xx (e.g. bad signature) goes straight to dead", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 401 }));
    const t = setup();
    await requestLoan(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [d] = await deliveries(t);
    expect(d).toMatchObject({ status: "dead", dispatchAttempts: 1 });
  });

  test("network errors are retried", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      if (++n === 1) throw new TypeError("fetch failed");
      return new Response("{}", { status: 202 });
    });
    const t = setup();
    await requestLoan(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [d] = await deliveries(t);
    expect(d).toMatchObject({ status: "dispatched", dispatchAttempts: 2 });
  });

  test("sweep marks long-claimed deliveries stale and never resends them", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 202 }));
    const t = setup();
    await requestLoan(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [d] = await deliveries(t);
    await t.run((ctx) => ctx.db.patch("deliveries", d._id, { status: "claimed", claimedAt: Date.now() - 31 * 60_000 }));
    await t.mutation(internal.automation.outbox.sweep, {});
    expect((await deliveries(t))[0].status).toBe("stale");
  });

  test("sweep requeues a queued delivery whose dispatch never ran", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 202 }));
    const t = setup();
    await requestLoan(t);
    const [d] = await deliveries(t);
    await t.run((ctx) => ctx.db.patch("deliveries", d._id, { nextDispatchAt: Date.now() - 10 * 60_000 }));
    await t.mutation(internal.automation.outbox.sweep, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await deliveries(t))[0].status).toBe("dispatched");
  });
});
