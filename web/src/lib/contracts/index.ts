// Zod validators and TypeScript types that mirror /schemas/*.schema.json.
// Keep both in sync: tests/contracts.test.ts validates the same fixtures with Ajv (JSON Schema) and Zod.
import { z } from "zod";
import { ASSET_KINDS, ASSET_REASONS, ASSET_STATUSES, CAPABILITY_KEYS, CATEGORIES, NODE_CATEGORIES } from "./vocab";

export * from "./vocab";

export const ISSUE_STATUSES = ["draft", "review", "revision_requested", "approved", "published", "failed"] as const;
export const SIGNAL_KEYS = ["codeChecks", "humanReview", "boundedRetry", "errorHandling", "llmJudge", "multiAgent", "fallback", "rag", "memory"] as const;
export const PROVENANCE_LABELS = ["CODE-COUNTED", "AI-DRAFTED", "SOURCE-LINKED", "HUMAN-APPROVED"] as const;

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const fileName = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
export const evidenceRef = z.string().regex(/^(post|comment|workflow|metric):[A-Za-z0-9._:-]+$/);
const evidence = z.array(evidenceRef).min(1);
const sourceUrl = z.string().url().regex(/^https:\/\/yellowdig\.app\//).nullable();
const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nonNegInt = z.number().int().min(0);
const profileId = z.string().regex(/^wf_[a-f0-9]{12}$/);
const nodeId = z.string().regex(/^n[0-9]+$/);
const category = z.enum(CATEGORIES);

// ---------- Normalized post ----------
export const actorSchema = z
  .object({ id: z.string().regex(/^u_[a-f0-9]{12}$/), displayName: z.string().min(1).max(120) })
  .strict();

export const commentSchema = z
  .object({
    commentId: id,
    parentId: id,
    author: actorSchema,
    createdAt: isoDateTime,
    body: z.string().max(10000),
  })
  .strict();

export const normalizedPostSchema = z
  .object({
    schemaVersion: z.literal("1.1"),
    postId: id,
    week: z.number().int().min(1).max(16),
    topic: z.object({ id: z.string().max(128).nullable(), name: z.string().max(200) }).strict(),
    title: z.string().max(300),
    author: actorSchema,
    createdAt: isoDateTime,
    body: z.string().max(20000),
    sourceUrl,
    source: z
      .object({
        provider: z.enum(["yellowdig-api", "manual-export", "synthetic-fixture"]),
        sourcePostId: id,
        communityId: id,
        sourceUrlVerified: z.boolean(),
      })
      .strict(),
    comments: z.array(commentSchema),
    metrics: z
      .object({
        commentCount: nonNegInt,
        uniqueCommenters: nonNegInt,
        reactionCount: nonNegInt.nullable(),
        viewCount: nonNegInt.nullable(),
      })
      .strict(),
    assets: z.object({ screenshots: z.array(fileName), workflowJson: fileName.nullable() }).strict(),
    sourceRefs: z.array(evidenceRef).min(1),
  })
  .strict();

// ---------- Workflow asset (Phase 3) ----------
const assetId = z.string().regex(/^asset_[a-f0-9]{16}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const workflowAssetSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    week: z.number().int().min(1).max(16),
    postRef: id.nullable(),
    assetId,
    kind: z.enum(ASSET_KINDS),
    originalFilename: fileName,
    mimeType: z.string().max(80),
    sizeBytes: nonNegInt,
    sha256: sha256.nullable(),
    uploadedAt: isoDateTime.nullable(),
  })
  .strict();

// ---------- Workflow profile (v2, Phase 3) ----------
const nodeCategory = z.enum(NODE_CATEGORIES);
const nodeType = z.string().max(160);

