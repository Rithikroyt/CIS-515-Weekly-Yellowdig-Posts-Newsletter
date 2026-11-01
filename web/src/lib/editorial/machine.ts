// The editorial run as a deterministic state machine. Pure and JSON-serializable, so the local runner and
// n8n workflow 04 drive the same logic: nextRequest() says which model call to make, acceptResponse() takes
// the model's text (or a transport error) and advances. Model calls are bounded: a fixed stage list, at most
// MAX_REVISIONS revisions, and a hard MAX_STEPS budget.
import { inputHash, sha256Hex, stableStringify } from "../ids";
import {
  WITHHELD_TEXT, checkClaim, collectClaims, indexInput, parseModelJson, reviewNewsletter, validateDiscussion, validatePostNotes,
  validateSelection, validateThemes, worst, type ClaimResult, type ClaimStatus, type StageIssue,
} from "./checks";
import {
  CURATOR_LIMITS, candidateImages, chooseHero, chooseImage, chooseSpotlights, scorePost, screenDiscussion, screenNotes, validateBuildGroups, validateImageCuration,
} from "./curate";
import { finalizeIntroduction, type IntroSource } from "./intro";
import { PROMPTS, systemPrompt, userPrompt, type PromptId } from "./prompts";
import { EDITORIAL_IDS, repairToSchema, schemaErrors } from "./registry";
import type { BuildGroups, Discussion, EditorialCode, ImageChoice, ImageCuration, EditorialInput, Newsletter, PostNote, ProviderName, RunStatus, Selection, Theme, Verdict } from "./types";
import { EditorialError } from "./types";

export const MAX_REVISIONS = 2;
export const MAX_STEPS = 30;
/** A failed call (transport error, invalid JSON, schema mismatch after repair) is re-requested this many times. */
export const MAX_FORMAT_RETRIES = 2;
/** Characters of post content per extractor call; larger weeks are split into batches. */
export const EXTRACT_BATCH_CHARS = 24_000;

type Phase = "extract" | "themes" | "groups" | "images" | "selection" | "discussion" | "newsletter" | "review" | "revise" | "done";

export type ModelRequest = {
  stage: string; promptId: PromptId; promptVersion: string; outputDef: string;
  provider: ProviderName; model: string; system: string; user: string;
  /** Real images sent with the call (image-curator only). Bytes are attached by the caller from the image bank. */
  images?: Array<{ assetRef: string; mimeType: string; data?: string }>;
};
export type ModelResponse = { ok: true; text: string } | { ok: false; code: "MODEL_TIMEOUT" | "MODEL_PROVIDER_ERROR"; detail: string };

export type CapabilityCheck = { postRef: string; capability: string; claimSource: "student-description" | "workflow-profile"; deterministicStatus: "confirmed" | "not-confirmed" | "no-workflow-file" };

export type RunState = {
  v: 1;
  input: EditorialInput;
  inputHash: string;
  idempotencyKey: string;
  runId: string;
  parentRunId: string | null;
  feedback: string | null;
  provider: ProviderName;
  model: string;
  startedAt: string;
  phase: Phase;
  batches: string[][];
  batchIndex: number;
  notes: PostNote[];
  capabilityChecks: CapabilityCheck[];
  themes: Theme[];
  buildGroups: BuildGroups;
  /** Image curator batches (post refs), its validated evaluations, and code's final image choices. */
  imageBatches: string[][];
  imageBatchIndex: number;
  imageCuration: ImageCuration["posts"];
  imageChoices: ImageChoice[];
  heroImage: ImageChoice | null;
  selection: Selection;
  discussion: Discussion;
  newsletter: Newsletter | null;
  review: ClaimResult[];
  reviewedByModel: boolean;
  revisionCount: number;
  stageIssues: StageIssue[];
  modelCalls: Array<{ stage: string; promptId: string; promptVersion: string; ok: boolean; errorCode: EditorialCode | null }>;
  statusHistory: RunStatus[];
  status: RunStatus;
  steps: number;
  errorCode: EditorialCode | null;
  errorSummary: string | null;
  pending: ModelRequest | null;
  /** Format retries used for the current call, and the correction sent with the retry. */
  formatRetries: number;
  retryNote: string | null;
};

