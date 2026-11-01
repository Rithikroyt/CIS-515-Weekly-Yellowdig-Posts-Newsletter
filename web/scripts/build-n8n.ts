// Bundles the n8n Code-node entries (src/n8n/nodes) with the shared logic in src/lib, so n8n runs the exact
// code the tests run. Writes:
//   n8n/src/generated/<workflow>/<entry>.js           one file per Code node (what goes into jsCode)
//   n8n/sdk/<workflow>.workflow.js                     SDK code for the n8n MCP server, from <workflow>.template.js
// Usage (from web/): npm run build:n8n
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";
import { REPO_ROOT } from "./schemas";

export const ENTRIES = {
  wf01: ["devRunConfig", "validateConfig", "resolveMode", "loadFixture", "checkCapability", "classifyFetchFailure", "collectAndMinimize", "dedupe", "filterDateTopic", "assembleAndValidate"],
  wf02: ["fixtureRunConfig", "validateSourceMetadata", "classifyEvents", "joinToPosts", "computeMetrics", "validateDataset"],
} as const;

const WORKFLOWS = [
  { key: "wf01", file: "01-fetch-yellowdig-events" },
  { key: "wf02", file: "02-normalize-and-join" },
] as const;

// The bundle hands its entry to __obsSet instead of exporting it: the n8n task-runner sandbox drops the
// getter-based exports esbuild's IIFE uses (seen in n8n Cloud: "__obs.run is not a function").
const PRELUDE = "let __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n";
const WRAPPER =
  "const __ctx = {\n" +
  "  items: $input.all().map((i) => i.json),\n" +
  "  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n" +
  "  runIndex: $runIndex,\n" +
  "  now: new Date().toISOString(),\n" +
  "};\n" +
  "return __run(__ctx).map((json) => ({ json }));\n";

export function bundleEntry(wf: string, entry: string): string {
  const out = buildSync({
    stdin: { contents: 'import { ' + entry + ' } from "./' + wf + '";\n__obsSet(' + entry + ");", resolveDir: join(__dirname, "..", "src", "n8n", "nodes"), loader: "ts" },
    bundle: true, write: false, format: "iife", platform: "node", target: "es2020",
    minify: true, legalComments: "none", charset: "ascii", supported: { "template-literal": false },
  });
  const header = "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/" + wf + ".ts (" + entry + ") by web/scripts/build-n8n.ts. Do not edit in n8n.\n";
  // n8n Cloud allows require("crypto") in Code nodes; use the bare name rather than the "node:" prefix.
  // esbuild calls require through a renamed shim, so rewrite the specifier itself.
  const js = out.outputFiles[0].text.replace(/"node:crypto"/g, '"crypto"');
  if (/"node:/.test(js)) throw new Error(wf + "." + entry + ": bundle requires a Node module other than crypto");
  return header + PRELUDE + js + WRAPPER;
}

function main() {
  const ids = JSON.parse(readFileSync(join(REPO_ROOT, "n8n", "workflow-ids.json"), "utf8")) as Record<string, string>;
  for (const wf of WORKFLOWS) {
    const dir = join(REPO_ROOT, "n8n", "src", "generated", wf.key);
    mkdirSync(dir, { recursive: true });
    const code: Record<string, string> = {};
    for (const entry of ENTRIES[wf.key]) {
      code[entry] = bundleEntry(wf.key, entry);
      writeFileSync(join(dir, entry + ".js"), code[entry], "utf8");
    }
    const tpl = join(REPO_ROOT, "n8n", "sdk", wf.file + ".template.js");
    if (!existsSync(tpl)) continue;
    const missing = [...readFileSync(tpl, "utf8").matchAll(/__WORKFLOW_ID:(\w+)__/g)].map((m) => m[1]).filter((k) => !ids[k]);
    if (missing.length) {
      console.log(wf.file + ": bundles built; SDK skipped until n8n/workflow-ids.json has " + missing.join(", "));
      continue;
    }
    const fill = (full: boolean) => readFileSync(tpl, "utf8")
      .replace(/"__CODE:(\w+)__"/g, (_m, name: string) => {
        if (!(name in code)) throw new Error(wf.file + ": unknown code token " + name);
        return JSON.stringify(full ? code[name] : "// " + wf.key + "." + name + ": replaced with n8n/src/generated/" + wf.key + "/" + name + ".js after creation");
      })
      .replace(/__WORKFLOW_ID:(\w+)__/g, (_m, key: string) => {
        if (!ids[key]) throw new Error("n8n/workflow-ids.json has no id for " + key);
        return ids[key];
      });
    // Full SDK (reviewable, reproducible) and a skeleton with short code placeholders for MCP validate/create;
    // the bundles are then set per node with update_workflow.
    const sdk = fill(true);
    writeFileSync(join(REPO_ROOT, "n8n", "sdk", wf.file + ".workflow.js"), sdk, "utf8");
    writeFileSync(join(REPO_ROOT, "n8n", "sdk", wf.file + ".skeleton.js"), fill(false), "utf8");
    const sizes = Object.entries(code).map(([k, v]) => k + "=" + (v.length / 1024).toFixed(1) + "KB").join(" ");
    console.log(wf.file + ": " + sizes + " | sdk " + (sdk.length / 1024).toFixed(1) + "KB");
  }
}

if (require.main === module) main();
