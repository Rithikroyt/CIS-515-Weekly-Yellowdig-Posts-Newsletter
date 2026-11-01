// Repo-level checks run before every commit and in CI: schemas compile, issue and fixture JSON validate,
// n8n exports carry no credentials or pinned data, and no tracked file looks like a secret or student email.
// Usage (from web/): npm run validate
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadValidators, readJson, REPO_ROOT, type SchemaName } from "./schemas";
import { generatedBundles } from "./export-n8n";
import { ENV_KEYS, SECRET_KEYS, parseEnvFile, readLocalEnv } from "./env-config";

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);
const rel = (p: string) => relative(REPO_ROOT, p).replace(/\\/g, "/");

function walk(dir: string, match: (p: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : walk(p, match);
    return match(p) ? [p] : [];
  });
}

// 1. Schemas compile (loadValidators throws otherwise).
const v = loadValidators();
console.log("schemas compile:", Object.keys(v).length);

// 2. Published issues and fixtures validate.
const check = (file: string, schema: SchemaName, many = false) => {
  const data = readJson(file);
  for (const item of many ? (data as unknown[]) : [data]) {
    if (!v[schema](item)) fail(rel(file) + " fails " + schema + ": " + JSON.stringify(v[schema].errors?.slice(0, 3)));
  }
};
const issueFiles = [
  ...walk(join(REPO_ROOT, "web", "public", "issues"), (p) => p.endsWith("issue.json")),
  ...walk(join(REPO_ROOT, "fixtures"), (p) => p.endsWith("issue.json")),
];
issueFiles.forEach((f) => check(f, "issue"));
walk(join(REPO_ROOT, "fixtures"), (p) => p.endsWith("normalized-posts.json")).forEach((f) => check(f, "normalized-post", true));
walk(join(REPO_ROOT, "fixtures"), (p) => p.endsWith("workflow-profiles.json")).forEach((f) => check(f, "workflow-profile", true));
walk(join(REPO_ROOT, "fixtures"), (p) => p.endsWith("asset-manifest.json")).forEach((f) => check(f, "asset-manifest"));
walk(join(REPO_ROOT, "fixtures"), (p) => p.endsWith("week-dataset.json")).forEach((f) => check(f, "week-dataset"));
console.log("issue files validated:", issueFiles.length);

// Published (non-fixture) issues must be approved and must not be synthetic.
walk(join(REPO_ROOT, "web", "public", "issues"), (p) => p.endsWith("issue.json")).forEach((f) => {
  const i = readJson(f) as { status: string; approvedBy: string | null };
  if (!["approved", "published"].includes(i.status) || !i.approvedBy) fail(rel(f) + " is public but not approved");
});

