// Shared Phase 3 types. The string unions mirror schemas/asset-manifest.schema.json and workflow-profile.schema.json.
import type { ASSET_REASONS, ASSET_STATUSES, NodeCategory } from "../contracts";

export type AssetReason = (typeof ASSET_REASONS)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type { NodeCategory };

/** A node after sanitization: only fields the profiler reads. Parameters are redacted. */
export type SafeNode = {
  index: number;
  name: string;
  type: string;
  typeVersion: number | null;
  disabled: boolean;
  parameters: Record<string, unknown>;
  onError: string | null;
  retryOnFail: boolean;
  maxTries: number | null;
};

export type RawConnections = Record<string, Record<string, unknown>>;

export type SanitizedWorkflow = {
  name: string;
  nodes: SafeNode[];
  connections: RawConnections;
  hasErrorWorkflow: boolean;
};

export type SecurityReport = {
  credentialReferencesDetected: number;
  pinnedDataDetected: boolean;
  executionDataDetected: boolean;
  staticDataDetected: boolean;
  binaryDataDetected: boolean;
  webhookIdsRemoved: number;
  webhookUrlsRedacted: number;
  possibleSecretsDetected: number;
  emailsDetected: number;
  stringsTruncated: number;
};