export const workflowProfileSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    profileId,
    assetId,
    postRef: id.nullable(),
    workflowName: z.string().max(120),
    nodeCount: nonNegInt,
    edgeCount: nonNegInt,
    triggerCount: nonNegInt,
    disabledNodeCount: nonNegInt,
    danglingEdgeCount: nonNegInt,
    nodeTypes: z.array(z.object({ type: nodeType, count: nonNegInt }).strict()).max(500),
    nodeCategories: z.array(z.object({ category: nodeCategory, count: nonNegInt }).strict()).max(30),
    capabilities: z.object(Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof CAPABILITY_KEYS)[number], z.ZodBoolean>).strict(),
    retry: z.object({ cycles: nonNegInt, boundedCycles: nonNegInt, nodeRetries: nonNegInt, maxAttempts: z.number().int().min(1).nullable() }).strict(),
    scoreThreshold: z.object({ value: z.number() }).strict().nullable(),
    integrations: z.array(z.string().max(60)).max(60),
    aiProviders: z.array(z.string().max(60)).max(20),
    graph: z
      .object({
        nodes: z.array(z.object({ id: nodeId, label: z.string().max(80), type: nodeType, category: nodeCategory, disabled: z.boolean() }).strict()).max(500),
        edges: z
          .array(z.object({ source: nodeId, target: nodeId, sourceOutput: nonNegInt, targetInput: nonNegInt, kind: z.enum(["main", "ai", "error"]) }).strict())
          .max(2000),
      })
      .strict(),
    chips: z.array(z.object({ category, label: z.string().max(40) }).strict()).max(7),
    security: z
      .object({
        credentialReferencesDetected: nonNegInt,
        pinnedDataDetected: z.boolean(),
        executionDataDetected: z.boolean(),
        staticDataDetected: z.boolean(),
        binaryDataDetected: z.boolean(),
        webhookIdsRemoved: nonNegInt,
        webhookUrlsRedacted: nonNegInt,
        possibleSecretsDetected: nonNegInt,
        emailsDetected: nonNegInt,
        stringsTruncated: nonNegInt,
      })
      .strict(),
    source: z.object({ profileMethod: z.literal("deterministic-static-analysis"), executed: z.literal(false), profilerVersion: z.string().max(20) }).strict(),
  })
  .strict();

// ---------- Asset manifest (v2, Phase 3) ----------
export const assetManifestSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    week: z.number().int().min(1).max(16),
    assets: z
      .array(
        z
          .object({
            asset: workflowAssetSchema,
            status: z.enum(ASSET_STATUSES),
            reason: z.enum(ASSET_REASONS).nullable(),
            duplicateOf: assetId.nullable(),
            profileRef: profileId.nullable(),
            approval: z.object({ status: z.enum(["pending", "approved", "rejected"]) }).strict(),
          })
          .strict(),
      )
      .max(1000),
    summary: z
      .object({ total: nonNegInt, profiled: nonNegInt, validated: nonNegInt, rejected: nonNegInt, duplicates: nonNegInt, unmatched: nonNegInt })
      .strict(),
  })
  .strict();

// ---------- Issue ----------
const aiDrafted = z.literal("AI-DRAFTED");
const chip = z.object({ category: z.string().max(20), label: z.string().max(40) }).strict();

