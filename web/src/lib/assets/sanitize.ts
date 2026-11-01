// Untrusted n8n workflow JSON → bounded parse → structural shape check → security scan → sanitized in-memory copy.
// The workflow is DATA. Nothing here evaluates code or expressions, resolves credentials or follows URLs.
// All walks are iterative (explicit stacks) and bounded by ASSET_LIMITS.
import { ASSET_LIMITS } from "./limits";
import type { AssetReason, RawConnections, SafeNode, SanitizedWorkflow, SecurityReport } from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

// ---------- Bounded parse ----------
/** Maximum bracket nesting of JSON text, counted without parsing (strings are skipped). Stops early past `limit`. */
export function jsonDepth(text: string, limit: number): number {
  let depth = 0, max = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === 92) escaped = true; // \
      else if (c === 34) inString = false; // "
    } else if (c === 34) inString = true;
    else if (c === 123 || c === 91) { depth++; if (depth > max) { max = depth; if (max > limit) return max; } }
    else if (c === 125 || c === 93) depth--;
  }
  return max;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; reason: AssetReason };

export function parseWorkflowText(text: string): ParseResult {
  const body = text.replace(/^﻿/, "");
  if (jsonDepth(body, ASSET_LIMITS.maxJsonDepth) > ASSET_LIMITS.maxJsonDepth) return { ok: false, reason: "JSON_TOO_DEEP" };
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (e) {
    return { ok: false, reason: e instanceof RangeError ? "JSON_TOO_DEEP" : "INVALID_JSON" };
  }
}

/** n8n workflows (and copied selections) are objects with a nodes array and a connections object. */
export function looksLikeN8nWorkflow(v: unknown): v is { nodes: unknown[]; connections: Obj } & Obj {
  return isObj(v) && Array.isArray(v.nodes) && isObj(v.connections);
}

