// "In brief: every build" groups. The model proposes groups; code validates titles, keeps every post exactly once,
// reassigns posts that fell through to "Other builds" (a second model pass, then word similarity), and falls back to
// domain vocabulary when the model gives nothing usable. Diagnostics are recorded for review, never published.
import { WITHHELD_TEXT, checkClaim, type RefIndex, type StageIssue } from "./checks";
import type { BuildGroups, PostNote } from "./types";

export const OTHER_BUILDS = "Other builds";
export const GROUP_MAX = 8;
/** "Other builds" is a last resort: at most this many posts whenever a reasonable fit exists. */
export const OTHER_MAX = 2;

export type TitleDiagnostic = { pass: 1 | 2; proposed: string; normalized: string; accepted: boolean; reason: string | null; posts: number };
export type GroupDiagnostics = {
  titles: TitleDiagnostic[];
  /** Posts that the first pass left without a named group. */
  fellThrough: string[];
  reassigned: Array<{ postRef: string; to: string; method: "second-pass" | "similarity" | "single-post-merge" | "domain-group" }>;
  fallback: "none" | "domain-vocabulary";
};
export const emptyDiagnostics = (): GroupDiagnostics => ({ titles: [], fellThrough: [], reassigned: [], fallback: "none" });

type Group = BuildGroups["groups"][number];
const CATCH_ALL = /\b(other|misc\w*|various|general|assorted|uncategori[sz]ed|everything|remaining)\b/i;
const VAGUE = /^(ai|automation|automations|workflows?|agents?|tools?|projects?|builds?|apps?|ideas?|stuff)$/i;
const STOP = new Set("a an and the of for to in on with by from at as or into using use uses used that this these those is are was were be it its my your our their his her we you they them ai n8n workflow workflows agent agents build builds built builder project projects tool tools week two using automated automation smart based new first second via".split(" "));

/** Trimmed, single-spaced, without trailing punctuation; first letter capitalized. */
export function normalizeTitle(t: string): string {
  const s = String(t ?? "").replace(/\s+/g, " ").trim().replace(/[.:;,!?–—-]+$/, "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
/** Same key for near-duplicate titles: case, "and"/"&", word order and plural endings ignored. */
export const titleKey = (t: string) => normalizeTitle(t).toLowerCase().replace(/&/g, " ").split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/s$/, "")).sort().join(" ");

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, "")));
const live = (t: string | undefined) => !!t && t !== WITHHELD_TEXT;

/** Why a proposed title cannot be used as a group name, or null when it can. */
function rejectReason(idx: RefIndex, title: string, i: number): string | null {
  if (!title) return "failed normalization";
  if (title.toLowerCase() === OTHER_BUILDS.toLowerCase()) return null;
  if (/\d/.test(title)) return "contains a number";
  if (CATCH_ALL.test(title)) return "catch-all wording";
  if (VAGUE.test(title) || titleKey(title).split(" ").filter(Boolean).length === 0) return "overly vague";
  if (title.length > 60) return "too long";
  const r = checkClaim(idx, "buildGroups[" + i + "].title", { text: title, evidenceRefs: [] });
  const codes = r.codes.filter((c) => c !== "MODEL_CAPABILITY_CONFLICT" && c !== "MODEL_UNSUPPORTED_CLAIM");
  return codes.length ? "names a student, ranks or uses hype (" + codes[0] + ")" : null;
}

/**
 * Validates one proposal. Unknown or repeated refs are dropped (posts already in `existing` are never moved);
 * rejected titles release their posts; near-duplicate titles merge. Returns named groups only (no "Other builds").
 */
export function acceptProposal(idx: RefIndex, out: BuildGroups | null, pass: 1 | 2, existing: Group[] = [], allowed?: Set<string>) {
  const issues: StageIssue[] = [];
  const titles: TitleDiagnostic[] = [];
  const order = new Map(idx.input.posts.map((p, i) => [p.postRef, i]));
  const groups: Group[] = existing.map((g) => ({ title: g.title, postRefs: [...g.postRefs] }));
  const seen = new Set(groups.flatMap((g) => g.postRefs));
  (out?.groups ?? []).forEach((g, i) => {
    const proposed = String(g.title ?? "");
    const title = normalizeTitle(proposed);
    const reason = rejectReason(idx, title, i);
    const refs = (Array.isArray(g.postRefs) ? g.postRefs : []).filter((ref) => {
      if (!order.has(ref)) { issues.push({ stage: "build-categorizer", code: "MODEL_UNKNOWN_REFERENCE", detail: "unknown post ref dropped" }); return false; }
      if (seen.has(ref) || (allowed && !allowed.has(ref))) return false;
      return true;
    });
    if (reason) {
      titles.push({ pass, proposed: proposed.slice(0, 120), normalized: title.slice(0, 120), accepted: false, reason, posts: refs.length });
      issues.push({ stage: "build-categorizer", code: "MODEL_STYLE_VIOLATION", detail: "group title rejected (" + reason + "); its posts are reassigned" });
      return;
    }
    if (title.toLowerCase() === OTHER_BUILDS.toLowerCase()) { titles.push({ pass, proposed, normalized: title, accepted: false, reason: "catch-all (posts reassigned where possible)", posts: refs.length }); return; }
    const dup = groups.find((x) => titleKey(x.title) === titleKey(title));
    refs.forEach((r) => seen.add(r));
    if (dup) { dup.postRefs.push(...refs); titles.push({ pass, proposed, normalized: title, accepted: false, reason: "duplicate of “" + dup.title + "” (merged)", posts: refs.length }); return; }
    if (!refs.length) { titles.push({ pass, proposed, normalized: title, accepted: false, reason: "no valid posts", posts: 0 }); return; }
    groups.push({ title, postRefs: refs });
    titles.push({ pass, proposed, normalized: title, accepted: true, reason: null, posts: refs.length });
  });
  const leftovers = idx.input.posts.map((p) => p.postRef).filter((r) => !seen.has(r));
  return { groups, leftovers, titles, issues };
}

