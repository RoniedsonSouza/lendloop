#!/usr/bin/env node
/**
 * Generates n8n/workflows/*.json from code. Code-node bodies live in n8n/src/code/*.js so
 * they are reviewable and unit-tested (n8n/contract.test.ts). Re-run after any change:
 *   node n8n/src/build.mjs
 * The output contains credential references (id + name) only — never secret values.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const code = (name) => readFileSync(join(here, "code", `${name}.js`), "utf8");

export const IDS = {
  signedRequest: "LlSignedRequest1",
  loanNotify: "LlLoanNotify0001",
  overdue: "LlOverdueRemind1",
  errorHandler: "LlErrorHandler01",
};
const CRED = {
  smtp: { smtp: { id: "LlSmtpCred000001", name: "LendLoop SMTP" } },
  webhookSecret: { crypto: { id: "LlWebhookSecret1", name: "LendLoop webhook secret" } },
  automationSecret: { crypto: { id: "LlAutomationSec1", name: "LendLoop automation secret" } },
};
const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 };
const FROM = "LendLoop <no-reply@lendloop.local>";

let x = 0;
const pos = () => [(x += 220), 0];
function node(name, type, typeVersion, parameters, extra = {}) {
  return { id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, type, typeVersion, position: pos(), parameters, ...extra };
}
const codeNode = (name, file) => node(name, "n8n-nodes-base.code", 2, { jsCode: code(file) });
const hmacNode = (name, field, credentials) =>
  node(name, "n8n-nodes-base.crypto", 2, {
    action: "hmac", type: "SHA256", value: "={{ $json.signingInput }}", dataPropertyName: field, encoding: "hex",
  }, { credentials });
const ifNode = (name, leftValue, operation, rightValue) =>
  node(name, "n8n-nodes-base.if", 2.2, {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [{
        id: `${name}-c`, leftValue, rightValue,
        operator: operation === "true"
          ? { type: "boolean", operation: "true", singleValue: true }
          : { type: "string", operation: "equals" },
      }],
      combinator: "and",
    },
    options: {},
  });
const setRequest = (name, method, path, bodyExpr) =>
  node(name, "n8n-nodes-base.code", 2, {
    jsCode: `return [{ json: { method: ${JSON.stringify(method)}, path: ${path}, body: ${bodyExpr} } }];`,
  });
const callSigned = (name, extra = {}) =>
  node(name, "n8n-nodes-base.executeWorkflow", 1.2, {
    source: "database",
    workflowId: { __rl: true, value: IDS.signedRequest, mode: "id" },
    mode: "each",
    options: { waitForSubWorkflow: true },
  }, extra);
const respond = (name, code, body) =>
  node(name, "n8n-nodes-base.respondToWebhook", 1.1, {
    respondWith: "json", responseBody: JSON.stringify(body), options: { responseCode: code },
  });
const email = (name, to, onError) =>
  node(name, "n8n-nodes-base.emailSend", 2.1, {
    fromEmail: FROM, toEmail: to, subject: "={{ $json.subject }}", emailFormat: "text", text: "={{ $json.text }}", options: {},
  }, { credentials: CRED.smtp, ...RETRY, ...(onError ? { onError } : {}) });

/** connections helper: [from, outputIndex, to] */
function connect(links) {
  const c = {};
  for (const [from, out, to] of links) {
    c[from] ??= { main: [] };
    while (c[from].main.length <= out) c[from].main.push([]);
    c[from].main[out].push({ node: to, type: "main", index: 0 });
  }
  return c;
}
function workflow(id, name, nodes, links, settings = {}) {
  x = 0;
  return {
    id, name, nodes, connections: connect(links), pinData: {}, active: false,
    settings: { executionOrder: "v1", saveManualExecutions: false, ...settings },
    tags: [],
  };
}
const onErrors = { errorWorkflow: IDS.errorHandler };

// ---- SUB: Signed Convex request ------------------------------------------------------
x = 0;
const signed = workflow(IDS.signedRequest, "LendLoop · Signed Convex request", [
  node("When called", "n8n-nodes-base.executeWorkflowTrigger", 1.1, { inputSource: "passthrough" }),
  codeNode("Prepare signature", "sign-prepare"),
  hmacNode("HMAC", "signature", CRED.automationSecret),
  node("Call Convex", "n8n-nodes-base.httpRequest", 4.2, {
    method: "={{ $json.method }}",
    url: "={{ $env.LENDLOOP_CONVEX_URL }}{{ $json.path }}",
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: "X-LendLoop-Timestamp", value: "={{ $json.ts }}" },
      { name: "X-LendLoop-Signature", value: "=v1={{ $json.signature }}" },
    ] },
    // Always true: an expression here hides the raw-body fields and n8n silently sends no body.
    sendBody: true,
    contentType: "raw", rawContentType: "application/json", body: "={{ $json.raw }}",
    options: { timeout: 10000 },
  }, RETRY),
