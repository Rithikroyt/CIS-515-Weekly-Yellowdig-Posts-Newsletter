// Builds the synthetic Week 2 fixture: normalized posts, workflow profiles, an asset manifest, the week dataset and a full issue.
// Every name and post is invented. Posts come from the same pipeline as live data:
//   synthetic API pages → pagination checks → privacy minimization → dedupe → filter → normalize.
// Issue numbers come from computeIssueMetrics, never typed by hand.
// Usage: npm run fixtures:synthetic
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AssetManifest, Issue, NormalizedPost, WorkflowProfile } from "../src/lib/contracts";
import { issueSchema, normalizedPostSchema, workflowProfileSchema, assetManifestSchema, CATEGORIES } from "../src/lib/contracts";
import { computeDiscussion, computeIssueMetrics, profileSignals, profilesByPost } from "../src/lib/metrics";
import { idempotencyKey, inputHash, issueIdFor, sha256Hex } from "../src/lib/ids";
import {
  SYNTHETIC_SALT, SYNTHETIC_TOPIC, SYNTHETIC_WEEK2_RUN, applyAssetManifest, assessPages, buildSourceBundle,
  normalizeBundle, syntheticPostId, syntheticWeek2Pages, validateRunConfig,
} from "../src/lib/source";
import { assertSourceBundle, assertWeekDataset } from "../src/lib/contracts/registry";

const OUT = join(__dirname, "..", "..", "fixtures", "synthetic", "week-02");
const FETCHED_AT = "2026-10-29T15:00:00Z";
const TOPIC = SYNTHETIC_TOPIC;
const postId = syntheticPostId;

// ---- Source pipeline (fixture provider) ----
const config = validateRunConfig(SYNTHETIC_WEEK2_RUN);
const fetched = assessPages(syntheticWeek2Pages(config.pageSize), config.maxPages);
const bundle = buildSourceBundle(
  config,
  { sourceModeRequested: "fixture", sourceModeUsed: "fixture", fallbackReason: "FIXTURE_FORCED", fetchedAt: FETCHED_AT, capability: null, retries: 0 },
  fetched.events, fetched.pagesFetched, SYNTHETIC_SALT,
);
assertSourceBundle(bundle);
const dataset = normalizeBundle(bundle);
assertWeekDataset(dataset);

// ---- Assets: the API does not provide attachments, so names come from the (admin) asset manifest ----
const ASSETS: Record<number, { screenshots: string[]; workflowJson: string | null }> = {
  1: { screenshots: ["recipe-overview.png", "recipe-judge-run.png"], workflowJson: "recipe-scaler.json" },
  2: { screenshots: ["planner-approval.png"], workflowJson: "study-planner.json" },
  3: { screenshots: [], workflowJson: "news-brief.json" },
  4: { screenshots: ["expense-checks.png"], workflowJson: "expense-logger.json" },
  5: { screenshots: ["support-desk.png", "support-flag.png"], workflowJson: "support-desk.json" },
  7: { screenshots: [], workflowJson: "notes-qa.json" },
  8: { screenshots: ["meeting-summary.png"], workflowJson: "meeting-summarizer.json" },
};
const manifest: AssetManifest = {
  schemaVersion: "1.0", week: 2,
  assets: Object.entries(ASSETS).map(([n, a]) => ({ postId: postId(Number(n)), screenshots: a.screenshots, workflowJson: a.workflowJson, approval: { status: "pending" as const } })),
};
const posts: NormalizedPost[] = applyAssetManifest(dataset.posts, manifest);

