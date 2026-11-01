// Private weekly asset intake: real post screenshots and workflow JSON → the n8n Data Table `newsletter_assets`.
// Usage (from web/): npm run assets:upload -- --week 2 --manifest <path/to/manifest.json> [--dry-run] [--skip-post-check]
// Post ids are checked against the links in the latest finished issue for the week; --skip-post-check is for tests.
//
// The manifest maps every file to a Yellowdig post id explicitly (format in docs/newsletter-generator.md).
// Workflow JSON is validated, sanitized and profiled by the same shared code as workflow 03 and is never executed;
// only the manifest and profiles are stored, never the workflow file. Each post's screenshot is re-encoded with
// sharp (metadata stripped, max 1088px wide) and stored as a data URI. Existing rows for the week are replaced.
// Files stay where they are; keep them outside the repository. N8N_API_KEY is read from .env.local, never printed.
import { readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, resolve, sep } from "node:path";
import sharp from "sharp";
import { processAssetBatch, type AssetInput } from "../src/lib/assets";
import { INTAKE_LIMITS, INTAKE_TABLE, parseIntakeManifest, type AssetRow, type IntakeAsset } from "../src/lib/assets/intake";
import { readLocalEnv } from "./env-config";
import { REPO_ROOT } from "./schemas";

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json" };

