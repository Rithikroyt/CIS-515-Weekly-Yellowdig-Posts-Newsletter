// Live Yellowdig capability probe. ONE request, at most 10 events, analysed in memory only.
// Prints counts, field names and value SHAPES. Never prints values, ids, names, text, emails or the key.
// Nothing is written to disk. Usage (from web/): npx tsx scripts/probe-yellowdig.ts
import { randomBytes } from "node:crypto";
import { readLocalEnv } from "./env-config";
import {
  PROBE_PAGE_SIZE, SENSITIVE_KEY_RE, capabilityProbe, classifyFailure, eventsUrl, minimizeAll, parsePage,
} from "../src/lib/source";

const ID_LIKE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4,}|[A-Za-z0-9_-]{20,})$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Describes a value by shape only. */
function shape(v: unknown, depth = 0): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array[" + v.length + "]" + (v.length ? " of " + shape(v[0], depth + 1) : "");
  if (isObj(v)) {
    if (depth > 1) return "object";
    const keys = Object.keys(v).map((k) => (ID_LIKE.test(k) ? "<id-key>" : k));
    return "object{" + keys.slice(0, 12).join(", ") + (keys.length > 12 ? ", …" : "") + "}";
  }
  if (typeof v === "number") return Number.isInteger(v) ? (v > 1e11 ? "integer(epoch-ms?)" : v > 1e9 ? "integer(epoch-s?)" : "integer") : "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return "string(uuid)";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return "string(iso-datetime" + (/(Z|[+-]\d{2}:?\d{2})$/.test(v) ? ", with offset" : ", NO offset") + ")";
    if (/^\d+$/.test(v)) return "string(digits)";
    if (/^https?:\/\//.test(v)) return "string(url)";
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) return "string(EMAIL-LIKE)";
    if (/<[a-z][^>]*>/i.test(v)) return "string(html, " + bucket(v.length) + ")";
    if (/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(v)) return "string(keyword)";
    return "string(" + bucket(v.length) + ")";
  }
  return typeof v;
}
const bucket = (n: number) => (n === 0 ? "empty" : n <= 20 ? "short" : n <= 200 ? "medium" : "long");

/** path -> shapes, walking nested objects; sensitive keys recorded but never descended; id-like keys masked. */
function inventory(ev: unknown, out: Map<string, Set<string>>, path = "") {
  if (!isObj(ev)) return;
  for (const [k0, v] of Object.entries(ev)) {
    const k = ID_LIKE.test(k0) ? "<id-key>" : k0;
    const p = path ? path + " > " + k : k;
    if (SENSITIVE_KEY_RE.test(k0)) { (out.get(p) ?? out.set(p, new Set()).get(p)!).add("[sensitive, not inspected]"); continue; }
    (out.get(p) ?? out.set(p, new Set()).get(p)!).add(shape(v));
    if (isObj(v) && path.split(" > ").length < 3) inventory(v, out, p);
    if (Array.isArray(v) && v.length && isObj(v[0]) && path.split(" > ").length < 3) inventory(v[0], out, p + "[]");
  }
}

