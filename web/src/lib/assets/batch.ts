// Weekly asset batch: validate files → sanitize workflows → profile → manifest.
// Each stage takes and returns plain JSON so workflow 03 can run one stage per Code node;
// processAssetBatch composes the same stages for tests and scripts.
import type { AssetManifest, WorkflowAsset, WorkflowProfile } from "../contracts";
import { sha256OfText } from "./bytes";
import { checkFile, safeFilename, type AssetInput } from "./files";
import { ASSET_LIMITS } from "./limits";
import { buildProfile } from "./profile";
import { parseWorkflowText, sanitizeWorkflow } from "./sanitize";
import type { AssetReason, AssetStatus, SanitizedWorkflow, SecurityReport } from "./types";

export type AssetBatchInput = { week: number; knownPostRefs?: string[] | null; assets: AssetInput[] };
export type ManifestEntry = AssetManifest["assets"][number];

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export type Stage1 = {
  week: number;
  entries: ManifestEntry[];
  /** Workflow files that passed file checks, with their text. Internal to the workflow run; never output. */
  workflows: Array<{ entry: number; assetId: string; postRef: string | null; sha256: string; text: string }>;
};

function entry(asset: WorkflowAsset, status: AssetStatus, reason: AssetReason | null, duplicateOf: string | null = null): ManifestEntry {
  return { asset, status, reason, duplicateOf, profileRef: null, approval: { status: "pending" } };
}

/** Stage 1: batch and per-file checks, explicit post matching, per-post limits and duplicate detection. No JSON parsing. */
export function stageCheckFiles(input: AssetBatchInput): Stage1 {
  if (!input || !Number.isInteger(input.week) || input.week < 1 || input.week > 16) throw new Error("[INVALID_BATCH] week must be an integer from 1 to 16");
  if (!Array.isArray(input.assets)) throw new Error("[INVALID_BATCH] assets must be an array");
  const known = Array.isArray(input.knownPostRefs) ? new Set(input.knownPostRefs) : null;
  const entries: ManifestEntry[] = [];
  const workflows: Stage1["workflows"] = [];
  const perPost = new Map<string, number>();
  const firstBySha = new Map<string, string>();
  const idUses = new Map<string, number>();

  input.assets.forEach((raw, idx) => {
    const a = (raw && typeof raw === "object" ? raw : {}) as AssetInput;
    const rawRef = a.postRef ?? null;
    const refValid = rawRef === null || (typeof rawRef === "string" && ID_RE.test(rawRef));
    const uploadedAt = typeof a.uploadedAt === "string" && ISO_RE.test(a.uploadedAt) ? a.uploadedAt : null;
    const filename = safeFilename(a.originalFilename);
    const makeAsset = (kind: WorkflowAsset["kind"], mimeType: string, sizeBytes: number, sha: string | null, postRef: string | null): WorkflowAsset => {
      const base = [sha ?? "no-hash", postRef ?? "", filename, kind].join("|");
      const k = (idUses.get(base) ?? 0) + 1;
      idUses.set(base, k);
      return {
        schemaVersion: "1.0", week: input.week, postRef, assetId: "asset_" + sha256OfText(base + "|" + k).slice(0, 16),
        kind, originalFilename: filename, mimeType: mimeType.slice(0, 80), sizeBytes, sha256: sha, uploadedAt,
      };
    };

    if (idx >= ASSET_LIMITS.assetsPerBatch) { entries.push(entry(makeAsset("n8n_workflow_json", "", 0, null, null), "REJECTED", "BATCH_LIMIT_EXCEEDED")); return; }
    const f = checkFile(a);
    const kind = f.kind ?? "n8n_workflow_json";
    if (!refValid || typeof a.originalFilename !== "string") { entries.push(entry(makeAsset(kind, f.mimeType, f.sizeBytes, f.sha256, null), "REJECTED", "INVALID_ASSET_METADATA")); return; }
    if (!f.ok) { entries.push(entry(makeAsset(kind, f.mimeType, f.sizeBytes, f.sha256, null), "REJECTED", f.reason)); return; }

    // Explicit association only: no post reference, or one that is not a known post, is never guessed.
    const matched = rawRef !== null && (!known || known.has(rawRef));
    const postRef = matched ? rawRef : null;
    const asset = makeAsset(f.kind, f.mimeType, f.sizeBytes, f.sha256, postRef);

    const dupKey = f.kind + ":" + f.sha256;
    const first = firstBySha.get(dupKey);
    if (first) { entries.push(entry(asset, "DUPLICATE", "DUPLICATE_CONTENT", first)); return; }

    if (postRef) {
      const key = postRef + ":" + f.kind;
      const used = (perPost.get(key) ?? 0) + 1;
      const cap = f.kind === "n8n_workflow_json" ? ASSET_LIMITS.workflowsPerPost : ASSET_LIMITS.screenshotsPerPost;
      if (used > cap) { entries.push(entry(asset, "REJECTED", "TOO_MANY_FILES_FOR_POST")); return; }
      perPost.set(key, used);
    }
    firstBySha.set(dupKey, asset.assetId);

    const status: AssetStatus = matched ? "VALIDATED" : "UNMATCHED_ASSET";
    const reason: AssetReason | null = matched ? null : rawRef === null ? "NO_POST_REFERENCE" : "UNKNOWN_POST_REFERENCE";
    entries.push(entry(asset, status, reason));
    if (f.kind === "n8n_workflow_json") workflows.push({ entry: entries.length - 1, assetId: asset.assetId, postRef, sha256: f.sha256, text: f.text! });
  });
  return { week: input.week, entries, workflows };
}

