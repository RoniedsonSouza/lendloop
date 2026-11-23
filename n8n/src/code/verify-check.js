// WF1: constant-time comparison of the provided signature with the one the Crypto node
// computed (secret lives in the "LendLoop webhook secret" credential), plus replay window.
const { raw, ts, signature, expected } = $input.first().json;
const provided = String(signature);
const wanted = 'v1=' + String(expected);
let diff = provided.length ^ wanted.length;
for (let i = 0; i < wanted.length; i++) diff |= wanted.charCodeAt(i) ^ (provided.charCodeAt(i) || 0);
const fresh = /^\d{1,12}$/.test(ts) && Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
let event = null;
if (diff === 0 && fresh) {
  try {
    event = JSON.parse(raw);
  } catch (e) {
    event = null;
  }
}
return [{ json: { valid: event !== null && typeof event.deliveryKey === 'string', event } }];
