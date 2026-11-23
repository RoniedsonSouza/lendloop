// WF3: summarize the failure without copying any payload data (no personal data in alerts).
const { execution = {}, workflow = {} } = $input.first().json;
const error = execution.error || {};
const message = String(error.message || 'Unknown error').slice(0, 500);
const failedNode = error.node && error.node.name ? String(error.node.name) : (execution.lastNodeExecuted || undefined);
return [{
  json: {
    method: 'POST',
    path: '/automation/incidents',
    body: { executionId: String(execution.id ?? `unknown-${Date.now()}`), workflowName: String(workflow.name || 'unknown'), failedNode, message },
    subject: `LendLoop automation failure: ${workflow.name || 'unknown workflow'}`,
    text: `Workflow: ${workflow.name}\nFailed node: ${failedNode || 'n/a'}\nExecution: ${execution.url || execution.id}\nError: ${message}`,
  },
}];
