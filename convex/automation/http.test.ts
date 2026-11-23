import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { setup, signIn, TOOL, type T } from "../test.setup";
import { signPayload } from "../lib/hmac";

const SECRET = "test-automation-secret";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  vi.stubEnv("LENDLOOP_AUTOMATION_SECRET", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function signed(body: string, opts: { ts?: number; secret?: string } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return {
    "Content-Type": "application/json",
    "X-LendLoop-Timestamp": String(ts),
    "X-LendLoop-Signature": await signPayload(opts.secret ?? SECRET, body, ts),
  };
}

async function overdueLoan(t: T) {
  const ana = await signIn(t, "Ana");
  const bob = await signIn(t, "Bob");
  const toolId = await ana.client.mutation(api.tools.create, TOOL);
  return t.run((ctx) =>
    ctx.db.insert("loans", { toolId, ownerId: ana.id, borrowerId: bob.id, toolName: TOOL.name, startDate: "2026-11-10", endDate: "2026-11-22", status: "approved" }),
  );
}

describe("automation HTTP endpoints", () => {
  test("unsigned request is rejected", async () => {
    const t = setup();
    const res = await t.fetch("/automation/overdue-loans", { method: "GET" });
    expect(res.status).toBe(401);
  });

  test("tampered body is rejected", async () => {
    const t = setup();
    const headers = await signed('{"key":"a"}');
    const res = await t.fetch("/automation/deliveries/claim", { method: "POST", headers, body: '{"key":"b"}' });
    expect(res.status).toBe(401);
  });

  test("expired timestamp is rejected", async () => {
    const t = setup();
    const headers = await signed("", { ts: Math.floor(Date.now() / 1000) - 301 });
    const res = await t.fetch("/automation/overdue-loans", { method: "GET", headers });
    expect(res.status).toBe(401);
  });

  test("oversized body is rejected with 413", async () => {
    const t = setup();
    const body = JSON.stringify({ key: "x".repeat(20_000) });
    const res = await t.fetch("/automation/deliveries/claim", { method: "POST", headers: await signed(body), body });
    expect(res.status).toBe(413);
  });

  test("malformed payload is rejected with 400", async () => {
    const t = setup();
    const body = JSON.stringify({ nope: true });
    const res = await t.fetch("/automation/deliveries/claim", { method: "POST", headers: await signed(body), body });
    expect(res.status).toBe(400);
  });

  test("signed overdue fetch, claim and complete flow", async () => {
    const t = setup();
    const loanId = await overdueLoan(t);
    let res = await t.fetch("/automation/overdue-loans", { method: "GET", headers: await signed("") });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.asOf).toBe("2026-11-23");
    expect(list.loans.map((l: { loanId: string }) => l.loanId)).toEqual([loanId]);

    const key = `reminder:${loanId}:2026-11-23`;
    const claim = JSON.stringify({ key, kind: "overdue_reminder", loanId });
    res = await t.fetch("/automation/deliveries/claim", { method: "POST", headers: await signed(claim), body: claim });
    expect(await res.json()).toEqual({ decision: "send" });

    const done = JSON.stringify({ key, outcome: "sent" });
    res = await t.fetch("/automation/deliveries/complete", { method: "POST", headers: await signed(done), body: done });
    expect(res.status).toBe(200);

    res = await t.fetch("/automation/overdue-loans", { method: "GET", headers: await signed("") });
    expect((await res.json()).loans).toEqual([]);
  });

  test("unknown loan id is a 400, not a crash", async () => {
    const t = setup();
    const claim = JSON.stringify({ key: "reminder:zzz:2026-11-23", kind: "overdue_reminder", loanId: "zzz" });
    const res = await t.fetch("/automation/deliveries/claim", { method: "POST", headers: await signed(claim), body: claim });
    expect(res.status).toBe(400);
  });
});
