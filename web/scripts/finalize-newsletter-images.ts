// Inserts real class images into a generated newsletter, on this computer only. Nothing is uploaded: no AI, no
// cloud storage, no n8n, no Vercel. The professor added class photos to the final HTML by hand for the same reason.
//
// Usage (from web/):
//   npm run newsletter:finalize-images -- --html <issue.html> --assets <folder> [--out <final.html>] [--pdf <final.pdf>]
//
// <folder>/images.json maps files (relative to the folder) to slots. Keys are a slot id ("hero", "spotlight-1" …) or
// a spotlight's post ref ("post:…"); list the slots of an issue with --list.
//   { "hero": { "file": "hero.png", "from": "spotlight-2", "alt": "…" },
//     "spotlights": { "spotlight-1": "canvas.png", "post:abc": { "file": "run.jpg", "alt": "…" } } }
// Keep the folder, the manifest and the finished HTML outside the repository (the script refuses paths inside it,
// except the git-ignored visual-compare/ folder).
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { defaultAlt, fillSlots, findSlots, type SlotImage } from "../src/lib/render/finalize";
import { prepareLocalImage } from "../src/lib/render/local-images";
import { REPO_ROOT } from "./schemas";

type Entry = string | { file: string; alt?: string; from?: string };

function arg(name: string): string | null {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

const repo = resolve(REPO_ROOT) + sep;
const allowedInRepo = resolve(REPO_ROOT, "visual-compare") + sep;
const outsideRepo = (p: string) => { const r = resolve(p) + sep; return !r.startsWith(repo) || r.startsWith(allowedInRepo); };

async function main() {
  const htmlPath = arg("html");
  if (!htmlPath) throw new Error("usage: finalize-newsletter-images.ts --html <issue.html> --assets <folder> [--out <final.html>] [--pdf <final.pdf>] | --html <issue.html> --list");
  const html = readFileSync(htmlPath, "utf8");
  const slots = findSlots(html);
  if (process.argv.includes("--list")) {
    slots.forEach((s) => console.log(s.slot.padEnd(13), s.postRef ?? "", s.author ? "· " + s.author : "", s.title ? "· " + s.title : ""));
    return;
  }
  const assets = arg("assets");
  if (!assets) throw new Error("--assets <folder> is required");
  const root = resolve(assets);
  if (!outsideRepo(join(root, "x"))) throw new Error("[PRIVATE_FILES_IN_REPO] keep class images outside the repository");
  const manifest = JSON.parse(readFileSync(arg("manifest") ?? join(root, "images.json"), "utf8")) as { hero?: Entry; spotlights?: Record<string, Entry> };
  const out = arg("out") ?? htmlPath.replace(/\.html?$/i, "") + "-final.html";
  if (!outsideRepo(out)) throw new Error("[PRIVATE_FILES_IN_REPO] write the finished issue outside the repository (or under visual-compare/)");

  const file = (e: Entry) => (typeof e === "string" ? e : e.file);
  const load = async (key: string, e: Entry): Promise<SlotImage> => {
    const p = resolve(root, file(e));
    if (!p.startsWith(root + sep)) throw new Error("[INVALID_MANIFEST] " + key + ": the file must be inside the assets folder");
    if (!existsSync(p) || !statSync(p).isFile()) throw new Error("[INVALID_MANIFEST] " + key + ": file not found");
    const img = await prepareLocalImage(readFileSync(p));
    const slot = slots.find((s) => s.slot === key || s.postRef === key) ?? null;
    const alt = typeof e === "object" && e.alt ? e.alt.slice(0, 200) : defaultAlt(slot);
    console.log(key.padEnd(13), img.format, img.width + "x" + img.height, Math.round(img.bytes / 1024) + " KB, metadata stripped");
    return { src: img.src, alt };
  };

  const images: Record<string, SlotImage> = {};
  if (manifest.hero) images.hero = await load("hero", manifest.hero);
  for (const [key, e] of Object.entries(manifest.spotlights ?? {})) images[key] = await load(key, e);
  const heroFrom = typeof manifest.hero === "object" ? manifest.hero.from ?? null : null;
  const r = fillSlots(html, { images, heroFrom });
  if (r.unknown.length) throw new Error("[UNKNOWN_SLOT] not in this issue: " + r.unknown.join(", ") + " (use --list)");
  writeFileSync(out, r.html);
  console.log("filled:", r.filled.join(", ") || "none", "| left empty:", r.missing.join(", ") || "none", "| wrote", out);

  const pdf = arg("pdf");
  if (pdf) {
    if (!outsideRepo(pdf)) throw new Error("[PRIVATE_FILES_IN_REPO] write the PDF outside the repository (or under visual-compare/)");
    const { htmlToPdf } = await import("../src/lib/server/pdf");
    writeFileSync(pdf, await htmlToPdf(r.html));
    console.log("wrote", pdf, "(scripts off, network blocked; needs CHROME_EXECUTABLE_PATH)");
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