export type StartOptions = {
  input: EditorialInput;
  provider: ProviderName;
  model: string;
  now: string;
  parentRunId?: string | null;
  feedback?: string | null;
  /** Runs already recorded for this course/term/week (from the run table). */
  existingRuns?: Array<{ idempotencyKey: string; status: RunStatus; runId: string }>;
  /** Explicitly allow another run for identical input. */
  force?: boolean;
};

const idKey = (input: EditorialInput, hash: string) => {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [slug(input.course.code), slug(input.course.term), "week-" + String(input.week).padStart(2, "0"), hash.slice(0, 16)].join(":");
};

/** Validates the input, enforces idempotency and plans the extractor batches. Throws EditorialError. */
export function startRun(o: StartOptions): RunState {
  const errs = schemaErrors(EDITORIAL_IDS.input, o.input);
  if (errs.length) throw new EditorialError("INPUT_INVALID", "editorial input does not match its schema: " + errs.slice(0, 3).join("; "));
  const hash = inputHash(o.input);
  const key = idKey(o.input, hash);
  const prior = (o.existingRuns ?? []).filter((r) => r.idempotencyKey === key && r.status !== "failed" && r.status !== "rejected");
  // A revision of an earlier run (parentRunId + feedback) or an explicit force is allowed; a silent repeat is not.
  if (prior.length && !o.force && !o.parentRunId) throw new EditorialError("DUPLICATE_RUN", "a run already exists for this input (" + prior[0].runId + ")");
  const attempt = (o.existingRuns ?? []).filter((r) => r.idempotencyKey === key).length;
  const runId = "run_ed-" + sha256Hex(key + "|" + (o.parentRunId ?? "") + "|" + attempt).slice(0, 16);

  const batches: string[][] = [];
  let cur: string[] = [], size = 0;
  for (const p of o.input.posts) {
    const len = p.title.length + p.body.length + p.comments.reduce((s, c) => s + c.body.length, 0) + 400;
    if (cur.length && size + len > EXTRACT_BATCH_CHARS) { batches.push(cur); cur = []; size = 0; }
    cur.push(p.postRef); size += len;
  }
  if (cur.length) batches.push(cur);

  return {
    v: 1, input: o.input, inputHash: hash, idempotencyKey: key, runId, parentRunId: o.parentRunId ?? null, feedback: o.feedback ?? null,
    provider: o.provider, model: o.model, startedAt: o.now, phase: batches.length ? "extract" : "done",
    batches, batchIndex: 0, notes: [], capabilityChecks: [], themes: [], buildGroups: { groups: [] }, imageBatches: [], imageBatchIndex: 0, imageCuration: [], imageChoices: [], heroImage: null, selection: { spotlights: [], failurePath: null, patterns: [] },
    discussion: { insights: [] }, newsletter: null, review: [], reviewedByModel: false, revisionCount: 0, stageIssues: [], modelCalls: [],
    statusHistory: ["draft"], status: "draft", steps: 0, errorCode: null,
    errorSummary: batches.length ? null : "No eligible posts in this week; nothing to draft.", pending: null,
    formatRetries: 0, retryNote: null,
  };
}

const setStatus = (s: RunState, status: RunStatus) => { if (s.status !== status) { s.status = status; s.statusHistory.push(status); } };
const clone = (s: RunState): RunState => JSON.parse(JSON.stringify(s));

function request(s: RunState, stage: string, promptId: PromptId, task: Record<string, unknown>, data: unknown): ModelRequest {
  const p = PROMPTS[promptId];
  return {
    stage, promptId, promptVersion: p.promptVersion, outputDef: p.outputDef, provider: s.provider, model: s.model,
    system: systemPrompt(promptId), user: userPrompt(task, data),
  };
}