// No errorWorkflow here: failures propagate to the calling workflow, which alerts once.
], [["When called", 0, "Prepare signature"], ["Prepare signature", 0, "HMAC"], ["HMAC", 0, "Call Convex"]]);

// ---- WF1: Loan notifications ----------------------------------------------------------
x = 0;
const notify = workflow(IDS.loanNotify, "LendLoop · Loan notifications", [
  node("Loan event webhook", "n8n-nodes-base.webhook", 2.1, {
    httpMethod: "POST", path: "lendloop/loan-events", responseMode: "responseNode", options: { rawBody: true },
  }, { webhookId: "3c7e1f62-4a8b-4d5e-9f10-6c3f2a9b0001" }),
  codeNode("Read raw body", "verify-prepare"),
  hmacNode("Expected signature", "expected", CRED.webhookSecret),
  codeNode("Verify signature", "verify-check"),
  ifNode("Signature valid?", "={{ $json.valid }}", "true"),
  respond("Reject", 401, { error: "unauthorized" }),
  setRequest("Claim request", "POST", "'/automation/deliveries/claim'", "{ key: $json.event.deliveryKey, kind: 'loan_update' }"),
  callSigned("Claim delivery"),
  ifNode("Should send?", "={{ $json.decision }}", "equals", "send"),
  respond("Already handled", 200, { status: "duplicate" }),
  respond("Accept", 202, { status: "accepted" }),
  codeNode("Render email", "render-loan-email"),
  email("Send email", "={{ $json.to }}", "continueErrorOutput"),
  setRequest("Complete sent", "POST", "'/automation/deliveries/complete'", "{ key: $('Verify signature').first().json.event.deliveryKey, outcome: 'sent' }"),
  callSigned("Record sent"),
  setRequest("Complete failed", "POST", "'/automation/deliveries/complete'", "{ key: $('Verify signature').first().json.event.deliveryKey, outcome: 'failed', error: String($json.error?.message ?? 'smtp error').slice(0, 200) }"),
  callSigned("Record failure"),
  node("Fail run", "n8n-nodes-base.stopAndError", 1, { errorMessage: "Notification email could not be sent" }),
], [
  ["Loan event webhook", 0, "Read raw body"], ["Read raw body", 0, "Expected signature"],
  ["Expected signature", 0, "Verify signature"], ["Verify signature", 0, "Signature valid?"],
  ["Signature valid?", 0, "Claim request"], ["Signature valid?", 1, "Reject"],
  ["Claim request", 0, "Claim delivery"], ["Claim delivery", 0, "Should send?"],
  ["Should send?", 0, "Accept"], ["Should send?", 1, "Already handled"],
  ["Accept", 0, "Render email"], ["Render email", 0, "Send email"],
  ["Send email", 0, "Complete sent"], ["Send email", 1, "Complete failed"],
  ["Complete sent", 0, "Record sent"], ["Complete failed", 0, "Record failure"], ["Record failure", 0, "Fail run"],
], onErrors);

