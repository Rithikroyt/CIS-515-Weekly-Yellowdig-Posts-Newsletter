import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadValidators, readJson, REPO_ROOT } from "../../scripts/schemas";
import { assetManifestSchema, issueSchema, normalizedPostSchema, workflowProfileSchema, type Issue, type NormalizedPost, type WorkflowProfile } from "./contracts";
import { computeDiscussion, computeIssueMetrics } from "./metrics";

const FIX = join(REPO_ROOT, "fixtures", "synthetic", "week-02");
const posts = readJson(join(FIX, "normalized-posts.json")) as NormalizedPost[];
const profiles = readJson(join(FIX, "workflow-profiles.json")) as WorkflowProfile[];
const manifest = readJson(join(FIX, "asset-manifest.json"));
const issue = readJson(join(FIX, "issue.json")) as Issue;
const v = loadValidators();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("JSON Schema and Zod agree on the synthetic Week 2 fixture", () => {
  it("normalized posts", () => {
    posts.forEach((p) => {
      expect(v["normalized-post"](p), JSON.stringify(v["normalized-post"].errors)).toBe(true);
      expect(normalizedPostSchema.safeParse(p).success).toBe(true);
    });
  });
  it("workflow profiles", () => {
    profiles.forEach((p) => {
      expect(v["workflow-profile"](p), JSON.stringify(v["workflow-profile"].errors)).toBe(true);
      expect(workflowProfileSchema.safeParse(p).success).toBe(true);
    });
  });
  it("asset manifest", () => {
    expect(v["asset-manifest"](manifest), JSON.stringify(v["asset-manifest"].errors)).toBe(true);
    expect(assetManifestSchema.safeParse(manifest).success).toBe(true);
  });
  it("issue", () => {
    expect(v.issue(issue), JSON.stringify(v.issue.errors)).toBe(true);
    expect(issueSchema.safeParse(issue).success).toBe(true);
  });
});

describe("both validators reject bad issues", () => {
  const cases: Array<[string, (i: Record<string, unknown>) => void]> = [
    ["unknown status", (i) => { i.status = "live"; }],
    ["missing hero", (i) => { delete i.hero; }],
    ["extra top-level field", (i) => { i.html = "<p>x</p>"; }],
    ["bad evidence prefix", (i) => { (i.hero as { evidence: string[] }).evidence = ["http://evil"]; }],
    ["revision count above two", (i) => { (i.methodology as { revisionCount: number }).revisionCount = 3; }],
    ["negative post count", (i) => { (i.metrics as { posts: number }).posts = -1; }],
    ["wrong metrics provenance", (i) => { (i.metrics as { provenance: string }).provenance = "AI-DRAFTED"; }],
    ["screenshot outside assets/", (i) => { (i.spotlights as Array<{ screenshots: Array<{ src: string }> }>)[0].screenshots[0].src = "javascript:alert(1)"; }],
  ];
  it.each(cases)("%s", (_name, mutate) => {
    const bad = clone(issue) as unknown as Record<string, unknown>;
    mutate(bad);
    expect(v.issue(bad)).toBe(false);
    expect(issueSchema.safeParse(bad).success).toBe(false);
  });
});

describe("normalized posts reject personal data", () => {
  it("rejects an email-like actor id and extra author fields", () => {
    const bad = clone(posts[0]) as unknown as { author: Record<string, unknown> };
    bad.author.email = "student@example.edu";
    expect(v["normalized-post"](bad)).toBe(false);
    expect(normalizedPostSchema.safeParse(bad).success).toBe(false);
    const bad2 = clone(posts[0]) as unknown as { author: { id: string } };
    bad2.author.id = "1234567890";
    expect(v["normalized-post"](bad2)).toBe(false);
    expect(normalizedPostSchema.safeParse(bad2).success).toBe(false);
  });
});

describe("metrics", () => {
  it("issue metrics equal a fresh recomputation from the posts", () => {
    expect(issue.metrics).toEqual(computeIssueMetrics(posts, profiles));
  });
  it("are deterministic regardless of input order", () => {
    const a = computeIssueMetrics(posts, profiles);
    const b = computeIssueMetrics([...posts].reverse(), [...profiles].reverse());
    expect(b).toEqual(a);
    expect(computeDiscussion([...posts].reverse())).toEqual(computeDiscussion(posts));
  });
  it("counts the fixture correctly", () => {
    const m = computeIssueMetrics(posts, profiles);
    expect(m.posts).toBe(8);
    expect(m.comments).toBe(13);
    expect(m.workflowFiles).toBe(7);
    expect(m.signals.codeChecks).toBe(3);
    expect(m.signals.humanReview).toBe(2);
    expect(m.avgCommentsPerPost).toBe(1.63);
  });
  it("handles a week with no posts", () => {
    const m = computeIssueMetrics([], []);
    expect(m.posts).toBe(0);
    expect(m.avgCommentsPerPost).toBe(0);
    expect(m.reactions).toBeNull();
    expect(m.views).toBeNull();
    expect(m.topicCounts).toEqual([]);
    expect(computeDiscussion([])).toEqual({ mostDiscussed: [], generousCommenters: [] });
  });
  it("keeps reactions null only when no post provides them", () => {
    const none = posts.map((p) => ({ ...p, metrics: { ...p.metrics, reactionCount: null } }));
    expect(computeIssueMetrics(none, profiles).reactions).toBeNull();
    const one = none.map((p, i) => (i === 0 ? { ...p, metrics: { ...p.metrics, reactionCount: 0 } } : p));
    expect(computeIssueMetrics(one, profiles).reactions).toBe(0);
  });
  it("excludes replies on your own post from generous commenters", () => {
    const d = computeDiscussion(posts);
    const avery = d.generousCommenters.find((g) => g.name === "Avery Quinn");
    // Avery has one comment on Blake's post and one reply on their own post.
    expect(avery?.commentsOnOthers).toBe(1);
  });
  it("ignores profiles for posts outside the week", () => {
    const stray = { ...profiles[0], profileId: "wf_000000000000", postId: "other-week-post" };
    expect(computeIssueMetrics(posts, [...profiles, stray])).toEqual(computeIssueMetrics(posts, profiles));
  });
});

describe("evidence references in the issue resolve", () => {
  it("every post:, comment: and workflow: ref points at a real source", () => {
    const known = new Set<string>([
      ...posts.map((p) => "post:" + p.postId),
      ...posts.flatMap((p) => p.comments.map((c) => "comment:" + c.commentId)),
      ...profiles.map((p) => "workflow:" + p.profileId),
    ]);
    const refs = JSON.stringify(issue).match(/"(post|comment|workflow):[A-Za-z0-9._:-]+"/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    refs.map((r) => r.slice(1, -1)).forEach((r) => expect(known.has(r), r).toBe(true));
  });
});
