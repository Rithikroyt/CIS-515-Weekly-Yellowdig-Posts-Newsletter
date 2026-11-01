// Workflow 02: classify events, join interactions to posts, compute metrics, report orphans.
// No AI. Every number here comes from code.
import type { NormalizedPost } from "../contracts";
import { computeDiscussion, computeIssueMetrics } from "../metrics";
import { inputHash } from "../ids";
import { SourceError, USED_EVENT_TYPES } from "./constants";
import type { SourceEvent } from "./fields";
import { postMatchesTopic, type SourceBundle } from "./process";
import { POST_URL_FORMAT_VERIFIED, yellowdigPostUrl } from "./urls";

export const NORMALIZED_POST_VERSION = "1.1";
export const WEEK_DATASET_VERSION = "1.0";

export type Orphan = { eventId: string; type: string; reason: "MISSING_PARENT_POST" | "MISSING_POST_ID" | "MISSING_AUTHOR" };

const byTime = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function classifyEvents(events: SourceEvent[]) {
  const groups = { post: [] as SourceEvent[], comment: [] as SourceEvent[], reaction: [] as SourceEvent[], view: [] as SourceEvent[] };
  let unknownEventTypes = 0;
  events.forEach((e) => {
    if ((USED_EVENT_TYPES as readonly string[]).includes(e.type)) groups[e.type as keyof typeof groups].push(e);
    else unknownEventTypes += 1;
  });
  return { ...groups, unknownEventTypes };
}

// ---------- Stages ----------
// Each stage takes and returns plain JSON, so workflow 02 can run one stage per Code node.
// normalizeBundle composes the same stages in the same order; tests exercise that composition.

/** Stage 1: the bundle's own claims must agree. Throws CONTRACT_VIOLATION otherwise. */
export function checkBundleConsistency(bundle: SourceBundle): SourceBundle {
  if (bundle.liveSourceVerified !== (bundle.sourceModeUsed === "yellowdig")) {
    throw new SourceError("CONTRACT_VIOLATION", "liveSourceVerified does not match sourceModeUsed");
  }
  if ((bundle.sourceModeUsed === "fixture") !== (bundle.provider === "synthetic-fixture")) {
    throw new SourceError("CONTRACT_VIOLATION", "provider does not match sourceModeUsed");
  }
  return bundle;
}

/** Stage 2: split events into posts, comments, reactions and views. Unknown types are counted, not used. */
export function stageClassify(bundle: SourceBundle) {
  return { bundle, ...classifyEvents(bundle.events) };
}
export type ClassifiedEvents = ReturnType<typeof stageClassify>;

