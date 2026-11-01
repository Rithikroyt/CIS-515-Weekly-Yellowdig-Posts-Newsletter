// Controlled second Yellowdig verification. At most MAX_PAGES cursor pages, analysed in memory only; nothing is
// written to disk. Prints event-type counts, field SHAPES for comment and reaction events, the result of the
// privacy layer, and the structured post/topics labels with post counts and date spans (topic labels are
// instructor-defined course structure). Never prints student names, ids, text, emails or the key.
// Usage (from web/): npx tsx scripts/probe-yellowdig-topics.ts
import { randomBytes } from "node:crypto";
import { readLocalEnv } from "./env-config";
import { capabilityProbe, classifyFailure, eventsUrl, minimizeAll, parsePage } from "../src/lib/source";

const MAX_PAGES = 4;
const PAGE_SIZE = 250;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const shape = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array[" + v.length + "]" : isObj(v) ? "object{" + Object.keys(v).slice(0, 10).join(", ") + "}" : typeof v;

async function main() {
  const env = readLocalEnv();
  const key = env?.YELLOWDIG_API_KEY;
  if (!key) { console.log("YELLOWDIG_API_KEY: missing. No request made."); process.exit(2); }
  const base = env!.YELLOWDIG_API_BASE_URL || "https://data.yellowdig.app";
  const url0 = eventsUrl({ network: env!.YELLOWDIG_NETWORK, communityId: env!.YELLOWDIG_COMMUNITY_ID }, base);
  const raw: unknown[] = [];
  let cursor: string | null = null, pages = 0, atEnd = false;
  while (pages < MAX_PAGES && !atEnd) {
    const url = url0 + "?limit=" + PAGE_SIZE + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
    const res = await fetch(url, { headers: { apikey: key, accept: "application/json" }, signal: AbortSignal.timeout(30000) })
      .catch((e) => { console.log("Request failed: " + classifyFailure({ message: String(e) }).code); process.exit(1); });
    if (!res.ok) { console.log("HTTP " + res.status + ": " + classifyFailure({ status: res.status, retryAfter: res.headers.get("retry-after") }).code); process.exit(1); }
    const page = parsePage(await res.text());
    raw.push(...page.data);
    cursor = page.cursor; atEnd = page.atEnd; pages++;
  }
  console.log("Pages fetched: " + pages + " | events: " + raw.length + " | reached end: " + atEnd);

  const typeOf = (e: unknown) => (isObj(e) ? String(e["event/type"] ?? "(none)") : "(not object)");
  const counts = new Map<string, number>();
  raw.forEach((e) => counts.set(typeOf(e), (counts.get(typeOf(e)) ?? 0) + 1));
  console.log("Event types: " + [...counts].map(([t, n]) => t + "=" + n).join(", "));

  // Shapes of non-post events (comments, reactions, views): top-level and nested keys, shapes only.
  for (const t of [...counts.keys()].filter((t) => !/^post|view/.test(t))) {
    const sample = raw.filter((e) => typeOf(e) === t).slice(0, 20) as Array<Record<string, unknown>>;
    const fields = new Map<string, Set<string>>();
    sample.forEach((e) => Object.entries(e).forEach(([k, v]) => {
      (fields.get(k) ?? fields.set(k, new Set()).get(k)!).add(/name|email|body|text|title|sis|lti/i.test(k) ? "[not inspected]" : shape(v));
    }));
    console.log("\n--- '" + t + "' fields (" + sample.length + " sampled) ---");
    [...fields].sort().forEach(([k, s]) => console.log("  " + k + " : " + [...s].join(" | ")));
  }

  const cap = capabilityProbe(raw);
  console.log("\n--- adapter mapping ---");
  Object.entries(cap.mapping).forEach(([k, v]) => console.log("  " + k + " -> " + (v ?? "NOT FOUND")));
  console.log("  missing required: " + (cap.missingRequired.join(", ") || "none"));

  try {
    const min = minimizeAll(raw, randomBytes(32).toString("hex"));
    const byType = new Map<string, number>();
    min.events.forEach((e) => byType.set(e.type, (byType.get(e.type) ?? 0) + 1));
    console.log("\n--- privacy minimization ---");
    console.log("  ok | sensitive fields removed: " + min.sensitiveFieldsRemoved + " | emails redacted: " + min.emailsRedacted);
    console.log("  minimized events by type: " + [...byType].map(([t, n]) => t + "=" + n).join(", "));
    console.log("  comments with a postId: " + min.events.filter((e) => e.type === "comment" && e.postId).length +
      " | with parentCommentId: " + min.events.filter((e) => e.type === "comment" && e.parentCommentId).length);

    const topics = new Map<string, { posts: number; first: string; last: string }>();
    min.events.filter((e) => e.type === "post").forEach((e) => e.topics.forEach((t) => {
      const cur = topics.get(t.name) ?? { posts: 0, first: e.createdAt, last: e.createdAt };
      cur.posts++;
      if (e.createdAt < cur.first) cur.first = e.createdAt;
      if (e.createdAt > cur.last) cur.last = e.createdAt;
      topics.set(t.name, cur);
    }));
    console.log("\n--- post/topics labels (structured) ---");
    [...topics].sort((a, b) => a[1].first.localeCompare(b[1].first))
      .forEach(([name, v]) => console.log("  " + JSON.stringify(name) + " | posts=" + v.posts + " | " + v.first.slice(0, 10) + " .. " + v.last.slice(0, 10)));
  } catch (e) {
    console.log("\nPrivacy minimization FAILED: " + (e as Error).message.replace(/event \S+/g, "event <id>"));
  }
  console.log("\n--- join check ---");
  await joinCheck(raw);
  console.log("\nNothing was written to disk.");
}
main();

// Join check (appended): do minimized comments and reactions point at posts in the sample?
export async function joinCheck(raw: unknown[]) {
  const min = minimizeAll(raw, randomBytes(32).toString("hex"));
  const postIds = new Set(min.events.filter((e) => e.type === "post").map((e) => e.postId));
  for (const t of ["comment", "reaction", "view"]) {
    const list = min.events.filter((e) => e.type === t);
    console.log("  " + t + ": " + list.length + " | with postId: " + list.filter((e) => e.postId).length + " | postId matches a sampled post: " + list.filter((e) => e.postId && postIds.has(e.postId)).length);
  }
  const commentIds = new Set(min.events.filter((e) => e.type === "comment").map((e) => e.commentId ?? e.eventId));
  const orphan = min.events.filter((e) => e.type === "reaction" && e.postId && !postIds.has(e.postId));
  console.log("  reactions not on a sampled post: " + orphan.length + " | of those, target matches a sampled comment: " + orphan.filter((e) => commentIds.has(e.postId!)).length);
  const keys = new Map<string, number>();
  raw.filter((e) => isObj(e) && e["event/type"] === "reaction").forEach((e) => { const k = String((e as Record<string, unknown>)["reaction/key"]); keys.set(k, (keys.get(k) ?? 0) + 1); });
  console.log("  reaction/key values: " + [...keys].map(([k, n]) => k + "=" + n).join(", "));
}
