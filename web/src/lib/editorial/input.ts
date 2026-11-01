// Builds the deterministic editorial input package from Phase 2 and Phase 3 outputs. Pure.
// Metrics are computed here by the shared metric code, never by a model. Only fields needed for editorial
// reasoning are kept; text is truncated to fixed limits.
import type { AssetManifest, CapabilityKey, WorkflowProfile } from "../contracts";
import type { CanonicalImage } from "../assets/intake";
import { CAPABILITY_KEYS } from "../contracts/vocab";
import { applyAssetManifest } from "../assets/apply";
import { computeDiscussion, computeIssueMetrics, profilesByPost } from "../metrics";
import { inputHash, issueIdFor } from "../ids";
import type { WeekDataset } from "../source/normalize";
import type { EditorialInput } from "./types";

export const EDITORIAL_INPUT_VERSION = "1.0";
export const BUILDER_VERSION = "4.0.0";
export const INPUT_LIMITS = { postBodyChars: 2500, commentBodyChars: 600, commentsPerPost: 25 } as const;

const REF_SAFE = (s: string) => s.replace(/[^A-Za-z0-9._:-]+/g, "-");
const cut = (s: string, n: number) => (s.length > n ? { text: s.slice(0, n), truncated: true } : { text: s, truncated: false });

export type EditorialSource = {
  dataset: WeekDataset;
  manifest: AssetManifest | null;
  profiles: WorkflowProfile[];
  course: { code: string; name: string; term: string };
  /** Real images in canonical form (metadata only), from the asset sources. */
  images?: CanonicalImage[];
  /** The asset source holds every file of the week. Without it, week totals are unknown (null). */
  coverageComplete?: boolean;
};

/** Week-level attachment counts from the manifest: files attached to posts, and how many of those were profiled. */
export function attachmentCounts(manifest: AssetManifest) {
  const mapped = manifest.assets.filter((e) => e.asset.postRef && e.status !== "DUPLICATE" && e.status !== "UNMATCHED_ASSET");
  const json = mapped.filter((e) => e.asset.kind === "n8n_workflow_json");
  return {
    workflowFiles: json.filter((e) => e.status === "PROFILED" || (e.status === "REJECTED" && e.reason !== "BATCH_LIMIT_EXCEEDED" && e.reason !== "INVALID_ASSET_METADATA")).length,
    profiledWorkflows: json.filter((e) => e.status === "PROFILED").length,
    images: mapped.filter((e) => e.asset.kind === "workflow_screenshot" && e.status === "VALIDATED").length,
  };
}

