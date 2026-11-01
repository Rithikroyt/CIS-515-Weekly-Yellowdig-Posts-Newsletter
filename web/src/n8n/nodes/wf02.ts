// Workflow 02 · Yellowdig Normalize and Join. One exported entry per Code node. No AI anywhere.
import type { NodeEntry } from "../runtime";
import {
  SYNTHETIC_WEEK2_RUN, checkBundleConsistency, stageClassify, stageDataset, stageJoin,
  type ClassifiedEvents, type Joined, type SourceBundle,
} from "../../lib/source";
import { assertSourceBundle, assertWeekDataset } from "../../lib/contracts/registry";

type J = Record<string, unknown>;

/** Manual runs only: ask workflow 01 for the synthetic week in fixture mode. */
export const fixtureRunConfig: NodeEntry = (ctx) => [{ ...SYNTHETIC_WEEK2_RUN, sourceMode: "fixture", ...(ctx.items[0] ?? {}) }];

/** The bundle must match schemas/source-bundle.schema.json and its own claims must agree. */
export const validateSourceMetadata: NodeEntry = (ctx) => {
  if (ctx.items.length !== 1) throw new Error("[CONTRACT_VIOLATION] expected exactly one source bundle, got " + ctx.items.length);
  const bundle = ctx.items[0] as unknown as SourceBundle;
  assertSourceBundle(bundle);
  return [checkBundleConsistency(bundle) as unknown as J];
};

export const classifyEvents: NodeEntry = (ctx) => [stageClassify(ctx.items[0] as unknown as SourceBundle) as unknown as J];

export const joinToPosts: NodeEntry = (ctx) => [stageJoin(ctx.items[0] as unknown as ClassifiedEvents) as unknown as J];

export const computeMetrics: NodeEntry = (ctx) => [stageDataset(ctx.items[0] as unknown as Joined) as unknown as J];

/** Every post against normalized-post.schema.json and the whole dataset against week-dataset.schema.json. */
export const validateDataset: NodeEntry = (ctx) => {
  const dataset = ctx.items[0];
  assertWeekDataset(dataset);
  return [dataset];
};
