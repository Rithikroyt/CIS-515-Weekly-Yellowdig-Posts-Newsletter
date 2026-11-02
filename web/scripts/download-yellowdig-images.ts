// Downloads original Yellowdig attachment images to this computer, for the local image finalizer. Nothing is
// uploaded anywhere and no credential, cookie or session is sent: attachment URLs open without logging in.
//
// The Yellowdig GraphQL endpoint that lists a post's attachments needs a browser session (tested 2026-11-01: the API
// key is ignored and it answers 404 "user not found"), so the URLs are copied by hand: open the post, right-click
// each image, "Copy image address".
//
// Usage (from web/):
//   npm run newsletter:download-images -- --urls <urls.json> --out <folder> [--html <issue.html>]
// urls.json: { "spotlight-1": "https://…", "spotlight-2": ["https://…", "https://…"], "hero": "https://…" }
// Files are saved unchanged as spotlight-1.png (or spotlight-1-1.png, spotlight-1-2.png …). images.json in the same
// folder is created or updated to use the first image of each slot, ready for `npm run newsletter:finalize-images`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { downloadAsset } from "../src/lib/assets/remote-download";
import { SLOT_ID, isAllowedAssetUrl, localName } from "../src/lib/assets/remote-image";
import { findSlots } from "../src/lib/render/finalize";
import { REPO_ROOT } from "./schemas";

function arg(name: string): string | null {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

async function main() {
  const urlsPath = arg("urls"), outDir = arg("out");
  if (!urlsPath || !outDir) throw new Error("usage: download-yellowdig-images.ts --urls <urls.json> --out <folder> [--html <issue.html>]");
  const out = resolve(outDir);
  if ((out + sep).startsWith(resolve(REPO_ROOT) + sep)) throw new Error("[PRIVATE_FILES_IN_REPO] keep class images outside the repository");
  const raw = JSON.parse(readFileSync(urlsPath, "utf8")) as Record<string, string | string[]>;
  const slots = arg("html") ? new Set(findSlots(readFileSync(arg("html")!, "utf8")).map((s) => s.slot)) : null;
  for (const key of Object.keys(raw)) {
    if (!SLOT_ID.test(key)) throw new Error("[INVALID_URLS] " + key + ": keys must be hero or spotlight-<n>");
    if (slots && !slots.has(key)) throw new Error("[UNKNOWN_SLOT] " + key + " is not a slot in this issue");
    const list = Array.isArray(raw[key]) ? (raw[key] as string[]) : [raw[key] as string];
    if (!list.length || list.some((u) => typeof u !== "string" || !isAllowedAssetUrl(u))) throw new Error("[URL_NOT_ALLOWED] " + key + ": every URL must be https on a yellowdig.app host");
  }
  mkdirSync(out, { recursive: true });

  const first: Record<string, string> = {};
  for (const [slot, value] of Object.entries(raw)) {
    const list = Array.isArray(value) ? value : [value];
    for (let i = 0; i < list.length; i++) {
      const { buf, host, kind } = await downloadAsset(list[i]);
      const name = localName(slot, i, list.length, kind.ext);
      writeFileSync(join(out, name), buf);
      if (i === 0) first[slot] = name;
      // Only the slot, file name, type, size and host are printed: never the URL.
      console.log(slot.padEnd(13), name.padEnd(20), kind.mime.padEnd(11), Math.round(buf.length / 1024) + " KB", "from", host);
    }
  }

  // images.json: point each slot at its first image; keep alt text and the hero's "from" if already set.
  const manifestPath = join(out, "images.json");
  const m = (existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {}) as { hero?: string | { file: string; from?: string; alt?: string }; spotlights?: Record<string, string | { file: string; alt?: string }> };
  m.spotlights ??= {};
  for (const [slot, name] of Object.entries(first)) {
    if (slot === "hero") { m.hero = typeof m.hero === "object" ? { ...m.hero, file: name } : { file: name, from: "spotlight-1" }; continue; }
    const cur = m.spotlights[slot];
    m.spotlights[slot] = typeof cur === "object" ? { ...cur, file: name } : name;
  }
  // Without a separate hero image, the hero reuses the first image of the spotlight named in "from" (default spotlight-1).
  if (!first.hero) {
    const from = typeof m.hero === "object" && m.hero.from ? m.hero.from : "spotlight-1";
    const heroFile = typeof m.hero === "object" ? m.hero.file : m.hero;
    if (first[from] && (!heroFile || !existsSync(join(out, heroFile)))) m.hero = { ...(typeof m.hero === "object" ? m.hero : {}), file: first[from], from };
  }
  writeFileSync(manifestPath, JSON.stringify(m, null, 2) + "\n");
  console.log("saved to", out, "| images.json updated | nothing was uploaded");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
