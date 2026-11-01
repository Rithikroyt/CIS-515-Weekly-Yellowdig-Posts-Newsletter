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
export type IntakeManifest = { week: number; assets: IntakeAsset[] };

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
  if (!Array.isArray(m.assets) || !m.assets.length) fail("assets must be a non-empty array");
  const list = m.assets as unknown[];
  if (list.length > INTAKE_LIMITS.assets) fail("at most " + INTAKE_LIMITS.assets + " assets per week");
  let heroes = 0;
  const assets = list.map((x, i) => {
    const a = (x && typeof x === "object" ? x : fail("asset " + i + " is not an object")) as Record<string, unknown>;
    const postId = bareId(a.postRef) ?? fail("asset " + i + ": postRef must be the Yellowdig post id");
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
  return { week, assets };
}

/** One row of the newsletter_assets table. */
export type AssetRow = { week: number; kind: "bundle" | "image"; post_id: string; role: string; alt: string; payload: string };

export type WeekAssets = {
  /** null when nothing was uploaded for the week: coverage is then unknown, not zero. */
  manifest: AssetManifest | null;
  profiles: WorkflowProfile[];
  images: Record<string, { src: string; alt: string }>;
  hero: { src: string; alt: string } | null;
};

/**
 * Reads the week's rows back (workflow 05). Rows are private data written by the intake script, still treated as
 * untrusted: the bundle must parse and match its schema shape, and images must be base64 data URIs of an allowed type.
 */
export function collectWeekAssets(rows: unknown[], week: number): WeekAssets {
  const mine = rows.filter((r): r is AssetRow => !!r && typeof r === "object" && (r as AssetRow).week === week);
  const bundle = mine.find((r) => r.kind === "bundle");
  let manifest: AssetManifest | null = null, profiles: WorkflowProfile[] = [];
  if (bundle) {
    try {
      const b = JSON.parse(String(bundle.payload)) as { manifest?: AssetManifest; profiles?: WorkflowProfile[] };
      if (b.manifest && b.manifest.week === week && Array.isArray(b.manifest.assets) && Array.isArray(b.profiles)) { manifest = b.manifest; profiles = b.profiles; }
    } catch { /* an unreadable bundle is ignored: coverage stays unknown */ }
    if (!manifest) throw new Error("[ASSETS_INVALID] the stored asset bundle for week " + week + " could not be read");
  }
  const images: WeekAssets["images"] = {};
  let hero: WeekAssets["hero"] = null;
  for (const r of mine) {
    if (r.kind !== "image" || typeof r.payload !== "string" || !IMAGE_RE.test(r.payload) || r.payload.length > INTAKE_LIMITS.imageDataUriBytes) continue;
    const id = bareId(r.post_id);
    if (!id) continue;
    const img = { src: r.payload, alt: String(r.alt ?? "").slice(0, INTAKE_LIMITS.altChars) };
    if (r.role === "hero") hero = img;
    if (!images["post:" + id] || r.role === "spotlight") images["post:" + id] = img;
  }
  return { manifest, profiles, images, hero };
}
