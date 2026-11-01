// Deterministic curation between model stages: build groups, claim screening and spotlight selection.
// The model proposes; code decides. Nothing here invents text: every claim kept comes from a validated stage.
import { LABEL_REQUIRES, WITHHELD_TEXT, checkClaim, type RefIndex, type StageIssue } from "./checks";
import type { BuildGroups, Claim, Discussion, InputPost, InputProfile, PostNote, Selection, SpotlightLabel } from "./types";

export const SPOTLIGHT_MIN = 4;
export const SPOTLIGHT_MAX = 6;
const MAX_PER_LABEL = 2;
const MAX_PER_GROUP = 2;
export const GROUP_MAX = 7;
export const OTHER_BUILDS = "Other builds";
/** A comment this long or longer counts as substantive for spotlight scoring. */
const SUBSTANTIVE_COMMENT_CHARS = 60;

const NOTE_FIELDS = ["workflowPurpose", "testPerformed", "interestingPattern", "failureOrLimitation", "humanControl", "reusableLesson"] as const;

const failed = (idx: RefIndex, id: string, c: Claim) => {
  const r = checkClaim(idx, id, c);
  return r.status === "unsupported" || r.status === "conflict" ? r : null;
};

/**
 * Post notes and discussion insights can reach the published page (spotlight fallbacks, every-build one-liners),
 * so they get the same deterministic claim checks as newsletter text. A failing optional field is cleared; a failing
 * summary is withheld.
 */
export function screenNotes(idx: RefIndex, notes: PostNote[]): { notes: PostNote[]; issues: StageIssue[] } {
  const issues: StageIssue[] = [];
  const out = notes.map((n) => {
    const clean: PostNote = { ...n };
    const s = failed(idx, n.postRef + ".summary", n.summary);
    if (s) { clean.summary = { ...n.summary, text: WITHHELD_TEXT }; issues.push({ stage: "post-extractor", code: s.codes[0], detail: n.postRef + ": summary withheld (" + s.notes[0] + ")" }); }
    NOTE_FIELDS.forEach((k) => {
      const c = clean[k];
      const r = c ? failed(idx, n.postRef + "." + k, c) : null;
      if (r) { clean[k] = null; issues.push({ stage: "post-extractor", code: r.codes[0], detail: n.postRef + ": " + k + " cleared (" + r.notes[0] + ")" }); }
    });
    return clean;
  });
  return { notes: out, issues };
}

export function screenDiscussion(idx: RefIndex, d: Discussion): { discussion: Discussion; issues: StageIssue[] } {
  const issues: StageIssue[] = [];
  const insights = d.insights.filter((i, n) => {
    const r = failed(idx, "discussion[" + n + "]", i.insight);
    if (r) issues.push({ stage: "discussion-analyst", code: r.codes[0], detail: "insight dropped (" + r.notes[0] + ")" });
    return !r;
  });
  return { discussion: { insights }, issues };
}

/**
 * Every post exactly once. Unknown or repeated refs are dropped; a title that names a student, ranks, uses hype or
 * contains a number drops its group; beyond GROUP_MAX the smallest groups merge; leftovers go to "Other builds".
 * With no model output (stage skipped) every post lands in "Other builds".
 */
export function validateBuildGroups(idx: RefIndex, out: BuildGroups | null): { buildGroups: BuildGroups; issues: StageIssue[] } {
  const issues: StageIssue[] = [];
  const order = new Map(idx.input.posts.map((p, i) => [p.postRef, i]));
  const seen = new Set<string>();
  let groups: BuildGroups["groups"] = [];
  (out?.groups ?? []).forEach((g, i) => {
    const title = g.title.trim();
    const r = checkClaim(idx, "buildGroups[" + i + "].title", { text: title, evidenceRefs: [] });
    const bad = /\d/.test(title) || r.codes.some((c) => c !== "MODEL_CAPABILITY_CONFLICT" && c !== "MODEL_UNSUPPORTED_CLAIM");
    if (bad) { issues.push({ stage: "build-categorizer", code: "MODEL_STYLE_VIOLATION", detail: "group title rejected; its posts moved to " + OTHER_BUILDS }); return; }
    const refs = g.postRefs.filter((ref) => {
      if (!order.has(ref)) { issues.push({ stage: "build-categorizer", code: "MODEL_UNKNOWN_REFERENCE", detail: "unknown post ref dropped" }); return false; }
      if (seen.has(ref)) return false;
      seen.add(ref);
      return true;
    });
    if (refs.length) groups.push({ title, postRefs: refs });
  });
  const other = (gs: BuildGroups["groups"]) => gs.find((g) => g.title.toLowerCase() === OTHER_BUILDS.toLowerCase());
  if (groups.length > GROUP_MAX) {
    const keep = [...groups].filter((g) => g !== other(groups)).sort((a, b) => b.postRefs.length - a.postRefs.length).slice(0, GROUP_MAX - 1);
    const merged = groups.filter((g) => !keep.includes(g)).flatMap((g) => g.postRefs);
    groups = groups.filter((g) => keep.includes(g));
    groups.push({ title: OTHER_BUILDS, postRefs: merged });
    issues.push({ stage: "build-categorizer", code: "MODEL_SCHEMA_INVALID", detail: "more than " + GROUP_MAX + " groups; the smallest were merged into " + OTHER_BUILDS });
  }
  const leftovers = idx.input.posts.map((p) => p.postRef).filter((r) => !seen.has(r));
  if (leftovers.length) {
    const o = other(groups);
    if (o) o.postRefs.push(...leftovers);
    else groups.push({ title: OTHER_BUILDS, postRefs: leftovers });
  }
  groups.forEach((g) => g.postRefs.sort((a, b) => order.get(a)! - order.get(b)!));
  // "Other builds" always comes last.
  const o = other(groups);
  if (o) groups = [...groups.filter((g) => g !== o), o];
  return { buildGroups: { groups }, issues };
}