const profileSummary = (s: RunState) => s.input.workflowProfiles.map((w) => ({
  workflowProfileRef: w.workflowProfileRef, postRef: w.postRef, workflowName: w.workflowName,
  capabilitiesTrue: Object.entries(w.capabilities).filter(([, v]) => v).map(([k]) => k), mainPath: w.mainPath,
  integrations: w.integrations, aiProviders: w.aiProviders, retry: w.retry, scoreThreshold: w.scoreThreshold,
}));
const postIndex = (s: RunState) => s.input.posts.map((p) => ({ postRef: p.postRef, title: p.title, authorName: p.authorName, workflowProfileRef: p.workflowProfileRef }));

function excerpts(s: RunState, refs: string[]) {
  const idx = indexInput(s.input);
  return refs.map((r) => {
    if (r.startsWith("post:")) { const p = idx.posts.get(r); return { ref: r, excerpt: p ? (p.title + ": " + p.body).slice(0, 900) : null }; }
    if (r.startsWith("comment:")) return { ref: r, excerpt: idx.comments.get(r)?.body ?? null };
    if (r.startsWith("workflow:")) { const w = idx.profiles.get(r); return { ref: r, excerpt: w ? w.workflowName + " — true capabilities: " + Object.entries(w.capabilities).filter(([, v]) => v).map(([k]) => k).join(", ") + " — path: " + w.mainPath.map((x) => x.category + ":" + x.label).join(" → ") : null }; }
    return { ref: r, excerpt: idx.metrics.has(r) ? r + " = " + idx.metrics.get(r) : null };
  });
}

