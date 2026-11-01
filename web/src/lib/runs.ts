// Newsletter run bookkeeping for workflow 05: request routing, duplicate-run handling, stale runs, safe error
// codes and status replies. Pure; the n8n Data Table `newsletter_runs` holds the rows.
import { parseWeek, weekConfig } from "./weeks";

export const RUN_ID_RE = /^r_[a-f0-9]{24}$/;
export const TERMINAL = new Set(["ready", "ready_with_omissions", "failed"]);
/** A run that has not moved for this long is treated as failed (for example, the execution was stopped). */
export const STALE_MS = 30 * 60 * 1000;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

export type RunRow = { run_id?: unknown; week?: unknown; status?: unknown; error_code?: unknown; omitted_claims?: unknown; html?: unknown; updatedAt?: unknown; createdAt?: unknown };
export type RoutedRequest =
  | { action: "generate"; week: number; runId: string; test: "synthetic" | null }
  | { action: "status" | "artifact"; runId: string }
  | { action: "reject"; errorCode: string };

/** Live runs need the server-side pseudonymization salt (PSEUDONYMIZATION_SALT) for workflow 01. */
export const MIN_SALT_LENGTH = 32;

/**
 * Validates an untrusted webhook body. Only `action`, `week`, `runId` and (for live generate) the presence of
 * `pseudonymSalt` are read. The salt itself is never part of the result; Source Config reads it from the webhook.
 */
export function routeRequest(body: unknown, allowTest: boolean): RoutedRequest {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const runId = typeof b.runId === "string" && RUN_ID_RE.test(b.runId) ? b.runId : null;
  if (!runId) return { action: "reject", errorCode: "INVALID_RUN_ID" };
  if (b.action === "status" || b.action === "artifact") return { action: b.action, runId };
  if (b.action !== "generate") return { action: "reject", errorCode: "INVALID_ACTION" };
  const week = parseWeek(b.week);
  if (week === null) return { action: "reject", errorCode: "INVALID_WEEK" };
  const test = allowTest && b.test === "synthetic" ? "synthetic" : null;
  if (!test && !weekConfig(week).topic) return { action: "reject", errorCode: "WEEK_NOT_CONFIGURED" };
  if (!test && (typeof b.pseudonymSalt !== "string" || b.pseudonymSalt.length < MIN_SALT_LENGTH)) return { action: "reject", errorCode: "SALT_NOT_CONFIGURED" };
  return { action: "generate", week, runId, test };
}

const isStale = (r: RunRow, now: string) => {
  const t = Date.parse(String(r.updatedAt ?? r.createdAt ?? ""));
  return Number.isFinite(t) && Date.parse(now) - t > STALE_MS;
};

/** An in-progress, non-stale run for the same week is reused instead of starting a second one. */
export function decideStart(rows: RunRow[], req: { week: number; runId: string }, now: string) {
  const active = rows.find((r) => typeof r.run_id === "string" && Number(r.week) === req.week && !TERMINAL.has(String(r.status)) && !isStale(r, now));
  return active
    ? { reuse: true, runId: String(active.run_id), week: req.week, status: String(active.status) }
    : { reuse: false, runId: req.runId, week: req.week, status: "queued" };
}

/** Pulls a "[CODE]" prefix out of an error message; anything else becomes GENERATION_FAILED. */
export function failureCode(message: unknown): string {
  const m = /\[([A-Z][A-Z0-9_]{2,63})\]/.exec(String(message ?? ""));
  return m && SAFE_CODE.test(m[1]) ? m[1] : "GENERATION_FAILED";
}

/** The status or artifact reply for one run. HTML is included only for `artifact` on a finished run. */
export function statusReply(rows: RunRow[], req: { action: "status" | "artifact"; runId: string }, now: string): Record<string, unknown> {
  const r = rows.find((x) => x.run_id === req.runId);
  if (!r) return { found: false };
  let status = String(r.status);
  let errorCode = typeof r.error_code === "string" && SAFE_CODE.test(r.error_code) ? r.error_code : null;
  if (!TERMINAL.has(status) && isStale(r, now)) { status = "failed"; errorCode = "RUN_STALE"; }
  const out: Record<string, unknown> = {
    found: true, runId: req.runId, week: Number(r.week), status, errorCode: status === "failed" ? errorCode ?? "GENERATION_FAILED" : null,
    omittedClaims: Number.isInteger(r.omitted_claims) ? r.omitted_claims : 0, updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
  };
  if (req.action === "artifact" && (status === "ready" || status === "ready_with_omissions") && typeof r.html === "string") out.html = r.html;
  return out;
}