// ---- Workflow profiles (hand-specified here; Phase 3 generates them from real workflow JSON) ----
type Cat = (typeof CATEGORIES)[number];
type ProfileSpec = {
  post: number; file: string; name: string;
  nodes: Array<[string, string, Cat]>; edges: Array<[number, number, "main" | "ai" | "error"]>;
  signals: WorkflowProfile["signals"]; ai: string[]; services: string[]; triggers: string[];
};
const S = (o: Partial<WorkflowProfile["signals"]>): WorkflowProfile["signals"] => ({
  codeChecks: false, humanReview: false, boundedRetry: { present: false, maxAttempts: null }, fallback: false,
  errorHandling: false, llmJudge: false, scoreThreshold: null, multiAgent: false, rag: false, memory: false, ...o,
});
const profileSpecs: ProfileSpec[] = [
  { post: 1, file: "recipe-scaler.json", name: "Recipe Scaler",
    nodes: [["Recipe form", "n8n-nodes-base.formTrigger", "trigger"], ["Draft scaled recipe", "@n8n/n8n-nodes-langchain.agent", "ai"], ["Check units", "n8n-nodes-base.code", "validator"], ["Judge draft", "@n8n/n8n-nodes-langchain.agent", "judge"], ["Passed?", "n8n-nodes-base.if", "gate"], ["Revise draft", "@n8n/n8n-nodes-langchain.agent", "ai"], ["Email recipe", "n8n-nodes-base.gmail", "action"]],
    edges: [[0, 1, "main"], [1, 2, "main"], [2, 3, "main"], [3, 4, "main"], [4, 6, "main"], [4, 5, "main"], [5, 3, "main"]],
    signals: S({ codeChecks: true, boundedRetry: { present: true, maxAttempts: 2 }, llmJudge: true, scoreThreshold: { value: 8, outOf: 10 }, multiAgent: true }),
    ai: ["OpenAI"], services: ["Gmail"], triggers: ["form"] },
  { post: 2, file: "study-planner.json", name: "Study Planner",
    nodes: [["Every Monday", "n8n-nodes-base.scheduleTrigger", "trigger"], ["Read calendar", "n8n-nodes-base.googleCalendar", "tool"], ["Plan the week", "@n8n/n8n-nodes-langchain.chainLlm", "ai"], ["Ask for approval", "n8n-nodes-base.gmail", "approval"], ["Create events", "n8n-nodes-base.googleCalendar", "action"], ["Notify failure", "n8n-nodes-base.gmail", "errorPath"]],
    edges: [[0, 1, "main"], [1, 2, "main"], [2, 3, "main"], [3, 4, "main"], [4, 5, "error"]],
    signals: S({ humanReview: true, errorHandling: true }), ai: ["Anthropic"], services: ["Gmail", "Google Calendar"], triggers: ["schedule"] },
  { post: 3, file: "news-brief.json", name: "Morning News Brief",
    nodes: [["Daily 7am", "n8n-nodes-base.scheduleTrigger", "trigger"], ["Read feeds", "n8n-nodes-base.rssFeedRead", "tool"], ["Summarize", "@n8n/n8n-nodes-langchain.agent", "ai"], ["Fallback list", "n8n-nodes-base.set", "other"], ["Send brief", "n8n-nodes-base.telegram", "action"]],
    edges: [[0, 1, "main"], [1, 2, "main"], [2, 4, "main"], [2, 3, "error"], [3, 4, "main"]],
    signals: S({ fallback: true, errorHandling: true, memory: true }), ai: ["Google Gemini"], services: ["RSS", "Telegram"], triggers: ["schedule"] },
  { post: 4, file: "expense-logger.json", name: "Expense Logger",
    nodes: [["New receipt email", "n8n-nodes-base.gmailTrigger", "trigger"], ["Extract fields", "@n8n/n8n-nodes-langchain.informationExtractor", "ai"], ["Validate amount and date", "n8n-nodes-base.code", "validator"], ["Valid?", "n8n-nodes-base.if", "gate"], ["Append to sheet", "n8n-nodes-base.googleSheets", "storage"], ["Flag for review", "n8n-nodes-base.googleSheets", "storage"]],
    edges: [[0, 1, "main"], [1, 2, "main"], [2, 3, "main"], [3, 4, "main"], [3, 1, "main"], [3, 5, "main"]],
    signals: S({ codeChecks: true, boundedRetry: { present: true, maxAttempts: 3 }, errorHandling: true }), ai: ["OpenAI"], services: ["Gmail", "Google Sheets"], triggers: ["gmail"] },
  { post: 5, file: "support-desk.json", name: "Support Reply Desk",
    nodes: [["Ticket form", "n8n-nodes-base.formTrigger", "trigger"], ["Writer", "@n8n/n8n-nodes-langchain.agent", "ai"], ["Risk flags", "n8n-nodes-base.code", "validator"], ["Judge", "@n8n/n8n-nodes-langchain.agent", "judge"], ["Pass rule", "n8n-nodes-base.if", "gate"], ["Telegram approval", "n8n-nodes-base.telegram", "approval"], ["Send reply", "n8n-nodes-base.gmail", "action"]],
    edges: [[0, 1, "main"], [1, 2, "main"], [2, 3, "main"], [3, 4, "main"], [4, 5, "main"], [4, 1, "main"], [5, 6, "main"]],
    signals: S({ codeChecks: true, humanReview: true, boundedRetry: { present: true, maxAttempts: 2 }, llmJudge: true, scoreThreshold: { value: 8, outOf: 10 }, multiAgent: true }),
    ai: ["Anthropic"], services: ["Gmail", "Telegram"], triggers: ["form"] },
  { post: 7, file: "notes-qa.json", name: "Lecture Notes Q&A",
    nodes: [["Chat", "@n8n/n8n-nodes-langchain.chatTrigger", "trigger"], ["Answer", "@n8n/n8n-nodes-langchain.agent", "ai"], ["Notes store", "@n8n/n8n-nodes-langchain.vectorStoreInMemory", "tool"]],
    edges: [[0, 1, "main"], [2, 1, "ai"]],
    signals: S({ rag: true }), ai: ["OpenAI"], services: [], triggers: ["chat"] },
  { post: 8, file: "meeting-summarizer.json", name: "Meeting Notes Summarizer",
    nodes: [["Notes form", "n8n-nodes-base.formTrigger", "trigger"], ["Summarize", "@n8n/n8n-nodes-langchain.chainLlm", "ai"], ["Email team", "n8n-nodes-base.gmail", "action"]],
    edges: [[0, 1, "main"], [1, 2, "main"]],
    signals: S({}), ai: ["OpenAI"], services: ["Gmail"], triggers: ["form"] },
];

