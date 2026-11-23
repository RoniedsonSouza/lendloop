import { describe, expect, test } from "vitest";
import { signPayload, verifySignature } from "./hmac";

const SECRET = "s3cr3t";
const NOW = 1_795_444_598_000;
const TS = Math.floor(NOW / 1000);

describe("hmac v1", () => {
  test("round trip verifies", async () => {
    const sig = await signPayload(SECRET, '{"a":1}', TS);
    expect(await verifySignature(SECRET, '{"a":1}', String(TS), sig, NOW)).toBe(true);
  });
  test("tampered body fails", async () => {
    const sig = await signPayload(SECRET, '{"a":1}', TS);
    expect(await verifySignature(SECRET, '{"a":2}', String(TS), sig, NOW)).toBe(false);
  });
  test("wrong secret fails", async () => {
    const sig = await signPayload("other", '{"a":1}', TS);
    expect(await verifySignature(SECRET, '{"a":1}', String(TS), sig, NOW)).toBe(false);
  });
  test("timestamp older than 300 s fails", async () => {
    const sig = await signPayload(SECRET, "{}", TS - 301);
    expect(await verifySignature(SECRET, "{}", String(TS - 301), sig, NOW)).toBe(false);
  });
  test("missing headers fail", async () => {
    expect(await verifySignature(SECRET, "{}", null, null, NOW)).toBe(false);
  });
  test("signature matches the documented format", async () => {
    expect(await signPayload(SECRET, "{}", TS)).toMatch(/^v1=[0-9a-f]{64}$/);
  });
});
