// Deterministic, code-counted metrics. The single place where issue numbers are computed.
// Pure functions: the same input always gives the same output (stable sort orders, no clocks, no randomness).
import type { DiscussionHighlights, IssueMetrics, NormalizedPost, SignalKey, WorkflowProfile } from "./contracts";

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Sum a nullable per-post count. Returns null only when no post has the value (the source did not provide it). */
function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => typeof v === "number");
  return present.length === 0 ? null : present.reduce((s, v) => s + v, 0);
}

/** Profiles explicitly attached to one of these posts (postRef), keyed by postId. If a post has several, the first by assetId wins. */
export function profilesByPost(posts: NormalizedPost[], profiles: WorkflowProfile[]): Map<string, WorkflowProfile> {
  const ids = new Set(posts.map((p) => p.postId));
  const map = new Map<string, WorkflowProfile>();
  [...profiles]
    .sort((a, b) => byText(a.assetId, b.assetId))
    .forEach((prof) => {
      if (prof.postRef && ids.has(prof.postRef) && !map.has(prof.postRef)) map.set(prof.postRef, prof);
    });
  return map;
}

/** Issue-level signal ← deterministic profile capability (see docs/workflow-asset-profiling.md). */
const SIGNAL_FROM_CAPABILITY: Array<[SignalKey, keyof WorkflowProfile["capabilities"]]> = [
  ["codeChecks", "hasCodeValidation"],
  ["humanReview", "usesHumanApproval"],
  ["boundedRetry", "hasBoundedRetry"],
  ["errorHandling", "hasExplicitFailureHandling"],
  ["llmJudge", "usesLLMJudge"],
  ["multiAgent", "usesMultipleAgents"],
  ["fallback", "hasFallback"],
  ["rag", "usesRAG"],
  ["memory", "usesMemory"],
];

/** The reliability signals a profile shows, in a fixed order. */
export function profileSignals(profile: WorkflowProfile | undefined | null): SignalKey[] {
  if (!profile) return [];
  return SIGNAL_FROM_CAPABILITY.filter(([, cap]) => profile.capabilities[cap]).map(([signal]) => signal);
}

export function computeIssueMetrics(posts: NormalizedPost[], profiles: WorkflowProfile[]): IssueMetrics {
  const byPost = profilesByPost(posts, profiles);
  const comments = posts.reduce((s, p) => s + p.comments.length, 0);
  const authors = new Set(posts.map((p) => p.author.id));
  const commenters = new Set(posts.flatMap((p) => p.comments.map((c) => c.author.id)));

  const topicMap = new Map<string, number>();
  posts.forEach((p) => topicMap.set(p.topic.name, (topicMap.get(p.topic.name) ?? 0) + 1));
  const topicCounts = [...topicMap.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || byText(a.topic, b.topic));

  const profiled = [...byPost.values()];
  const countSignal = (key: SignalKey) => profiled.filter((prof) => profileSignals(prof).includes(key)).length;

  const serviceMap = new Map<string, number>();
  profiled.forEach((prof) => new Set(prof.integrations).forEach((svc) => serviceMap.set(svc, (serviceMap.get(svc) ?? 0) + 1)));
  const externalServices = [...serviceMap.entries()]
    .map(([name, builds]) => ({ name, builds }))
    .sort((a, b) => b.builds - a.builds || byText(a.name, b.name));

  return {
    provenance: "CODE-COUNTED",
    posts: posts.length,
    comments,
    uniqueAuthors: authors.size,
    uniqueCommenters: commenters.size,
    reactions: sumNullable(posts.map((p) => p.metrics.reactionCount)),
    views: sumNullable(posts.map((p) => p.metrics.viewCount)),
    workflowFiles: byPost.size,
    screenshots: posts.reduce((s, p) => s + p.assets.screenshots.length, 0),
    avgCommentsPerPost: posts.length === 0 ? 0 : Math.round((comments / posts.length) * 100) / 100,
    topicCounts,
    signals: {
      profiledBuilds: profiled.length,
      codeChecks: countSignal("codeChecks"),
      humanReview: countSignal("humanReview"),
      boundedRetry: countSignal("boundedRetry"),
      errorHandling: countSignal("errorHandling"),
      llmJudge: countSignal("llmJudge"),
      multiAgent: countSignal("multiAgent"),
      fallback: countSignal("fallback"),
    },
    externalServices,
  };
}

/** Most discussed posts and most generous commenters. AI synthesis is added later, separately. */
export function computeDiscussion(posts: NormalizedPost[], limit = 5): Omit<DiscussionHighlights, "synthesis"> {
  const mostDiscussed = posts
    .filter((p) => p.comments.length > 0)
    .sort((a, b) => b.comments.length - a.comments.length || byText(a.createdAt, b.createdAt) || byText(a.postId, b.postId))
    .slice(0, limit)
    .map((p) => ({ postId: p.postId, title: p.title, author: p.author.displayName, commentCount: p.comments.length }));

  // Generous = comments on someone else's post. Replies on your own post do not count.
  const tally = new Map<string, { name: string; n: number }>();
  posts.forEach((p) =>
    p.comments.forEach((c) => {
      if (c.author.id === p.author.id) return;
      const cur = tally.get(c.author.id) ?? { name: c.author.displayName, n: 0 };
      cur.n += 1;
      tally.set(c.author.id, cur);
    }),
  );
  const generousCommenters = [...tally.values()]
    .sort((a, b) => b.n - a.n || byText(a.name, b.name))
    .slice(0, limit)
    .map((t) => ({ name: t.name, commentsOnOthers: t.n }));

  return { mostDiscussed, generousCommenters };
}