const profiles: WorkflowProfile[] = profileSpecs.map((p) => {
  const nodes = p.nodes.map(([name, type, category], i) => ({ id: "n" + i, name, type, category, position: [i * 220, 0] as [number, number] }));
  const edges = p.edges.map(([a, b, kind]) => ({ source: "n" + a, target: "n" + b, kind }));
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, nodes.filter((n) => n.category === c).length])) as WorkflowProfile["categoryCounts"];
  const mainPath: string[] = [];
  const seen = new Set<number>();
  const queue = [0];
  while (queue.length) {
    const v = queue.shift()!;
    if (seen.has(v)) continue;
    seen.add(v); mainPath.push("n" + v);
    p.edges.filter(([a, , k]) => a === v && k === "main").forEach(([, b]) => queue.push(b));
  }
  return {
    schemaVersion: "1.0", profileId: "wf_" + sha256Hex(p.file).slice(0, 12), postId: postId(p.post), fileName: p.file, workflowName: p.name,
    nodeCount: nodes.length, edgeCount: edges.length, sanitization: { credentialRefsRemoved: 0, pinDataRemoved: false, flags: [] },
    nodes, edges, categoryCounts, signals: p.signals, aiProviders: p.ai, externalServices: p.services, triggerTypes: p.triggers,
    mainPath, chips: mainPath.slice(0, 7).map((nid) => { const n = nodes.find((x) => x.id === nid)!; return { category: n.category, label: n.name }; }),
  };
});

// ---- Issue: code-counted parts from metrics; editorial text written here as a stand-in for the AI stages ----
const metrics = computeIssueMetrics(posts, profiles);
const discussion = computeDiscussion(posts);
const byPost = profilesByPost(posts, profiles);
const pick = (n: number) => posts[n - 1];
const hash = inputHash({ posts, profiles });
const spotlightIds = [postId(5), postId(1), postId(4)];
const categories: Record<string, string> = {
  [postId(1)]: "Food · Quality control", [postId(2)]: "Planning · Human approval", [postId(3)]: "News · Fallbacks",
  [postId(4)]: "Money · Code checks", [postId(5)]: "Support · Risk gates", [postId(6)]: "Travel",
  [postId(7)]: "Study · Retrieval", [postId(8)]: "Work · Summaries",
};
const oneLines: Record<string, string> = {
  [postId(1)]: "Scales recipes; a judge scores each draft out of 10 and 8 passes, with at most two revisions.",
  [postId(2)]: "Drafts a weekly study plan and waits for email approval before writing to the calendar.",
  [postId(3)]: "Sends a daily brief and falls back to a plain headline list when the model times out.",
  [postId(4)]: "Extracts receipt fields and checks amount and date in code, retrying up to three times.",
  [postId(5)]: "Drafts support replies; code flags risky tickets and a person approves every reply.",
  [postId(6)]: "Finds round trips under $500; the workflow file was not attached this week.",
  [postId(7)]: "Answers questions about lecture notes from a small vector store.",
  [postId(8)]: "Turns meeting notes into action items with owners and dates.",
};
const spotlight = (n: number, s: { summary: string; narrative: string; testResult: string | null; fromTheThread: string | null; worthBorrowing: string; screenshots: Array<[string, string]> }) => {
  const p = pick(n);
  const prof = byPost.get(p.postId) ?? null;
  return {
    postId: p.postId, title: p.title, author: p.author.displayName, category: categories[p.postId],
    summary: s.summary, narrative: s.narrative, testResult: s.testResult, fromTheThread: s.fromTheThread, worthBorrowing: s.worthBorrowing,
    workflowProfileId: prof ? prof.profileId : null, chips: prof ? prof.chips : [],
    screenshots: s.screenshots.map(([file, alt]) => ({ src: "assets/" + file, alt })),
    sourceUrl: p.sourceUrl, commentCount: p.comments.length,
    evidence: ["post:" + p.postId, ...(prof ? ["workflow:" + prof.profileId] : []), ...p.comments.slice(0, 2).map((c) => "comment:" + c.commentId)],
    provenance: "AI-DRAFTED" as const,
  };
};

