// Workflow 05 bookkeeping: request routing, duplicate runs, stale runs, safe codes and replies.
import { describe, expect, it } from "vitest";
import { decideStart, failureCode, routeRequest, statusReply } from "./runs";
import { WEEK_TOPICS } from "./weeks";

const RUN = "r_0123456789abcdef01234567";
const NOW = "2026-11-01T12:00:00Z";
const ago = (min: number) => new Date(Date.parse(NOW) - min * 60000).toISOString();

describe("routeRequest", () => {
  it("accepts configured weeks only, from the body only", () => {
    expect(routeRequest({ action: "generate", week: 2, runId: RUN }, false)).toEqual({ action: "generate", week: 2, runId: RUN, test: null });
    expect(routeRequest({ action: "generate", week: 4, runId: RUN }, false)).toEqual({ action: "reject", errorCode: "WEEK_NOT_CONFIGURED" });
    expect(routeRequest({ action: "generate", week: "2", runId: RUN }, false)).toEqual({ action: "reject", errorCode: "INVALID_WEEK" });
    expect(routeRequest({ action: "generate", week: 2, runId: "bad" }, false)).toEqual({ action: "reject", errorCode: "INVALID_RUN_ID" });
    expect(routeRequest({ action: "delete", runId: RUN }, false)).toEqual({ action: "reject", errorCode: "INVALID_ACTION" });
    expect(routeRequest(null, false)).toEqual({ action: "reject", errorCode: "INVALID_RUN_ID" });
  });

  it("allows the synthetic test flag only from the manual trigger", () => {
    expect(routeRequest({ action: "generate", week: 4, runId: RUN, test: "synthetic" }, false)).toMatchObject({ action: "reject" });
    expect(routeRequest({ action: "generate", week: 2, runId: RUN, test: "synthetic" }, true)).toMatchObject({ test: "synthetic" });
  });

  it("maps only weeks whose topic was observed live", () => {
    expect(Object.values(WEEK_TOPICS).filter((w) => w.topic).map((w) => w.week)).toEqual([1, 2]);
  });
});

describe("decideStart", () => {
  it("reuses an active run for the same week and ignores finished or stale ones", () => {
    const active = { run_id: "r_aaaaaaaaaaaaaaaaaaaaaaaa", week: 2, status: "generating_editorial", updatedAt: ago(2) };
    expect(decideStart([active], { week: 2, runId: RUN }, NOW)).toEqual({ reuse: true, runId: active.run_id, week: 2, status: "generating_editorial" });
    expect(decideStart([{ ...active, status: "ready" }], { week: 2, runId: RUN }, NOW).reuse).toBe(false);
    expect(decideStart([{ ...active, updatedAt: ago(45) }], { week: 2, runId: RUN }, NOW).reuse).toBe(false);
    expect(decideStart([{}], { week: 2, runId: RUN }, NOW)).toEqual({ reuse: false, runId: RUN, week: 2, status: "queued" });
  });
});

describe("statusReply", () => {
  const row = { run_id: RUN, week: 2, status: "ready", error_code: "", omitted_claims: 3, html: "<!doctype html>x", updatedAt: ago(1) };
  it("returns html only for artifact on a finished run", () => {
    expect(statusReply([row], { action: "status", runId: RUN }, NOW)).not.toHaveProperty("html");
    expect(statusReply([row], { action: "artifact", runId: RUN }, NOW).html).toBe(row.html);
    expect(statusReply([{ ...row, status: "rendering" }], { action: "artifact", runId: RUN }, NOW)).not.toHaveProperty("html");
  });
  it("reports unknown and stale runs", () => {
    expect(statusReply([{}], { action: "status", runId: RUN }, NOW)).toEqual({ found: false });
    expect(statusReply([{ ...row, status: "fetching_yellowdig", updatedAt: ago(60) }], { action: "status", runId: RUN }, NOW)).toMatchObject({ status: "failed", errorCode: "RUN_STALE" });
  });
});

describe("failureCode", () => {
  it("keeps bracketed codes and hides everything else", () => {
    expect(failureCode("[SOURCE_FALLBACK] refusing")).toBe("SOURCE_FALLBACK");
    expect(failureCode("TypeError: x is undefined at /data/secret")).toBe("GENERATION_FAILED");
    expect(failureCode(undefined)).toBe("GENERATION_FAILED");
  });
});