// ---------- Detection patterns (value-based) ----------
const SECRET_VALUE_RES: RegExp[] = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];
const URL_USERINFO_RE = /(\/\/)[^/\s:@'"<>]+:[^/\s@'"<>]+@/g;
const QUERY_SECRET_RE = /([?&](?:api[_-]?key|apikey|key|token|access[_-]?token|auth|sig|signature|password|secret|client[_-]?secret)=)[^&#\s"'<>]+/gi;
const WEBHOOK_URL_RE = /https?:\/\/[^\s"'<>]*\/(?:webhook|webhook-test|webhook-waiting|form|form-test)\/[^\s"'<>]+/gi;
// A secret-named identifier or key assigned a quoted literal, e.g. in Code-node source: password = '...'.
const ASSIGNED_SECRET_RE = /(\b(?:password|passwd|pwd|secret|client_?secret|api_?key|apikey|api_?token|access_?token|auth_?token|token)["']?\s*[:=]\s*)(["'`])(?!\[REDACTED\])[^"'`\s]{4,}\2/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DATA_URI_RE = /^data:[^;,]+;base64,/i;

/** Parameter keys whose values are secrets (compared lowercased with separators removed). */
const SECRET_KEYS = new Set([
  "password", "passwd", "pass", "pwd", "secret", "clientsecret", "apikey", "apisecret", "apitoken", "xapikey",
  "accesskey", "accesskeyid", "secretaccesskey", "privatekey", "token", "accesstoken", "refreshtoken", "authtoken",
  "bearertoken", "idtoken", "sessiontoken", "authorization", "auth", "cookie", "webhooksecret", "signingsecret",
]);
const SECRET_HEADER_RE = /(authorization|token|secret|api[-_]?key|password|cookie|x-auth)/i;
const CODE_KEYS = new Set(["jsCode", "pythonCode", "functionCode", "code"]);
const EXPRESSION_ONLY_RE = /^=?\s*\{\{[^}]*\}\}\s*$/;
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

type Counters = SecurityReport;

/** Redacts secrets, emails and webhook URLs in a string, counting what it removed. Pure apart from the counters. */
function redactString(s: string, c: Counters, limit: number): string {
  let out = s;
  if (out.length > limit) { out = out.slice(0, limit) + " [truncated]"; c.stringsTruncated++; }
  if (DATA_URI_RE.test(out)) { c.binaryDataDetected = true; return "[binary data removed]"; }
  SECRET_VALUE_RES.forEach((re) => { out = out.replace(re, () => { c.possibleSecretsDetected++; return "[REDACTED]"; }); });
  out = out.replace(ASSIGNED_SECRET_RE, (_m, p1: string, q: string) => { c.possibleSecretsDetected++; return p1 + q + "[REDACTED]" + q; });
  out = out.replace(URL_USERINFO_RE, (_m, p1: string) => { c.possibleSecretsDetected++; return p1 + "[REDACTED]@"; });
  out = out.replace(QUERY_SECRET_RE, (_m, p1: string) => { c.possibleSecretsDetected++; return p1 + "[REDACTED]"; });
  out = out.replace(WEBHOOK_URL_RE, () => { c.webhookUrlsRedacted++; return "[webhook URL removed]"; });
  out = out.replace(EMAIL_RE, () => { c.emailsDetected++; return "[email removed]"; });
  return out;
}

/** Deterministic label redaction without counters (used for node names on both sides of a connection). */
export function redactLabel(s: string): string {
  let out = s.slice(0, 500);
  SECRET_VALUE_RES.forEach((re) => { out = out.replace(re, "[REDACTED]"); });
  return out.replace(WEBHOOK_URL_RE, "[webhook URL removed]").replace(EMAIL_RE, "[email removed]");
}

class BudgetExceeded extends Error {}

/** Iterative deep copy of node parameters with redaction. Throws BudgetExceeded past maxJsonValues. */
function redactTree(root: unknown, c: Counters, budget: { left: number }, isWebhookNode: boolean): unknown {
  const scalar = (v: unknown, key: string | null): unknown => {
    if (--budget.left < 0) throw new BudgetExceeded();
    if (typeof v !== "string") return v;
    if (key !== null && isWebhookNode && key === "path" && v) { c.webhookUrlsRedacted++; return "[webhook path removed]"; }
    if (key !== null && SECRET_KEYS.has(norm(key)) && v) {
      if (!EXPRESSION_ONLY_RE.test(v)) c.possibleSecretsDetected++;
      return "[REDACTED]";
    }
    return redactString(v, c, key !== null && CODE_KEYS.has(key) ? ASSET_LIMITS.maxCodeInspect : ASSET_LIMITS.maxStringInspect);
  };
  if (!root || typeof root !== "object") return scalar(root, null);
  const out: unknown = Array.isArray(root) ? [] : {};
  const stack: Array<[unknown, Obj | unknown[]]> = [[root, out as Obj]];
  while (stack.length) {
    const [src, dst] = stack.pop()!;
    if (--budget.left < 0) throw new BudgetExceeded();
    const put = (k: string | number, v: unknown, key: string | null) => {
      if (v && typeof v === "object") {
        const child: Obj | unknown[] = Array.isArray(v) ? [] : {};
        (dst as Obj)[k as string] = child;
        stack.push([v, child]);
      } else (dst as Obj)[k as string] = scalar(v, key);
    };
    if (Array.isArray(src)) src.forEach((v, i) => put(i, v, null));
    else if (isObj(src)) {
      for (const [k, v] of Object.entries(src)) {
        if (k === "credentials" && isObj(v)) { c.credentialReferencesDetected += Object.keys(v).length; continue; }
        put(k, v, k);
      }
      // Header / query pairs: { name: "Authorization", value: "Bearer …" }
      const d = dst as Obj;
      if (typeof src.name === "string" && SECRET_HEADER_RE.test(src.name) && typeof src.value === "string" && src.value) {
        if (d.value !== "[REDACTED]" && !EXPRESSION_ONLY_RE.test(src.value)) c.possibleSecretsDetected++;
        d.value = "[REDACTED]";
      }
    }
  }
  return out;
}

export type SanitizeResult =
  | { ok: true; workflow: SanitizedWorkflow; security: SecurityReport }
  | { ok: false; reason: AssetReason; security: SecurityReport };

export function emptySecurity(): SecurityReport {
  return {
    credentialReferencesDetected: 0, pinnedDataDetected: false, executionDataDetected: false, staticDataDetected: false,
    binaryDataDetected: false, webhookIdsRemoved: 0, webhookUrlsRedacted: 0, possibleSecretsDetected: 0, emailsDetected: 0, stringsTruncated: 0,
  };
}

const nonEmpty = (v: unknown) => (Array.isArray(v) ? v.length > 0 : isObj(v) ? Object.keys(v).length > 0 : v !== undefined && v !== null && v !== "");

/**
 * Keeps only: workflow name, per-node {name, type, typeVersion, disabled, parameters (redacted), onError, retryOnFail, maxTries},
 * the raw connections (structure only, validated in graph.ts), and whether an error workflow is configured.
 * Drops: credentials, pinData, staticData, execution data, webhookId, ids, notes, meta, tags, settings values.
 */
export function sanitizeWorkflow(raw: unknown): SanitizeResult {
  const c = emptySecurity();
  if (!looksLikeN8nWorkflow(raw)) return { ok: false, reason: "NOT_N8N_WORKFLOW", security: c };
  if (raw.nodes.length > ASSET_LIMITS.maxNodes) return { ok: false, reason: "TOO_MANY_NODES", security: c };

  c.pinnedDataDetected = nonEmpty(raw.pinData);
  c.staticDataDetected = nonEmpty(raw.staticData);
  c.executionDataDetected = ["data", "executionData", "resultData", "runData"].some((k) => nonEmpty(raw[k]));
  const settings = isObj(raw.settings) ? raw.settings : {};
  const budget = { left: ASSET_LIMITS.maxJsonValues };
  const names = new Set<string>();
  const nodes: SafeNode[] = [];

  try {
    for (let i = 0; i < raw.nodes.length; i++) {
      const n = raw.nodes[i];
      if (!isObj(n) || typeof n.name !== "string" || !n.name.trim() || typeof n.type !== "string" || !n.type.trim()) {
        return { ok: false, reason: "UNSUPPORTED_STRUCTURE", security: c };
      }
      if (n.typeVersion !== undefined && typeof n.typeVersion !== "number") return { ok: false, reason: "UNSUPPORTED_STRUCTURE", security: c };
      if (n.parameters !== undefined && !isObj(n.parameters)) return { ok: false, reason: "UNSUPPORTED_STRUCTURE", security: c };
      if (n.disabled !== undefined && typeof n.disabled !== "boolean") return { ok: false, reason: "UNSUPPORTED_STRUCTURE", security: c };
      if (n.position !== undefined && !(Array.isArray(n.position) && n.position.length === 2 && n.position.every((x) => typeof x === "number" && Number.isFinite(x)))) {
        return { ok: false, reason: "UNSUPPORTED_STRUCTURE", security: c };
      }
      const name = redactLabel(n.name);
      if (names.has(name)) return { ok: false, reason: "UNSUPPORTED_STRUCTURE", security: c };
      names.add(name);
      if (isObj(n.credentials)) c.credentialReferencesDetected += Object.keys(n.credentials).length;
      if (typeof n.webhookId === "string" && n.webhookId) c.webhookIdsRemoved++;
      const type = n.type.slice(0, 160);
      const isWebhookNode = /\.(webhook|formTrigger)$/.test(type);
      redactString(n.name, c, ASSET_LIMITS.maxStringInspect); // count anything sensitive in the name itself
      nodes.push({
        index: i,
        name,
        type,
        typeVersion: typeof n.typeVersion === "number" ? n.typeVersion : null,
        disabled: n.disabled === true,
        parameters: (n.parameters ? redactTree(n.parameters, c, budget, isWebhookNode) : {}) as Obj,
        onError: typeof n.onError === "string" ? n.onError : null,
        retryOnFail: n.retryOnFail === true,
        maxTries: typeof n.maxTries === "number" && Number.isFinite(n.maxTries) ? Math.max(1, Math.floor(n.maxTries)) : null,
      });
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) return { ok: false, reason: "WORKFLOW_TOO_LARGE", security: c };
    throw e;
  }

  const workflow: SanitizedWorkflow = {
    name: redactString(typeof raw.name === "string" ? raw.name : "", c, 200).slice(0, 120),
    nodes,
    connections: raw.connections as RawConnections,
    hasErrorWorkflow: typeof settings.errorWorkflow === "string" && settings.errorWorkflow.length > 0,
  };

  // Defence in depth: nothing secret-shaped may survive into the sanitized copy.
  const leftover = JSON.stringify({ name: workflow.name, nodes: workflow.nodes });
  if ([...SECRET_VALUE_RES, ASSIGNED_SECRET_RE].some((re) => { re.lastIndex = 0; return re.test(leftover); }) || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(leftover)) {
    return { ok: false, reason: "SECRET_POLICY_FAILURE", security: c };
  }
  return { ok: true, workflow, security: c };
}
