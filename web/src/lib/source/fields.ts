// The privacy boundary. Raw Yellowdig events are mapped through an allowlist into SourceEvent;
// every other field (SIS ids, LTI fields, emails, profile data, network data) is dropped here.
//
// NOT VERIFIED: the Yellowdig API spec documents event *types* but not the fields inside an event.
// The candidate names below are assumptions. The capability probe reports which candidates a real
// response actually uses, and FIELD_MAPPING_UNVERIFIED stops a live run if required fields are absent.
import { SourceError } from "./constants";
import { pseudonymousId } from "../ids";
import { canonicalIso, parseTimestamp } from "./time";

type Path = string[];
export const FIELD_MAP = {
  eventId: [["event/squuid"], ["event/id"], ["squuid"], ["id"]],
  type: [["event/type"], ["type"]],
  createdAt: [["event/created-at"], ["event/time"], ["event/timestamp"], ["created-at"], ["timestamp"]],
  user: [["event/user"], ["user"], ["event/actor"]],
  userId: [["user/squuid"], ["user/id"]],
  userDisplayName: [["user/display-name"], ["user/name"]],
  userFirstName: [["user/first-name"]],
  userLastName: [["user/last-name"]],
  post: [["event/post"], ["post"]],
  postId: [["post/squuid"], ["post/id"]],
  postTitle: [["post/title"]],
  postBody: [["post/body"], ["post/text"], ["post/content"]],
  postTopics: [["post/topics"], ["post/topic"]],
  topicId: [["topic/squuid"], ["topic/id"]],
  topicName: [["topic/name"], ["topic/title"]],
  comment: [["event/comment"], ["comment"]],
  commentId: [["comment/squuid"], ["comment/id"]],
  commentBody: [["comment/body"], ["comment/text"]],
  commentParent: [["comment/parent"], ["comment/parent-squuid"]],
} satisfies Record<string, Path[]>;
export type FieldKey = keyof typeof FIELD_MAP;

/** Fields the importer cannot work without. */
export const REQUIRED_FIELDS: FieldKey[] = ["eventId", "type", "createdAt"];

export type Actor = { id: string; displayName: string };
export type Topic = { id: string | null; name: string };
/** One event after minimization. This is all that leaves workflow 01. */
export type SourceEvent = {
  eventId: string;
  type: string;
  createdAt: string;
  actor: Actor | null;
  postId: string | null;
  commentId: string | null;
  parentCommentId: string | null;
  title: string | null;
  body: string | null;
  topics: Topic[];
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function get(obj: unknown, key: FieldKey): { value: unknown; path: string | null } {
  if (!isObj(obj)) return { value: undefined, path: null };
  for (const path of FIELD_MAP[key] as Path[]) {
    let cur: unknown = obj;
    for (const k of path) cur = isObj(cur) ? cur[k] : undefined;
    if (cur !== undefined && cur !== null) return { value: cur, path: path.join(".") };
  }
  return { value: undefined, path: null };
}

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
function idOf(v: unknown, nestedKey?: FieldKey): string | null {
  if (isObj(v) && nestedKey) return idOf(get(v, nestedKey).value);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && ID_RE.test(v) ? v : null;
}

// ---------- Text cleaning ----------
export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** HTML to plain text. Block ends become paragraph breaks, so paragraphs survive. */
export function htmlToText(s: string): string {
  return s
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z0-9]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v\r]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text with any email address replaced. Returns the count replaced. */
export function cleanText(v: unknown, max: number): { text: string | null; emails: number } {
  if (typeof v !== "string") return { text: null, emails: 0 };
  let emails = 0;
  const text = htmlToText(v).replace(EMAIL_RE, () => { emails += 1; return "[email removed]"; });
  return { text: text.slice(0, max), emails };
}

// ---------- Sensitive-field detection (for diagnostics and the probe; values are never kept) ----------
export const SENSITIVE_KEY_RE = /(sis|lti|e-?mail|password|passwd|token|secret|auth|phone|canvas|lms|external|login|username|ip-?addr|birth|address)/i;

/** Counts sensitive keys and email-like values anywhere in the object. */
export function scanSensitive(v: unknown, path = "", out = { keys: [] as string[], emailValues: 0 }) {
  if (Array.isArray(v)) v.forEach((x) => scanSensitive(x, path + "[]", out));
  else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      const p = path ? path + "." + k : k;
      if (SENSITIVE_KEY_RE.test(k)) out.keys.push(p);
      else scanSensitive(x, p, out);
    }
  } else if (typeof v === "string" && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v.trim())) out.emailValues += 1;
  return out;
}

