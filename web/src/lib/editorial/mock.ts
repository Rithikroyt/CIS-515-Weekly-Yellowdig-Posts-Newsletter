// Deterministic mock model for tests and n8n test runs. Development and test only: selectProvider refuses it
// in production. Responses come from fixtures/synthetic/editorial/week-02/mock-responses.json (invented data).
import fixture from "../../../../fixtures/synthetic/editorial/week-02/mock-responses.json";
import type { ModelRequest, ModelResponse } from "./machine";
import type { PromptId } from "./prompts";
import type { EditorialModelProvider } from "./providers";
import { DEFAULT_MODELS } from "./providers";

/** One scripted response: JSON to return, raw text, a transport error, or the reviewer's verdicts. */
export type MockStep =
  | { json: unknown }
  | { raw: string }
  | { error: "timeout" | "provider" }
  | { review: "all-supported" | Record<string, "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "CONFLICT"> }
  /** Local tests only (functions are not JSON): the response computed from the request's fenced source data. */
  | { build: (sourceData: unknown) => unknown };
/** Steps per prompt, used in call order; the last step repeats. */
export type MockScenario = Partial<Record<PromptId, MockStep[]>>;

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const MOCK_FIXTURE = fixture;

/** Clean newsletter with one invented count claim in place of the first summary line. */
export function newsletterWithInventedCount() {
  const nl = copy(fixture.newsletterClean);
  nl.executiveSummary[0] = copy(fixture.inventedCountClaim);
  return nl;
}

export const BASE_SCENARIO: MockScenario = {
  "post-extractor": [{ json: fixture.postNotes }],
  "theme-analyst": [{ json: fixture.themes }],
  "build-categorizer": [{ json: fixture.buildGroups }],
  "spotlight-pattern-selector": [{ json: fixture.selection }],
  "discussion-analyst": [{ json: fixture.discussion }],
  "newsletter-editor": [{ json: fixture.newsletterClean }],
  "evidence-reviewer": [{ review: "all-supported" }],
  "newsletter-reviser": [{ json: fixture.newsletterClean }],
};

export const NAMED_SCENARIOS: Record<string, MockScenario> = {
  clean: BASE_SCENARIO,
  "revise-once": { ...BASE_SCENARIO, "newsletter-editor": [{ json: newsletterWithInventedCount() }], "newsletter-reviser": [{ json: fixture.newsletterClean }] },
  "revision-limit": { ...BASE_SCENARIO, "newsletter-editor": [{ json: newsletterWithInventedCount() }], "newsletter-reviser": [{ json: newsletterWithInventedCount() }] },
};

/** The request's fenced source data, parsed back. */
function sourceData(req: ModelRequest): unknown {
  const m = /<source_data>\n([\s\S]*)\n<\/source_data>$/.exec(req.user);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** Claim ids the evidence-reviewer request asks about. */
const requestedClaimIds = (req: ModelRequest): string[] => ((sourceData(req) as { claims?: Array<{ claimId: string }> } | null)?.claims ?? []).map((c) => c.claimId);

/** Pure: the response for a request, given how many earlier calls used the same prompt. */
export function mockRespond(req: ModelRequest, callIndex: number, scenario: MockScenario): ModelResponse {
  const steps = scenario[req.promptId] ?? BASE_SCENARIO[req.promptId] ?? [];
  const step = steps[Math.min(callIndex, steps.length - 1)];
  if (!step) return { ok: false, code: "MODEL_PROVIDER_ERROR", detail: "mock has no response for " + req.promptId };
  if ("error" in step) return step.error === "timeout" ? { ok: false, code: "MODEL_TIMEOUT", detail: "mock timeout" } : { ok: false, code: "MODEL_PROVIDER_ERROR", detail: "mock provider error" };
  if ("raw" in step) return { ok: true, text: step.raw };
  if ("build" in step) return { ok: true, text: JSON.stringify(step.build(sourceData(req))) };
  if ("review" in step) {
    const verdicts = requestedClaimIds(req).map((claimId) => ({
      claimId,
      verdict: step.review === "all-supported" ? "SUPPORTED" : step.review[claimId] ?? "SUPPORTED",
      reason: "mock reviewer",
    }));
    return { ok: true, text: JSON.stringify({ verdicts }) };
  }
  return { ok: true, text: JSON.stringify(step.json) };
}

export function createMockProvider(scenario: MockScenario = BASE_SCENARIO): EditorialModelProvider & { calls: ModelRequest[] } {
  const counts = new Map<string, number>();
  const calls: ModelRequest[] = [];
  return {
    name: "mock",
    model: DEFAULT_MODELS.mock,
    calls,
    async generate(req) {
      calls.push(req);
      const n = counts.get(req.promptId) ?? 0;
      counts.set(req.promptId, n + 1);
      return mockRespond(req, n, scenario);
    },
  };
}
