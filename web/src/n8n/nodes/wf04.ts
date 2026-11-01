// Workflow 04 · Editorial Intelligence. One exported entry per Code node. The editorial logic is the shared
// state machine in lib/editorial; n8n only transports model calls. No public webhook; no key in any node.
import type { NodeEntry } from "../runtime";
import { acceptResponse, assertDraft, buildDraft, nextRequest, runRow, startRun, type ModelResponse, type RunState } from "../../lib/editorial/machine";
import { NAMED_SCENARIOS, mockRespond } from "../../lib/editorial/mock";
import { DEFAULT_MODELS, geminiRequest, parseGeminiResponse } from "../../lib/editorial/providers";
import { EditorialError, type EditorialInput, type ProviderName } from "../../lib/editorial/types";
import { syntheticEditorialInput } from "../../lib/editorial/synthetic";

type J = Record<string, unknown>;
type StepItem = { state: RunState; scenario: string | null };
type StartItem = {
  input: EditorialInput;
  options?: { provider?: string; model?: string; scenario?: string; parentRunId?: string; feedback?: string; force?: boolean; existingRuns?: Array<{ idempotencyKey: string; status: RunState["status"]; runId: string }> };
};

function startFrom(item: StartItem, now: string): StepItem {
  const o = item.options ?? {};
  const provider = (o.provider ?? "") as ProviderName;
  if (provider === "openai" || provider === "anthropic") throw new EditorialError("PROVIDER_NOT_IMPLEMENTED", provider + " has no adapter yet");
  if (provider !== "gemini" && provider !== "mock") throw new EditorialError("PROVIDER_NOT_CONFIGURED", "options.provider must be gemini or mock");
  // The mock can never stand in for a real model on real data.
  if (provider === "mock" && item.input?.sourceStatus?.provider !== "synthetic-fixture") throw new EditorialError("PROVIDER_NOT_CONFIGURED", "the mock provider only runs on synthetic input");
  const scenario = provider === "mock" ? (o.scenario && NAMED_SCENARIOS[o.scenario] ? o.scenario : "clean") : null;
  const state = startRun({
    input: item.input, provider, model: o.model || DEFAULT_MODELS[provider], now,
    parentRunId: o.parentRunId ?? null, feedback: o.feedback ?? null, existingRuns: o.existingRuns ?? [], force: o.force === true,
  });
  return { state, scenario };
}

/**
 * Starts the run (item has `input`) or accepts a model response (item has `state` + `modelResponse`), then plans
 * the next model call. When the run is done it emits the review-ready draft and its run-table row.
 */
export const editorialStep: NodeEntry = (ctx) => {
  if (ctx.items.length !== 1) throw new Error("[CONTRACT_VIOLATION] expected exactly one item, got " + ctx.items.length);
  const item = ctx.items[0] as J;
  let step: StepItem;
  if (item.input) step = startFrom(item as unknown as StartItem, ctx.now);
  else if (item.state && item.modelResponse) step = { state: acceptResponse(item.state as RunState, item.modelResponse as ModelResponse, ctx.now), scenario: (item.scenario as string) ?? null };
  else throw new EditorialError("INPUT_INVALID", "expected {input, options} or {state, modelResponse}");
  const state = nextRequest(step.state, ctx.now);
  if (state.pending) {
    return [{
      done: false, state, scenario: step.scenario, stepCount: state.steps, useMock: state.provider === "mock",
      gemini: state.provider === "gemini" ? geminiRequest(state.pending) : null,
    } as unknown as J];
  }
  const draft = buildDraft(state, ctx.now);
  assertDraft(draft);
  return [{ done: true, status: draft.status, draft, runRow: runRow(draft) } as unknown as J];
};

/** Development/test only: answers from the synthetic mock fixture (refused for non-synthetic input at start). */
export const mockModel: NodeEntry = (ctx) => {
  const { state, scenario } = ctx.items[0] as unknown as StepItem;
  const req = state.pending!;
  const calls = state.modelCalls.filter((c) => c.promptId === req.promptId).length;
  const modelResponse = mockRespond(req, calls, NAMED_SCENARIOS[scenario ?? "clean"] ?? NAMED_SCENARIOS.clean);
  return [{ state, scenario, stepCount: state.steps, modelResponse } as unknown as J];
};

/** After the Gemini HTTP Request node: turn the response (or error item) into a model response and reattach state. */
export const attachGeminiState: NodeEntry = (ctx) => {
  const prev = ctx.node("Use Mock Model?") as unknown as StepItem | null;
  if (!prev?.state) throw new EditorialError("MODEL_PROVIDER_ERROR", "run state missing before the Gemini call");
  return [{ state: prev.state, scenario: null, stepCount: prev.state.steps, modelResponse: parseGeminiResponse(ctx.items[0]) } as unknown as J];
};

/** Manual-test path only: the synthetic Week 2 editorial input (invented data) with the mock provider. */
export const syntheticEditorialRun: NodeEntry = (ctx) => {
  const scenario = String((ctx.items[0] as J | undefined)?.scenario ?? "revise-once");
  return [{ input: syntheticEditorialInput(), options: { provider: "mock", scenario } } as unknown as J];
};
