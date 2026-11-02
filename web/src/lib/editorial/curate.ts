// Deterministic curation between model stages: build groups, claim screening and spotlight selection.
// The model proposes; code decides. Nothing here invents text: every claim kept comes from a validated stage.
import { LABEL_REQUIRES, WITHHELD_TEXT, checkClaim, type RefIndex, type StageIssue } from "./checks";
export { GROUP_MAX, OTHER_BUILDS, OTHER_MAX, validateBuildGroups } from "./groups";
import type { BuildGroups, Claim, Discussion, ImageChoice, ImageClass, ImageCuration, ImageEvaluation, InputPost, InputProfile, PostNote, Selection, SpotlightLabel } from "./types";

export const SPOTLIGHT_MIN = 4;
export const SPOTLIGHT_MAX = 6;
const MAX_PER_LABEL = 2;
const MAX_PER_GROUP = 2;
/** A post this well evidenced may exceed the label and group caps once the minimum is met. */
const STRONG_SCORE = 12;
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

const live = (c: Claim | null | undefined): c is Claim => !!c && c.text !== WITHHELD_TEXT && !!c.text.trim();

const hasControl = (p: InputProfile) =>
  p.capabilities.usesHumanApproval || p.capabilities.hasValidationGate || p.capabilities.hasCodeValidation ||
  p.capabilities.hasExplicitFailureHandling || p.capabilities.hasBoundedRetry || p.capabilities.hasFallback;

export type SpotlightScore = { postRef: string; score: number; reasons: string[] };

/**
 * The published scoring rules. Comment counts and views never count; only evidence the issue can show. A suitable
 * real image weighs most: the issue is image-led. `image` is code's image choice for the post (see chooseImage).
 */
