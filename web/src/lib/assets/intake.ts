// Private weekly asset intake: the manifest format for scripts/assets-upload.ts and the rows it writes to the
// n8n Data Table `newsletter_assets`, read back by workflow 05. Pure: no file system, no network, no image codecs.
// Every asset is mapped to a post explicitly by its Yellowdig post id; nothing is matched by name or guessed.
import type { AssetManifest, WorkflowProfile } from "../contracts";

export const INTAKE_TABLE = "newsletter_assets";
export const INTAKE_LIMITS = { assets: 100, altChars: 200, imageDataUriBytes: 600_000 } as const;
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export type IntakeKind = "workflow_json" | "post_image";
export type IntakeRole = "hero" | "spotlight" | "supporting";
export type IntakeAsset = { postId: string; kind: IntakeKind; path: string; role: IntakeRole; altText: string };
/** coverageComplete: the manifest lists every image and workflow file of the week (default false: a subset). */
export type IntakeManifest = { week: number; coverageComplete: boolean; assets: IntakeAsset[] };

const fail = (why: string): never => { throw new Error("[INVALID_MANIFEST] " + why); };

/** Accepts "abc-123" or "post:abc-123"; returns the bare Yellowdig post id. */
export function bareId(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  const id = ref.startsWith("post:") ? ref.slice(5) : ref;
  return ID_RE.test(id) && !id.startsWith("post:") ? id : null;
}

/** Validates the manifest JSON. Paths must be relative and stay inside the manifest's folder. */
export function parseIntakeManifest(raw: unknown, week: number): IntakeManifest {
  const m = (raw && typeof raw === "object" ? raw : fail("manifest must be a JSON object")) as Record<string, unknown>;
  if (m.week !== week) fail("manifest week " + String(m.week) + " does not match --week " + week);
  if (m.coverageComplete !== undefined && typeof m.coverageComplete !== "boolean") fail("coverageComplete must be true or false");
  if (!Array.isArray(m.assets) || !m.assets.length) fail("assets must be a non-empty array");
  const list = m.assets as unknown[];
  if (list.length > INTAKE_LIMITS.assets) fail("at most " + INTAKE_LIMITS.assets + " assets per week");
  let heroes = 0;
  const assets = list.map((x, i) => {
    const a = (x && typeof x === "object" ? x : fail("asset " + i + " is not an object")) as Record<string, unknown>;
    if (a.postId !== undefined && a.postRef !== undefined) fail("asset " + i + ": give postId or postRef, not both");
    const postId = bareId(a.postId ?? a.postRef) ?? fail("asset " + i + ": postId must be the Yellowdig post id");
    const kind = a.kind === "workflow_json" || a.kind === "post_image" ? a.kind : fail("asset " + i + ": kind must be workflow_json or post_image");
    const path = typeof a.path === "string" ? a.path.replace(/\\/g, "/") : fail("asset " + i + ": path is required");
    if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.split("/").includes("..")) fail("asset " + i + ": path must be relative to the manifest, without ..");
    const role = a.role === undefined ? "supporting" : a.role === "hero" || a.role === "spotlight" || a.role === "supporting" ? a.role : fail("asset " + i + ": role must be hero, spotlight or supporting");
    if (role === "hero") heroes++;
    const altText = typeof a.altText === "string" ? a.altText.trim() : "";
    if (kind === "post_image" && (altText.length < 8 || altText.length > INTAKE_LIMITS.altChars)) fail("asset " + i + ": altText must describe the screenshot in 8 to " + INTAKE_LIMITS.altChars + " characters");
    if (kind === "workflow_json" && role === "hero") fail("asset " + i + ": only a post_image can be the hero");
    return { postId, kind, path, role, altText } as IntakeAsset;
  });
  if (heroes > 1) fail("at most one hero image");
  return { week, coverageComplete: m.coverageComplete === true, assets };
}

/** One row of the newsletter_assets table. */
export type AssetRow = {
  week: number; kind: "bundle" | "image"; post_id: string; role: string; alt: string; payload: string;
  asset_id?: string; width?: number; height?: number; source?: string;
};

// ---------- Canonical assets: one shape whatever the source ----------

export type AssetSource = "yellowdig_attachment" | "private_asset_store";

/** A real image attached to a post. Bytes are in WeekAssets.bank under the same assetRef, never in this record. */
export type CanonicalImage = {
  assetRef: string; postRef: string; kind: "image"; source: AssetSource;
  mimeType: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number; role: IntakeRole; altText: string;
};

export type WeekAssets = {
  /** null when no source supplied anything for the week: coverage is then unknown, not zero. */
  manifest: AssetManifest | null;
  profiles: WorkflowProfile[];
  /**
   * True only when the source says it holds every image and workflow file of the week. Otherwise the week-level
   * file and image totals are unknown and render as a dash, even though individual images can still be shown.
   */
  coverageComplete: boolean;
  images: CanonicalImage[];
  /** assetRef → data:image/...;base64 URI. */
  bank: Record<string, string>;
  /** Which sources contributed, and why a source contributed nothing. */
  sources: Array<{ source: AssetSource; available: boolean; reason: string }>;
};

