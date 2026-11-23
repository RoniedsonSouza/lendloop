// WF1: read the exact raw request body and build the string to HMAC ("<ts>.<raw body>").
const item = $input.first();
const raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
const headers = item.json.headers || {};
const ts = String(headers['x-lendloop-timestamp'] || '');
const signature = String(headers['x-lendloop-signature'] || '');
return [{ json: { raw, ts, signature, signingInput: `${ts}.${raw}` } }];
