// Conservative publication eligibility for live Yellowdig posts (recorded in Phase 3, finalized after the
// second live capability run). post/status and post/visibility exist in live data, but their value
// enumerations are NOT VERIFIED yet, so no value is trusted as publishable until it is listed here.
// Not wired into ingestion yet: Phase 4/5 apply it before anything reaches a public issue.

/** Values confirmed (from live data) to mean published, public community content. Empty until verified. */
export const VERIFIED_PUBLISHABLE_STATUSES: readonly string[] = [];
export const VERIFIED_PUBLIC_VISIBILITIES: readonly string[] = [];

export type Eligibility = "eligible" | "excluded" | "needs-review";

/**
 * - deleted → excluded
 * - status and visibility both on the verified allowlists → eligible
 * - status or visibility present but not allowlisted, or missing → needs-review (never published automatically)
 */
export function publicationEligibility(post: { status?: string | null; visibility?: string | null; deleted?: boolean | null }): Eligibility {
  if (post.deleted === true) return "excluded";
  const status = (post.status ?? "").trim().toLowerCase();
  const visibility = (post.visibility ?? "").trim().toLowerCase();
  if (!status || !visibility) return "needs-review";
  if (VERIFIED_PUBLISHABLE_STATUSES.includes(status) && VERIFIED_PUBLIC_VISIBILITIES.includes(visibility)) return "eligible";
  return "needs-review";
}
