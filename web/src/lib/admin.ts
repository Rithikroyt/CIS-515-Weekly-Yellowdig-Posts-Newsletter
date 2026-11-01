// Admin access policy. There is no authentication yet, so the admin console is development-only: it renders
// only when NODE_ENV is not "production". It never receives secrets and makes no backend calls.
export function adminEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export const RUN_STAGES = [
  "Validating inputs", "Fetching Yellowdig", "Normalizing posts", "Profiling workflow assets", "Computing metrics",
  "Drafting editorial content", "Validating evidence", "Awaiting human review", "Publishing",
] as const;

/** n8n workflows as recorded in the repository (docs/architecture.md). Not a live status check. */
export const WORKFLOWS: Array<{ name: string; id: string | null; state: string }> = [
  { name: "01 - Yellowdig Fetch Events", id: "dHZoXDny6WU1v62y", state: "Built · fixture tested · not published" },
  { name: "02 - Yellowdig Normalize and Join", id: "ZZoqGbrNSC3nAo3f", state: "Built · fixture tested · not published" },
  { name: "03 - Profile Workflow Assets", id: "L2fnEPtg0te7KTbG", state: "Built · fixture tested · not published" },
  { name: "04 - Editorial Intelligence", id: null, state: "Not built" },
  { name: "05 - Review and Publish", id: null, state: "Not built" },
];
