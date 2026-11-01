// Every Phase 3 limit in one place. Checked before any expensive work.

export const ASSET_LIMITS = {
  workflowJsonMaxBytes: 5 * 1024 * 1024,
  screenshotMaxBytes: 10 * 1024 * 1024,
  workflowsPerPost: 10,
  screenshotsPerPost: 10,
  assetsPerBatch: 100,
  maxNodes: 500,
  maxEdges: 2000,
  /** Maximum array/object nesting in workflow JSON, checked on the text before JSON.parse. */
  maxJsonDepth: 64,
  /** Maximum number of values visited while scanning one workflow (iterative walk). */
  maxJsonValues: 250_000,
  /** Longest string inspected or kept in the sanitized copy; longer strings are truncated. */
  maxStringInspect: 20_000,
  /** Longest Code-node source inspected; the rest is truncated in the sanitized copy. */
  maxCodeInspect: 100_000,
  maxLabelLength: 80,
  maxFilenameLength: 120,
} as const;

export type AssetLimits = typeof ASSET_LIMITS;

/** Bumped whenever profiling rules change, so profiles from different rule sets are distinguishable. */
export const PROFILER_VERSION = "3.0.0";