const issue: Issue = {
  schemaVersion: "1.0",
  issueId: issueIdFor("CIS 515", "2026 Fall B", 2),
  status: "approved",
  course: { code: "CIS 515", name: "AI and Data Analytics Strategy" },
  term: "2026 Fall B",
  week: 2,
  dateRange: { start: "2026-10-23", end: "2026-10-28", label: "Oct 23–28, 2026" },
  generatedAt: "2026-10-29T15:00:00Z",
  approvedAt: "2026-10-29T18:30:00Z",
  approvedBy: "Synthetic Reviewer",
  hero: {
    headline: "Code Gates Catch What Judges Miss",
    dek: "Week 2 builds added checks between the first draft and the send. The strongest ones let code, not the model, decide what is risky.",
    intro: "Most builds this week put a check between the model's first answer and the action that follows. Drew Patel's support desk showed why: a judge scored a risky reply 9 out of 10, and a code flag stopped it. Blake Torres moved date checks out of the prompt and into code, and Avery Quinn tested the failure path on purpose.",
    evidence: ["post:" + postId(5), "post:" + postId(4), "post:" + postId(1), "metric:signals.codeChecks"],
    provenance: "AI-DRAFTED",
  },
  metrics,
  themes: [
    { themeId: "code-gates", title: "Code decides what is risky", description: "Builds that check facts such as amounts, dates and units in code instead of asking a model.", postIds: [postId(4), postId(5), postId(1)], evidence: ["post:" + postId(4), "post:" + postId(5), "post:" + postId(1)], provenance: "AI-DRAFTED" },
    { themeId: "people-approve", title: "A person makes the final call", description: "Builds that pause for approval before writing to a calendar or sending a reply.", postIds: [postId(2), postId(5)], evidence: ["post:" + postId(2), "post:" + postId(5)], provenance: "AI-DRAFTED" },
    { themeId: "plan-for-failure", title: "Plan for the failure path", description: "Bounded retries, fallbacks and error branches that keep a failed step from becoming a silent one.", postIds: [postId(3), postId(4), postId(1)], evidence: ["post:" + postId(3), "post:" + postId(4), "post:" + postId(1)], provenance: "AI-DRAFTED" },
  ],
  spotlights: [
    spotlight(5, { summary: "A writer drafts support replies from the policy, a judge scores them, code flags risky tickets, and a person approves every reply in Telegram.", narrative: "Drew's desk layers three checks. Code sets the risk flag for refunds over $100, so risk never depends on the model. The judge scores tone and accuracy, and a person approves the final reply.", testResult: "In one test the judge gave 9 out of 10 to a reply that promised a refund over the limit; the code flag stopped it.", fromTheThread: "Blake asked whether the judge sees the risk flag. Drew said not yet; he wants to see whether it notices on its own first.", worthBorrowing: "Let code flag high-risk items, and keep a person on the final call even when the score passes.", screenshots: [["support-desk.png", "Support Reply Desk workflow on the n8n canvas"], ["support-flag.png", "Risk flag output for a refund ticket"]] }),
    spotlight(1, { summary: "Scales a recipe to a new serving size; a judge scores each draft out of 10 and 8 passes.", narrative: "Below 8, one revision runs with the judge's notes, at most twice, then the draft goes to Avery. A code node now rejects any ingredient without a unit.", testResult: "Avery raised the threshold to 10 for one run to watch the revision path work.", fromTheThread: "Blake suggested a hard check on units; Avery added one in code.", worthBorrowing: "Test the failure path with real outputs by raising the threshold for one run.", screenshots: [["recipe-overview.png", "Recipe Scaler workflow overview"]] }),
    spotlight(4, { summary: "Extracts amount, date and category from emailed receipts and checks them in code before logging.", narrative: "Failed checks retry up to three times. After that, the receipt lands in a review sheet with the reason.", testResult: "The checks caught a $75 grocery receipt the model had dated last year.", fromTheThread: "Drew asked what happens after the third retry; Blake explained the review sheet.", worthBorrowing: "Check dates and amounts in code, not in the prompt.", screenshots: [["expense-checks.png", "Expense Logger validation step"]] }),
  ],
  failurePath: {
    postId: postId(5), title: pick(5).title, author: pick(5).author.displayName,
    whatFailed: "The judge scored a reply 9 out of 10 even though it promised a refund over the $100 limit.",
    whatCaughtIt: "A code rule that flags refunds over $100 routed the reply to a person.",
    lesson: "A high judge score is not proof. Put hard rules in code.",
    sourceUrl: pick(5).sourceUrl, evidence: ["post:" + postId(5), "comment:" + postId(5) + "-c1"], provenance: "AI-DRAFTED",
  },
  allBuilds: posts.map((p) => {
    const prof = byPost.get(p.postId) ?? null;
    return {
      postId: p.postId, title: p.title, author: p.author.displayName, category: categories[p.postId], oneLine: oneLines[p.postId],
      commentCount: p.comments.length, sourceUrl: p.sourceUrl, workflowProfileId: prof ? prof.profileId : null,
      signals: profileSignals(prof), isSpotlight: spotlightIds.includes(p.postId), evidence: ["post:" + p.postId],
    };
  }),
  discussionHighlights: {
    ...discussion,
    synthesis: [
      { text: "Classmates kept asking what happens after the last retry, which pushed authors to describe their fallback paths.", evidence: ["comment:" + postId(4) + "-c2", "comment:" + postId(4) + "-c4"], provenance: "AI-DRAFTED" },
      { text: "Several replies pointed to checks that belong in code rather than in a judge's prompt.", evidence: ["comment:" + postId(1) + "-c1", "comment:" + postId(5) + "-c1"], provenance: "AI-DRAFTED" },
    ],
  },
  takeaways: [
    { title: "A high score isn't proof", text: "A judge passed a reply that broke policy. Hard rules belong in code or with a person.", evidence: ["post:" + postId(5)], provenance: "AI-DRAFTED" },
    { title: "Cap the loop, then hand off", text: "Give every retry loop a maximum and a place to go when it runs out.", evidence: ["post:" + postId(1), "post:" + postId(4)], provenance: "AI-DRAFTED" },
    { title: "Test the failure path on purpose", text: "Raise the threshold or feed a known-bad input to see what your safeguards catch.", evidence: ["post:" + postId(1)], provenance: "AI-DRAFTED" },
  ],
  methodology: {
    pipelineVersion: "0.1.0", promptVersion: "synthetic", llmProvider: "none (synthetic fixture)", reviewerScore: null, revisionCount: 0,
    codeChecks: [
      { name: "issue.json validates against issue.schema.json", passed: true },
      { name: "metrics recomputed from normalized posts", passed: true },
      { name: "every evidence reference resolves to a source", passed: true },
    ],
    notes: ["Synthetic fixture. Every name and post is invented for testing.", "Prompt-injection text in post " + postId(7) + " is kept as data and never followed."],
  },
  provenance: {
    runId: "run_synthetic-week-02", inputHash: hash, idempotencyKey: idempotencyKey("CIS 515", "2026 Fall B", 2, hash),
    labels: ["CODE-COUNTED", "AI-DRAFTED", "SOURCE-LINKED", "HUMAN-APPROVED"], synthetic: true, githubCommitSha: null, publicUrl: null,
  },
  downloads: { json: "/issues/week-02/issue.json", html: "/issues/week-02/newsletter.html" },
  sourceSummary: { provider: "synthetic-fixture", verified: false, eventCount: bundle.events.length, fetchedAt: FETCHED_AT, topic: TOPIC.name },
};

// Validate before writing, so a broken fixture never lands on disk.
posts.forEach((p) => normalizedPostSchema.parse(p));
profiles.forEach((p) => workflowProfileSchema.parse(p));
assetManifestSchema.parse(manifest);
issueSchema.parse(issue);

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + "\n", "utf8");
write("normalized-posts.json", posts);
write("workflow-profiles.json", profiles);
write("asset-manifest.json", manifest);
write("issue.json", issue);
write("week-dataset.json", dataset);
console.log("wrote", OUT, { posts: posts.length, comments: metrics.comments, profiles: profiles.length, diagnostics: dataset.diagnostics });