/** Decides the next model call, or finishes the run. Never makes a call itself. */
export function nextRequest(state: RunState, now: string): RunState {
  const s = clone(state);
  s.pending = null;
  if (s.phase === "done" || s.status === "failed") return finish(s);
  if (s.steps >= MAX_STEPS) {
    // With a newsletter already drafted, stop here and keep it: unresolved claims are still withheld.
    if (s.newsletter) { s.stageIssues.push({ stage: s.phase, code: "STEP_BUDGET_EXCEEDED", detail: "model-call budget of " + MAX_STEPS + " reached" }); return finish(s); }
    return fail(s, now, "STEP_BUDGET_EXCEEDED", "model-call budget of " + MAX_STEPS + " exceeded");
  }
  const metrics = s.input.metrics;
  switch (s.phase) {
    case "extract": {
      const refs = new Set(s.batches[s.batchIndex]);
      const posts = s.input.posts.filter((p) => refs.has(p.postRef));
      s.pending = request(s, "post-extractor", "post-extractor", { batch: s.batchIndex + 1, of: s.batches.length, write_one_note_per_post: [...refs] },
        { posts, workflowProfiles: profileSummary(s).filter((w) => w.postRef && refs.has(w.postRef)) });
      break;
    }
    case "themes":
      s.pending = request(s, "theme-analyst", "theme-analyst", { week: s.input.week, topic: s.input.topic }, { notes: s.notes, workflowProfiles: profileSummary(s), metrics, posts: postIndex(s) });
      break;
    case "groups": {
      const noteOf = new Map(s.notes.map((n) => [n.postRef, n]));
      const posts = s.input.posts.map((p) => ({ postRef: p.postRef, title: p.title, summary: noteOf.get(p.postRef)?.summary.text ?? p.body.slice(0, 300) }));
      s.pending = request(s, "build-categorizer", "build-categorizer", { week: s.input.week, topic: s.input.topic, groupEveryPost: posts.length }, { posts });
      break;
    }
    case "images": {
      const refs = s.imageBatches[s.imageBatchIndex];
      const posts = s.input.posts.filter((p) => refs.includes(p.postRef)).map((p) => ({
        postRef: p.postRef, title: p.title, body: p.body.slice(0, 600), workflowProfileRef: p.workflowProfileRef,
        images: candidateImages(p).slice(0, CURATOR_LIMITS.imagesPerPost).map((i) => ({ assetRef: i.assetRef, mimeType: i.mimeType, width: i.width, height: i.height })),
      }));
      s.pending = request(s, "image-curator", "image-curator", { batch: s.imageBatchIndex + 1, of: s.imageBatches.length, evaluateEveryImage: true },
        { posts, workflowProfiles: profileSummary(s).filter((w) => w.postRef && refs.includes(w.postRef)) });
      s.pending.images = posts.flatMap((p) => p.images.map((i) => ({ assetRef: i.assetRef, mimeType: i.mimeType })));
      break;
    }
    case "selection":
      s.pending = request(s, "spotlight-pattern-selector", "spotlight-pattern-selector", { week: s.input.week },
        { notes: s.notes, themes: s.themes, workflowProfiles: profileSummary(s), posts: s.input.posts, metrics });
      break;
    case "discussion": {
      const withComments = s.input.posts.filter((p) => p.comments.length).map((p) => ({ postRef: p.postRef, title: p.title, authorName: p.authorName, comments: p.comments }));
      if (!withComments.length) { s.phase = "newsletter"; return nextRequest(s, now); }
      s.pending = request(s, "discussion-analyst", "discussion-analyst", { week: s.input.week }, { posts: withComments });
      break;
    }
    case "newsletter":
      s.pending = request(s, "newsletter-editor", "newsletter-editor", { week: s.input.week, reviewerFeedback: s.feedback },
        { notes: s.notes, themes: s.themes, selection: s.selection, discussion: s.discussion, metrics, posts: postIndex(s), workflowProfiles: profileSummary(s), spotlightImages: spotlightImages(s) });
      break;
    case "review": {
      const claims = collectClaims(s.newsletter).map(({ claimId, claim }) => ({ claimId, text: claim.text, evidence: excerpts(s, claim.evidenceRefs) }));
      s.pending = request(s, "evidence-reviewer", "evidence-reviewer", { judge_each_claim_against_its_cited_excerpts: true }, { claims });
      break;
    }
    case "revise": {
      const problems = s.review.filter((r) => r.status !== "supported").map((r) => ({ claimId: r.claimId, codes: r.codes, notes: r.notes }));
      s.pending = request(s, "newsletter-reviser", "newsletter-reviser", { revision: s.revisionCount + 1, maxRevisions: MAX_REVISIONS, fixTheseProblems: problems },
        { newsletter: s.newsletter, themes: s.themes, selection: s.selection, discussion: s.discussion, metrics, posts: postIndex(s), workflowProfiles: profileSummary(s) });
      break;
    }
  }
  if (s.pending && s.retryNote) s.pending.user += "\n\n" + s.retryNote;
  s.steps += 1;
  return s;
}

function fail(s: RunState, now: string, code: EditorialCode, summary: string): RunState {
  s.errorCode = code;
  s.errorSummary = summary.slice(0, 300);
  setStatus(s, "failed");
  return finish(s);
}

/** Runs the deterministic review on the current newsletter and decides: model review, revision or done. */
function afterDraft(s: RunState): RunState {
  setStatus(s, "evidence_review");
  s.review = reviewNewsletter(indexInput(s.input), s.newsletter!, { themes: s.themes, selection: s.selection });
  s.reviewedByModel = false;
  const ok = s.review.every((r) => r.status === "supported");
  if (ok) { s.phase = "review"; return s; }
  return revisionOrStop(s);
}

function revisionOrStop(s: RunState): RunState {
  if (s.revisionCount < MAX_REVISIONS) { setStatus(s, "revision_requested"); s.phase = "revise"; return s; }
  s.errorCode = "REVISION_LIMIT_REACHED";
  s.errorSummary = "Evidence review still failed after " + MAX_REVISIONS + " revisions; unresolved claims are withheld for the human reviewer.";
  return finish(s);
}

