// Workflow 03 · Profile Workflow Assets. One exported entry per Code node. No AI, no HTTP.
// Uploaded workflow JSON is parsed as data only: never executed, evaluated, imported or followed.
import type { NodeEntry } from "../runtime";
import {
  stageAssemble, stageCheckFiles, stageProfile, stageSanitize, syntheticAssetBatch,
  type AssetBatchInput, type Stage1, type Stage2, type Stage3,
} from "../../lib/assets";
import { assertAssetManifest, assertWorkflowProfile } from "../../lib/contracts/assets-registry";

type J = Record<string, unknown>;

/** Manual runs only: a synthetic batch (fake workflows, generated images). Never real student files. */
export const syntheticBatch: NodeEntry = () => [syntheticAssetBatch() as unknown as J];

/** Batch and per-post limits, file type, MIME and magic bytes, SHA-256, duplicates, explicit post matching. */
export const checkFiles: NodeEntry = (ctx) => {
  if (ctx.items.length !== 1) throw new Error("[CONTRACT_VIOLATION] expected exactly one asset batch, got " + ctx.items.length);
  return [stageCheckFiles(ctx.items[0] as unknown as AssetBatchInput) as unknown as J];
};

/** Static JSON parse, structure checks, credential/pinData/staticData removal and secret redaction. */
export const sanitize: NodeEntry = (ctx) => [stageSanitize(ctx.items[0] as unknown as Stage1) as unknown as J];

/** Deterministic classification, safe graph and capability detection from structure only. */
export const profile: NodeEntry = (ctx) => [stageProfile(ctx.items[0] as unknown as Stage2) as unknown as J];

/** Manifest summary, then every profile and the manifest against their schemas. */
export const assembleAndValidate: NodeEntry = (ctx) => {
  const out = stageAssemble(ctx.items[0] as unknown as Stage3);
  out.profiles.forEach((p) => assertWorkflowProfile(p));
  assertAssetManifest(out.manifest);
  return [out as unknown as J];
};
