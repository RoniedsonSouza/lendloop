// SUB: serialize the body exactly once; the same string is signed and sent.
const { method, path, body } = $input.first().json;
const raw = method === 'GET' ? '' : JSON.stringify(body ?? {});
const ts = Math.floor(Date.now() / 1000);
return [{ json: { method, path, raw, ts, signingInput: `${ts}.${raw}` } }];
