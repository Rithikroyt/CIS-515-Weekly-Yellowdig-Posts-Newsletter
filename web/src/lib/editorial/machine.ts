// The editorial run as a deterministic state machine. Pure and JSON-serializable, so the local runner and
// n8n workflow 04 drive the same logic: nextRequest() says which model call to make, acceptResponse() takes
// the model's text (or a transport error) and advances. Model calls are bounded: a fixed stage list, at most
// MAX_REVISIONS revisions, and a hard MAX_STEPS budget.
import { inputHash, sha256Hex, stableStringify } from "../ids";
import {
  WITHHELD_TEXT, collectClaims, indexInput, parseModelJson, reviewNewsletter, validateDiscussion, validatePostNotes,
  validateSelection, validateThemes, worst, type ClaimResult, type ClaimStatus, type StageIssue,
} from "./checks";
import { PROMPTS, systemPrompt, userPrompt, type PromptId } from "./prompts";
import { EDITORIAL_IDS, schemaErrors } from "./registry";
import type { Discussion, EditorialCode, EditorialInput, Newsletter, PostNote, ProviderName, RunStatus, Selection, Theme, Verdict } from "./types";
import { EditorialError } from "./types";

export const MAX_REVISIONS = 2;
export const MAX_STEPS = 30;
/** A response that is not valid JSON or breaks its output schema is re-requested this many times per call. */
export const MAX_FORMAT_RETRIES = 1;
/** Characters of post content per extractor call; larger weeks are split into batches. */
export const EXTRACT_BATCH_CHARS = 24_000;

type Phase = "extract" | "themes" | "selection" | "discussion" | "newsletter" | "review" | "revise" | "done";

export type ModelRequest = {
  stage: string; promptId: PromptId; promptVersion: string; outputDef: string;
  provider: ProviderName; model: string; system: string; user: string;
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
    batches, batchIndex: 0, notes: [], capabilityChecks: [], themes: [], selection: { spotlights: [], failurePath: null, patterns: [] },
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
  if (s.steps >= MAX_STEPS) return fail(s, now, "STEP_BUDGET_EXCEEDED", "model-call budget of " + MAX_STEPS + " exceeded");
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
        { notes: s.notes, themes: s.themes, selection: s.selection, discussion: s.discussion, metrics, posts: postIndex(s), workflowProfiles: profileSummary(s) });
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
  if (!response.ok) { log(false, response.code); return fail(s, now, response.code, req.stage + ": " + response.detail); }
  const parsed = parseModelJson<Record<string, unknown>>(response.text, req.outputDef);
  if (!parsed.ok) {
    log(false, parsed.code);
    // The phase is unchanged, so nextRequest() re-issues the same call, this time with the correction attached.
    if (s.formatRetries < MAX_FORMAT_RETRIES) {
      s.formatRetries += 1;
      s.retryNote = "Your previous response was rejected (" + parsed.code + ": " + parsed.detail.slice(0, 300) + "). Return exactly one JSON object that matches the required output format.";
      return s;
    }
    return fail(s, now, parsed.code, req.stage + ": " + parsed.detail);
  }
  s.formatRetries = 0;
  s.retryNote = null;
  log(true, null);
  const idx = indexInput(s.input);
  const v = parsed.value;
  switch (s.phase) {
    case "extract": {
      const r = validatePostNotes(idx, (v as { notes: PostNote[] }).notes, s.batches[s.batchIndex]);
      s.notes.push(...r.notes);
      s.capabilityChecks.push(...r.checks);
      s.stageIssues.push(...r.issues);
      s.batchIndex += 1;
      if (s.batchIndex >= s.batches.length) s.phase = "themes";
      return s;
    }
    case "themes": {
      const r = validateThemes(idx, (v as { themes: Theme[] }).themes);
      s.themes = r.themes; s.stageIssues.push(...r.issues); s.phase = "selection";
      return s;
    }
    case "selection": {
      const r = validateSelection(idx, v as Selection);
      s.selection = r.selection; s.stageIssues.push(...r.issues); s.phase = "discussion";
      return s;
    }
    case "discussion": {
      const r = validateDiscussion(idx, v as Discussion);
      s.discussion = r.discussion; s.stageIssues.push(...r.issues); s.phase = "newsletter";
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
  const review = {
    passed: s.status !== "failed" && !!newsletter && s.review.length > 0 && s.review.every((r) => r.status === "supported"),
    claims: s.review.map((r) => {
      const c = newsletter ? collectClaims(newsletter).find((x) => x.claimId === r.claimId)?.claim : undefined;
      return { claimId: r.claimId, method: "ai-drafted" as const, evidenceRefs: c ? c.evidenceRefs : [], reviewStatus: r.status, codes: r.codes };
    }),
    unresolved,
    stageIssues: s.stageIssues.slice(0, 400),
  };
  const body = {
    schemaVersion: "1.0" as const, issueId: s.input.issueId, week: s.input.week, status: s.status, inputHash: s.inputHash, idempotencyKey: s.idempotencyKey,
    metrics: s.input.metrics, postNotes: s.notes, capabilityChecks: s.capabilityChecks, themes: s.themes, selection: s.selection,
    discussion: s.discussion, newsletter, review,
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