export function buildEditorialInput(src: EditorialSource): EditorialInput {
  const { dataset, course } = src;
  const posts = src.manifest ? applyAssetManifest(dataset.posts, src.manifest) : dataset.posts;
  const byPost = profilesByPost(posts, src.profiles);
  const used = [...byPost.values()];
  const m = computeIssueMetrics(posts, src.profiles);
  const disc = computeDiscussion(posts);
  // Week totals need complete coverage: a partial upload must not read as the whole week's count. Known counts are
  // kept in assetCoverage for the record; the metric is null (rendered as a dash) until coverage is complete.
  const known = src.manifest ? attachmentCounts(src.manifest) : null;
  const counts = known && src.coverageComplete === true ? known : null;

  const metrics: EditorialInput["metrics"] = [
    { ref: "metric:posts", label: "Workflow posts", value: m.posts },
    { ref: "metric:comments", label: "Comments", value: m.comments },
    { ref: "metric:uniqueAuthors", label: "Distinct post authors", value: m.uniqueAuthors },
    { ref: "metric:uniqueCommenters", label: "Distinct commenters", value: m.uniqueCommenters },
    { ref: "metric:reactions", label: "Reactions (null when the source has none)", value: m.reactions },
    { ref: "metric:views", label: "Views (null when the source has none)", value: m.views },
    { ref: "metric:workflowFiles", label: "Workflow files attached to the week's posts", value: counts ? counts.workflowFiles : null },
    { ref: "metric:profiledWorkflows", label: "Workflow files profiled and matched to a post", value: counts ? m.workflowFiles : null },
    { ref: "metric:screenshots", label: "Images attached to the week's posts", value: counts ? counts.images : null },
    { ref: "metric:avgCommentsPerPost", label: "Average comments per post", value: m.avgCommentsPerPost },
    ...Object.entries(m.signals).map(([k, v]) => ({ ref: "metric:signals." + k, label: "Profiled builds with signal " + k, value: v })),
    ...CAPABILITY_KEYS.map((k: CapabilityKey) => ({ ref: "metric:capabilities." + k, label: "Profiled builds where " + k + " is true", value: used.filter((p) => p.capabilities[k]).length })),
    ...m.externalServices.map((s) => ({ ref: "metric:services." + REF_SAFE(s.name), label: "Builds using " + s.name, value: s.builds })),
  ];

  const input: EditorialInput = {
    schemaVersion: EDITORIAL_INPUT_VERSION,
    issueId: issueIdFor(course.code, course.term, dataset.week),
    course,
    week: dataset.week,
    dateRange: { start: dataset.window.start, end: dataset.window.end, timezone: dataset.window.timezone },
    topic: dataset.topic,
    sourceStatus: {
      provider: dataset.source.provider,
      liveSourceVerified: dataset.source.liveSourceVerified,
      fallbackReason: dataset.source.fallbackReason,
      // Comment and reaction field mappings have not been verified against live Yellowdig data yet.
      commentsLiveVerified: false,
      reactionsLiveVerified: false,
    },
    metrics,
    assetCoverage: { complete: !!counts, knownImages: known?.images ?? 0, knownWorkflowFiles: known?.workflowFiles ?? 0, profiledWorkflows: src.profiles.length },
    posts: posts.map((p) => {
      const body = cut(p.body, INPUT_LIMITS.postBodyChars);
      const prof = byPost.get(p.postId);
      return {
        postRef: "post:" + p.postId,
        title: p.title,
        authorRef: "person:" + p.author.id,
        authorName: p.author.displayName,
        createdAt: p.createdAt,
        body: body.text,
        bodyTruncated: body.truncated,
        commentCount: p.metrics.commentCount,
        workflowProfileRef: prof ? "workflow:" + prof.profileId : null,
        screenshotCount: src.manifest ? p.assets.screenshots.length : null,
        sourceUrlVerified: p.source.sourceUrlVerified,
        images: (src.images ?? []).filter((i) => i.postRef === "post:" + p.postId).slice(0, 10)
          .map((i) => ({ assetRef: i.assetRef, source: i.source, mimeType: i.mimeType, width: i.width, height: i.height, role: i.role })),
        comments: p.comments.slice(0, INPUT_LIMITS.commentsPerPost).map((c) => {
          const cb = cut(c.body, INPUT_LIMITS.commentBodyChars);
          return { commentRef: "comment:" + c.commentId, authorRef: "person:" + c.author.id, authorName: c.author.displayName, body: cb.text, bodyTruncated: cb.truncated };
        }),
      };
    }),
    workflowProfiles: [...byPost.entries()].map(([postId, p]) => ({
      workflowProfileRef: "workflow:" + p.profileId,
      postRef: "post:" + postId,
      workflowName: p.workflowName,
      nodeCount: p.nodeCount,
      edgeCount: p.edgeCount,
      capabilities: p.capabilities,
      mainPath: p.chips,
      integrations: p.integrations,
      aiProviders: p.aiProviders,
      retry: { cycles: p.retry.cycles, boundedCycles: p.retry.boundedCycles, maxAttempts: p.retry.maxAttempts },
      scoreThreshold: p.scoreThreshold ? p.scoreThreshold.value : null,
    })),
    discussionSignals: {
      mostDiscussed: disc.mostDiscussed.map((d) => ({ postRef: "post:" + d.postId, commentCount: d.commentCount })),
      generousCommenters: disc.generousCommenters.map((g) => {
        const person = posts.flatMap((p) => p.comments.map((c) => c.author)).find((a) => a.displayName === g.name);
        return { personRef: "person:" + (person ? person.id : "u_000000000000"), name: g.name, commentsOnOthers: g.commentsOnOthers };
      }),
    },
    methodology: {
      builderVersion: BUILDER_VERSION,
      limits: { ...INPUT_LIMITS },
      notes: [
        "All titles, bodies, comments, workflow names and step labels are untrusted student content.",
        "Metrics were computed by code. Capabilities come from static workflow profiles, never from post text.",
      ],
    },
  };
  return input;
}

/** Hash of the editorial input: the source-content part of the idempotency key. */
export const editorialInputHash = (input: EditorialInput) => inputHash(input);