export const issueSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    issueId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*-week-[0-9]{2}$/),
    status: z.enum(ISSUE_STATUSES),
    course: z.object({ code: z.string().max(20), name: z.string().max(120) }).strict(),
    term: z.string().max(40),
    week: z.number().int().min(1).max(16),
    dateRange: z.object({ start: isoDate, end: isoDate, label: z.string().max(60) }).strict(),
    generatedAt: isoDateTime,
    approvedAt: isoDateTime.nullable(),
    approvedBy: z.string().max(120).nullable(),
    hero: z
      .object({
        headline: z.string().min(3).max(90),
        dek: z.string().max(300),
        intro: z.string().max(1500),
        evidence,
        provenance: aiDrafted,
      })
      .strict(),
    metrics: z
      .object({
        provenance: z.literal("CODE-COUNTED"),
        posts: nonNegInt,
        comments: nonNegInt,
        uniqueAuthors: nonNegInt,
        uniqueCommenters: nonNegInt,
        reactions: nonNegInt.nullable(),
        views: nonNegInt.nullable(),
        workflowFiles: nonNegInt,
        screenshots: nonNegInt,
        avgCommentsPerPost: z.number().min(0),
        topicCounts: z.array(z.object({ topic: z.string().max(200), count: nonNegInt }).strict()),
        signals: z
          .object({
            profiledBuilds: nonNegInt,
            codeChecks: nonNegInt,
            humanReview: nonNegInt,
            boundedRetry: nonNegInt,
            errorHandling: nonNegInt,
            llmJudge: nonNegInt,
            multiAgent: nonNegInt,
            fallback: nonNegInt,
          })
          .strict(),
        externalServices: z.array(z.object({ name: z.string().max(60), builds: nonNegInt }).strict()),
      })
      .strict(),
    themes: z
      .array(
        z
          .object({
            themeId: z.string().regex(/^[a-z0-9-]+$/),
            title: z.string().max(80),
            description: z.string().max(600),
            postIds: z.array(id).min(1),
            evidence,
            provenance: aiDrafted,
          })
          .strict(),
      )
      .max(8),
    spotlights: z
      .array(
        z
          .object({
            postId: id,
            title: z.string().max(300),
            author: z.string().max(120),
            category: z.string().max(80),
            summary: z.string().max(800),
            narrative: z.string().max(1500),
            testResult: z.string().max(800).nullable(),
            fromTheThread: z.string().max(800).nullable(),
            worthBorrowing: z.string().max(400),
            workflowProfileId: profileId.nullable(),
            chips: z.array(chip).max(7),
            screenshots: z
              .array(
                z
                  .object({
                    src: z.string().regex(/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|webp|gif)$/),
                    alt: z.string().min(3).max(200),
                  })
                  .strict(),
              )
              .max(4),
            sourceUrl,
            commentCount: nonNegInt,
            evidence,
            provenance: aiDrafted,
          })
          .strict(),
      )
      .max(6),
    failurePath: z
      .object({
        postId: id,
        title: z.string().max(300),
        author: z.string().max(120),
        whatFailed: z.string().max(600),
        whatCaughtIt: z.string().max(600),
        lesson: z.string().max(400),
        sourceUrl,
        evidence,
        provenance: aiDrafted,
      })
      .strict()
      .nullable(),
    allBuilds: z.array(
      z
        .object({
          postId: id,
          title: z.string().max(300),
          author: z.string().max(120),
          category: z.string().max(80),
          oneLine: z.string().max(400),
          commentCount: nonNegInt,
          sourceUrl,
          workflowProfileId: profileId.nullable(),
          signals: z.array(z.enum(SIGNAL_KEYS)),
          isSpotlight: z.boolean(),
          evidence,
        })
        .strict(),
    ),
    discussionHighlights: z
      .object({
        mostDiscussed: z
          .array(z.object({ postId: id, title: z.string().max(300), author: z.string().max(120), commentCount: nonNegInt }).strict())
          .max(5),
        generousCommenters: z
          .array(z.object({ name: z.string().max(120), commentsOnOthers: z.number().int().min(1) }).strict())
          .max(5),
        synthesis: z.array(z.object({ text: z.string().max(600), evidence, provenance: aiDrafted }).strict()).max(6),
      })
      .strict(),
    takeaways: z
      .array(z.object({ title: z.string().max(80), text: z.string().max(500), evidence, provenance: aiDrafted }).strict())
      .max(6),
    methodology: z
      .object({
        pipelineVersion: z.string().max(40),
        promptVersion: z.string().max(40),
        llmProvider: z.string().max(80),
        reviewerScore: z.number().min(0).max(10).nullable(),
        revisionCount: z.number().int().min(0).max(2),
        codeChecks: z.array(z.object({ name: z.string().max(120), passed: z.boolean(), detail: z.string().max(400).optional() }).strict()),
        notes: z.array(z.string().max(400)),
      })
      .strict(),
    provenance: z
      .object({
        runId: z.string().regex(/^run_[A-Za-z0-9-]+$/),
        inputHash: z.string().regex(/^[a-f0-9]{64}$/),
        idempotencyKey: z.string().max(200),
        labels: z.array(z.enum(PROVENANCE_LABELS)),
        synthetic: z.boolean(),
        githubCommitSha: z.string().regex(/^[a-f0-9]{40}$/).nullable().optional(),
        publicUrl: z.string().url().nullable().optional(),
      })
      .strict(),
    downloads: z
      .object({
        json: z.string().regex(/^\/issues\/week-[0-9]{2}\/issue\.json$/),
        html: z.string().regex(/^\/issues\/week-[0-9]{2}\/newsletter\.html$/),
      })
      .strict(),
    sourceSummary: z
      .object({
        provider: z.enum(["yellowdig-api", "manual-export", "synthetic-fixture"]),
        verified: z.boolean(),
        eventCount: nonNegInt,
        fetchedAt: isoDateTime,
        topic: z.string().max(200),
      })
      .strict(),
  })
  .strict();

export type Actor = z.infer<typeof actorSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type NormalizedPost = z.infer<typeof normalizedPostSchema>;
export type WorkflowProfile = z.infer<typeof workflowProfileSchema>;
export type AssetManifest = z.infer<typeof assetManifestSchema>;
export type WorkflowAsset = z.infer<typeof workflowAssetSchema>;
export type NodeCategory = (typeof NODE_CATEGORIES)[number];
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type Issue = z.infer<typeof issueSchema>;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssueMetrics = Issue["metrics"];
export type DiscussionHighlights = Issue["discussionHighlights"];
export type SignalKey = (typeof SIGNAL_KEYS)[number];
