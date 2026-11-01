// Local environment configuration: names, which ones are secrets, and a reader for .env.local.
// Reports only "configured" / "missing". Values are never printed, logged or returned to a caller that prints.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./schemas";

/** Secret values: must be blank in .env.example and never appear in tracked files or NEXT_PUBLIC_ names. */
export const SECRET_KEYS = [
  "YELLOWDIG_API_KEY", "N8N_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
  "GITHUB_TOKEN", "N8N_WEBHOOK_SECRET", "PSEUDONYMIZATION_SALT",
] as const;

/** Every name the app knows. Blank is allowed until the phase that needs it. */
export const ENV_KEYS = [
  "YELLOWDIG_API_KEY", "YELLOWDIG_API_BASE_URL", "YELLOWDIG_NETWORK", "YELLOWDIG_COMMUNITY_ID",
  "N8N_BASE_URL", "N8N_API_KEY",
  "APP_TIMEZONE", "CIS515_DEFAULT_WEEK",
  "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
  "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH",
  "REVIEWER_EMAIL",
  "N8N_GENERATE_WEBHOOK_URL", "N8N_REVIEW_WEBHOOK_URL", "N8N_WEBHOOK_SECRET",
  "PSEUDONYMIZATION_SALT",
] as const;

/** Parses KEY=value lines. Comments and blank lines are ignored; surrounding quotes are removed. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  });
  return out;
}

export function readLocalEnv(): Record<string, string> | null {
  const p = join(REPO_ROOT, ".env.local");
  return existsSync(p) ? parseEnvFile(readFileSync(p, "utf8")) : null;
}

/** Status per key. Contains no values. */
export function envStatus(env: Record<string, string> | null): Array<{ key: string; status: "configured" | "missing" }> {
  return ENV_KEYS.map((key) => ({ key, status: env && env[key] ? "configured" : "missing" }));
}

if (require.main === module) {
  const env = readLocalEnv();
  if (!env) console.log(".env.local: not found (copy .env.example to .env.local)");
  envStatus(env).forEach((s) => console.log(s.key + ": " + s.status));
}