// ---- WF2: Daily overdue reminders ------------------------------------------------------
x = 0;
const overdue = workflow(IDS.overdue, "LendLoop · Daily overdue reminders", [
  node("Every day at 09:00", "n8n-nodes-base.scheduleTrigger", 1.2, {
    rule: { interval: [{ field: "cronExpression", expression: "0 9 * * *" }] },
  }),
  // Lets `npm run n8n:remind` (n8n CLI) run the same production path on demand.
  node("Run now (CLI)", "n8n-nodes-base.executeWorkflowTrigger", 1.1, { inputSource: "passthrough" }),
  setRequest("Overdue request", "GET", "'/automation/overdue-loans'", "null"),
  callSigned("Fetch overdue loans"),
  node("One item per loan", "n8n-nodes-base.splitOut", 1, { fieldToSplitOut: "loans", options: {} }),
  // batchSize must stay 1: loop nodes reference the current loan with $('Loop over loans').first().
  node("Loop over loans", "n8n-nodes-base.splitInBatches", 3, { batchSize: 1, options: {} }),
  setRequest("Claim request", "POST", "'/automation/deliveries/claim'",
    "{ key: `reminder:${$('Loop over loans').first().json.loanId}:${$('Fetch overdue loans').first().json.asOf}`, kind: 'overdue_reminder', loanId: $('Loop over loans').first().json.loanId }"),
  // A failure for one loan is recorded and the loop continues with the next borrower.
  callSigned("Claim reminder", { onError: "continueErrorOutput" }),
  ifNode("Should send?", "={{ $json.decision }}", "equals", "send"),
  codeNode("Render reminder", "render-reminder"),
  email("Send reminder", "={{ $json.to }}", "continueErrorOutput"),
  setRequest("Complete sent", "POST", "'/automation/deliveries/complete'",
    "{ key: `reminder:${$('Loop over loans').first().json.loanId}:${$('Fetch overdue loans').first().json.asOf}`, outcome: 'sent' }"),
  callSigned("Record sent", { onError: "continueErrorOutput" }),
  setRequest("Complete failed", "POST", "'/automation/deliveries/complete'",
    "{ key: `reminder:${$('Loop over loans').first().json.loanId}:${$('Fetch overdue loans').first().json.asOf}`, outcome: 'failed', error: String($json.error?.message ?? 'smtp error').slice(0, 200) }"),
  callSigned("Record failure", { onError: "continueErrorOutput" }),
  node("Mark failed", "n8n-nodes-base.code", 2, { jsCode: "return [{ json: { failed: true } }];" }),
  node("Count failures", "n8n-nodes-base.code", 2, {
    // The loop's "done" output carries every item fed back into it (one per loan).
    jsCode: "const failed = $input.all().filter((i) => i.json.status === 'failed' || i.json.failed === true).length;\nreturn [{ json: { failed } }];",
  }),
  ifNode("Any failure?", "={{ $json.failed > 0 }}", "true"),
  node("Fail run", "n8n-nodes-base.stopAndError", 1, { errorMessage: "={{ $json.failed }} overdue reminder(s) could not be sent" }),
], [
  ["Every day at 09:00", 0, "Overdue request"], ["Run now (CLI)", 0, "Overdue request"], ["Overdue request", 0, "Fetch overdue loans"],
  ["Fetch overdue loans", 0, "One item per loan"], ["One item per loan", 0, "Loop over loans"],
  ["Loop over loans", 0, "Count failures"], ["Loop over loans", 1, "Claim request"],
  ["Claim request", 0, "Claim reminder"], ["Claim reminder", 0, "Should send?"],
  ["Should send?", 0, "Render reminder"], ["Should send?", 1, "Loop over loans"],
  ["Render reminder", 0, "Send reminder"],
  ["Send reminder", 0, "Complete sent"], ["Send reminder", 1, "Complete failed"],
  ["Complete sent", 0, "Record sent"], ["Record sent", 0, "Loop over loans"],
  ["Complete failed", 0, "Record failure"], ["Record failure", 0, "Loop over loans"],
  ["Claim reminder", 1, "Mark failed"], ["Record sent", 1, "Mark failed"], ["Record failure", 1, "Mark failed"],
  ["Mark failed", 0, "Loop over loans"],
  ["Count failures", 0, "Any failure?"], ["Any failure?", 0, "Fail run"],
], onErrors);

// ---- WF3: Error handler -----------------------------------------------------------------
x = 0;
const errorHandler = workflow(IDS.errorHandler, "LendLoop · Error handler", [
  node("On workflow error", "n8n-nodes-base.errorTrigger", 1, {}),
  codeNode("Build incident", "build-incident"),
  email("Alert ops", "={{ $env.OPS_ALERT_EMAIL }}", "continueRegularOutput"),
  node("Incident request", "n8n-nodes-base.code", 2, {
    jsCode: "const i = $('Build incident').first().json;\nreturn [{ json: { method: i.method, path: i.path, body: i.body } }];",
  }),
  callSigned("Record incident"),
], [
  ["On workflow error", 0, "Build incident"], ["Build incident", 0, "Alert ops"],
  ["Alert ops", 0, "Incident request"], ["Incident request", 0, "Record incident"],
]);

const out = join(here, "..", "workflows");
for (const [file, wf] of [
  ["01-signed-convex-request.json", signed],
  ["02-error-handler.json", errorHandler],
  ["03-loan-notifications.json", notify],
  ["04-daily-overdue-reminders.json", overdue],
]) {
  writeFileSync(join(out, file), JSON.stringify(wf, null, 2) + "\n");
  console.log(`wrote n8n/workflows/${file}`);
}