/** Takes the model's response for the pending request and advances the run. */
export function acceptResponse(state: RunState, response: ModelResponse, now: string): RunState {
  const s = clone(state);
  const req = s.pending;
  if (!req) throw new EditorialError("MODEL_PROVIDER_ERROR", "no pending model request");
  s.pending = null;
  const log = (ok: boolean, code: EditorialCode | null) => s.modelCalls.push({ stage: req.stage, promptId: req.promptId, promptVersion: req.promptVersion, ok, errorCode: code });
  const parsed = response.ok ? parseModelJson<Record<string, unknown>>(response.text, req.outputDef) : null;
  if (!response.ok || !parsed!.ok) {
    const bad = response.ok ? (parsed as { code: EditorialCode; detail: string }) : response;
    log(false, bad.code);
    // The phase is unchanged, so nextRequest() re-issues the same call (with the correction for a format problem).
    if (s.formatRetries < MAX_FORMAT_RETRIES) {
      s.formatRetries += 1;
      s.retryNote = response.ok ? "Your previous response was rejected (" + bad.code + ": " + bad.detail.slice(0, 300) + "). Return exactly one JSON object that matches the required output format." : null;
      return s;
    }
    return giveUpOnStage(s, now, req.stage, bad.code, bad.detail);
  }
  s.formatRetries = 0;
  s.retryNote = null;
  log(true, null);
  const idx = indexInput(s.input);
  const v = parsed!.value;
  switch (s.phase) {
    case "extract": {
      const r = validatePostNotes(idx, (v as { notes: PostNote[] }).notes, s.batches[s.batchIndex]);
      const screened = screenNotes(idx, r.notes);
      s.notes.push(...screened.notes);
      s.stageIssues.push(...screened.issues);
      s.capabilityChecks.push(...r.checks);
      s.stageIssues.push(...r.issues);
      s.batchIndex += 1;
      if (s.batchIndex >= s.batches.length) s.phase = "themes";
      return s;
    }
    case "themes": {
      const r = validateThemes(idx, (v as { themes: Theme[] }).themes);
      s.themes = r.themes; s.stageIssues.push(...r.issues); s.phase = "groups";
      return s;
    }
    case "groups": {
      const r = validateBuildGroups(idx, v as BuildGroups);
      s.buildGroups = r.buildGroups; s.stageIssues.push(...r.issues);
      return enterImages(s);
    }
    case "images": {
      const r = validateImageCuration(idx, v as ImageCuration, s.imageBatches[s.imageBatchIndex]);
      s.imageCuration.push(...r.posts); s.stageIssues.push(...r.issues);
      return nextImageBatch(s);
    }
    case "selection": {
      const r = validateSelection(idx, v as Selection);
      s.selection = r.selection; s.stageIssues.push(...r.issues);
      return afterSelection(s);
    }
    case "discussion": {
      const r = validateDiscussion(idx, v as Discussion);
      const screened = screenDiscussion(idx, r.discussion);
      s.discussion = screened.discussion; s.stageIssues.push(...r.issues, ...screened.issues); s.phase = "newsletter";
      return s;
    }
    case "newsletter":
      s.newsletter = v as Newsletter;
      return afterDraft(s);
    case "revise":
      s.revisionCount += 1;
      s.newsletter = v as Newsletter;
      return afterDraft(s);
    case "review": {
      // The model reviewer can only lower a claim's status; it never rewrites text or upgrades a code finding.
      const verdicts = new Map((v as { verdicts: Array<{ claimId: string; verdict: Verdict }> }).verdicts.map((x) => [x.claimId, x.verdict]));
      const map: Record<Verdict, ClaimStatus> = { SUPPORTED: "supported", PARTIALLY_SUPPORTED: "partially-supported", UNSUPPORTED: "unsupported", CONFLICT: "conflict" };
      s.review.forEach((r) => {
        const verdict = verdicts.get(r.claimId);
        const st: ClaimStatus = verdict ? map[verdict] : r.claimId.endsWith(".title") && !r.claimId.startsWith("hero") ? "supported" : "partially-supported";
        if (st !== "supported") { r.status = worst(r.status, st); if (!r.codes.includes("REVIEWER_FLAGGED")) r.codes.push("REVIEWER_FLAGGED"); r.notes.push(verdict ? "model reviewer: " + verdict : "model reviewer returned no verdict"); }
      });
      s.reviewedByModel = true;
      if (s.review.every((r) => r.status === "supported")) return finish(s);
      return revisionOrStop(s);
    }
  }
  return s;
}