async function main() {
  const env = readLocalEnv();
  const key = env?.YELLOWDIG_API_KEY;
  if (!key) { console.log("YELLOWDIG_API_KEY: missing. No request made."); process.exit(2); }
  const base = env!.YELLOWDIG_API_BASE_URL || "https://data.yellowdig.app";
  const url = eventsUrl({ network: env!.YELLOWDIG_NETWORK, communityId: env!.YELLOWDIG_COMMUNITY_ID }, base) + "?limit=" + PROBE_PAGE_SIZE;
  console.log("Request: GET " + base + "/network/<configured>/community/<configured>/events?limit=" + PROBE_PAGE_SIZE + " (mode: yellowdig, no fallback)");

  let res: Response;
  try {
    res = await fetch(url, { headers: { apikey: key, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  } catch (e) {
    const c = classifyFailure({ message: e instanceof Error ? e.message : String(e) });
    console.log("Request failed before a response: " + c.code);
    process.exit(1);
  }
  console.log("HTTP status: " + res.status);
  if (!res.ok) {
    const c = classifyFailure({ status: res.status, retryAfter: res.headers.get("retry-after") });
    console.log("Classified failure: " + c.code + " (response body not printed)");
    process.exit(1);
  }

  const text = await res.text();
  let page;
  try { page = parsePage(text); } catch (e) { console.log("Page check failed: " + (e as Error).message); process.exit(1); }
  const raw = page.data as unknown[];
  console.log("\nEvents returned: " + raw.length + " | record-count present: " + (page.recordCount !== null) + " | at-end: " + page.atEnd + " | cursor present: " + (page.cursor !== null));
  const topKeys = Object.keys(JSON.parse(text)).sort();
  console.log("Page keys: " + topKeys.join(", "));

  // Event types (raw "event/type" value is an enum, safe to show).
  const typeOf = (e: unknown) => (isObj(e) ? String(e["event/type"] ?? e["type"] ?? "(no event/type)") : "(not an object)");
  const types = new Map<string, unknown[]>();
  raw.forEach((e) => { const t = typeOf(e); types.set(t, [...(types.get(t) ?? []), e]); });
  console.log("\nEvent types observed: " + [...types.entries()].map(([t, l]) => t + ": " + l.length).join(", "));

  // Field inventory per event type.
  for (const [t, list] of types) {
    const inv = new Map<string, Set<string>>();
    list.forEach((e) => inventory(e, inv));
    console.log("\n--- fields on '" + t + "' events (" + list.length + ") ---");
    [...inv.keys()].sort().forEach((p) => console.log("  " + p + " : " + [...inv.get(p)!].join(" | ")));
  }

  // Topic, parent and target relationships (structure only).
  const postIds = new Set<string>();
  raw.forEach((e) => { if (isObj(e) && typeof e["post/squuid"] === "string") postIds.add(e["post/squuid"] as string); });
  const rel = (field: string) => {
    const vals = raw.filter((e) => isObj(e) && e[field] !== undefined).map((e) => (e as Record<string, unknown>)[field]);
    const inSample = vals.filter((v) => typeof v === "string" && postIds.has(v)).length;
    return field + ": present on " + vals.length + " event(s); shapes: " + [...new Set(vals.map((v) => shape(v)))].join(" | ") + (vals.length ? "; matches a post/squuid in this sample: " + inSample + "/" + vals.length : "");
  };
  console.log("\n--- relationships (structure only) ---");
  ["post/topics", "post/parent", "post/squuid", "event/receiver", "event/actor", "event/community", "event/post", "event/user"].forEach((f) => console.log("  " + rel(f)));

  // Current Phase 2 adapter against live data.
  const cap = capabilityProbe(raw);
  console.log("\n--- Phase 2 adapter (FIELD_MAP) against live data ---");
  Object.entries(cap.mapping).forEach(([k, v]) => console.log("  " + k + " -> " + (v ?? "NOT FOUND")));
  console.log("  missing required: " + (cap.missingRequired.length ? cap.missingRequired.join(", ") : "none"));
  console.log("  sensitive detection: sisIdFields=" + cap.detected.sisIdFields + " ltiFields=" + cap.detected.ltiFields + " emailLikeFields=" + cap.detected.emailLikeFields + " emailLikeValues=" + cap.detected.emailLikeValues + " otherSensitive=" + cap.detected.otherSensitiveFields.length);

  // Privacy layer, with a throwaway salt (pseudonyms from this run are discarded).
  try {
    const min = minimizeAll(raw, randomBytes(32).toString("hex"));
    const n = (f: (e: (typeof min.events)[number]) => unknown) => min.events.filter((e) => f(e) !== null && f(e) !== "" && !(Array.isArray(f(e)) && (f(e) as unknown[]).length === 0)).length;
    console.log("\n--- privacy minimization on live data ---");
    console.log("  sensitive fields removed: " + min.sensitiveFieldsRemoved + " | email-like strings redacted from text: " + min.emailsRedacted);
    console.log("  minimized events with: actor=" + n((e) => e.actor) + " postId=" + n((e) => e.postId) + " title=" + n((e) => e.title) + " body=" + n((e) => e.body) + " topics=" + n((e) => e.topics) + " parentComment=" + n((e) => e.parentCommentId) + " (of " + min.events.length + ")");
  } catch (e) {
    console.log("\nPrivacy minimization FAILED on live data: " + (e as Error).message.replace(/event \S+/g, "event <id>"));
  }
  console.log("\nNothing was written to disk.");
}

main();
