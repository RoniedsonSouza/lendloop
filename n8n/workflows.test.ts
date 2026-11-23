import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

type Node = { name: string; onError?: string; parameters: { jsCode?: string } };
type Wf = { nodes: Node[]; connections: Record<string, { main: { node: string }[][] }> };
const wf: Wf = JSON.parse(readFileSync(new URL("./workflows/04-daily-overdue-reminders.json", import.meta.url), "utf8"));
const node = (n: string) => wf.nodes.find((x) => x.name === n)!;

describe("daily reminders workflow wiring", () => {
  test.each(["Claim reminder", "Record sent", "Record failure"])("%s failure does not stop the remaining reminders", (name) => {
    expect(node(name).onError).toBe("continueErrorOutput");
    const errorTargets = wf.connections[name].main[1].map((c) => c.node);
    expect(errorTargets).toEqual(["Mark failed"]);
  });

  test("failures are counted from every processed item, not the last run", async () => {
    const code = node("Count failures").parameters.jsCode!;
    const items = [{ json: { status: "sent" } }, { json: { status: "failed" } }, { json: { failed: true } }, { json: { decision: "skip" } }];
    const fn = new Function("$input", `return (async () => { ${code} })();`);
    const [out] = await fn({ all: () => items });
    expect(out.json.failed).toBe(2);
  });
});
