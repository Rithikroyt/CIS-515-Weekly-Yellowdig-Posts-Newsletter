// Renders the synthetic Week 2 issue (mock provider) to a file, for visual checks. Invented data only.
// Usage (from web/): npx tsx scripts/render-synthetic.ts <out.html> [scenario] [--images]
// --images adds generated placeholder screenshots (clearly labelled synthetic) so the image, hero and collage
// layout can be checked without real student files.
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import * as E from "../src/lib/editorial";
import { assertPublicationQuality, renderNewsletter, type RenderImage } from "../src/lib/render/newsletter";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A gray canvas with the profile's main path as boxes: a stand-in for a real n8n screenshot. */
async function placeholder(title: string, steps: string[]): Promise<string> {
  const boxes = steps.slice(0, 6).map((s, i) => '<rect x="' + (40 + i * 172) + '" y="250" width="150" height="90" rx="10" fill="#FFFFFF" stroke="#9A9A9A" stroke-width="2"/>' +
    '<text x="' + (115 + i * 172) + '" y="302" font-family="Arial" font-size="17" text-anchor="middle" fill="#333333">' + xml(s.slice(0, 16)) + "</text>").join("");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1088" height="600"><rect width="1088" height="600" fill="#EDEDED"/>' +
    '<text x="40" y="70" font-family="Arial" font-size="26" fill="#1A1A1A">' + xml(title.slice(0, 60)) + "</text>" +
    '<text x="40" y="560" font-family="Arial" font-size="18" fill="#8C1D40">SYNTHETIC SCREENSHOT · invented test data</text>' + boxes + "</svg>";
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 72 }).toBuffer();
  return "data:image/jpeg;base64," + jpg.toString("base64");
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("usage: render-synthetic.ts <out.html> [scenario] [--images]");
  const scenario = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "clean";
  const input = E.syntheticEditorialInput();
  const draft = await E.runEditorial({ input, provider: E.createMockProvider(E.NAMED_SCENARIOS[scenario]), now: () => "2026-11-01T12:00:00Z" });
  const images: Record<string, RenderImage> = {};
  if (process.argv.includes("--images")) {
    for (const p of input.posts.filter((x) => x.workflowProfileRef)) {
      const prof = input.workflowProfiles.find((w) => w.workflowProfileRef === p.workflowProfileRef)!;
      images[p.postRef] = { src: await placeholder(p.title, prof.mainPath.map((s) => s.label)), alt: "Synthetic n8n canvas for " + p.title };
    }
  }
  const r = renderNewsletter({ input, draft, images });
  assertPublicationQuality(input, r);
  writeFileSync(out, r.html);
  console.log(r.status, "omitted:", r.omittedClaims, "bytes:", r.html.length, JSON.stringify(r.quality));
}
main().catch((e) => { console.error(e); process.exit(1); });
