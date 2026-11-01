// Workflow 05 · Generate Newsletter. One exported entry per Code node. Orchestrates 01 → 02 → 04, renders the
// reviewed draft with the shared renderer and stores the finished HTML in the newsletter_runs Data Table.
// The webhook body is untrusted; only action, week and runId are read. Headers (which carry the secret) are never read.
import { randomBytes } from "node:crypto";
import type { NodeEntry } from "../runtime";
import { buildEditorialInput } from "../../lib/editorial/input";
import type { EditorialDraft } from "../../lib/editorial/machine";
import type { EditorialInput } from "../../lib/editorial/types";
import { renderNewsletter } from "../../lib/render/newsletter";
import { decideStart, failureCode, routeRequest as route, statusReply as reply, type RunRow } from "../../lib/runs";
import { SYNTHETIC_WEEK2_RUN } from "../../lib/source/synthetic-week2";
import type { WeekDataset } from "../../lib/source/normalize";
import { COURSE, YELLOWDIG_SOURCE, weekConfig, type Week } from "../../lib/weeks";

type J = Record<string, unknown>;
export const WF05 = {
  manual: "Manual Test (synthetic)",
  route: "Route Request",
  source: "Run 01 Fetch Events",
  dataset: "Run 02 Normalize and Join",
  request: "Editorial Request",
  editorial: "Run 04 Editorial Intelligence",
} as const;

/** Test only: a synthetic Week 2 request (fixture source, mock model). Reachable only from the manual trigger. */
export const syntheticRequest: NodeEntry = () => [{ action: "generate", week: 2, runId: "r_" + randomBytes(12).toString("hex"), test: "synthetic" }];

export const routeRequest: NodeEntry = (ctx) => {
  const fromManual = ctx.node(WF05.manual) !== null;
  const item = ctx.items[0] ?? {};
  return [route(fromManual ? item : item.body, fromManual) as unknown as J];
};

export const decideRunStart: NodeEntry = (ctx) => {
  const req = ctx.node(WF05.route) as { week: number; runId: string };
  return [decideStart(ctx.items as RunRow[], req, ctx.now) as unknown as J];
};

export const queuedReply: NodeEntry = (ctx) => {
  const req = ctx.node(WF05.route) as { week: number; runId: string };
  return [{ runId: req.runId, week: req.week, status: "queued" }];
};

/** Run input for workflow 01. Production reads Yellowdig only (no fixture fallback); the test path uses the fixture. */
export const sourceConfig: NodeEntry = (ctx) => {
  const req = ctx.node(WF05.route) as { week: Week; test: string | null };
  if (req.test === "synthetic") return [{ ...SYNTHETIC_WEEK2_RUN }];
  const w = weekConfig(req.week);
  if (!w.topic || !w.startDate || !w.endDate) throw new Error("[WEEK_NOT_CONFIGURED] week " + req.week);
  return [{ sourceMode: "yellowdig", week: w.week, startDate: w.startDate, endDate: w.endDate, topic: w.topic, ...YELLOWDIG_SOURCE, yellowdigCredentialConfigured: true }];
};

/** Builds the deterministic editorial input. No workflow files are uploaded in this flow, so no profiles. */
export const editorialRequest: NodeEntry = (ctx) => {
  const req = ctx.node(WF05.route) as { test: string | null };
  const dataset = ctx.node(WF05.dataset) as unknown as WeekDataset | null;
  if (!dataset || !Array.isArray(dataset.posts)) throw new Error("[SOURCE_UNAVAILABLE] no week dataset");
  const synthetic = dataset.source?.provider === "synthetic-fixture";
  if (synthetic && req.test !== "synthetic") throw new Error("[SOURCE_FALLBACK] refusing to publish fixture data as a real week");
  if (!dataset.posts.length) throw new Error("[NO_POSTS] no posts for this week's topic");
  const input = buildEditorialInput({ dataset, manifest: null, profiles: [], course: { ...COURSE } });
  return [{ input, options: synthetic ? { provider: "mock", scenario: "clean" } : { provider: "gemini" } } as unknown as J];
};

export const renderArtifact: NodeEntry = (ctx) => {
  const out = ctx.node(WF05.editorial) as { done?: boolean; draft?: EditorialDraft } | null;
  const req = ctx.node(WF05.request) as { input: EditorialInput } | null;
  const draft = out?.draft;
  if (!draft || !req) throw new Error("[EDITORIAL_FAILED] no editorial draft");
  if (draft.status === "failed" || !draft.newsletter) throw new Error("[" + (draft.run?.errorCode ?? "EDITORIAL_FAILED") + "] editorial run failed");
  const r = renderNewsletter({ input: req.input, draft });
  return [{ status: r.status, html: r.html, omittedClaims: r.omittedClaims }];
};

export const failRun: NodeEntry = (ctx) => {
  const e = (ctx.items[0] ?? {}) as { error?: unknown; message?: unknown };
  const msg = typeof e.error === "object" && e.error ? (e.error as { message?: unknown }).message : e.error ?? e.message;
  return [{ status: "failed", errorCode: failureCode(msg) }];
};

export const statusReply: NodeEntry = (ctx) => {
  const req = ctx.node(WF05.route) as { action: "status" | "artifact"; runId: string };
  return [reply(ctx.items as RunRow[], req, ctx.now)];
};