// 3. n8n exports: no credentials, no pinned data.
const exports = walk(join(REPO_ROOT, "n8n", "workflows"), (p) => p.endsWith(".json"));
exports.forEach((f) => {
  const wf = readJson(f) as {
    nodes?: Array<{ name: string; type: string; credentials?: unknown; webhookId?: unknown; parameters?: { jsCode?: string } }>;
    pinData?: Record<string, unknown>; staticData?: unknown; settings?: Record<string, unknown>;
  };
  (wf.nodes ?? []).forEach((n) => {
    if (n.credentials && Object.keys(n.credentials).length) fail(rel(f) + ": node '" + n.name + "' has credentials");
    if (n.webhookId) fail(rel(f) + ": node '" + n.name + "' has a webhookId");
  });
  if (wf.pinData && Object.keys(wf.pinData).length) fail(rel(f) + ": has pinData");
  if (wf.staticData) fail(rel(f) + ": has staticData");
  // A node wired to itself re-fires without progress (seen once in workflow 04's first build).
  Object.entries((wf as { connections?: Record<string, Record<string, Array<Array<{ node: string }> | null>>> }).connections ?? {}).forEach(([src, outs]) =>
    Object.values(outs).flat().forEach((arr) => (arr ?? []).forEach((c) => { if (c.node === src) fail(rel(f) + ": node '" + src + "' is connected to itself"); })));
  // Workflow 03 profiles untrusted workflow files: only triggers, Code nodes and notes; no AI, HTTP, webhooks or
  // sub-workflow calls, callable only by the owner's workflows, and no execution data saved.
  if (/[\\/]03-[^\\/]+$/.test(f)) {
    const allowed = new Set(["n8n-nodes-base.executeWorkflowTrigger", "n8n-nodes-base.manualTrigger", "n8n-nodes-base.code", "n8n-nodes-base.stickyNote"]);
    (wf.nodes ?? []).forEach((n) => { if (!allowed.has(n.type)) fail(rel(f) + ": node '" + n.name + "' has disallowed type " + n.type); });
    const s = wf.settings ?? {};
    if (s.callerPolicy !== "workflowsFromSameOwner") fail(rel(f) + ": callerPolicy must be workflowsFromSameOwner");
    if (s.saveDataSuccessExecution !== "none" || s.saveDataErrorExecution !== "none") fail(rel(f) + ": production execution data must not be saved");
  }
  // Workflow 04 drafts editorial copy: no AI/LangChain nodes (the model is reached only through one HTTP Request
  // node using an n8n credential), no webhooks, no publishing nodes, owner-only callers, no saved execution data.
  if (/[\\/]04-[^\\/]+$/.test(f)) {
    const allowed = new Set(["n8n-nodes-base.executeWorkflowTrigger", "n8n-nodes-base.manualTrigger", "n8n-nodes-base.code", "n8n-nodes-base.if",
      "n8n-nodes-base.noOp", "n8n-nodes-base.httpRequest", "n8n-nodes-base.stopAndError", "n8n-nodes-base.stickyNote"]);
    (wf.nodes ?? []).forEach((n) => { if (!allowed.has(n.type)) fail(rel(f) + ": node '" + n.name + "' has disallowed type " + n.type); });
    const http = (wf.nodes ?? []).filter((n) => n.type === "n8n-nodes-base.httpRequest") as Array<{ name: string; parameters?: Record<string, unknown> }>;
    if (http.length > 1) fail(rel(f) + ": only one model HTTP Request node is allowed");
    http.forEach((n) => {
      const p = n.parameters ?? {};
      if (p.authentication !== "predefinedCredentialType" || p.nodeCredentialType !== "googlePalmApi") fail(rel(f) + ": '" + n.name + "' must authenticate with the n8n Gemini credential");
      if (/key=|apikey|x-goog-api-key/i.test(JSON.stringify(p))) fail(rel(f) + ": '" + n.name + "' contains a key-like parameter");
    });
    const s = wf.settings ?? {};
    if (s.callerPolicy !== "workflowsFromSameOwner") fail(rel(f) + ": callerPolicy must be workflowsFromSameOwner");
    if (s.saveDataSuccessExecution !== "none" || s.saveDataErrorExecution !== "none") fail(rel(f) + ": production execution data must not be saved");
  }
  // Workflow 05 is the only public entry point: exactly one POST webhook with header auth, no HTTP Request or AI
  // nodes, sub-workflow calls only to 01, 02 and 04, Data Table access only to newsletter_runs (and read-only to
  // newsletter_assets), not callable as a sub-workflow, and no saved production execution data (the webhook request carries the secret header).
  if (/[\\/]05-[^\\/]+$/.test(f)) {
    const allowed = new Set(["n8n-nodes-base.webhook", "n8n-nodes-base.respondToWebhook", "n8n-nodes-base.manualTrigger", "n8n-nodes-base.code",
      "n8n-nodes-base.if", "n8n-nodes-base.switch", "n8n-nodes-base.dataTable", "n8n-nodes-base.executeWorkflow", "n8n-nodes-base.noOp", "n8n-nodes-base.stickyNote"]);
    const nodes = (wf.nodes ?? []) as Array<{ name: string; type: string; parameters?: Record<string, unknown> }>;
    nodes.forEach((n) => { if (!allowed.has(n.type)) fail(rel(f) + ": node '" + n.name + "' has disallowed type " + n.type); });
    const hooks = nodes.filter((n) => n.type === "n8n-nodes-base.webhook");
    if (hooks.length !== 1) fail(rel(f) + ": exactly one webhook is allowed");
    hooks.forEach((n) => { if (n.parameters?.authentication !== "headerAuth" || n.parameters?.httpMethod !== "POST") fail(rel(f) + ": webhook must be POST with header auth"); });
    const ids = readJson(join(REPO_ROOT, "n8n", "workflow-ids.json")) as Record<string, string>;
    const subs = new Set([ids.wf01, ids.wf02, ids.wf04]);
    nodes.filter((n) => n.type === "n8n-nodes-base.executeWorkflow").forEach((n) => {
      if (!subs.has(String((n.parameters?.workflowId as { value?: unknown })?.value))) fail(rel(f) + ": '" + n.name + "' calls a workflow other than 01, 02 or 04");
    });
    nodes.filter((n) => n.type === "n8n-nodes-base.dataTable").forEach((n) => {
      const table = (n.parameters?.dataTableId as { cachedResultName?: unknown })?.cachedResultName;
      if (table === "newsletter_assets" && n.parameters?.operation !== "get") fail(rel(f) + ": '" + n.name + "' may only read newsletter_assets");
      else if (table !== "newsletter_runs" && table !== "newsletter_assets") fail(rel(f) + ": '" + n.name + "' uses a table other than newsletter_runs or newsletter_assets");
    });
    const s = wf.settings ?? {};
    if (s.callerPolicy !== "none") fail(rel(f) + ": callerPolicy must be none");
    if (s.saveDataSuccessExecution !== "none" || s.saveDataErrorExecution !== "none") fail(rel(f) + ": production execution data must not be saved");
  }
  // Current exports (NN-*.json, not archive/) must run exactly the generated bundles.
  const m = /^(\d\d)-/.exec(f.split(/[\\/]/).pop() ?? "");
  if (m && !/[\\/]archive[\\/]/.test(f)) {
    const bundles = new Set(Object.values(Object.fromEntries(generatedBundles("wf" + m[1]))));
    (wf.nodes ?? []).filter((n) => n.type === "n8n-nodes-base.code").forEach((n) => {
      if (!bundles.has(n.parameters?.jsCode ?? "")) fail(rel(f) + ": Code node '" + n.name + "' differs from n8n/src/generated (rebuild and re-export)");
    });
  }
});
console.log("n8n exports checked:", exports.length);

