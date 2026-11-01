// The synthetic Week 2 editorial input, built from the committed fixtures by the real input builder.
// Used by tests and by the manual-test path of n8n workflow 04. Invented data only.
import dataset from "../../../../fixtures/synthetic/week-02/week-dataset.json";
import manifest from "../../../../fixtures/synthetic/week-02/asset-manifest.json";
import profiles from "../../../../fixtures/synthetic/week-02/workflow-profiles.json";
import type { AssetManifest, WorkflowProfile } from "../contracts";
import type { WeekDataset } from "../source/normalize";
import { buildEditorialInput } from "./input";

export const SYNTHETIC_COURSE = { code: "CIS 515", name: "AI and Data Analytics Strategy", term: "2026 Fall B" } as const;

export function syntheticEditorialInput() {
  return buildEditorialInput({
    dataset: JSON.parse(JSON.stringify(dataset)) as WeekDataset,
    manifest: JSON.parse(JSON.stringify(manifest)) as AssetManifest,
    profiles: JSON.parse(JSON.stringify(profiles)) as WorkflowProfile[],
    course: { ...SYNTHETIC_COURSE },
  });
}
