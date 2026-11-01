// Uploads generated Code-node bundles into an existing n8n workflow through the n8n public API, so large bundles
// arrive byte-exact. It changes nothing but Code nodes' jsCode. Validation, tests and exports still use the MCP tools.
// The API key is read from .env.local (N8N_API_KEY) and is never printed, logged or written anywhere.
// Usage (from web/): npx tsx scripts/n8n-sync-code.ts <wf04>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLocalEnv } from "./env-config";
import { generatedBundles } from "./export-n8n";
import { REPO_ROOT } from "./schemas";

const SETTINGS_KEYS = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder", "callerPolicy", "callerIds"];

/** Which generated entry a Code node runs: from the bundle header, or from the skeleton placeholder. */
export function entryOf(wf: string, jsCode: string): string | null {
  const header = new RegExp("generated from web/src/n8n/nodes/" + wf + "\\.ts \\((\\w+)\\)").exec(jsCode);
  const placeholder = new RegExp("^// " + wf + "\\.(\\w+): replaced").exec(jsCode);
  return header?.[1] ?? placeholder?.[1] ?? null;
}

async function main() {
  const wf = process.argv[2];
  if (!/^wf0\d$/.test(wf ?? "")) throw new Error("usage: n8n-sync-code.ts <wf0N>");
  const ids = JSON.parse(readFileSync(join(REPO_ROOT, "n8n", "workflow-ids.json"), "utf8")) as Record<string, string>;
  const id = ids[wf];
  if (!id) throw new Error("n8n/workflow-ids.json has no id for " + wf);
  const env = readLocalEnv() ?? {};
  const key = env.N8N_API_KEY;
  const base = (env.N8N_BASE_URL ?? "").replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  if (!key || !/^https:\/\/[a-z0-9.-]+$/i.test(base)) throw new Error("N8N_API_KEY and an https N8N_BASE_URL must be configured in .env.local");
  const headers = { "X-N8N-API-KEY": key, accept: "application/json", "content-type": "application/json" };
  const url = base + "/api/v1/workflows/" + id;

  const got = await fetch(url, { headers });
  if (!got.ok) throw new Error("GET workflow failed: HTTP " + got.status);
  const w = (await got.json()) as { name: string; nodes: Array<{ name: string; type: string; parameters: Record<string, unknown> }>; connections: unknown; settings?: Record<string, unknown> };
  const bundles = generatedBundles(wf);
  const changed: string[] = [];
  for (const n of w.nodes) {
    if (n.type !== "n8n-nodes-base.code") continue;
    const entry = entryOf(wf, String(n.parameters.jsCode ?? ""));
    if (!entry || !bundles.has(entry)) throw new Error("cannot map Code node '" + n.name + "' to a generated bundle");
    if (n.parameters.jsCode !== bundles.get(entry)) { n.parameters.jsCode = bundles.get(entry); changed.push(n.name + " = " + entry); }
  }
  if (!changed.length) { console.log("no Code node changes"); return; }
  const settings = Object.fromEntries(Object.entries(w.settings ?? {}).filter(([k]) => SETTINGS_KEYS.includes(k)));
  const put = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings }) });
  if (!put.ok) throw new Error("PUT workflow failed: HTTP " + put.status);
  console.log("updated " + changed.length + " Code node(s):");
  changed.forEach((c) => console.log("  " + c));
}

if (require.main === module) main().catch((e) => { console.error((e as Error).message); process.exit(1); });