/** Generic domain vocabulary for the fallback when the model grouping fails completely (not tied to any week). */
const DOMAINS: Array<{ title: string; re: RegExp }> = [
  { title: "Meeting and Notes Assistants", re: /\b(meetings?|meeting notes|lecture notes|minutes|standups?|transcripts?|follow-?ups?)\b/i },
  { title: "News and Content Briefs", re: /\b(news|briefs?|headlines?|digests?|newsletters?|rss|articles?|podcasts?|content)\b/i },
  { title: "Finance and Trading Workflows", re: /\b(financ\w*|trad(e|es|ing)|stocks?|budget\w*|expenses?|spending|invoices?|receipts?|betting|bets?|money|transactions?)\b/i },
  { title: "Meal and Grocery Planning", re: /\b(meals?|grocer(y|ies)|recipes?|dinners?|nutrition|calories|food|cooking|culinary|smoothies?|fruit|snacks?)\b/i },
  { title: "Career and Job Search Tools", re: /\b(jobs?|resumes?|careers?|interviews?|hiring|recruit\w*)\b/i },
  { title: "Customer and Business Operations", re: /\b(support|customers?|tickets?|refunds?|clients?|sales|products?|startups?|business|discovery)\b/i },
  { title: "Productivity and Planning Agents", re: /\b(planners?|planning|schedul\w*|calendars?|reminders?|tasks?|study|assignments?|productivity|memory)\b/i },
  { title: "Personal Tracking and Coaching", re: /\b(fitness|gym|workouts?|running|health|habits?|coach\w*|trackers?|tracking|reading|sunsets?|weather|travel|flights?)\b/i },
];

const postText = (idx: RefIndex, notes: Map<string, PostNote>, ref: string) => {
  const p = idx.posts.get(ref)!;
  const s = notes.get(ref)?.summary?.text;
  return p.title + " " + (live(s) ? s : p.body.slice(0, 400));
};

/** Domain-vocabulary groups over the given posts, largest first (including single-post domains). */
function domainSplit(idx: RefIndex, noteOf: Map<string, PostNote>, refs: string[]): Group[] {
  const by = new Map<string, string[]>();
  for (const ref of refs) {
    const d = DOMAINS.find((x) => x.re.test(postText(idx, noteOf, ref)));
    if (d) by.set(d.title, [...(by.get(d.title) ?? []), ref]);
  }
  return [...by.entries()].map(([title, postRefs]) => ({ title, postRefs })).sort((a, b) => b.postRefs.length - a.postRefs.length);
}

/** Domain-vocabulary groups (fallback when the model grouping fails). Only domains with at least two posts. */
export function domainGroups(idx: RefIndex, notes: PostNote[]): Group[] {
  return domainSplit(idx, new Map(notes.map((n) => [n.postRef, n])), idx.input.posts.map((p) => p.postRef)).filter((g) => g.postRefs.length >= 2);
}

/**
 * How well a post fits a group. The post must share a word with the group's title or match the group's domain
 * vocabulary; words shared with the group's members only break ties, since they alone produce false fits.
 */
function fit(idx: RefIndex, noteOf: Map<string, PostNote>, ref: string, g: Group): number {
  const text = postText(idx, noteOf, ref);
  const pt = tokens(text);
  const gt = tokens(g.title);
  let score = 0;
  pt.forEach((w) => { if (gt.has(w)) score += 2; });
  const domain = DOMAINS.find((d) => d.title === g.title || titleKey(d.title) === titleKey(g.title) || d.re.test(g.title));
  if (domain && domain.re.test(text)) score += 2;
  if (score === 0) return 0;
  const members = tokens(g.postRefs.filter((r) => r !== ref).map((r) => postText(idx, noteOf, r)).join(" "));
  pt.forEach((w) => { if (!gt.has(w) && members.has(w)) score += 0.25; });
  return score;
}
const MIN_FIT = 2;
/** Dissolving a single-post group needs a clearly better home than a leftover does. */
const MERGE_FIT = 4;