export type Stage2 = {
  week: number;
  entries: ManifestEntry[];
  sanitized: Array<{ entry: number; assetId: string; postRef: string | null; sha256: string; workflow: SanitizedWorkflow; security: SecurityReport }>;
};

/** Stage 2: bounded JSON parse, n8n structure check, security scan and sanitization. Raw text is dropped here. */
export function stageSanitize(s: Stage1): Stage2 {
  const entries = s.entries.map((e) => ({ ...e }));
  const sanitized: Stage2["sanitized"] = [];
  s.workflows.forEach((w) => {
    const parsed = parseWorkflowText(w.text);
    if (!parsed.ok) { entries[w.entry] = { ...entries[w.entry], status: "REJECTED", reason: parsed.reason }; return; }
    const r = sanitizeWorkflow(parsed.value);
    if (!r.ok) { entries[w.entry] = { ...entries[w.entry], status: "REJECTED", reason: r.reason }; return; }
    sanitized.push({ entry: w.entry, assetId: w.assetId, postRef: w.postRef, sha256: w.sha256, workflow: r.workflow, security: r.security });
  });
  return { week: s.week, entries, sanitized };
}

export type Stage3 = { week: number; entries: ManifestEntry[]; profiles: WorkflowProfile[] };

/** Stage 3: graph extraction and deterministic profiling. */
export function stageProfile(s: Stage2): Stage3 {
  const entries = s.entries.map((e) => ({ ...e }));
  const profiles: WorkflowProfile[] = [];
  s.sanitized.forEach((w) => {
    const r = buildProfile({ assetId: w.assetId, postRef: w.postRef, sha256: w.sha256, workflow: w.workflow, security: w.security });
    if (!r.ok) { entries[w.entry] = { ...entries[w.entry], status: "REJECTED", reason: r.reason }; return; }
    profiles.push(r.profile);
    const e = entries[w.entry];
    entries[w.entry] = { ...e, profileRef: r.profile.profileId, status: e.status === "UNMATCHED_ASSET" ? "UNMATCHED_ASSET" : "PROFILED" };
  });
  return { week: s.week, entries, profiles };
}

/** Stage 4: the manifest and profiles handed downstream. */
export function stageAssemble(s: Stage3): { manifest: AssetManifest; profiles: WorkflowProfile[] } {
  const count = (st: AssetStatus) => s.entries.filter((e) => e.status === st).length;
  const manifest: AssetManifest = {
    schemaVersion: "2.0",
    week: s.week,
    assets: s.entries,
    summary: { total: s.entries.length, profiled: count("PROFILED"), validated: count("VALIDATED"), rejected: count("REJECTED"), duplicates: count("DUPLICATE"), unmatched: count("UNMATCHED_ASSET") },
  };
  const profiles = [...s.profiles].sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));
  return { manifest, profiles };
}

export function processAssetBatch(input: AssetBatchInput) {
  return stageAssemble(stageProfile(stageSanitize(stageCheckFiles(input))));
}