/**
 * Retries are used up. Only the newsletter draft is essential: an optional stage is skipped and recorded (the
 * newsletter is then written without it), a failed revision keeps the previous draft with its unresolved claims
 * withheld, and a failed model review keeps the code review, which every claim had already passed.
 */
function giveUpOnStage(s: RunState, now: string, stage: string, code: EditorialCode, detail: string): RunState {
  s.formatRetries = 0;
  s.retryNote = null;
  const skip = () => s.stageIssues.push({ stage: stage.slice(0, 40), code, detail: ("stage skipped: " + detail).slice(0, 300) });
  switch (s.phase) {
    case "extract": skip(); s.batchIndex += 1; if (s.batchIndex >= s.batches.length) s.phase = "themes"; return s;
    case "themes": skip(); s.phase = "groups"; return s;
    case "groups": { skip(); const r = validateBuildGroups(indexInput(s.input), null); s.buildGroups = r.buildGroups; return enterImages(s); }
    // A failed curator batch never fails the run: those posts get the deterministic image choice.
    case "images": skip(); return nextImageBatch(s);
    case "selection": skip(); return afterSelection(s);
    case "discussion": skip(); s.phase = "newsletter"; return s;
    case "revise": skip(); s.revisionCount = MAX_REVISIONS; return revisionOrStop(s);
    case "review": skip(); return finish(s);
    default: return fail(s, now, code, stage + ": " + detail);
  }
}

/**
 * Plans the image curator: the strongest posts that have readable real images (scored without the image bonus),
 * at most CURATOR_LIMITS.posts, batched so no call carries more than CURATOR_LIMITS.imagesPerCall images.
 * A week without images skips straight to selection.
 */
function enterImages(s: RunState): RunState {
  // Privacy: real class images are never sent to an external model. The curator runs only on synthetic test data;
  // real weeks get images inserted by a person on their own computer (scripts/finalize-newsletter-images.ts).
  if (s.input.sourceStatus.provider !== "synthetic-fixture") {
    s.imageBatches = []; s.imageBatchIndex = 0; s.phase = "selection"; chooseImages(s);
    return s;
  }
  const idx = indexInput(s.input);
  const noteOf = new Map(s.notes.map((n) => [n.postRef, n]));
  const order = new Map(s.input.posts.map((p, i) => [p.postRef, i]));
  const withImages = s.input.posts.filter((p) => candidateImages(p).length)
    .map((p) => ({ p, score: scorePost(p, noteOf.get(p.postRef), idx.profileOfPost.get(p.postRef)).score }))
    .sort((a, b) => b.score - a.score || order.get(a.p.postRef)! - order.get(b.p.postRef)!).slice(0, CURATOR_LIMITS.posts);
  const batches: string[][] = [];
  let cur: string[] = [], n = 0;
  for (const { p } of withImages) {
    const k = Math.min(candidateImages(p).length, CURATOR_LIMITS.imagesPerPost);
    if (cur.length && n + k > CURATOR_LIMITS.imagesPerCall) { batches.push(cur); cur = []; n = 0; }
    cur.push(p.postRef); n += k;
  }
  if (cur.length) batches.push(cur);
  s.imageBatches = batches;
  s.imageBatchIndex = 0;
  s.phase = batches.length ? "images" : "selection";
  if (!batches.length) chooseImages(s);
  return s;
}

