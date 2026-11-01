// Repo-level checks run before every commit and in CI: schemas compile, issue and fixture JSON validate,
// n8n exports carry no credentials or pinned data, and no tracked file looks like a secret or student email.
// Usage (from web/): npm run validate
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadValidators, readJson, REPO_ROOT, type SchemaName } from "./schemas";
import { generatedBundles } from "./export-n8n";

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
  const wf = readJson(f) as { nodes?: Array<{ name: string; type: string; credentials?: unknown; webhookId?: unknown; parameters?: { jsCode?: string } }>; pinData?: Record<string, unknown> };
  (wf.nodes ?? []).forEach((n) => {
    if (n.credentials && Object.keys(n.credentials).length) fail(rel(f) + ": node '" + n.name + "' has credentials");
    if (n.webhookId) fail(rel(f) + ": node '" + n.name + "' has a webhookId");
  });
  if (wf.pinData && Object.keys(wf.pinData).length) fail(rel(f) + ": has pinData");
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

if (failures.length) {
  console.error("\nFAILED (" + failures.length + "):\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("\nvalidate: OK");