export const NO_ASSETS: WeekAssets = { manifest: null, profiles: [], coverageComplete: false, images: [], bank: {}, sources: [] };
const ASSET_ID_RE = /^asset_[A-Za-z0-9_-]{1,58}$/;

/**
 * Adapter: Yellowdig post attachments. VERIFIED 2026-11-01 against every event the API key can read (819 events):
 * the events API has no attachment, media, file or URL field and post bodies are plain text. Until a sanctioned
 * attachment source exists, this adapter reports itself unavailable rather than guessing.
 */
export function yellowdigAttachmentAdapter(): { assets: WeekAssets | null; status: WeekAssets["sources"][number] } {
  return { assets: null, status: { source: "yellowdig_attachment", available: false, reason: "the Yellowdig events API exposes no attachments (verified 2026-11-01)" } };
}

/**
 * Adapter: the private asset store (newsletter_assets rows written by scripts/assets-upload.ts). Rows are private but
 * still untrusted: the bundle must parse and match the week, images must be base64 data URIs of an allowed type
 * with a valid asset id and dimensions.
 */
export function privateAssetStoreAdapter(rows: unknown[], week: number): { assets: WeekAssets | null; status: WeekAssets["sources"][number] } {
  const mine = rows.filter((r): r is AssetRow => !!r && typeof r === "object" && (r as AssetRow).week === week);
  const bundle = mine.find((r) => r.kind === "bundle");
  if (!bundle) return { assets: null, status: { source: "private_asset_store", available: false, reason: "no assets uploaded for week " + week } };
  let manifest: AssetManifest | null = null, profiles: WorkflowProfile[] = [], coverageComplete = false;
  try {
    const b = JSON.parse(String(bundle.payload)) as { manifest?: AssetManifest; profiles?: WorkflowProfile[]; coverageComplete?: unknown };
    if (b.manifest && b.manifest.week === week && Array.isArray(b.manifest.assets) && Array.isArray(b.profiles)) { manifest = b.manifest; profiles = b.profiles; coverageComplete = b.coverageComplete === true; }
  } catch { /* handled below */ }
  if (!manifest) throw new Error("[ASSETS_INVALID] the stored asset bundle for week " + week + " could not be read");
  const images: CanonicalImage[] = [];
  const bank: Record<string, string> = {};
  for (const r of mine) {
    if (r.kind !== "image" || typeof r.payload !== "string" || !IMAGE_RE.test(r.payload) || r.payload.length > INTAKE_LIMITS.imageDataUriBytes) continue;
    const id = bareId(r.post_id);
    const w = Number(r.width), h = Number(r.height);
    if (!id || typeof r.asset_id !== "string" || !ASSET_ID_RE.test(r.asset_id) || !(w > 0 && h > 0)) continue;
    const assetRef = "asset:" + r.asset_id;
    if (bank[assetRef]) continue;
    bank[assetRef] = r.payload;
    const role: IntakeRole = r.role === "hero" || r.role === "spotlight" ? r.role : "supporting";
    images.push({
      assetRef, postRef: "post:" + id, kind: "image", source: "private_asset_store", mimeType: r.payload.slice(5, r.payload.indexOf(";")) as CanonicalImage["mimeType"],
      width: Math.round(w), height: Math.round(h), role, altText: String(r.alt ?? "").slice(0, INTAKE_LIMITS.altChars),
    });
  }
  return { assets: { manifest, profiles, coverageComplete, images, bank, sources: [] }, status: { source: "private_asset_store", available: true, reason: images.length + " stored images" } };
}

/**
 * Combines the sources. Priority: a post's Yellowdig attachments when available, otherwise its private-store assets.
 * Both arrive in the same canonical shape, so everything downstream is source-agnostic.
 */
export function mergeAssetSources(...parts: Array<{ assets: WeekAssets | null; status: WeekAssets["sources"][number] }>): WeekAssets {
  const out: WeekAssets = { manifest: null, profiles: [], coverageComplete: false, images: [], bank: {}, sources: parts.map((p) => p.status) };
  const claimed = new Set<string>();
  for (const { assets } of parts) {
    if (!assets) continue;
    if (!out.manifest) { out.manifest = assets.manifest; out.profiles = assets.profiles; out.coverageComplete = assets.coverageComplete; }
    const fresh = assets.images.filter((i) => !claimed.has(i.postRef) || out.images.some((x) => x.postRef === i.postRef && x.source === i.source));
    fresh.forEach((i) => { out.images.push(i); out.bank[i.assetRef] = assets.bank[i.assetRef]; });
    new Set(fresh.map((i) => i.postRef)).forEach((r) => claimed.add(r));
  }
  return out;
}

/** Workflow 05: the week's assets from every source, in canonical form. */
export function collectWeekAssets(rows: unknown[], week: number): WeekAssets {
  return mergeAssetSources(yellowdigAttachmentAdapter(), privateAssetStoreAdapter(rows, week));
}