function nextImageBatch(s: RunState): RunState {
  s.imageBatchIndex += 1;
  if (s.imageBatchIndex >= s.imageBatches.length) { chooseImages(s); s.phase = "selection"; }
  return s;
}

/** Code's image for every post with readable images: curator-informed where evaluated, deterministic otherwise. */
function chooseImages(s: RunState) {
  const byPost = new Map(s.imageCuration.map((c) => [c.postRef, c]));
  s.imageChoices = s.input.posts.map((p) => chooseImage(p, byPost.get(p.postRef))).filter((c): c is ImageChoice => !!c);
}

const spotlightImages = (s: RunState) => s.selection.spotlights.map((sp) => {
  const c = s.imageChoices.find((x) => x.postRef === sp.postRef);
  return { postRef: sp.postRef, classification: c?.classification ?? null };
});

/**
 * The model's spotlight picks are suggestions: code scores the whole week and fixes the final 4–6 (see curate.ts).
 * Groups are filled first if that stage never ran, so every post has a group for the diversity rule.
 */
function afterSelection(s: RunState): RunState {
  const idx = indexInput(s.input);
  if (!s.buildGroups.groups.length) s.buildGroups = validateBuildGroups(idx, null).buildGroups;
  const choices = new Map(s.imageChoices.map((c) => [c.postRef, c]));
  const r = chooseSpotlights(idx, s.notes, s.buildGroups, s.selection.spotlights, choices);
  s.selection = { ...s.selection, spotlights: r.spotlights };
  s.heroImage = chooseHero(idx, r.spotlights, choices, s.imageCuration);
  s.phase = "discussion";
  return s;
}

/** Ends the run at human_review (or failed). Nothing is ever marked approved here. */
function finish(s: RunState): RunState {
  s.phase = "done";
  if (s.status !== "failed") setStatus(s, "human_review");
  return s;
}

