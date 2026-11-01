// Deterministic evidence controls. Pure. The model is never trusted for references, numbers, names or
// workflow capabilities: every check here compares model output with the deterministic input package.
import type { CapabilityKey } from "../contracts";
import { EDITORIAL_IDS, repairToSchema, schemaErrors } from "./registry";
import type {
  Claim, Discussion, EditorialCode, EditorialInput, InputPost, InputProfile, Newsletter, PostNote, Selection, SpotlightLabel, Theme,
} from "./types";

export const MAX_MODEL_OUTPUT_CHARS = 200_000;
export const WITHHELD_TEXT = "[Withheld: this claim did not pass evidence review. See review.unresolved.]";

// ---------- Index of everything the model may cite ----------
export type RefIndex = {
  input: EditorialInput;
  posts: Map<string, InputPost>;
  comments: Map<string, { postRef: string; authorName: string; body: string }>;
  profiles: Map<string, InputProfile>;
  profileOfPost: Map<string, InputProfile>;
  metrics: Map<string, number | null>;
  people: Array<{ name: string; first: string; refs: Set<string> }>;
};

export function indexInput(input: EditorialInput): RefIndex {
  const posts = new Map(input.posts.map((p) => [p.postRef, p]));
  const comments = new Map(input.posts.flatMap((p) => p.comments.map((c) => [c.commentRef, { postRef: p.postRef, authorName: c.authorName, body: c.body }] as const)));
  const profiles = new Map(input.workflowProfiles.map((w) => [w.workflowProfileRef, w]));
  const profileOfPost = new Map<string, InputProfile>();
  input.posts.forEach((p) => { if (p.workflowProfileRef && profiles.has(p.workflowProfileRef)) profileOfPost.set(p.postRef, profiles.get(p.workflowProfileRef)!); });
  const metrics = new Map(input.metrics.map((m) => [m.ref, m.value]));
  const byName = new Map<string, Set<string>>();
  const add = (name: string, ref: string) => { if (!byName.has(name)) byName.set(name, new Set()); byName.get(name)!.add(ref); };
  input.posts.forEach((p) => { add(p.authorName, p.postRef); p.comments.forEach((c) => add(c.authorName, c.commentRef)); });
  const people = [...byName.entries()].map(([name, refs]) => ({ name, first: name.split(/\s+/)[0], refs }));
  return { input, posts, comments, profiles, profileOfPost, metrics, people };
}

export function refExists(idx: RefIndex, ref: string): boolean {
  if (ref.startsWith("post:")) return idx.posts.has(ref);
  if (ref.startsWith("comment:")) return idx.comments.has(ref);
  if (ref.startsWith("workflow:")) return idx.profiles.has(ref);
  if (ref.startsWith("metric:")) return idx.metrics.has(ref);
  return false;
}

// ---------- Model output parsing ----------
export type Parsed<T> = { ok: true; value: T } | { ok: false; code: EditorialCode; detail: string };

/** JSON parse + schema check against one $defs entry. A single surrounding code fence is tolerated. */
export function parseModelJson<T>(text: string, def: string): Parsed<T> {
  if (text.length > MAX_MODEL_OUTPUT_CHARS) return { ok: false, code: "MODEL_OUTPUT_TOO_LARGE", detail: "response is " + text.length + " characters" };
  const body = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, code: "MODEL_INVALID_JSON", detail: "response is not valid JSON" };
  }
  repairToSchema(EDITORIAL_IDS.stage(def), value);
  const errs = schemaErrors(EDITORIAL_IDS.stage(def), value);
  if (errs.length) return { ok: false, code: "MODEL_SCHEMA_INVALID", detail: errs.slice(0, 3).join("; ") };
  return { ok: true, value: value as T };
}

// ---------- Claim-level checks ----------
export type ClaimStatus = "supported" | "partially-supported" | "unsupported" | "conflict";
const RANK: Record<ClaimStatus, number> = { supported: 0, "partially-supported": 1, unsupported: 2, conflict: 3 };
export const worst = (a: ClaimStatus, b: ClaimStatus): ClaimStatus => (RANK[a] >= RANK[b] ? a : b);