function arg(name: string): string | null {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

/**
 * The week's real post ids, read from the links in the latest finished issue for the week (newsletter_runs). Used to
 * refuse assets mapped to a post that is not in the week. Returns null when no finished issue exists yet.
 */
async function knownPostIds(week: number): Promise<string[] | null> {
  const f = encodeURIComponent(JSON.stringify({ type: "and", filters: [{ columnName: "week", condition: "eq", value: week }] }));
  const rows = ((await api("/data-tables/uWls7HHm5Ek7u1SQ/rows?limit=100&sortBy=" + encodeURIComponent("updatedAt:desc") + "&filter=" + f)) as { data: Array<{ status?: string; html?: string }> }).data;
  const done = rows.find((r) => (r.status === "ready" || r.status === "ready_with_omissions") && typeof r.html === "string" && !r.html.includes("Synthetic test issue."));
  if (!done) return null;
  return [...new Set([...done.html!.matchAll(/[?&]postId=([A-Za-z0-9._:-]+)/g)].map((m) => m[1]))];
}

/** Re-encodes to JPEG at display resolution (2× the 544px column), dropping EXIF, GPS and other metadata. */
async function optimize(buf: Buffer): Promise<string> {
  for (const [width, quality] of [[1088, 72], [960, 62], [800, 55]] as const) {
    const out = await sharp(buf, { limitInputPixels: 60_000_000 }).rotate().resize({ width, withoutEnlargement: true }).flatten({ background: "#FFFFFF" }).jpeg({ quality, mozjpeg: true }).toBuffer();
    const uri = "data:image/jpeg;base64," + out.toString("base64");
    if (uri.length <= INTAKE_LIMITS.imageDataUriBytes) return uri;
  }
  throw new Error("[IMAGE_TOO_LARGE] a screenshot stays over the size limit after re-encoding");
}

/** Images stored per post for the image curator to choose from (all validated images still count in the metrics). */
const STORED_PER_POST = 2;

/** The images stored for each post: hero first, then those marked spotlight, then in manifest order. */
function featured<T extends { a: IntakeAsset }>(images: T[]): T[] {
  const rank = (a: IntakeAsset) => (a.role === "hero" ? 0 : a.role === "spotlight" ? 1 : 2);
  const byPost = new Map<string, T[]>();
  images.forEach((x) => byPost.set(x.a.postId, [...(byPost.get(x.a.postId) ?? []), x]));
  return [...byPost.values()].flatMap((list) => list.map((x, i) => ({ x, i })).sort((p, q) => rank(p.x.a) - rank(q.x.a) || p.i - q.i).slice(0, STORED_PER_POST).map((y) => y.x));
}

async function api(path: string, init: RequestInit = {}) {
  const env = readLocalEnv() ?? {};
  const base = (env.N8N_BASE_URL ?? "").replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  if (!env.N8N_API_KEY || !/^https:\/\/[a-z0-9.-]+$/i.test(base)) throw new Error("N8N_API_KEY and an https N8N_BASE_URL must be configured in .env.local");
  const r = await fetch(base + "/api/v1" + path, { ...init, headers: { "X-N8N-API-KEY": env.N8N_API_KEY, accept: "application/json", "content-type": "application/json" } });
  if (!r.ok) throw new Error("n8n API " + (init.method ?? "GET") + " " + path.split("?")[0] + " failed: HTTP " + r.status);
  return r.json() as Promise<unknown>;
}

async function main() {
  const week = Number(arg("week"));
  const manifestPath = arg("manifest");
  const dry = process.argv.includes("--dry-run");
  if (!Number.isInteger(week) || week < 1 || week > 5 || !manifestPath) throw new Error("usage: assets-upload.ts --week <1-5> --manifest <manifest.json> [--dry-run]");
  const root = dirname(resolve(manifestPath));
  if ((root + sep).startsWith(resolve(REPO_ROOT) + sep)) throw new Error("[PRIVATE_FILES_IN_REPO] keep real screenshots and workflow files outside the repository");
  const manifest = parseIntakeManifest(JSON.parse(readFileSync(manifestPath, "utf8")), week);

  const inputs: AssetInput[] = [];
  const images: Array<{ a: IntakeAsset; buf: Buffer; index: number }> = [];
  manifest.assets.forEach((a) => {
    const file = resolve(root, a.path);
    if (!file.startsWith(root + sep)) throw new Error("[INVALID_MANIFEST] a path leaves the manifest folder");
    if (!statSync(file).isFile()) throw new Error("[INVALID_MANIFEST] not a file: " + a.path);
    const buf = readFileSync(file);
    const mimeType = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
    if (a.kind === "workflow_json") inputs.push({ postRef: a.postId, originalFilename: basename(file), mimeType, contentText: buf.toString("utf8") });
    else { images.push({ a, buf, index: inputs.length }); inputs.push({ postRef: a.postId, originalFilename: basename(file), mimeType, contentBase64: buf.toString("base64") }); }
  });

  // Same validation and static profiling as workflow 03. Workflow JSON is parsed as data only.
  const known = process.argv.includes("--skip-post-check") ? null : await knownPostIds(week);
  if (!known && !process.argv.includes("--skip-post-check")) throw new Error("[POSTS_UNKNOWN] no finished Week " + week + " issue to check post ids against; generate the week once first");
  const { manifest: assetManifest, profiles } = processAssetBatch({ week, knownPostRefs: known, assets: inputs });
  const entries = assetManifest.assets;
  const count = (st: string) => entries.filter((e) => e.status === st).length;
  const reasons = entries.filter((e) => e.reason).reduce<Record<string, number>>((m, e) => ((m[e.reason!] = (m[e.reason!] ?? 0) + 1), m), {});

  // Ambiguous mappings stop the upload: unknown posts, one file mapped to two posts, or two workflow files for one post.
  const ambiguous: string[] = [];
  if (count("UNMATCHED_ASSET")) ambiguous.push(count("UNMATCHED_ASSET") + " asset(s) mapped to a post id that is not in Week " + week);
  const byId = new Map(entries.map((e) => [e.asset.assetId, e]));
  const crossPost = entries.filter((e) => e.status === "DUPLICATE" && e.duplicateOf && byId.get(e.duplicateOf)?.asset.postRef !== e.asset.postRef).length;
  if (crossPost) ambiguous.push(crossPost + " identical file(s) mapped to different posts");
  const wfPerPost = entries.filter((e) => e.asset.kind === "n8n_workflow_json" && e.status === "PROFILED").reduce<Record<string, number>>((m, e) => ((m[e.asset.postRef ?? ""] = (m[e.asset.postRef ?? ""] ?? 0) + 1), m), {});
  const multiWf = Object.values(wfPerPost).filter((n) => n > 1).length;
  if (multiWf) ambiguous.push(multiWf + " post(s) with more than one workflow file");

  const okImages = images.filter((x) => entries[x.index]?.status === "VALIDATED");
  const rows: AssetRow[] = [{ week, kind: "bundle", post_id: "", role: "", alt: "", payload: JSON.stringify({ manifest: assetManifest, profiles, coverageComplete: manifest.coverageComplete }), source: "private_asset_store" }];
  let stripped = 0;
  for (const x of featured(okImages)) {
    const payload = await optimize(x.buf);
    const meta = await sharp(Buffer.from(payload.split(",")[1], "base64")).metadata();
    if (!meta.exif && !meta.icc && !meta.xmp && !meta.iptc) stripped++;
    const assetId = entries[x.index].asset.assetId;
    rows.push({ week, kind: "image", post_id: x.a.postId, role: x.a.role, alt: x.a.altText, payload, asset_id: assetId, width: meta.width ?? 0, height: meta.height ?? 0, source: "private_asset_store" });
  }

  // Counts only: no file names, contents or post text are printed.
  console.log(JSON.stringify({
    week, postsInWeek: known?.length ?? "not checked", coverageComplete: manifest.coverageComplete, assets: entries.length,
    accepted: count("PROFILED") + count("VALIDATED"), workflowFilesProfiled: count("PROFILED"), imagesValidated: count("VALIDATED"),
    rejected: count("REJECTED"), duplicates: count("DUPLICATE"), unmatched: count("UNMATCHED_ASSET"), rejectedReasons: reasons,
    postsWithWorkflowFile: Object.keys(wfPerPost).length, postsWithImage: new Set(rows.filter((r) => r.kind === "image").map((r) => r.post_id)).size, imagesStored: rows.length - 1, hero: rows.some((r) => r.role === "hero"),
    imagesMetadataStripped: stripped + "/" + (rows.length - 1), storedBytes: rows.reduce((t, r) => t + r.payload.length, 0),
  }, null, 1));
  if (ambiguous.length) throw new Error("[AMBIGUOUS_MAPPING] " + ambiguous.join("; ") + ". Fix the manifest; nothing was uploaded.");
  if (dry) { console.log("dry run: nothing uploaded"); return; }

  const tables = (await api("/data-tables?limit=100")) as { data: Array<{ id: string; name: string }> };
  const table = tables.data.find((t) => t.name === INTAKE_TABLE);
  if (!table) throw new Error("Data Table " + INTAKE_TABLE + " not found");
  const filter = encodeURIComponent(JSON.stringify({ type: "and", filters: [{ columnName: "week", condition: "eq", value: week }] }));
  await api("/data-tables/" + table.id + "/rows/delete?filter=" + filter, { method: "DELETE" });
  for (const row of rows) await api("/data-tables/" + table.id + "/rows", { method: "POST", body: JSON.stringify({ data: [row], returnType: "count" }) });
  console.log("uploaded", rows.length, "rows to", INTAKE_TABLE, "(previous week " + week + " rows replaced)");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
