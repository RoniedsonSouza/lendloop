/**
 * HMAC v1 signing shared by both integration directions.
 *
 *   X-LendLoop-Timestamp: <unix seconds>
 *   X-LendLoop-Signature: v1=<hex(HMAC_SHA256(secret, "<timestamp>.<raw body>"))>
 *
 * Uses Web Crypto only, so it runs in the default Convex runtime.
 */
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

async function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Returns the header value `v1=<hex>` for `body` signed at unix time `timestampSeconds`. */
export async function signPayload(
  secret: string,
  body: string,
  timestampSeconds: number,
): Promise<string> {
  const key = await importKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestampSeconds}.${body}`));
  return `v1=${toHex(mac)}`;
}

/**
 * Constant-time verification (crypto.subtle.verify) of a v1 signature,
 * rejecting timestamps outside the replay window.
 */
export async function verifySignature(
  secret: string,
  body: string,
  timestamp: string | null,
  signature: string | null,
  nowMs: number,
): Promise<boolean> {
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (Math.abs(nowMs / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;
  if (!signature.startsWith("v1=")) return false;
  const mac = fromHex(signature.slice(3));
  if (!mac || mac.length !== 32) return false;
  const key = await importKey(secret, "verify");
  return crypto.subtle.verify(
    "HMAC",
    key,
    mac as Uint8Array<ArrayBuffer>,
    encoder.encode(`${timestamp}.${body}`),
  );
}

/** Builds the two signature headers for an outgoing request. */
export async function signedHeaders(secret: string, body: string, nowMs: number) {
  const ts = Math.floor(nowMs / 1000);
  return {
    "Content-Type": "application/json",
    [TIMESTAMP_HEADER]: String(ts),
    [SIGNATURE_HEADER]: await signPayload(secret, body, ts),
  };
}
