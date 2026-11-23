#!/usr/bin/env node
/**
 * Guards the exported n8n workflows (run in CI):
 *  - no pinData (test data can contain personal data)
 *  - credentials referenced by id + name only; no secret-looking strings anywhere
 *  - every workflow except the error handler and the sub-workflow sets settings.errorWorkflow
 *  - every HTTP Request and Send Email node retries on failure
 *  - JSON is exactly what n8n/src/build.mjs generates (no hand edits drift)
 */
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DIR = "n8n/workflows";
const SECRET_PATTERNS = [/[a-f0-9]{48,}/i, /sk_(live|test)_/, /BEGIN [A-Z ]*PRIVATE KEY/, /hmacSecret/i, /password"\s*:\s*"[^"]+"/i];
const NO_ERROR_WORKFLOW = new Set(["LlErrorHandler01", "LlSignedRequest1"]);
const NEEDS_RETRY = new Set(["n8n-nodes-base.httpRequest", "n8n-nodes-base.emailSend"]);
const problems = [];

const before = Object.fromEntries(readdirSync(DIR).map((f) => [f, readFileSync(`${DIR}/${f}`, "utf8")]));
execFileSync("node", ["n8n/src/build.mjs"], { stdio: "ignore" });
for (const [f, content] of Object.entries(before)) {
  if (readFileSync(`${DIR}/${f}`, "utf8") !== content) problems.push(`${f}: out of date, run npm run n8n:build`);
}

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const text = readFileSync(`${DIR}/${file}`, "utf8");
  const wf = JSON.parse(text);
  if (wf.pinData && Object.keys(wf.pinData).length) problems.push(`${file}: contains pinData`);
  for (const p of SECRET_PATTERNS) if (p.test(text)) problems.push(`${file}: matches secret pattern ${p}`);
  if (!NO_ERROR_WORKFLOW.has(wf.id) && !wf.settings?.errorWorkflow) problems.push(`${file}: missing settings.errorWorkflow`);
  for (const n of wf.nodes) {
    for (const [type, ref] of Object.entries(n.credentials ?? {})) {
      const keys = Object.keys(ref).sort().join(",");
      if (keys !== "id,name") problems.push(`${file}: node "${n.name}" credential ${type} has fields ${keys}`);
    }
    if (NEEDS_RETRY.has(n.type) && n.retryOnFail !== true) problems.push(`${file}: node "${n.name}" lacks retryOnFail`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${readdirSync(DIR).length} workflows OK`);
