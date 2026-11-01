// Phase 3 schema validators (asset manifest, workflow profile). Kept apart from registry.ts so the
// Phase 2 n8n bundles do not change when Phase 3 schemas do.
import { SourceError } from "../source/constants";
import { createLiteValidator, type LiteError } from "./validate-lite";
import workflowAsset from "../../../../schemas/workflow-asset.schema.json";
import assetManifest from "../../../../schemas/asset-manifest.schema.json";
import workflowProfile from "../../../../schemas/workflow-profile.schema.json";

const BASE = "https://cis515-observatory/schemas/";
export const ASSET_SCHEMA_IDS = {
  workflowAsset: BASE + "workflow-asset.schema.json",
  assetManifest: BASE + "asset-manifest.schema.json",
  workflowProfile: BASE + "workflow-profile.schema.json",
} as const;

let validator: ReturnType<typeof createLiteValidator> | null = null;
export function assetsLite() {
  validator ??= createLiteValidator([workflowAsset, assetManifest, workflowProfile] as Array<Record<string, unknown>>);
  return validator;
}

function throwIfInvalid(errs: LiteError[], label: string): void {
  if (errs.length) {
    throw new SourceError("CONTRACT_VIOLATION", label + " does not match its schema: " + errs.slice(0, 5).map((e) => (e.path || "/") + " " + e.message).join("; "));
  }
}

export function assertAssetManifest(data: unknown): void {
  throwIfInvalid(assetsLite().errors(ASSET_SCHEMA_IDS.assetManifest, data), "asset manifest");
}

export function assertWorkflowProfile(data: unknown): void {
  throwIfInvalid(assetsLite().errors(ASSET_SCHEMA_IDS.workflowProfile, data), "workflow profile");
}
