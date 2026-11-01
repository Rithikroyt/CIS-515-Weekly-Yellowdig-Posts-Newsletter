// Server-only bridge to workflow 05 (Generate Newsletter). The browser never sees the webhook URL or secret.
// One authenticated n8n webhook handles three actions: generate, status and artifact.
import { randomBytes } from "node:crypto";

import { RUN_ID_RE } from "../runs";
export { RUN_ID_RE };
export const newRunId = () => "r_" + randomBytes(12).toString("hex");

export const RUN_STATES = [
  "queued", "fetching_yellowdig", "normalizing", "profiling_assets", "generating_editorial", "evidence_review",
  "rendering", "ready", "ready_with_omissions", "failed",
] as const;
export type RunState = (typeof RUN_STATES)[number];
export const TERMINAL: ReadonlySet<RunState> = new Set(["ready", "ready_with_omissions", "failed"]);

export type RunStatus = { runId: string; week: number; status: RunState; errorCode: string | null; omittedClaims: number; updatedAt: string | null };
export type Artifact = { runId: string; week: number; status: RunState; html: string };

export class N8nError extends Error {
  constructor(public code: "N8N_NOT_CONFIGURED" | "N8N_UNAVAILABLE" | "N8N_BAD_RESPONSE" | "RUN_NOT_FOUND", public httpStatus: number) {
    super(code);
  }
}

const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

function config() {
  const url = process.env.N8N_GENERATE_WEBHOOK_URL ?? "";
  const secret = process.env.N8N_WEBHOOK_SECRET ?? "";
  if (!/^https:\/\/[^\s]+$/.test(url) || secret.length < 16) throw new N8nError("N8N_NOT_CONFIGURED", 503);
  return { url, secret };
}

async function call(body: Record<string, unknown>, timeoutMs = 20000): Promise<Record<string, unknown>> {
  const { url, secret } = config();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-cis515-webhook-secret": secret },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new N8nError("N8N_UNAVAILABLE", 502);
  }
  if (res.status === 404) throw new N8nError("RUN_NOT_FOUND", 404);
  if (!res.ok) throw new N8nError("N8N_UNAVAILABLE", 502);
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new N8nError("N8N_BAD_RESPONSE", 502);
  if ((json as { found?: unknown }).found === false) throw new N8nError("RUN_NOT_FOUND", 404);
  return json as Record<string, unknown>;
}

function toStatus(j: Record<string, unknown>): RunStatus {
  const status = j.status as RunState;
  if (typeof j.runId !== "string" || !RUN_ID_RE.test(j.runId) || !RUN_STATES.includes(status)) throw new N8nError("N8N_BAD_RESPONSE", 502);
  return {
    runId: j.runId,
    week: Number(j.week),
    status,
    errorCode: typeof j.errorCode === "string" && SAFE_CODE.test(j.errorCode) ? j.errorCode : status === "failed" ? "GENERATION_FAILED" : null,
    omittedClaims: Number.isInteger(j.omittedClaims) ? (j.omittedClaims as number) : 0,
    updatedAt: typeof j.updatedAt === "string" ? j.updatedAt.slice(0, 40) : null,
  };
}

/** Starts a run. n8n returns the active run for that week instead when one is already in progress. */
export async function startGeneration(week: number): Promise<RunStatus> {
  return toStatus(await call({ action: "generate", week, runId: newRunId() }));
}

export async function getStatus(runId: string): Promise<RunStatus> {
  return toStatus(await call({ action: "status", runId }));
}

export async function getArtifact(runId: string): Promise<Artifact> {
  const j = await call({ action: "artifact", runId }, 30000);
  const s = toStatus(j);
  if (s.status !== "ready" && s.status !== "ready_with_omissions") throw new N8nError("RUN_NOT_FOUND", 404);
  if (typeof j.html !== "string" || !j.html.startsWith("<!doctype html>") || j.html.length > 8_000_000) throw new N8nError("N8N_BAD_RESPONSE", 502);
  return { runId: s.runId, week: s.week, status: s.status, html: j.html };
}

/** Headers for serving the newsletter HTML: no scripts, no network, sandboxed even when opened directly. */
export const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; sandbox",
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
} as const;

export const errorBody = (code: string) => ({ error: code });