// 4. Tracked and staged files: no secrets, no real email addresses.
const tracked = execSync("git ls-files --cached --others --exclude-standard", { cwd: REPO_ROOT, encoding: "utf8" })
  .split("\n").filter((f) => f && /\.(json|ts|tsx|js|mjs|md|html|ya?ml|env\.example|txt)$/.test(f) && !f.includes("package-lock"));
const SECRET = [
  /sk-ant-[A-Za-z0-9_-]{10,}/, /sk-[A-Za-z0-9]{32,}/, /ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/,
  /AKIA[0-9A-Z]{16}/, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL = /@(example\.(com|edu|org)|anthropic\.com|users\.noreply\.github\.com)$/;
tracked.forEach((f) => {
  const text = readFileSync(join(REPO_ROOT, f), "utf8");
  SECRET.forEach((re) => { if (re.test(text)) fail(f + ": looks like a secret (" + re.source.slice(0, 12) + "...)"); });
  (text.match(EMAIL) ?? []).filter((e) => !ALLOWED_EMAIL.test(e) && !/\.(png|svg|jpg)$/.test(e)).forEach((e) => fail(f + ": email address " + e.replace(/^(.).*@/, "$1***@")));
});
console.log("files scanned for secrets and emails:", tracked.length);

// 5. Environment safety. Values are never printed; only key names and file paths are reported.
const git = (args: string) => execSync("git " + args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
if (git("ls-files --cached -- .env.local .env .env.production")) fail(".env.local / .env is tracked or staged");
try { git("check-ignore -q .env.local"); } catch { fail(".env.local is not ignored by .gitignore"); }
const example = parseEnvFile(readFileSync(join(REPO_ROOT, ".env.example"), "utf8"));
ENV_KEYS.forEach((k) => { if (!(k in example)) fail(".env.example is missing " + k); });
SECRET_KEYS.forEach((k) => { if (example[k]) fail(".env.example has a value for secret " + k); });
const publicSecret = new RegExp("NEXT_PUBLIC_\\w*(" + SECRET_KEYS.join("|") + "|API_KEY|TOKEN|SECRET|SALT)");
tracked.forEach((f) => { if (publicSecret.test(readFileSync(join(REPO_ROOT, f), "utf8"))) fail(f + ": a secret is exposed through a NEXT_PUBLIC_ name"); });
// Any secret pasted into .env.local must not appear verbatim in a tracked file.
const local = readLocalEnv();
const localSecrets = local ? SECRET_KEYS.filter((k) => (local[k] ?? "").length >= 8) : [];
tracked.forEach((f) => {
  const text = readFileSync(join(REPO_ROOT, f), "utf8");
  localSecrets.forEach((k) => { if (text.includes(local![k])) fail(f + ": contains the value of " + k + " from .env.local"); });
});
console.log("env checks: .env.local ignored, .env.example complete, " + localSecrets.length + " local secret value(s) checked against tracked files");

if (failures.length) {
  console.error("\nFAILED (" + failures.length + "):\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("\nvalidate: OK");
