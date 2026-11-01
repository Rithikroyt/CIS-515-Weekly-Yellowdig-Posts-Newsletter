// Turns an n8n workflow (as returned by the MCP get_workflow_details tool) into a sanitized, importable export.
// Strips credentials, pinned data, webhook ids and instance metadata, and checks every Code node against the
// generated bundle in n8n/src/generated/<wf>/ so the repo and n8n cannot drift silently.
// Usage (from web/): npx tsx scripts/export-n8n.ts <details.json> <wf01|wf02|wf03> <out.json>
//   A jsCode value of "@@generated:<entry>" is filled from n8n/src/generated/<wf>/<entry>.js.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./schemas";

type Node = { id: string; name: string; type: string; typeVersion: number; position: number[]; parameters: Record<string, unknown>; [k: string]: unknown };
const KEEP_NODE_KEYS = ["id", "name", "type", "typeVersion", "position", "parameters", "executeOnce", "onError", "retryOnFail", "maxTries", "waitBetweenTries", "alwaysOutputData", "disabled", "notes"];
const KEEP_SETTINGS = ["executionOrder", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "callerPolicy"];

export function generatedBundles(wf: string): Map<string, string> {
  const dir = join(REPO_ROOT, "n8n", "src", "generated", wf);
  return new Map(readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => [f.replace(/\.js$/, ""), readFileSync(join(dir, f), "utf8")]));
}

export function sanitizeWorkflow(details: Record<string, unknown>, wf: string) {
  const w = (details.workflow ?? details) as Record<string, unknown>;
  const bundles = generatedBundles(wf);
  const codeReport: Array<{ node: string; entry: string | null; source: "n8n" | "generated" }> = [];
  const nodes = (w.nodes as Node[]).map((n) => {
    const out: Record<string, unknown> = {};
    KEEP_NODE_KEYS.forEach((k) => { if (n[k] !== undefined) out[k] = n[k]; });
    if (n.type === "n8n-nodes-base.code") {
      const params = { ...(n.parameters as Record<string, unknown>) };
      let code = String(params.jsCode ?? "");
      let source: "n8n" | "generated" = "n8n";
      const fill = /^@@generated:(\w+)$/.exec(code);
      if (fill) {
        if (!bundles.has(fill[1])) throw new Error(n.name + ": no generated bundle " + fill[1]);
        code = bundles.get(fill[1])!;
        source = "generated";
      }
      const entry = [...bundles.entries()].find(([, b]) => b === code)?.[0] ?? null;
      if (!entry) throw new Error(n.name + ": jsCode does not match any file in n8n/src/generated/" + wf + " (drift)");
      params.jsCode = code;
      out.parameters = params;
      codeReport.push({ node: n.name, entry, source });
    }
    return out;
  });
  const settings: Record<string, unknown> = {};
  KEEP_SETTINGS.forEach((k) => { const s = (w.settings as Record<string, unknown>)?.[k]; if (s !== undefined) settings[k] = s; });
  return {
    exported: {
      name: w.name,
      nodes,
      connections: w.connections,
      settings,
      pinData: {},
      nodeGroups: w.nodeGroups ?? [],
      tags: [],
      meta: { observatory: { workflowId: w.id, versionId: w.versionId, sanitized: true, note: "Credentials, pinned data, webhook ids and instance metadata removed. Code nodes are generated; see web/scripts/build-n8n.ts." } },
    },
    codeReport,
  };
}

if (require.main === module) {
  const [detailsPath, wf, outPath] = process.argv.slice(2);
  if (!detailsPath || !/^wf0\d$/.test(wf ?? "") || !outPath) throw new Error("usage: export-n8n.ts <details.json> <wf01|wf02|wf03> <out.json>");
  const { exported, codeReport } = sanitizeWorkflow(JSON.parse(readFileSync(detailsPath, "utf8")), wf);
  writeFileSync(outPath, JSON.stringify(exported, null, 2) + "\n", "utf8");
  console.log("wrote " + outPath);
  codeReport.forEach((r) => console.log("  " + r.node + " = " + r.entry + (r.source === "generated" ? " (filled from generated)" : " (exact match with n8n)")));
}
