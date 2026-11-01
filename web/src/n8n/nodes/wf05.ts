// Workflow 05 · Generate Newsletter. One exported entry per Code node. Orchestrates 01 → 02 → 04, reads the week's
// private assets (newsletter_assets: workflow profiles and screenshots from scripts/assets-upload.ts), renders the
// reviewed draft with the shared renderer and stores the finished HTML in the newsletter_runs Data Table.
// The webhook body is untrusted; only action, week and runId are read. Headers (which carry the secret) are never read.
import { randomBytes } from "node:crypto";
import type { NodeEntry } from "../runtime";
import { NO_ASSETS, collectWeekAssets, type WeekAssets } from "../../lib/assets/intake";
import type { AssetManifest, WorkflowProfile } from "../../lib/contracts";
import syntheticManifest from "../../../../fixtures/synthetic/week-02/asset-manifest.json";
import syntheticProfiles from "../../../../fixtures/synthetic/week-02/workflow-profiles.json";
import { buildEditorialInput } from "../../lib/editorial/input";
import type { EditorialDraft } from "../../lib/editorial/machine";
import type { EditorialInput } from "../../lib/editorial/types";
import { assertPublicationQuality, renderNewsletter } from "../../lib/render/newsletter";
import { MIN_SALT_LENGTH, decideStart, failureCode, routeRequest as route, statusReply as reply, type RunRow } from "../../lib/runs";
import { SYNTHETIC_WEEK2_RUN } from "../../lib/source/synthetic-week2";
import type { WeekDataset } from "../../lib/source/normalize";
import { COURSE, YELLOWDIG_SOURCE, weekConfig, type Week } from "../../lib/weeks";

type J = Record<string, unknown>;
export const WF05 = {
  manual: "Manual Test (synthetic)",
  route: "Route Request",
  source: "Run 01 Fetch Events",
  dataset: "Run 02 Normalize and Join",
  assets: "Collect Assets",
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
const WEBHOOK_NODE = "Newsletter Webhook";

export const sourceConfig: NodeEntry = (ctx) => {
  const req = ctx.node(WF05.route) as { week: Week; test: string | null };
  if (req.test === "synthetic") return [{ ...SYNTHETIC_WEEK2_RUN }];
  const w = weekConfig(req.week);
  if (!w.topic || !w.startDate || !w.endDate) throw new Error("[WEEK_NOT_CONFIGURED] week " + req.week);
  // The salt comes from the authenticated webhook body (Vercel's server-only PSEUDONYMIZATION_SALT) and goes only to 01.
  const salt = ((ctx.node(WEBHOOK_NODE) as { body?: { pseudonymSalt?: unknown } } | null)?.body?.pseudonymSalt);
  if (typeof salt !== "string" || salt.length < MIN_SALT_LENGTH) throw new Error("[SALT_NOT_CONFIGURED] no pseudonymization salt");
  return [{ sourceMode: "yellowdig", week: w.week, startDate: w.startDate, endDate: w.endDate, topic: w.topic, ...YELLOWDIG_SOURCE, yellowdigCredentialConfigured: true, pseudonymSalt: salt }];
};

/**
 * The week's real assets in canonical form, from the asset sources in priority order: Yellowdig attachments (the
 * events API has none, verified), then the private asset store rows that "Find Week Assets" returned. No source:
 * coverage is unknown and the issue shows a dash for files and images. The synthetic test path never reads stored
 * assets; it uses the synthetic fixture's manifest and profiles (invented workflows).
 */
export const collectAssets: NodeEntry = (ctx) => {
  const req = ctx.node(WF05.route) as { week: number; test: string | null };
  if (req.test === "synthetic") {
    const fixture: WeekAssets = { ...NO_ASSETS, manifest: syntheticManifest as unknown as AssetManifest, profiles: syntheticProfiles as unknown as WorkflowProfile[], coverageComplete: true };
    return [fixture as unknown as J];
  }
  return [collectWeekAssets(ctx.items, req.week) as unknown as J];
};

/** Builds the deterministic editorial input from the week dataset and the stored asset manifest and profiles. */
export const editorialRequest: NodeEntry = (ctx) => {
  const req = ctx.node(WF05.route) as { test: string | null };
  const assets = ctx.node(WF05.assets) as unknown as WeekAssets | null;
  const dataset = ctx.node(WF05.dataset) as unknown as WeekDataset | null;
  if (!dataset || !Array.isArray(dataset.posts)) throw new Error("[SOURCE_UNAVAILABLE] no week dataset");
  const synthetic = dataset.source?.provider === "synthetic-fixture";
  if (synthetic && req.test !== "synthetic") throw new Error("[SOURCE_FALLBACK] refusing to publish fixture data as a real week");
  if (!dataset.posts.length) throw new Error("[NO_POSTS] no posts for this week's topic");
  const input = buildEditorialInput({ dataset, manifest: assets?.manifest ?? null, profiles: assets?.profiles ?? [], images: assets?.images ?? [], coverageComplete: assets?.coverageComplete === true, course: { ...COURSE } });
  // Image bytes ride alongside the input (not inside it): workflow 04 attaches them only to image-curator calls.
  return [{ input, imageBank: assets?.bank ?? {}, options: synthetic ? { provider: "mock", scenario: "clean" } : { provider: "gemini" } } as unknown as J];
};

export const renderArtifact: NodeEntry = (ctx) => {
  const out = ctx.node(WF05.editorial) as { done?: boolean; draft?: EditorialDraft } | null;
  const req = ctx.node(WF05.request) as { input: EditorialInput } | null;
  const draft = out?.draft;
  if (!draft || !req) throw new Error("[EDITORIAL_FAILED] no editorial draft");
  // The summary is code-generated (stage, code, schema path); it never contains post text. Only the code is stored.
  if (draft.status === "failed" || !draft.newsletter) throw new Error("[" + (draft.run?.errorCode ?? "EDITORIAL_FAILED") + "] editorial run failed: " + String(draft.run?.errorSummary ?? "").slice(0, 200));
  const dataset = ctx.node(WF05.dataset) as unknown as WeekDataset | null;
  const assets = ctx.node(WF05.assets) as unknown as WeekAssets | null;
  // Links only from the verified URL format, built in workflow 02 from the API's own identifiers.
  const postUrls = Object.fromEntries((dataset?.posts ?? []).filter((p) => p.sourceUrl && p.source.sourceUrlVerified).map((p) => ["post:" + p.postId, p.sourceUrl as string]));
  const altText = Object.fromEntries((assets?.images ?? []).map((i) => [i.assetRef, i.altText]));
  const r = renderNewsletter({ input: req.input, draft, postUrls, imageBank: assets?.bank ?? {}, altText });
  assertPublicationQuality(req.input, r);
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
