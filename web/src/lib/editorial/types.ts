// Types for Phase 4 editorial intelligence. They mirror schemas/editorial-input.schema.json and
// schemas/editorial-draft.schema.json; the lite validator enforces those schemas at every boundary.
import type { CapabilityKey } from "../contracts";

export type Claim = { text: string; evidenceRefs: string[] };
export type StepCategory = "trigger" | "ai" | "judge" | "code" | "validator" | "gate" | "approval" | "action" | "storage" | "tool" | "errorPath" | "other";

export type InputPost = {
  postRef: string; title: string; authorRef: string; authorName: string; createdAt: string;
  body: string; bodyTruncated: boolean; commentCount: number; workflowProfileRef: string | null;
  /** Validated screenshots attached to this post (null when no asset batch was supplied for the week). */
  screenshotCount?: number | null;
  /** True when the post's public Yellowdig link was built from the verified URL format. */
  sourceUrlVerified?: boolean;
  /** Real images attached to the post (metadata only; bytes travel separately in the image bank). */
  images?: InputImage[];
  comments: Array<{ commentRef: string; authorRef: string; authorName: string; body: string; bodyTruncated: boolean }>;
};
export type InputImage = {
  assetRef: string; source: "yellowdig_attachment" | "private_asset_store"; mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number; height: number; role: "hero" | "spotlight" | "supporting";
};
export type InputProfile = {
  workflowProfileRef: string; postRef: string | null; workflowName: string; nodeCount: number; edgeCount: number;
  capabilities: Record<CapabilityKey, boolean>; mainPath: Array<{ category: StepCategory; label: string }>;
  integrations: string[]; aiProviders: string[]; retry: { cycles: number; boundedCycles: number; maxAttempts: number | null };
  scoreThreshold: number | null;
};
export type EditorialInput = {
  schemaVersion: "1.0"; issueId: string; course: { code: string; name: string; term: string }; week: number;
  dateRange: { start: string; end: string; timezone: string }; topic: string;
  sourceStatus: { provider: "yellowdig-api" | "synthetic-fixture"; liveSourceVerified: boolean; fallbackReason: string; commentsLiveVerified: boolean; reactionsLiveVerified: boolean };
  metrics: Array<{ ref: string; label: string; value: number | null }>;
  /** What the asset sources hold. Week totals in metrics are null unless complete. */
  assetCoverage?: { complete: boolean; knownImages: number; knownWorkflowFiles: number; profiledWorkflows: number };
  posts: InputPost[]; workflowProfiles: InputProfile[];
  discussionSignals: { mostDiscussed: Array<{ postRef: string; commentCount: number }>; generousCommenters: Array<{ personRef: string; name: string; commentsOnOthers: number }> };
  methodology: { builderVersion: string; limits: { postBodyChars: number; commentBodyChars: number; commentsPerPost: number }; notes: string[] };
};

