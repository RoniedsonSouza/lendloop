/**
 * Contract tests: the JavaScript that runs inside n8n Code nodes must agree with the
 * Convex HMAC implementation. We run the real node sources (n8n/src/code/*.js) in a
 * sandbox with the same globals n8n provides, using a Node HMAC in place of the Crypto node.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { signPayload, verifySignature } from "../convex/lib/hmac";

const SECRET = "contract-secret";
const src = (name: string) => readFileSync(new URL(`./src/code/${name}.js`, import.meta.url), "utf8");

type Json = Record<string, unknown>;
async function runCode(name: string, input: Json, extra: Record<string, unknown> = {}): Promise<Json> {
  const fn = new Function("$input", "$", "$env", `return (async function () { ${src(name)} }).call(this);`);
  const out = await fn.call(extra.self ?? {}, { first: () => ({ json: input }) }, extra.$ ?? (() => ({})), extra.$env ?? {});
  return (out as { json: Json }[])[0].json;
}
/** Stand-in for the n8n Crypto node (HMAC-SHA256, hex) configured with the credential secret. */
const cryptoNode = (input: string) => createHmac("sha256", SECRET).update(input).digest("hex");

async function n8nVerifies(raw: string, ts: string, signature: string) {
  const self = { helpers: { getBinaryDataBuffer: async () => Buffer.from(raw, "utf8") } };
  const prepared = await runCode("verify-prepare", { headers: { "x-lendloop-timestamp": ts, "x-lendloop-signature": signature } }, { self });
  const expected = cryptoNode(String(prepared.signingInput));
  return runCode("verify-check", { ...prepared, expected });
}

const event = JSON.stringify({ deliveryKey: "loan:abc:requested", type: "loan.requested" });
const now = () => Math.floor(Date.now() / 1000);

describe("Convex -> n8n signature contract", () => {
  test("n8n accepts a payload signed by Convex", async () => {
    const ts = now();
    const res = await n8nVerifies(event, String(ts), await signPayload(SECRET, event, ts));
    expect(res.valid).toBe(true);
  });
  test("n8n rejects a tampered payload", async () => {
    const ts = now();
    const sig = await signPayload(SECRET, event, ts);
    expect((await n8nVerifies(event.replace("abc", "abd"), String(ts), sig)).valid).toBe(false);
  });
  test("n8n rejects an expired timestamp", async () => {
    const ts = now() - 301;
    expect((await n8nVerifies(event, String(ts), await signPayload(SECRET, event, ts))).valid).toBe(false);
  });
  test("n8n rejects a missing signature", async () => {
    expect((await n8nVerifies(event, String(now()), "")).valid).toBe(false);
  });
});

describe("n8n -> Convex signature contract", () => {
  test("Convex accepts a request signed by the n8n sub-workflow", async () => {
    const prepared = await runCode("sign-prepare", { method: "POST", path: "/x", body: { key: "k", outcome: "sent" } });
    const signature = `v1=${cryptoNode(String(prepared.signingInput))}`;
    const ok = await verifySignature(SECRET, String(prepared.raw), String(prepared.ts), signature, Date.now());
    expect(ok).toBe(true);
  });
  test("GET requests sign an empty body", async () => {
    const prepared = await runCode("sign-prepare", { method: "GET", path: "/automation/overdue-loans", body: null });
    expect(prepared.raw).toBe("");
    const ok = await verifySignature(SECRET, "", String(prepared.ts), `v1=${cryptoNode(String(prepared.signingInput))}`, Date.now());
    expect(ok).toBe(true);
  });
});

describe("message rendering", () => {
  test("loan email is plain text addressed to the recipient", async () => {
    const ev = {
      deliveryKey: "loan:1:requested", type: "loan.requested", counterpartFirstName: "Bob",
      recipient: { firstName: "Ana", email: "ana@example.com" },
      loan: { toolName: "<b>Drill</b>", startDate: "2026-12-01", endDate: "2026-12-03" }, link: "http://app/incoming",
    };
    const res = await runCode("render-loan-email", {}, { $: () => ({ first: () => ({ json: { event: ev } }) }) });
    expect(res).toMatchObject({ to: "ana@example.com", subject: "LendLoop · New request for your <b>Drill</b>" });
    expect(String(res.text)).toContain("Bob would like to borrow your <b>Drill</b> (Dec 1 – Dec 3)");
  });
  test("incident summary carries no payload data", async () => {
    const res = await runCode("build-incident", {
      execution: { id: 7, url: "http://n8n/7", error: { message: "boom", node: { name: "Send email" } } },
      workflow: { name: "LendLoop · Loan notifications" },
    });
    expect(res.body).toEqual({ executionId: "7", workflowName: "LendLoop · Loan notifications", failedNode: "Send email", message: "boom" });
  });
});
