// Local editorial runner: drives the state machine with one provider. The same machine runs in n8n workflow 04.
import { acceptResponse, assertDraft, buildDraft, nextRequest, startRun, type EditorialDraft, type StartOptions } from "./machine";
import { withImageBytes, type EditorialModelProvider, type ImageBank } from "./providers";

export type RunOptions = Omit<StartOptions, "provider" | "model" | "now"> & {
  provider: EditorialModelProvider;
  /** Clock, injectable so tests are deterministic. */
  now?: () => string;
  /** Real image bytes for the image curator, by assetRef. */
  imageBank?: ImageBank;
};

export async function runEditorial(o: RunOptions): Promise<EditorialDraft> {
  const now = o.now ?? (() => new Date().toISOString());
  let state = startRun({ ...o, provider: o.provider.name, model: o.provider.model, now: now() });
  for (;;) {
    state = nextRequest(state, now());
    if (!state.pending) break;
    state = acceptResponse(state, await o.provider.generate(withImageBytes(state.pending, o.imageBank)), now());
  }
  const draft = buildDraft(state, now());
  assertDraft(draft);
  return draft;
}
