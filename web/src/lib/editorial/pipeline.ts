// Local editorial runner: drives the state machine with one provider. The same machine runs in n8n workflow 04.
import { acceptResponse, assertDraft, buildDraft, nextRequest, startRun, type EditorialDraft, type StartOptions } from "./machine";
import type { EditorialModelProvider } from "./providers";

export type RunOptions = Omit<StartOptions, "provider" | "model" | "now"> & {
  provider: EditorialModelProvider;
  /** Clock, injectable so tests are deterministic. */
  now?: () => string;
};

export async function runEditorial(o: RunOptions): Promise<EditorialDraft> {
  const now = o.now ?? (() => new Date().toISOString());
  let state = startRun({ ...o, provider: o.provider.name, model: o.provider.model, now: now() });
  for (;;) {
    state = nextRequest(state, now());
    if (!state.pending) break;
    state = acceptResponse(state, await o.provider.generate(state.pending), now());
  }
  const draft = buildDraft(state, now());
  assertDraft(draft);
  return draft;
}
