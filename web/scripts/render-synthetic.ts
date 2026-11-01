// Renders a synthetic issue (mock provider) to a file, for visual checks. Invented data only.
// Usage (from web/): npx tsx scripts/render-synthetic.ts <out.html> [scenario] [--reference]
// --reference renders the 27-post reference-sized week with drawn placeholder screenshots (clearly labelled
// synthetic) flowing through the same asset, curator, selection and renderer path as real post images.
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import * as E from "../src/lib/editorial";
import { referenceWeek, type ReferenceImageSpec } from "../src/lib/editorial/synthetic-reference";
import { assertPublicationQuality, renderNewsletter } from "../src/lib/render/newsletter";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (x: number, y: number, s: string, size = 18, fill = "#333333", anchor = "start") =>
  '<text x="' + x + '" y="' + y + '" font-family="Arial" font-size="' + size + '" fill="' + fill + '" text-anchor="' + anchor + '">' + xml(s) + "</text>";

/** A drawn stand-in for a real screenshot of the given class. */
function drawing(s: ReferenceImageSpec): { svg: string; w: number; h: number } {
  if (s.cls === "irrelevant") return { w: 400, h: 400, svg: '<rect width="400" height="400" fill="#E8E8E8"/><circle cx="200" cy="160" r="80" fill="#B9B9B9"/><circle cx="200" cy="420" r="160" fill="#B9B9B9"/>' };
  const w = 1600, h = 900;
  let body = "";
  if (s.cls === "workflow_canvas") {
    body = '<rect width="1600" height="900" fill="#F4F4F6"/>' + Array.from({ length: 30 }, (_, i) => '<circle cx="' + (40 + (i % 10) * 160) + '" cy="' + (120 + Math.floor(i / 10) * 300) + '" r="2" fill="#CCCCCC"/>').join("") +
      s.steps.map((st, i) => '<rect x="' + (90 + i * 290) + '" y="360" width="200" height="140" rx="16" fill="#FFFFFF" stroke="#8A8A9A" stroke-width="3"/>' + text(190 + i * 290, 440, st, 26, "#222222", "middle") +
        (i < s.steps.length - 1 ? '<line x1="' + (290 + i * 290) + '" y1="430" x2="' + (380 + i * 290) + '" y2="430" stroke="#8A8A9A" stroke-width="4"/>' : "")).join("");
  } else if (s.cls === "execution_result") {
    body = '<rect width="1600" height="900" fill="#FFFFFF"/>' + s.steps.map((st, i) => '<rect x="120" y="' + (200 + i * 170) + '" width="1360" height="130" rx="10" fill="' + (/held/.test(st) ? "#FFF3E6" : "#EEF8EF") + '"/>' + text(170, 280 + i * 170, st, 40, "#222222")).join("");
  } else if (s.cls === "application_output") {
    body = '<rect width="1600" height="900" fill="#FAFAFA"/><rect x="250" y="120" width="1100" height="680" rx="12" fill="#FFFFFF" stroke="#DDDDDD" stroke-width="3"/>' + s.steps.map((st, i) => text(320, 230 + i * 130, st + ": ...........................", 34, "#444444")).join("");
  } else if (s.cls === "chart") {
    body = '<rect width="1600" height="900" fill="#FFFFFF"/>' + s.steps.map((st, i) => { const bh = 120 + ((i * 97) % 380); return '<rect x="' + (220 + i * 250) + '" y="' + (760 - bh) + '" width="150" height="' + bh + '" fill="#8C1D40"/>' + text(295 + i * 250, 810, st, 30, "#333333", "middle"); }).join("");
  } else {
    body = '<rect width="1600" height="900" fill="#F0F0F0"/>' + s.steps.map((st, i) => '<rect x="' + (120 + i * 480) + '" y="160" width="400" height="620" rx="12" fill="#FFFFFF"/>' + text(320 + i * 480, 220, st, 32, "#333333", "middle") +
      [0, 1, 2].map((k) => '<rect x="' + (150 + i * 480) + '" y="' + (270 + k * 150) + '" width="340" height="110" rx="8" fill="#E4E4EC"/>').join("")).join("");
  }
  const label = text(40, 60, s.title, 34, "#1A1A1A") + text(40, h - 30, "SYNTHETIC SCREENSHOT · invented test data · " + s.cls, 24, "#8C1D40");
  return { w, h, svg: body + label };
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("usage: render-synthetic.ts <out.html> [scenario] [--reference]");
  if (process.argv.includes("--reference")) {
    const week = referenceWeek();
    const imageBank: Record<string, string> = {};
    for (const s of week.imageSpecs) {
      const d = drawing(s);
      const jpg = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + d.w + '" height="' + d.h + '">' + d.svg + "</svg>")).resize({ width: 1088, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
      imageBank[s.assetRef] = "data:image/jpeg;base64," + jpg.toString("base64");
    }
    const draft = await E.runEditorial({ input: week.input, provider: E.createMockProvider(week.scenario), imageBank, now: () => "2026-11-01T12:00:00Z" });
    const r = renderNewsletter({ input: week.input, draft, imageBank, altText: Object.fromEntries(week.images.map((i) => [i.assetRef, i.altText])) });
    assertPublicationQuality(week.input, r);
    writeFileSync(out, r.html);
    console.log(r.status, "omitted:", r.omittedClaims, "bytes:", r.html.length, JSON.stringify(r.quality));
    return;
  }
  const scenario = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "clean";
  const input = E.syntheticEditorialInput();
  const draft = await E.runEditorial({ input, provider: E.createMockProvider(E.NAMED_SCENARIOS[scenario]), now: () => "2026-11-01T12:00:00Z" });
  const r = renderNewsletter({ input, draft });
  assertPublicationQuality(input, r);
  writeFileSync(out, r.html);
  console.log(r.status, "omitted:", r.omittedClaims, "bytes:", r.html.length, JSON.stringify(r.quality));
}
main().catch((e) => { console.error(e); process.exit(1); });