const live = (c: Claim | null | undefined): c is Claim => !!c && c.text !== WITHHELD_TEXT && !!c.text.trim();

const hasControl = (p: InputProfile) =>
  p.capabilities.usesHumanApproval || p.capabilities.hasValidationGate || p.capabilities.hasCodeValidation ||
  p.capabilities.hasExplicitFailureHandling || p.capabilities.hasBoundedRetry || p.capabilities.hasFallback;

export type SpotlightScore = { postRef: string; score: number; reasons: string[] };

/** The published scoring rules. Comment counts and views never count; only evidence the issue can show. */
export function scorePost(p: InputPost, note: PostNote | undefined, prof: InputProfile | undefined): SpotlightScore {
  const reasons: string[] = [];
  let score = 0;
  const add = (n: number, why: string) => { score += n; reasons.push(why + " +" + n); };
  if (prof) add(4, "workflow file");
  if ((p.screenshotCount ?? 0) > 0) add(4, "screenshot");
  if (live(note?.testPerformed)) add(3, "test result");
  if (p.comments.filter((c) => c.body.trim().length >= SUBSTANTIVE_COMMENT_CHARS).length >= 2) add(2, "substantive comments");
  if ((prof && hasControl(prof)) || live(note?.humanControl) || live(note?.failureOrLimitation)) add(2, "control or fallback");
  if (p.sourceUrlVerified) add(1, "verified link");
  return { postRef: p.postRef, score, reasons };
}

const DERIVE_ORDER: SpotlightLabel[] = [
  "Strong Human Control", "Thoughtful Fallback", "Interesting Failure Recovery", "Reusable Validation Pattern", "Clear Multi-Agent Design", "Creative Integration",
];

/**
 * Picks 4–6 spotlights from the whole week. Eligible posts have a usable note or a workflow profile and score at
 * least 2. Greedy by score, +1 when the pick adds a new build group or label; at most 2 per group and per label
 * while enough candidates remain. A model-chosen label is kept when valid; otherwise the first label the
 * deterministic profile supports, else "Useful Testing Pattern". Never ranks students: only the set is published.
 */
export function chooseSpotlights(idx: RefIndex, notes: PostNote[], groups: BuildGroups, model: Selection["spotlights"]): { spotlights: Selection["spotlights"]; scores: SpotlightScore[]; eligible: number } {
  const noteOf = new Map(notes.map((n) => [n.postRef, n]));
  const groupOf = new Map(groups.groups.flatMap((g) => g.postRefs.map((r) => [r, g.title] as const)));
  const modelOf = new Map(model.map((m) => [m.postRef, m]));
  const order = new Map(idx.input.posts.map((p, i) => [p.postRef, i]));
  const scores = idx.input.posts.map((p) => scorePost(p, noteOf.get(p.postRef), idx.profileOfPost.get(p.postRef)));
  const eligible = scores.filter((s) => s.score >= 2 && (live(noteOf.get(s.postRef)?.summary) || idx.profileOfPost.has(s.postRef)));

  const chosen: Selection["spotlights"] = [];
  const labelCount = new Map<string, number>(), groupCount = new Map<string, number>();
  const labelFor = (ref: string): SpotlightLabel => {
    const m = modelOf.get(ref);
    if (m) return m.label;
    const prof = idx.profileOfPost.get(ref);
    const fits = DERIVE_ORDER.filter((l) => prof && LABEL_REQUIRES[l]!(prof));
    return fits.find((l) => (labelCount.get(l) ?? 0) < MAX_PER_LABEL) ?? fits[0] ?? "Useful Testing Pattern";
  };
  const reasonFor = (ref: string): Claim => {
    const m = modelOf.get(ref);
    if (m) return m.reason;
    const n = noteOf.get(ref);
    return live(n?.summary) ? n!.summary : { text: idx.posts.get(ref)!.title || "Post", evidenceRefs: [ref] };
  };
  const pick = (capped: boolean) => {
    while (chosen.length < SPOTLIGHT_MAX) {
      let best: { s: SpotlightScore; label: SpotlightLabel; value: number } | null = null;
      for (const s of eligible) {
        if (chosen.some((c) => c.postRef === s.postRef)) continue;
        const label = labelFor(s.postRef);
        const group = groupOf.get(s.postRef) ?? "";
        if (capped && ((labelCount.get(label) ?? 0) >= MAX_PER_LABEL || (groupCount.get(group) ?? 0) >= MAX_PER_GROUP)) continue;
        const value = s.score + ((groupCount.get(group) ?? 0) === 0 || (labelCount.get(label) ?? 0) === 0 ? 1 : 0) + (modelOf.has(s.postRef) ? 0.5 : 0);
        if (!best || value > best.value || (value === best.value && order.get(s.postRef)! < order.get(best.s.postRef)!)) best = { s, label, value };
      }
      if (!best) return;
      chosen.push({ postRef: best.s.postRef, label: best.label, reason: reasonFor(best.s.postRef) });
      labelCount.set(best.label, (labelCount.get(best.label) ?? 0) + 1);
      const g = groupOf.get(best.s.postRef) ?? "";
      groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
      if (!capped && chosen.length >= SPOTLIGHT_MIN) return;
    }
  };
  pick(true);
  if (chosen.length < SPOTLIGHT_MIN) pick(false);
  chosen.sort((a, b) => order.get(a.postRef)! - order.get(b.postRef)!);
  return { spotlights: chosen, scores, eligible: eligible.length };
}