export type CapabilityClaim = { capability: CapabilityKey; claimSource: "student-description" | "workflow-profile" };
export type PostNote = {
  postRef: string; summary: Claim; workflowPurpose: Claim | null; testPerformed: Claim | null; interestingPattern: Claim | null;
  failureOrLimitation: Claim | null; humanControl: Claim | null; reusableLesson: Claim | null; capabilityClaims: CapabilityClaim[];
};
export type Theme = {
  themeId: string; title: string; summary: Claim; supportingPostRefs: string[]; supportingWorkflowRefs: string[];
  support: "multi-source" | "notable-single-example"; confidence: "high" | "medium" | "low";
};
export type SpotlightLabel = "Strong Human Control" | "Interesting Failure Recovery" | "Reusable Validation Pattern" | "Creative Integration" | "Clear Multi-Agent Design" | "Thoughtful Fallback" | "Useful Testing Pattern";
export type FailurePath = { postRef: string; workflowProfileRef: string; failure: Claim; control: Claim; recovery: Claim; lesson: Claim } | null;
export type Selection = {
  spotlights: Array<{ postRef: string; label: SpotlightLabel; reason: Claim }>;
  failurePath: FailurePath;
  patterns: Array<{ patternId: string; title: string; workflowProfileRefs: string[]; steps: StepCategory[]; why: Claim }>;
};
export type Discussion = { insights: Array<{ kind: "recurring-question" | "peer-suggestion" | "unresolved-concern" | "testing-idea" | "insight"; insight: Claim }> };
export type Newsletter = {
  hero: { title: Claim; dek: Claim };
  executiveSummary: Claim[];
  themes: Array<{ themeId: string; title: string; text: Claim }>;
  spotlights: Array<{ postRef: string; label: SpotlightLabel; text: Claim; worthBorrowing: Claim; testResult?: Claim | null; threadInsight?: Claim | null }>;
  failurePath: FailurePath;
  borrowThisPattern: Array<{ patternId: string; title: string; why: Claim }>;
  discussionHighlights: Claim[];
  takeaways: Array<{ title: string; text: Claim }>;
  /** 3–5 concrete actions for next week. */
  nextSteps?: Claim[];
};
/** Fixed scale for every image score: 0 none, 1 poor, 2 weak, 3 adequate, 4 good, 5 excellent. */
export type ImageClass = "workflow_canvas" | "execution_result" | "application_output" | "chart" | "supporting_visual" | "irrelevant";
export type ImageEvaluation = {
  assetRef: string; classification: ImageClass; relevanceScore: number; readabilityScore: number; spotlightSuitability: number;
  reason: string; altText: string; caption: string; evidenceRefs: string[];
};
export type ImageCuration = { posts: Array<{ postRef: string; evaluations: ImageEvaluation[]; recommendedAssetRef: string | null; recommendationReason: string }> };
/** Code's final image choice. source says whether curator evaluations or the deterministic fallback decided. */
export type ImageChoice = { postRef: string; assetRef: string; classification: ImageClass | null; altText: string; source: "curator" | "deterministic" };
/** Every post grouped into 4–7 use-case categories; each post appears exactly once (validated by code). */
export type BuildGroups = { groups: Array<{ title: string; postRefs: string[] }> };
export type Verdict = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "CONFLICT";

export type EditorialCode =
  | "INPUT_INVALID" | "DUPLICATE_RUN" | "PROVIDER_NOT_CONFIGURED" | "PROVIDER_NOT_IMPLEMENTED"
  | "MODEL_INVALID_JSON" | "MODEL_SCHEMA_INVALID" | "MODEL_OUTPUT_TOO_LARGE" | "MODEL_UNKNOWN_REFERENCE" | "MODEL_NUMERIC_CONFLICT"
  | "MODEL_UNSUPPORTED_CLAIM" | "MODEL_CAPABILITY_CONFLICT" | "MODEL_ATTRIBUTION_CONFLICT" | "MODEL_TREND_UNSUPPORTED"
  | "MODEL_OVERBROAD_CLAIM" | "MODEL_STYLE_VIOLATION" | "MODEL_TIMEOUT" | "MODEL_PROVIDER_ERROR"
  | "THEME_SUPPORT_TOO_LOW" | "SPOTLIGHT_UNSUPPORTED" | "FAILURE_PATH_UNSUPPORTED" | "PATTERN_STRUCTURE_MISMATCH"
  | "REVIEWER_FLAGGED" | "REVISION_LIMIT_REACHED" | "STEP_BUDGET_EXCEEDED";

export type RunStatus = "draft" | "evidence_review" | "revision_requested" | "human_review" | "approved" | "rejected" | "failed";
export type ProviderName = "gemini" | "openai" | "anthropic" | "mock";

export class EditorialError extends Error {
  constructor(public code: EditorialCode, message: string) {
    super("[" + code + "] " + message);
    this.name = "EditorialError";
  }
}