/** The review-ready draft. Unsupported or conflicting claims are withheld for the human reviewer. */
export function buildDraft(s: RunState, now: string) {
  const reviewById = new Map(s.review.map((r) => [r.claimId, r]));
  const newsletter: Newsletter | null = s.newsletter ? JSON.parse(JSON.stringify(s.newsletter)) : null;
  const unresolved: Array<{ claimId: string; originalText: string; reviewStatus: "partially-supported" | "unsupported" | "conflict"; codes: EditorialCode[] }> = [];
  if (newsletter) {
    collectClaims(newsletter).forEach(({ claimId, claim }) => {
      const r = reviewById.get(claimId);
      if (!r || r.status === "supported") return;
      unresolved.push({ claimId, originalText: claim.text.slice(0, 700), reviewStatus: r.status, codes: r.codes });
      if (r.status === "unsupported" || r.status === "conflict") claim.text = WITHHELD_TEXT;
    });
  }
  // The introduction is never left blank: rejected sentences are removed and re-checked, else code assembles one
  // from checked evidence (intro.ts). Rejected originals stay in review.unresolved for the human reviewer.
  const isIntro = (id: string) => id.startsWith("executiveSummary[");
  let introSource: IntroSource | null = null;
  const introClaims: Array<{ claimId: string; method: "ai-drafted" | "code-generated"; evidenceRefs: string[]; reviewStatus: ClaimStatus; codes: EditorialCode[] }> = [];
  if (newsletter && s.newsletter) {
    const idx = indexInput(s.input);
    const intro = finalizeIntroduction(idx, s.newsletter.executiveSummary, reviewById, { notes: s.notes, selection: s.selection, themes: s.themes });
    newsletter.executiveSummary = intro.claims;
    introSource = intro.source;
    intro.claims.forEach((c, i) => {
      const id = "executiveSummary[" + i + "]";
      const r = intro.source === "ai" ? reviewById.get(id) : checkClaim(idx, id, c);
      introClaims.push({ claimId: id, method: intro.source === "deterministic" ? "code-generated" : "ai-drafted", evidenceRefs: c.evidenceRefs, reviewStatus: r?.status ?? "supported", codes: r?.codes ?? [] });
    });
  }
  const review = {
    passed: s.status !== "failed" && !!newsletter && s.review.length > 0 && s.review.every((r) => r.status === "supported"),
    claims: [...s.review.filter((r) => !isIntro(r.claimId)).map((r) => {
      const c = newsletter ? collectClaims(newsletter).find((x) => x.claimId === r.claimId)?.claim : undefined;
      return { claimId: r.claimId, method: "ai-drafted" as const, evidenceRefs: c ? c.evidenceRefs : [], reviewStatus: r.status, codes: r.codes };
    }), ...introClaims],
    unresolved,
    stageIssues: s.stageIssues.slice(0, 400),
  };
  const body = {
    schemaVersion: "1.0" as const, issueId: s.input.issueId, week: s.input.week, status: s.status, inputHash: s.inputHash, idempotencyKey: s.idempotencyKey,
    metrics: s.input.metrics, postNotes: s.notes, capabilityChecks: s.capabilityChecks, themes: s.themes, selection: s.selection,
    discussion: s.discussion, newsletter, buildGroups: s.buildGroups, introSource,
    images: { curation: { posts: s.imageCuration }, choices: s.imageChoices, hero: s.heroImage }, review,
  };
  const usedPrompts = [...new Map(s.modelCalls.map((c) => [c.promptId, c.promptVersion])).entries()].map(([promptId, promptVersion]) => ({ promptId, promptVersion }));
  const run = {
    runId: s.runId, parentRunId: s.parentRunId, idempotencyKey: s.idempotencyKey, week: s.input.week, status: s.status,
    statusHistory: s.statusHistory, provider: s.provider, model: s.model, promptVersions: usedPrompts, inputHash: s.inputHash,
    outputHash: s.status === "failed" ? null : sha256Hex(stableStringify(body)), startedAt: s.startedAt, completedAt: now,
    revisionCount: s.revisionCount, postCount: s.input.posts.length, workflowProfileCount: s.input.workflowProfiles.length,
    modelCalls: s.modelCalls, evidenceFailures: s.stageIssues.length + unresolved.length, errorCode: s.errorCode, errorSummary: s.errorSummary,
  };
  return { ...body, run };
}

export type EditorialDraft = ReturnType<typeof buildDraft>;

/** Throws CONTRACT_VIOLATION-style EditorialError when a draft does not match schemas/editorial-draft.schema.json. */
export function assertDraft(draft: unknown): void {
  // Larger real weeks can exceed list or length limits (post notes, stage issues); trim structurally before checking.
  repairToSchema(EDITORIAL_IDS.draft, draft);
  const errs = schemaErrors(EDITORIAL_IDS.draft, draft);
  if (errs.length) throw new EditorialError("MODEL_SCHEMA_INVALID", "editorial draft does not match its schema: " + errs.slice(0, 3).join("; "));
}

/** Ends a run that the caller must stop (for example, n8n's step-budget guard). */
export function abortRun(state: RunState, code: EditorialCode, summary: string, now: string): RunState {
  return fail(clone(state), now, code, summary);
}

/** One flat row for the editorial_runs table (design in docs/editorial-intelligence.md). No source content. */
export function runRow(draft: EditorialDraft) {
  const r = draft.run;
  return {
    run_id: r.runId, parent_run_id: r.parentRunId, week: r.week, status: r.status, input_hash: r.inputHash, idempotency_key: r.idempotencyKey,
    provider: r.provider, model: r.model, prompt_versions: r.promptVersions.map((p) => p.promptId + "@" + p.promptVersion).join(","),
    post_count: r.postCount, workflow_profile_count: r.workflowProfileCount, revision_count: r.revisionCount, model_calls: r.modelCalls.length,
    evidence_failures: r.evidenceFailures, started_at: r.startedAt, completed_at: r.completedAt, error_code: r.errorCode, error_summary: r.errorSummary,
  };
}
