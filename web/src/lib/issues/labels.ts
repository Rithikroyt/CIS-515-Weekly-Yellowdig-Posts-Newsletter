// Display vocabulary shared by the web pages and the standalone newsletter renderer. No data, only labels.
import type { Issue, SignalKey } from "../contracts";

export const COURSE_WEEKS = [1, 2, 3, 4, 5] as const;
/** The assigned production issue for Fall B 2026. */
export const PRODUCTION_WEEK = 4;

export const SIGNAL_LABELS: Record<SignalKey, { label: string; definition: string }> = {
  codeChecks: { label: "Code validation", definition: "A Code node checks model output before a decision gate." },
  humanReview: { label: "Human approval", definition: "A person approves before the workflow continues." },
  boundedRetry: { label: "Bounded retry", definition: "Every retry loop has a counter or batch limit." },
  errorHandling: { label: "Failure handling", definition: "An error branch, error workflow or failure route exists." },
  llmJudge: { label: "LLM judge", definition: "A second model scores the first model's output at a gate." },
  multiAgent: { label: "Multi-agent", definition: "Two or more agent nodes work in the same workflow." },
  fallback: { label: "Fallback", definition: "An error output leads to a working alternative path." },
  rag: { label: "Retrieval (RAG)", definition: "A vector store or retriever supplies context." },
  memory: { label: "Memory", definition: "A memory node carries context between runs." },
};

type Metrics = Issue["metrics"];
type CountKey = "posts" | "comments" | "uniqueAuthors" | "uniqueCommenters" | "reactions" | "views" | "workflowFiles" | "screenshots" | "avgCommentsPerPost";

export const METRIC_LABELS: Array<{ key: CountKey; label: string; definition: string }> = [
  { key: "posts", label: "Workflow posts", definition: "Posts in the week's Yellowdig topic and date window." },
  { key: "uniqueAuthors", label: "Contributors", definition: "Distinct people who posted a workflow." },
  { key: "comments", label: "Comments", definition: "Replies joined to those posts." },
  { key: "uniqueCommenters", label: "Commenters", definition: "Distinct people who replied." },
  { key: "workflowFiles", label: "Workflow files", definition: "n8n workflow files profiled and matched to a post." },
  { key: "screenshots", label: "Screenshots", definition: "Validated screenshots matched to a post." },
  { key: "reactions", label: "Reactions", definition: "Reactions on posts. Unavailable when the source has none." },
  { key: "views", label: "Views", definition: "Post views. Unavailable when the source has none." },
  { key: "avgCommentsPerPost", label: "Comments per post", definition: "Comments divided by posts, rounded to 2 places." },
];

export function metricValue(m: Metrics, key: CountKey): number | null {
  return m[key];
}

export const STATUS_TEXT: Record<Issue["status"], string> = {
  draft: "Draft",
  review: "In review",
  revision_requested: "Revision requested",
  approved: "Approved",
  published: "Published",
  failed: "Failed",
};

export const pad2 = (n: number) => String(n).padStart(2, "0");