export function scorePost(p: InputPost, note: PostNote | undefined, prof: InputProfile | undefined, image: ImageChoice | null = null): SpotlightScore {
  const reasons: string[] = [];
  let score = 0;
  const add = (n: number, why: string) => { score += n; reasons.push(why + " +" + n); };
  if (image) add(5, "suitable image");
  if (prof) add(4, "workflow file");
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
export function chooseSpotlights(idx: RefIndex, notes: PostNote[], groups: BuildGroups, model: Selection["spotlights"], images: Map<string, ImageChoice> = new Map()): { spotlights: Selection["spotlights"]; scores: SpotlightScore[]; eligible: number } {
  const noteOf = new Map(notes.map((n) => [n.postRef, n]));
  const groupOf = new Map(groups.groups.flatMap((g) => g.postRefs.map((r) => [r, g.title] as const)));
  const modelOf = new Map(model.map((m) => [m.postRef, m]));
  const order = new Map(idx.input.posts.map((p, i) => [p.postRef, i]));
  const scores = idx.input.posts.map((p) => scorePost(p, noteOf.get(p.postRef), idx.profileOfPost.get(p.postRef), images.get(p.postRef) ?? null));
  // When enough posts have a suitable real image, a spotlight must have one: the next qualified post replaces it.
  const imageRequired = images.size >= SPOTLIGHT_MIN;
  const eligible = scores.filter((s) => s.score >= 2 && (live(noteOf.get(s.postRef)?.summary) || idx.profileOfPost.has(s.postRef)) && (!imageRequired || images.has(s.postRef)));

  const chosen: Selection["spotlights"] = [];
  const labelCount = new Map<string, number>(), groupCount = new Map<string, number>();
  const labelFor = (ref: string): SpotlightLabel => {
    // The model's label is kept while it is under the per-label cap; otherwise another label the profile supports.
    const m = modelOf.get(ref);
    if (m && (labelCount.get(m.label) ?? 0) < MAX_PER_LABEL) return m.label;
    const prof = idx.profileOfPost.get(ref);
    const fits = DERIVE_ORDER.filter((l) => prof && LABEL_REQUIRES[l]!(prof));
    return fits.find((l) => (labelCount.get(l) ?? 0) < MAX_PER_LABEL) ?? m?.label ?? fits[0] ?? "Useful Testing Pattern";
  };
  const reasonFor = (ref: string): Claim => {
    const m = modelOf.get(ref);
    if (m) return m.reason;
    const n = noteOf.get(ref);
    return live(n?.summary) ? n!.summary : { text: idx.posts.get(ref)!.title || "Post", evidenceRefs: [ref] };
  };
  const pick = (capped: boolean, pool: SpotlightScore[], target: number) => {
    while (chosen.length < target) {
      let best: { s: SpotlightScore; label: SpotlightLabel; value: number } | null = null;
      for (const s of pool) {
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
    }
  };
  pick(true, eligible, SPOTLIGHT_MAX);
  if (chosen.length < SPOTLIGHT_MIN) pick(false, eligible, SPOTLIGHT_MIN);
  // Past the minimum, the caps give way only for fully evidenced posts (for example image + workflow file + test).
  pick(false, eligible.filter((s) => s.score >= STRONG_SCORE), SPOTLIGHT_MAX);
  chosen.sort((a, b) => order.get(a.postRef)! - order.get(b.postRef)!);
  return { spotlights: chosen, scores, eligible: eligible.length };
}

// ---------- Images: the curator advises, code decides ----------

/** Smallest image that stays readable in the 544px column. */
export const IMAGE_MIN = { width: 400, height: 220 } as const;
/** Spotlight preference: a readable workflow canvas first, then a test result, then product output. */
const CLASS_ORDER: Record<ImageClass, number> = { workflow_canvas: 0, execution_result: 1, application_output: 2, chart: 3, supporting_visual: 4, irrelevant: 9 };
/** Curator thresholds on the fixed 0–5 scale (0 none, 1 poor, 2 weak, 3 adequate, 4 good, 5 excellent). */
export const IMAGE_THRESHOLDS = { relevance: 3, readability: 2, heroSuitability: 4 } as const;
/** Posts and images sent to the curator, to stay inside the model-call and execution-time budgets. */
export const CURATOR_LIMITS = { posts: 10, imagesPerPost: 2, imagesPerCall: 6 } as const;

const ROLE_ORDER = { hero: 0, spotlight: 1, supporting: 2 } as const;
const readableSize = (i: { width: number; height: number }) => i.width >= IMAGE_MIN.width && i.height >= IMAGE_MIN.height;

/** A post's images that can be shown at all: readable size, hero and spotlight roles first, then intake order. */
export function candidateImages(p: InputPost) {
  return (p.images ?? []).filter(readableSize).map((img, i) => ({ img, i }))
    .sort((a, b) => ROLE_ORDER[a.img.role] - ROLE_ORDER[b.img.role] || a.i - b.i).map((x) => x.img);
}

/**
 * Curator output is advisory and untrusted: a post outside the batch, an image that is not that post's own, a
 * repeated image, or an alt text that fails the claim checks (names, ranking, hype, numbers) is dropped or cleared.
 */
export function validateImageCuration(idx: RefIndex, out: ImageCuration, batch: string[]): { posts: ImageCuration["posts"]; issues: StageIssue[] } {
  const issues: StageIssue[] = [];
  const posts: ImageCuration["posts"] = [];
  for (const p of out.posts) {
    const post = idx.posts.get(p.postRef);
    if (!post || !batch.includes(p.postRef) || posts.some((x) => x.postRef === p.postRef)) { issues.push({ stage: "image-curator", code: "MODEL_UNKNOWN_REFERENCE", detail: "evaluation for a post outside the batch dropped" }); continue; }
    const own = new Set((post.images ?? []).map((i) => i.assetRef));
    const seen = new Set<string>();
    const evaluations = p.evaluations.filter((e) => {
      if (!own.has(e.assetRef)) { issues.push({ stage: "image-curator", code: "MODEL_UNKNOWN_REFERENCE", detail: p.postRef + ": image from another post dropped" }); return false; }
      if (seen.has(e.assetRef)) return false;
      seen.add(e.assetRef);
      return true;
    }).map((e): ImageEvaluation => {
      const alt = checkClaim(idx, p.postRef + ".alt", { text: e.altText, evidenceRefs: [p.postRef] });
      const bad = alt.status === "unsupported" || alt.status === "conflict" || alt.codes.includes("MODEL_STYLE_VIOLATION");
      if (bad) issues.push({ stage: "image-curator", code: alt.codes[0] ?? "MODEL_STYLE_VIOLATION", detail: p.postRef + ": alt text cleared" });
      return { ...e, altText: bad ? "" : e.altText, caption: bad ? "" : e.caption, evidenceRefs: [p.postRef, e.assetRef] };
    });
    posts.push({ postRef: p.postRef, evaluations, recommendedAssetRef: p.recommendedAssetRef && own.has(p.recommendedAssetRef) ? p.recommendedAssetRef : null, recommendationReason: p.recommendationReason });
  }
  return { posts, issues };
}

const usableImage = (e: ImageEvaluation) => e.classification !== "irrelevant" && e.relevanceScore >= IMAGE_THRESHOLDS.relevance && e.readabilityScore >= IMAGE_THRESHOLDS.readability;

/**
 * Code's image for one post. With curator evaluations: the best usable image by class order, then suitability and
 * readability (the curator's recommendation breaks ties). Without them (curator skipped or failed): the first
 * readable image, hero and spotlight roles first. Null when nothing suitable exists.
 */
export function chooseImage(p: InputPost, evals: ImageCuration["posts"][number] | undefined): ImageChoice | null {
  const cands = candidateImages(p);
  if (!cands.length) return null;
  if (evals && evals.evaluations.length) {
    const order = new Map(cands.map((c, i) => [c.assetRef, i]));
    const best = evals.evaluations.filter((e) => order.has(e.assetRef) && usableImage(e)).sort((a, b) =>
      CLASS_ORDER[a.classification] - CLASS_ORDER[b.classification] || b.spotlightSuitability - a.spotlightSuitability || b.readabilityScore - a.readabilityScore ||
      Number(b.assetRef === evals.recommendedAssetRef) - Number(a.assetRef === evals.recommendedAssetRef) || order.get(a.assetRef)! - order.get(b.assetRef)!)[0];
    return best ? { postRef: p.postRef, assetRef: best.assetRef, classification: best.classification, altText: best.altText, source: "curator" } : null;
  }
  return { postRef: p.postRef, assetRef: cands[0].assetRef, classification: null, altText: "", source: "deterministic" };
}

/**
 * The hero: an intake image marked hero; else a second strong image from a spotlight post (so the hero does not
 * repeat a spotlight image); else the strongest image from a post without a spotlight; else the first spotlight's.
 */
export function chooseHero(idx: RefIndex, spotlights: Selection["spotlights"], choices: Map<string, ImageChoice>, curation: ImageCuration["posts"]): ImageChoice | null {
  for (const p of idx.input.posts) {
    const h = (p.images ?? []).find((i) => i.role === "hero" && readableSize(i));
    if (!h) continue;
    const e = curation.find((c) => c.postRef === p.postRef)?.evaluations.find((x) => x.assetRef === h.assetRef);
    return { postRef: p.postRef, assetRef: h.assetRef, classification: e?.classification ?? null, altText: e?.altText ?? "", source: e ? "curator" : "deterministic" };
  }
  const used = new Set([...choices.values()].map((c) => c.assetRef));
  const strongest = (postRefs: Set<string>) => curation.filter((c) => postRefs.has(c.postRef)).flatMap((c) => c.evaluations.map((e) => ({ postRef: c.postRef, e })))
    .filter(({ e }) => usableImage(e) && e.spotlightSuitability >= IMAGE_THRESHOLDS.heroSuitability && !used.has(e.assetRef) && e.classification !== "chart")
    .sort((a, b) => b.e.spotlightSuitability - a.e.spotlightSuitability || b.e.readabilityScore - a.e.readabilityScore)[0];
  const spot = new Set(spotlights.map((s) => s.postRef));
  const pick = strongest(spot) ?? strongest(new Set(idx.input.posts.map((p) => p.postRef).filter((r) => !spot.has(r))));
  if (pick) return { postRef: pick.postRef, assetRef: pick.e.assetRef, classification: pick.e.classification, altText: pick.e.altText, source: "curator" };
  const first = spotlights.find((s) => choices.has(s.postRef));
  return first ? choices.get(first.postRef)! : null;
}
