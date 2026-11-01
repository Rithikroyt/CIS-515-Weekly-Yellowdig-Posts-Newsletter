// The /schemas files for the lite validator. Used by the source layer and the n8n bundles.
// Each validator is built lazily from only the schemas it needs, so a bundle carries no more schema than it uses.
import { SourceError } from "../source/constants";
import { createLiteValidator, type LiteError } from "./validate-lite";
import normalizedPost from "../../../../schemas/normalized-post.schema.json";
import metrics from "../../../../schemas/metrics.schema.json";
import sourceBundle from "../../../../schemas/source-bundle.schema.json";
import weekDataset from "../../../../schemas/week-dataset.schema.json";

const BASE = "https://cis515-observatory/schemas/";
export const SCHEMA_IDS = {
  normalizedPost: BASE + "normalized-post.schema.json",
  sourceBundle: BASE + "source-bundle.schema.json",
  weekDataset: BASE + "week-dataset.schema.json",
} as const;

type Schema = Record<string, unknown>;
let bundleValidator: ReturnType<typeof createLiteValidator> | null = null;
let datasetValidator: ReturnType<typeof createLiteValidator> | null = null;

/** Validator for source bundles only (workflow 01 output, workflow 02 input). */
export function bundleLite() {
  bundleValidator ??= createLiteValidator([sourceBundle as Schema]);
  return bundleValidator;
}

/** Validator for week datasets and normalized posts (needs every schema the dataset references). */
export function datasetLite() {
  datasetValidator ??= createLiteValidator([normalizedPost, metrics, sourceBundle, weekDataset] as Schema[]);
  return datasetValidator;
}

function throwIfInvalid(errs: LiteError[], label: string): void {
  if (errs.length) {
    throw new SourceError("CONTRACT_VIOLATION", label + " does not match its schema: " + errs.slice(0, 5).map((e) => (e.path || "/") + " " + e.message).join("; "));
  }
}

/** Throws CONTRACT_VIOLATION with the first few error paths (never the offending values). */
export function assertSourceBundle(data: unknown): void {
  throwIfInvalid(bundleLite().errors(SCHEMA_IDS.sourceBundle, data), "source bundle");
}

export function assertWeekDataset(data: unknown): void {
  throwIfInvalid(datasetLite().errors(SCHEMA_IDS.weekDataset, data), "week dataset");
}
