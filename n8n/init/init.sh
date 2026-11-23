#!/bin/sh
# One-shot init: creates encrypted n8n credentials from env, imports and publishes workflows.
# Secrets only exist in this container's env and in n8n's encrypted DB; never in the repo.
set -eu
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
node -e '
const fs = require("fs");
const tpl = fs.readFileSync("/n8n/credentials/credentials.template.json", "utf8");
const out = tpl.replace(/\$\{([A-Z_]+)\}/g, (_, k) => {
  const v = process.env[k];
  if (v === undefined) { console.error("missing env " + k); process.exit(1); }
  return v;
});
JSON.parse(out);
fs.writeFileSync(process.argv[1], out);
' "$TMP/credentials.json"
n8n import:credentials --input="$TMP/credentials.json"
n8n import:workflow --separate --input=/n8n/workflows
for f in /n8n/workflows/*.json; do
  id=$(node -e 'console.log(require(process.argv[1]).id)' "$f")
  n8n publish:workflow --id="$id"
done
echo "n8n init done"