// ---------- Minimize one raw event ----------
function actorFrom(raw: unknown, salt: string): Actor | null {
  const user = get(raw, "user").value;
  const rawId = idOf(get(user, "userId").value);
  if (!rawId) return null;
  const display = get(user, "userDisplayName").value;
  const first = get(user, "userFirstName").value;
  const last = get(user, "userLastName").value;
  let name = typeof display === "string" ? display : [first, last].filter((x) => typeof x === "string" && x).join(" ");
  name = name.replace(EMAIL_RE, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return { id: pseudonymousId(rawId, salt), displayName: name || "Yellowdig member" };
}

function topicsFrom(post: unknown): Topic[] {
  const v = get(post, "postTopics").value;
  const list = Array.isArray(v) ? v : v === undefined ? [] : [v];
  return list
    .map((t): Topic | null => {
      if (typeof t === "string") return { id: null, name: t.slice(0, 200) };
      const name = get(t, "topicName").value;
      return typeof name === "string" ? { id: idOf(get(t, "topicId").value), name: name.slice(0, 200) } : null;
    })
    .filter((t): t is Topic => t !== null);
}

export type MinimizeResult = { event: SourceEvent; sensitiveFieldsRemoved: number; emailsRedacted: number };

/** Maps one raw event through the allowlist. Throws on events without an id, type or valid timestamp. */
export function minimizeEvent(raw: unknown, salt: string): MinimizeResult {
  if (!isObj(raw)) throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "an event is not an object");
  const eventId = idOf(get(raw, "eventId").value);
  if (!eventId) throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "an event has no usable id");
  const type = get(raw, "type").value;
  if (typeof type !== "string" || !type) throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "event " + eventId + " has no type");
  const ms = parseTimestamp(get(raw, "createdAt").value);
  if (!Number.isFinite(ms)) throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "event " + eventId + " has no valid timestamp");

  const post = get(raw, "post").value;
  const comment = get(raw, "comment").value;
  const t = type.toLowerCase();
  const title = t === "post" ? cleanText(get(post, "postTitle").value, 300) : { text: null, emails: 0 };
  const body = t === "post" ? cleanText(get(post, "postBody").value, 20000) : t === "comment" ? cleanText(get(comment, "commentBody").value, 10000) : { text: null, emails: 0 };
  const scan = scanSensitive(raw);

  return {
    event: {
      eventId,
      type: t,
      createdAt: canonicalIso(ms),
      actor: actorFrom(raw, salt),
      postId: idOf(post, "postId"),
      commentId: t === "comment" || t === "reaction" || t === "view" ? idOf(comment, "commentId") : null,
      parentCommentId: t === "comment" ? idOf(get(comment, "commentParent").value, "commentId") : null,
      title: title.text,
      body: body.text,
      topics: t === "post" ? topicsFrom(post) : [],
    },
    sensitiveFieldsRemoved: scan.keys.length + scan.emailValues,
    emailsRedacted: title.emails + body.emails,
  };
}

// ---------- Capability probe ----------
export type CapabilityReport = {
  sampleSize: number;
  eventTypes: Record<string, number>;
  fieldInventory: Array<{ path: string; types: string[]; presentIn: number }>;
  mapping: Record<FieldKey, string | null>;
  missingRequired: FieldKey[];
  detected: { sisIdFields: number; ltiFields: number; emailLikeFields: number; emailLikeValues: number; otherSensitiveFields: string[] };
};

/** Summarizes field names and value types of a small sample. Never records a value. */
export function capabilityProbe(rawEvents: unknown[]): CapabilityReport {
  const inv = new Map<string, { types: Set<string>; n: number }>();
  const walk = (v: unknown, path: string, seen: Set<string>) => {
    const ty = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    if (path) {
      const e = inv.get(path) ?? { types: new Set<string>(), n: 0 };
      e.types.add(ty);
      if (!seen.has(path)) { e.n += 1; seen.add(path); }
      inv.set(path, e);
    }
    if (Array.isArray(v)) v.forEach((x) => walk(x, path + "[]", seen));
    // Record a sensitive key's name but never descend into it (LTI maps can carry custom key names).
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(SENSITIVE_KEY_RE.test(k) ? "[redacted]" : x, path ? path + "." + k : k, seen);
  };
  const types: Record<string, number> = {};
  const sensitive: string[] = [];
  let emailValues = 0;
  rawEvents.forEach((ev) => {
    walk(ev, "", new Set());
    const t = get(ev, "type").value;
    const key = typeof t === "string" ? t : "(missing)";
    types[key] = (types[key] ?? 0) + 1;
    const s = scanSensitive(ev);
    sensitive.push(...s.keys);
    emailValues += s.emailValues;
  });
  const mapping = {} as Record<FieldKey, string | null>;
  (Object.keys(FIELD_MAP) as FieldKey[]).forEach((k) => {
    const container = k.startsWith("user") && k !== "user" ? "user" : k.startsWith("post") && k !== "post" ? "post" : k.startsWith("comment") && k !== "comment" ? "comment" : k.startsWith("topic") ? null : undefined;
    let found: string | null = null;
    for (const ev of rawEvents) {
      if (container === null) {
        const topics = get(get(ev, "post").value, "postTopics").value;
        const first = Array.isArray(topics) ? topics[0] : topics;
        found = get(first, k).path;
      } else found = get(container ? get(ev, container).value : ev, k).path;
      if (found) break;
    }
    mapping[k] = found;
  });
  const uniq = [...new Set(sensitive.map((p) => p.replace(/\[\]/g, "")))].sort();
  return {
    sampleSize: rawEvents.length,
    eventTypes: types,
    fieldInventory: [...inv.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, e]) => ({ path, types: [...e.types].sort(), presentIn: e.n })),
    mapping,
    missingRequired: rawEvents.length ? REQUIRED_FIELDS.filter((k) => !mapping[k]) : [],
    detected: {
      sisIdFields: uniq.filter((p) => /sis/i.test(p)).length,
      ltiFields: uniq.filter((p) => /lti/i.test(p)).length,
      emailLikeFields: uniq.filter((p) => /e-?mail/i.test(p)).length,
      emailLikeValues: emailValues,
      otherSensitiveFields: uniq.filter((p) => !/sis|lti|e-?mail/i.test(p)),
    },
  };
}