/**
 * Final groups: leftovers are reassigned by fit until "Other builds" holds at most OTHER_MAX posts (only where a
 * reasonable fit exists), single-post groups are merged into a fitting group when possible, the group count is capped,
 * posts keep feed order, and "Other builds" comes last. Every post appears exactly once.
 */
export function finalizeGroups(idx: RefIndex, named: Group[], leftovers: string[], notes: PostNote[], diag: GroupDiagnostics): BuildGroups {
  const noteOf = new Map(notes.map((n) => [n.postRef, n]));
  const order = new Map(idx.input.posts.map((p, i) => [p.postRef, i]));
  let groups = named.map((g) => ({ title: g.title, postRefs: [...g.postRefs] })).filter((g) => g.postRefs.length);
  let other = [...leftovers];
  const best = (ref: string, among: Group[]) => among.map((g) => ({ g, s: fit(idx, noteOf, ref, g) })).sort((a, b) => b.s - a.s)[0];

  // Single-post groups join a fitting larger group when one exists.
  for (const g of [...groups]) {
    if (groups.length <= 1 || g.postRefs.length !== 1) continue;
    const b = best(g.postRefs[0], groups.filter((x) => x !== g && x.postRefs.length > 1));
    if (b && b.s >= MERGE_FIT) { b.g.postRefs.push(g.postRefs[0]); groups = groups.filter((x) => x !== g); diag.reassigned.push({ postRef: g.postRefs[0], to: b.g.title, method: "single-post-merge" }); }
  }
  // Over the cap: the smallest groups' posts are re-placed.
  while (groups.length > GROUP_MAX - (other.length ? 1 : 0)) {
    const smallest = [...groups].sort((a, b) => a.postRefs.length - b.postRefs.length)[0];
    groups = groups.filter((x) => x !== smallest);
    other.push(...smallest.postRefs);
  }
  // Leftovers: most confident placements first, until Other is within its cap.
  if (groups.length) {
    const ranked = other.map((ref) => ({ ref, b: best(ref, groups) })).sort((a, b) => b.b.s - a.b.s);
    for (const { ref, b } of ranked) {
      if (other.length <= OTHER_MAX && b.s < MIN_FIT * 2) continue;
      if (b.s < MIN_FIT) continue;
      b.g.postRefs.push(ref);
      other = other.filter((r) => r !== ref);
      diag.reassigned.push({ postRef: ref, to: b.g.title, method: "similarity" });
    }
  }
  // Still too many left over: posts sharing a domain become a new group (two or more posts first; a single-post
  // group only when the alternative is an oversized "Other builds").
  if (other.length > OTHER_MAX) {
    for (const minSize of [2, 1]) {
      for (const d of domainSplit(idx, noteOf, other)) {
        if (other.length <= OTHER_MAX || groups.length >= GROUP_MAX - 1) break;
        if (d.postRefs.length < minSize || groups.some((g) => titleKey(g.title) === titleKey(d.title))) continue;
        const take = d.postRefs.filter((r) => other.includes(r));
        if (take.length < minSize) continue;
        groups.push({ title: d.title, postRefs: take });
        other = other.filter((r) => !take.includes(r));
        take.forEach((r) => diag.reassigned.push({ postRef: r, to: d.title, method: "domain-group" }));
      }
    }
  }
  const out = groups.map((g) => ({ title: g.title, postRefs: [...new Set(g.postRefs)].sort((a, b) => order.get(a)! - order.get(b)!) }));
  if (other.length) out.push({ title: out.length ? OTHER_BUILDS : OTHER_BUILDS, postRefs: other.sort((a, b) => order.get(a)! - order.get(b)!) });
  return { groups: out };
}

/**
 * One-step grouping (first pass + similarity, or the domain fallback when `out` is null). The state machine adds a
 * second model pass between acceptProposal and finalizeGroups when too many posts fall through.
 */
export function validateBuildGroups(idx: RefIndex, out: BuildGroups | null, notes: PostNote[] = []): { buildGroups: BuildGroups; issues: StageIssue[]; diagnostics: GroupDiagnostics } {
  const diag = emptyDiagnostics();
  if (!out) {
    const groups = domainGroups(idx, notes);
    const placed = new Set(groups.flatMap((g) => g.postRefs));
    diag.fallback = "domain-vocabulary";
    diag.fellThrough = idx.input.posts.map((p) => p.postRef).filter((r) => !placed.has(r));
    return { buildGroups: finalizeGroups(idx, groups, diag.fellThrough, notes, diag), issues: [], diagnostics: diag };
  }
  const r = acceptProposal(idx, out, 1);
  diag.titles.push(...r.titles);
  diag.fellThrough = r.leftovers;
  return { buildGroups: finalizeGroups(idx, r.groups, r.leftovers, notes, diag), issues: r.issues, diagnostics: diag };
}
