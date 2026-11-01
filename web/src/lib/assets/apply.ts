// Joins manually supplied asset names onto normalized posts (the Yellowdig API does not provide attachments). Pure.
import type { AssetManifest, NormalizedPost } from "../contracts";

/**
 * Only assets explicitly attached to the post (postRef) that passed validation are used:
 * screenshots with status VALIDATED, and the first PROFILED workflow file in manifest order.
 */
export function applyAssetManifest(posts: NormalizedPost[], manifest: AssetManifest): NormalizedPost[] {
  return posts.map((p) => {
    const mine = manifest.assets.filter((e) => e.asset.postRef === p.postId);
    const screenshots = mine.filter((e) => e.asset.kind === "workflow_screenshot" && e.status === "VALIDATED").map((e) => e.asset.originalFilename);
    const workflow = mine.find((e) => e.asset.kind === "n8n_workflow_json" && e.status === "PROFILED");
    if (!screenshots.length && !workflow) return p;
    return { ...p, assets: { screenshots, workflowJson: workflow ? workflow.asset.originalFilename : null } };
  });
}