/** Stage 3: build posts and join comments, reactions and views. Never invents a parent. */
export function stageJoin(c: ClassifiedEvents) {
  const { bundle } = c;
  const orphans: Orphan[] = [];
  let duplicatePostEvents = 0;
  let missingParentComments = 0;
  let interactionsOnComments = 0;

  // Posts: the earliest event per post id wins (later ones are treated as duplicates, e.g. edits).
  const posts = new Map<string, NormalizedPost>();
  [...c.post].sort((a, b) => byTime({ createdAt: a.createdAt, id: a.eventId }, { createdAt: b.createdAt, id: b.eventId })).forEach((e) => {
    const postId = e.postId ?? e.eventId;
    if (posts.has(postId)) { duplicatePostEvents += 1; return; }
    if (!e.actor) { orphans.push({ eventId: e.eventId, type: e.type, reason: "MISSING_AUTHOR" }); return; }
    const topic = e.topics.find((t) => postMatchesTopic({ ...e, topics: [t] }, bundle.topic, bundle.topicId)) ?? e.topics[0] ?? { id: null, name: bundle.topic };
    // Links only for real Yellowdig posts; synthetic ids would make fabricated links.
    const url = bundle.provider === "yellowdig-api" ? yellowdigPostUrl(bundle.network, bundle.communityId, postId) : null;
    posts.set(postId, {
      schemaVersion: NORMALIZED_POST_VERSION,
      postId,
      week: bundle.week,
      topic: { id: topic.id, name: topic.name },
      title: e.title?.trim() || "(untitled)",
      author: e.actor,
      createdAt: e.createdAt,
      body: e.body ?? "",
      sourceUrl: url,
      source: { provider: bundle.provider, sourcePostId: postId, communityId: bundle.communityId, sourceUrlVerified: POST_URL_FORMAT_VERIFIED && url !== null },
      comments: [],
      metrics: { commentCount: 0, uniqueCommenters: 0, reactionCount: bundle.capabilities.reactionEvents ? 0 : null, viewCount: bundle.capabilities.viewEvents ? 0 : null },
      assets: { screenshots: [], workflowJson: null },
      sourceRefs: ["post:" + postId],
    } as NormalizedPost);
  });

  const parentPost = (e: SourceEvent): NormalizedPost | null => {
    if (!e.postId) { orphans.push({ eventId: e.eventId, type: e.type, reason: "MISSING_POST_ID" }); return null; }
    const p = posts.get(e.postId);
    if (!p) { orphans.push({ eventId: e.eventId, type: e.type, reason: "MISSING_PARENT_POST" }); return null; }
    return p;
  };

  // Comments
  const commentIds = new Set(c.comment.map((e) => e.commentId ?? e.eventId));
  c.comment.forEach((e) => {
    const p = parentPost(e);
    if (!p) return;
    if (!e.actor) { orphans.push({ eventId: e.eventId, type: e.type, reason: "MISSING_AUTHOR" }); return; }
    let parentId = p.postId;
    if (e.parentCommentId && e.parentCommentId !== p.postId) {
      if (commentIds.has(e.parentCommentId)) parentId = e.parentCommentId;
      else missingParentComments += 1; // reply to a comment we never saw: attach to the post, never invent a parent
    }
    p.comments.push({ commentId: e.commentId ?? e.eventId, parentId, author: e.actor, createdAt: e.createdAt, body: e.body ?? "" });
  });

  // Reactions and views count toward a post only when they target the post itself.
  [...c.reaction, ...c.view].forEach((e) => {
    const p = parentPost(e);
    if (!p) return;
    if (e.commentId) { interactionsOnComments += 1; return; }
    if (e.type === "reaction") p.metrics.reactionCount = (p.metrics.reactionCount ?? 0) + 1;
    else p.metrics.viewCount = (p.metrics.viewCount ?? 0) + 1;
  });

  const list = [...posts.values()].sort((a, b) => byTime({ createdAt: a.createdAt, id: a.postId }, { createdAt: b.createdAt, id: b.postId }));
  list.forEach((p) => {
    p.comments.sort((a, b) => byTime({ createdAt: a.createdAt, id: a.commentId }, { createdAt: b.createdAt, id: b.commentId }));
    p.metrics.commentCount = p.comments.length;
    p.metrics.uniqueCommenters = new Set(p.comments.map((x) => x.author.id)).size;
    p.sourceRefs = ["post:" + p.postId, ...p.comments.map((x) => "comment:" + x.commentId)];
  });

  return {
    bundle,
    posts: list,
    orphans: orphans.sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)),
    counters: { unknownEventTypes: c.unknownEventTypes, duplicatePostEvents, missingParentComments, interactionsOnComments },
  };
}
export type Joined = ReturnType<typeof stageJoin>;

/** Stage 4: code-counted metrics, input hash and diagnostics → the week dataset. */
export function stageDataset(j: Joined) {
  const { bundle, posts, orphans, counters } = j;
  const missingParents = orphans.filter((o) => o.reason === "MISSING_PARENT_POST" || o.reason === "MISSING_POST_ID").length;
  return {
    schemaVersion: WEEK_DATASET_VERSION,
    week: bundle.week,
    topic: bundle.topic,
    window: bundle.window,
    source: {
      provider: bundle.provider,
      sourceModeRequested: bundle.sourceModeRequested,
      sourceModeUsed: bundle.sourceModeUsed,
      liveSourceVerified: bundle.liveSourceVerified,
      fallbackReason: bundle.fallbackReason,
      fetchedAt: bundle.fetchedAt,
      network: bundle.network,
      communityId: bundle.communityId,
    },
    inputHash: inputHash({ events: bundle.events, window: bundle.window, topic: bundle.topic, topicId: bundle.topicId }),
    posts,
    metrics: computeIssueMetrics(posts, []),
    discussion: computeDiscussion(posts),
    orphans,
    diagnostics: {
      ...bundle.diagnostics,
      unknownEventTypes: bundle.diagnostics.unknownEventTypes + counters.unknownEventTypes,
      postsNormalized: posts.length,
      commentsJoined: posts.reduce((s, p) => s + p.comments.length, 0),
      reactionsJoined: posts.reduce((s, p) => s + (p.metrics.reactionCount ?? 0), 0),
      viewsJoined: posts.reduce((s, p) => s + (p.metrics.viewCount ?? 0), 0),
      missingParents,
      missingParentComments: counters.missingParentComments,
      eventsMissingAuthor: orphans.filter((o) => o.reason === "MISSING_AUTHOR").length,
      duplicatePostEvents: counters.duplicatePostEvents,
      interactionsOnComments: counters.interactionsOnComments,
    },
  };
}

/** Bundle (from workflow 01) → normalized week dataset. Throws CONTRACT_VIOLATION on inconsistent metadata. */
export function normalizeBundle(bundle: SourceBundle) {
  return stageDataset(stageJoin(stageClassify(checkBundleConsistency(bundle))));
}

export type WeekDataset = ReturnType<typeof normalizeBundle>;