export type ClaimResult = { claimId: string; status: ClaimStatus; codes: EditorialCode[]; notes: string[] };

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const WORD_OF = Object.fromEntries(Object.entries(NUMBER_WORDS).map(([w, n]) => [n, w]));
const NUM_RE = new RegExp("(?<![\\w.])\\$?(\\d+(?:[.,]\\d+)?)%?|\\b(" + Object.keys(NUMBER_WORDS).join("|") + ")\\b", "gi");
const COUNT_CLAIM_RE = new RegExp("\\b(\\d+|" + Object.keys(NUMBER_WORDS).join("|") + ")\\s+(?:of the\\s+\\S+\\s+)?(?:profiled\\s+|submitted\\s+)?(builds?|workflows?|posts?|students|classmates|comments|people|contributors|commenters|authors)\\b", "gi");

const CAPABILITY_PHRASES: Array<[CapabilityKey, RegExp]> = [
  ["usesHumanApproval", /\b(human (approval|review|sign-off)|human[- ]in[- ]the[- ]loop|(person|human|people|someone|reviewer) (approves|signs off|reviews)|approves (it|every|each))\b/i],
  ["usesLLMJudge", /\bjudge/i],
  ["hasBoundedRetry", /\b(bounded retr\w*|retr(y|ies) (limit|cap)|retr(y|ies|ying) up to|capped (retr\w*|loop|revision\w*)|revision (limit|cap|counter))\b/i],
  ["hasFallback", /\b(fallback|falls? back)\b/i],
  ["usesMultipleAgents", /\b(multi-agent|multiple agents|two agents|second (model|agent))\b/i],
  ["hasCodeValidation", /\b(code (checks?|rules?|flags?|gates?|validat\w*)|(checked|checks?|validated|flags?) in code)\b/i],
  ["usesRAG", /\b(vector store|retrieval|RAG)\b/],
  ["hasExplicitFailureHandling", /\b(error (branch|branches|path|output)|failure (branch|route|handling))\b/i],
  ["usesMemory", /\bmemory\b/i],
];
const HEDGE_RE = /\b(says|said|describes|described|reports|reported|plans?|planned|wants|hopes|claims|intends)\b/i;
const TREND_RE = /\b(than last week|previous week|prior week|week over week|compared (to|with) (last|previous|earlier|week)|(rose|fell|grew|increased|decreased|improved|declined) (from|by|to|since)|more and more|on the rise)\b/i;
const OVERBROAD_RE = /\b((every|all|most) (students?|classmates|builds?|workflows?|posts?|teams?)|the whole class|the entire class|everyone|everybody)\b/i;
const STYLE_RE = /\b(in today's rapidly evolving|leverag(e|ing) the power of|revolutionary|game[- ]changing|delve|transformative journey|cutting[- ]edge|unlock the (full )?potential)\b/i;
const RANKING_RE = /\b(best (student|workflow|build)|top (student|performer)|worst|weakest|lowest quality)\b/i;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sourceText(idx: RefIndex, ref: string): string {
  if (ref.startsWith("post:")) { const p = idx.posts.get(ref); return p ? p.title + "\n" + p.body : ""; }
  if (ref.startsWith("comment:")) return idx.comments.get(ref)?.body ?? "";
  if (ref.startsWith("workflow:")) {
    const w = idx.profiles.get(ref);
    return w ? [w.workflowName, w.nodeCount, w.edgeCount, w.retry.maxAttempts ?? "", w.scoreThreshold ?? "", w.mainPath.map((s) => s.label).join(" ")].join(" ") : "";
  }
  return "";
}

/** Profiles a claim is about: cited workflows, the workflows of cited posts, and of posts whose comments are cited. */
function citedProfiles(idx: RefIndex, refs: string[]): InputProfile[] {
  const out = new Map<string, InputProfile>();
  refs.forEach((r) => {
    if (r.startsWith("workflow:") && idx.profiles.has(r)) out.set(r, idx.profiles.get(r)!);
    const postRef = r.startsWith("post:") ? r : r.startsWith("comment:") ? idx.comments.get(r)?.postRef : undefined;
    const prof = postRef ? idx.profileOfPost.get(postRef) : undefined;
    if (prof) out.set(prof.workflowProfileRef, prof);
  });
  return [...out.values()];
}

/** All deterministic checks for one claim (or a title, with evidenceRefs = []). */
export function checkClaim(idx: RefIndex, claimId: string, claim: Claim): ClaimResult {
  const res: ClaimResult = { claimId, status: "supported", codes: [], notes: [] };
  const flag = (status: ClaimStatus, code: EditorialCode, note: string) => {
    res.status = worst(res.status, status);
    if (!res.codes.includes(code)) res.codes.push(code);
    res.notes.push(note);
  };
  const text = claim.text;
  const refs = claim.evidenceRefs;

  const unknown = refs.filter((r) => !refExists(idx, r));
  if (unknown.length) flag("unsupported", "MODEL_UNKNOWN_REFERENCE", unknown.length + " cited reference(s) do not exist in the input");
  const known = refs.filter((r) => refExists(idx, r));
  const metricVals = known.filter((r) => r.startsWith("metric:")).map((r) => idx.metrics.get(r)).filter((v): v is number => typeof v === "number");
  const sources = known.map((r) => sourceText(idx, r).toLowerCase()).join("\n");

  // Numbers: each must equal a cited metric or appear in a cited source. Counting claims need a cited metric.
  const allowed = new Set([idx.input.week, ...(idx.input.course.code.match(/\d+/g) ?? []).map(Number)]);
  for (const m of text.matchAll(NUM_RE)) {
    const n = m[1] !== undefined ? Number(m[1].replace(",", "")) : NUMBER_WORDS[m[2].toLowerCase()];
    if (allowed.has(n) || (n >= 2000 && n <= 2100) || metricVals.includes(n)) continue;
    const inSource = new RegExp("(^|[^\\d.])" + esc(String(n)) + "(?![\\d])").test(sources) || (WORD_OF[n] ? new RegExp("\\b" + WORD_OF[n] + "\\b").test(sources) : false);
    if (!inSource) flag("conflict", "MODEL_NUMERIC_CONFLICT", "the number " + n + " is not in a cited metric or source");
  }
  for (const m of text.matchAll(COUNT_CLAIM_RE)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
    if (!metricVals.includes(n)) flag("conflict", "MODEL_NUMERIC_CONFLICT", "count \"" + m[0] + "\" does not match a cited code-counted metric");
  }

  // Attribution: a named student must be the author of a cited post or comment.
  let remaining = text;
  for (const p of idx.people) {
    if (new RegExp("\\b" + esc(p.name) + "\\b").test(remaining)) {
      if (![...p.refs].some((r) => known.includes(r))) flag("conflict", "MODEL_ATTRIBUTION_CONFLICT", "names " + p.name + " without citing their post or comment");
      remaining = remaining.replace(new RegExp("\\b" + esc(p.name) + "\\b", "g"), " ");
    }
  }
  const firsts = idx.people.map((p) => p.first);
  for (const p of idx.people) {
    if (p.first.length < 3 || firsts.filter((f) => f === p.first).length > 1) continue;
    if (new RegExp("\\b" + esc(p.first) + "\\b").test(remaining) && ![...p.refs].some((r) => known.includes(r))) {
      flag("conflict", "MODEL_ATTRIBUTION_CONFLICT", "names " + p.first + " without citing their post or comment");
    }
  }

  // Capabilities: stated as fact only when a cited workflow profile shows them.
  const profs = citedProfiles(idx, known);
  for (const [cap, re] of CAPABILITY_PHRASES) {
    if (!re.test(text)) continue;
    if (known.includes("metric:capabilities." + cap) || profs.some((p) => p.capabilities[cap])) continue;
    if (profs.length > 0) flag(HEDGE_RE.test(text) ? "partially-supported" : "conflict", "MODEL_CAPABILITY_CONFLICT", cap + " is not true in any cited workflow profile");
    else flag("partially-supported", "MODEL_UNSUPPORTED_CLAIM", cap + " is described but no workflow file confirms it");
  }

  if (TREND_RE.test(text)) flag("unsupported", "MODEL_TREND_UNSUPPORTED", "trend or cross-week comparison without prior-week data");
  if (OVERBROAD_RE.test(text) && !known.some((r) => r.startsWith("metric:"))) flag("unsupported", "MODEL_OVERBROAD_CLAIM", "class-wide generalization without a cited metric");
  if (STYLE_RE.test(text)) flag("partially-supported", "MODEL_STYLE_VIOLATION", "uses a banned hype phrase");
  if (RANKING_RE.test(text)) flag("conflict", "MODEL_STYLE_VIOLATION", "ranks or grades students");
  return res;
}

/** Every claim object inside a value, with a stable path id ("hero.title", "themes[0].text"). */
export function collectClaims(value: unknown, path = ""): Array<{ claimId: string; claim: Claim }> {
  const out: Array<{ claimId: string; claim: Claim }> = [];
  const stack: Array<[unknown, string]> = [[value, path]];
  while (stack.length) {
    const [v, p] = stack.pop()!;
    if (Array.isArray(v)) { for (let i = v.length - 1; i >= 0; i--) stack.push([v[i], p + "[" + i + "]"]); continue; }
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string" && Array.isArray(o.evidenceRefs)) { out.push({ claimId: p || "claim", claim: o as unknown as Claim }); continue; }
    Object.keys(o).sort().reverse().forEach((k) => stack.push([o[k], p ? p + "." + k : k]));
  }
  return out;
}

const claimRefsOk = (idx: RefIndex, c: Claim | null) => !c || c.evidenceRefs.every((r) => refExists(idx, r));

export type StageIssue = { stage: string; code: EditorialCode; detail: string };

// ---------- Stage validators: invalid items are dropped and recorded, never passed on ----------
export function validatePostNotes(idx: RefIndex, notes: PostNote[], expected: string[]) {
  const issues: StageIssue[] = [];
  const kept: PostNote[] = [];
  const checks: Array<{ postRef: string; capability: CapabilityKey; claimSource: "student-description" | "workflow-profile"; deterministicStatus: "confirmed" | "not-confirmed" | "no-workflow-file" }> = [];
  const seen = new Set<string>();
  for (const n of notes) {
    if (!idx.posts.has(n.postRef) || !expected.includes(n.postRef)) { issues.push({ stage: "post-extractor", code: "MODEL_UNKNOWN_REFERENCE", detail: "note for a post not in this batch was dropped" }); continue; }
    if (seen.has(n.postRef)) continue;
    if (!claimRefsOk(idx, n.summary)) { issues.push({ stage: "post-extractor", code: "MODEL_UNKNOWN_REFERENCE", detail: n.postRef + ": summary cites an unknown reference; note dropped" }); continue; }
    const clean = { ...n };
    (["workflowPurpose", "testPerformed", "interestingPattern", "failureOrLimitation", "humanControl", "reusableLesson"] as const).forEach((k) => {
      if (!claimRefsOk(idx, clean[k])) { issues.push({ stage: "post-extractor", code: "MODEL_UNKNOWN_REFERENCE", detail: n.postRef + ": " + k + " cites an unknown reference; field cleared" }); clean[k] = null; }
    });
    const prof = idx.profileOfPost.get(n.postRef);
    clean.capabilityClaims = n.capabilityClaims.filter((c, i, a) => a.findIndex((x) => x.capability === c.capability) === i);
    clean.capabilityClaims.forEach((c) => {
      const status = !prof ? "no-workflow-file" : prof.capabilities[c.capability] ? "confirmed" : "not-confirmed";
      checks.push({ postRef: n.postRef, capability: c.capability, claimSource: c.claimSource, deterministicStatus: status });
      if (c.claimSource === "workflow-profile" && status !== "confirmed") {
        issues.push({ stage: "post-extractor", code: "MODEL_CAPABILITY_CONFLICT", detail: n.postRef + ": " + c.capability + " attributed to the workflow profile, which does not show it" });
      }
    });
    seen.add(n.postRef);
    kept.push(clean);
  }
  return { notes: kept, checks, issues };
}

export function validateThemes(idx: RefIndex, themes: Theme[]) {
  const issues: StageIssue[] = [];
  const kept: Theme[] = [];
  for (const t of themes) {
    const refs = [...t.supportingPostRefs, ...t.supportingWorkflowRefs];
    if (!refs.every((r) => refExists(idx, r)) || !claimRefsOk(idx, t.summary)) { issues.push({ stage: "theme-analyst", code: "MODEL_UNKNOWN_REFERENCE", detail: t.themeId + ": unknown reference; theme dropped" }); continue; }
    if (t.support === "multi-source" && t.supportingPostRefs.length < 2) { issues.push({ stage: "theme-analyst", code: "THEME_SUPPORT_TOO_LOW", detail: t.themeId + ": multi-source theme with one post; dropped" }); continue; }
    if (kept.some((k) => k.themeId === t.themeId)) continue;
    kept.push(t);
  }
  return { themes: kept, issues };
}

/** What each spotlight label requires from the deterministic profile. */
export const LABEL_REQUIRES: Record<SpotlightLabel, ((p: InputProfile) => boolean) | null> = {
  "Strong Human Control": (p) => p.capabilities.usesHumanApproval,
  "Interesting Failure Recovery": (p) => p.capabilities.hasExplicitFailureHandling || p.capabilities.hasFallback,
  "Reusable Validation Pattern": (p) => p.capabilities.hasValidationGate || p.capabilities.hasCodeValidation,
  "Creative Integration": (p) => p.capabilities.usesExternalAPI || p.integrations.length >= 2,
  "Clear Multi-Agent Design": (p) => p.capabilities.usesMultipleAgents,
  "Thoughtful Fallback": (p) => p.capabilities.hasFallback,
  "Useful Testing Pattern": null,
};

const hasControl = (p: InputProfile) =>
  p.capabilities.hasValidationGate || p.capabilities.usesHumanApproval || p.capabilities.hasExplicitFailureHandling || p.capabilities.hasBoundedRetry || p.capabilities.hasFallback;

const isSubsequence = (steps: string[], path: string[]) => { let i = 0; for (const s of path) if (s === steps[i]) i++; return i === steps.length; };

export function validateSelection(idx: RefIndex, sel: Selection) {
  const issues: StageIssue[] = [];
  const spotlights: Selection["spotlights"] = [];
  for (const s of sel.spotlights) {
    if (!idx.posts.has(s.postRef) || !claimRefsOk(idx, s.reason)) { issues.push({ stage: "spotlight-pattern-selector", code: "MODEL_UNKNOWN_REFERENCE", detail: "spotlight with an unknown reference dropped" }); continue; }
    const need = LABEL_REQUIRES[s.label];
    const prof = idx.profileOfPost.get(s.postRef);
    if (need && (!prof || !need(prof))) { issues.push({ stage: "spotlight-pattern-selector", code: "SPOTLIGHT_UNSUPPORTED", detail: s.postRef + ": label \"" + s.label + "\" is not supported by the workflow profile" }); continue; }
    if (spotlights.some((x) => x.postRef === s.postRef)) continue;
    spotlights.push(s);
  }
  let failurePath = sel.failurePath;
  if (failurePath) {
    const f = failurePath;
    const prof = idx.profileOfPost.get(f.postRef);
    const own = (c: Claim) => c.evidenceRefs.some((r) => r === f.postRef || r === f.workflowProfileRef || idx.comments.get(r)?.postRef === f.postRef);
    const claims = [f.failure, f.control, f.recovery, f.lesson];
    let why = "";
    if (!idx.posts.has(f.postRef) || !claims.every((c) => claimRefsOk(idx, c))) why = "unknown reference";
    else if (!prof || prof.workflowProfileRef !== f.workflowProfileRef) why = "workflowProfileRef is not this post's workflow";
    else if (!hasControl(prof)) why = "the workflow profile shows no control (gate, approval, failure handling, retry limit or fallback)";
    else if (!claims.every(own)) why = "a step cites evidence from a different post";
    if (why) { issues.push({ stage: "spotlight-pattern-selector", code: "FAILURE_PATH_UNSUPPORTED", detail: f.postRef + ": " + why + "; failure path set to null" }); failurePath = null; }
  }
  const patterns: Selection["patterns"] = [];
  for (const p of sel.patterns) {
    if (!p.workflowProfileRefs.every((r) => idx.profiles.has(r)) || !claimRefsOk(idx, p.why)) { issues.push({ stage: "spotlight-pattern-selector", code: "MODEL_UNKNOWN_REFERENCE", detail: p.patternId + ": unknown reference; pattern dropped" }); continue; }
    const fits = p.workflowProfileRefs.some((r) => isSubsequence(p.steps, idx.profiles.get(r)!.mainPath.map((s) => s.category)));
    if (!fits) { issues.push({ stage: "spotlight-pattern-selector", code: "PATTERN_STRUCTURE_MISMATCH", detail: p.patternId + ": steps do not occur in any cited workflow's main path; dropped" }); continue; }
    if (patterns.some((x) => x.patternId === p.patternId)) continue;
    patterns.push(p);
  }
  return { selection: { spotlights, failurePath, patterns }, issues };
}

export function validateDiscussion(idx: RefIndex, d: Discussion) {
  const issues: StageIssue[] = [];
  const insights = d.insights.filter((i) => {
    if (!claimRefsOk(idx, i.insight)) { issues.push({ stage: "discussion-analyst", code: "MODEL_UNKNOWN_REFERENCE", detail: "insight with an unknown reference dropped" }); return false; }
    if (!i.insight.evidenceRefs.some((r) => r.startsWith("comment:"))) { issues.push({ stage: "discussion-analyst", code: "MODEL_UNSUPPORTED_CLAIM", detail: "insight cites no comment; dropped" }); return false; }
    return true;
  });
  return { discussion: { insights }, issues };
}

// ---------- Newsletter review ----------
export type Candidates = { themes: Theme[]; selection: Selection };

/** Deterministic review of every newsletter claim and title, plus structure against validated candidates. */
export function reviewNewsletter(idx: RefIndex, nl: Newsletter, cand: Candidates): ClaimResult[] {
  const results = collectClaims(nl).map(({ claimId, claim }) => checkClaim(idx, claimId, claim));
  const byId = new Map(results.map((r) => [r.claimId, r]));
  const mark = (prefix: string, code: EditorialCode, note: string) =>
    results.filter((r) => r.claimId === prefix || r.claimId.startsWith(prefix + ".")).forEach((r) => {
      r.status = worst(r.status, "unsupported");
      if (!r.codes.includes(code)) r.codes.push(code);
      r.notes.push(note);
    });
  nl.themes.forEach((t, i) => { if (!cand.themes.some((c) => c.themeId === t.themeId)) mark("themes[" + i + "]", "MODEL_UNSUPPORTED_CLAIM", "theme is not a validated candidate"); });
  nl.spotlights.forEach((s, i) => { if (!cand.selection.spotlights.some((c) => c.postRef === s.postRef && c.label === s.label)) mark("spotlights[" + i + "]", "MODEL_UNSUPPORTED_CLAIM", "spotlight is not a validated candidate"); });
  nl.borrowThisPattern.forEach((p, i) => { if (!cand.selection.patterns.some((c) => c.patternId === p.patternId)) mark("borrowThisPattern[" + i + "]", "PATTERN_STRUCTURE_MISMATCH", "pattern is not a validated candidate"); });
  const f = nl.failurePath, cf = cand.selection.failurePath;
  if (f && (!cf || cf.postRef !== f.postRef || cf.workflowProfileRef !== f.workflowProfileRef)) mark("failurePath", "FAILURE_PATH_UNSUPPORTED", "failure path is not the validated candidate");
  // Titles carry no evidence, so they may not contain numbers, trends, rankings or hype.
  const titles: Array<[string, string]> = [
    ...nl.themes.map((t, i) => ["themes[" + i + "].title", t.title] as [string, string]),
    ...nl.borrowThisPattern.map((p, i) => ["borrowThisPattern[" + i + "].title", p.title] as [string, string]),
    ...nl.takeaways.map((t, i) => ["takeaways[" + i + "].title", t.title] as [string, string]),
  ];
  titles.forEach(([id, title]) => {
    const r = checkClaim(idx, id, { text: title, evidenceRefs: [] });
    if (/\d/.test(title)) { r.status = worst(r.status, "conflict"); if (!r.codes.includes("MODEL_NUMERIC_CONFLICT")) r.codes.push("MODEL_NUMERIC_CONFLICT"); }
    // Capability words in a title are judged with the item's own claim; drop those flags here.
    r.codes = r.codes.filter((c) => c !== "MODEL_CAPABILITY_CONFLICT" && c !== "MODEL_UNSUPPORTED_CLAIM");
    if (!r.codes.length) r.status = "supported";
    if (!byId.has(id)) results.push(r);
  });
  return results;
}
