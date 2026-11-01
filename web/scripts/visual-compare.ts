// Desktop and mobile screenshots (and a PDF) of newsletter HTML files, for side-by-side comparison with the
// reference issue. Output goes to visual-compare/ (git-ignored). Uses the same PDF path as the app (scripts off,
// network blocked). Needs CHROME_EXECUTABLE_PATH (a local Chrome or Edge).
// Usage (from web/): npx tsx scripts/visual-compare.ts <name>=<file.html> [<name>=<file.html> ...]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { htmlToPdf } from "../src/lib/server/pdf";
import { REPO_ROOT } from "./schemas";

async function main() {
  const exe = process.env.CHROME_EXECUTABLE_PATH;
  if (!exe) throw new Error("set CHROME_EXECUTABLE_PATH to a local Chrome or Edge");
  const outDir = join(REPO_ROOT, "visual-compare");
  mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--disable-gpu"] });
  try {
    for (const pair of process.argv.slice(2)) {
      const [name, file] = pair.split("=");
      const html = readFileSync(file, "utf8");
      for (const [label, width] of [["desktop", 1280], ["mobile", 390]] as const) {
        const page = await browser.newPage();
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on("request", (r) => (r.url().startsWith("data:") || r.url() === "about:blank" ? r.continue() : r.abort()));
        await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: "load" });
        const dims = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, imgs: document.images.length }));
        await page.screenshot({ path: join(outDir, name + "-" + label + ".png") as `${string}.png`, fullPage: true });
        console.log(name, label, "height", dims.h, "scrollWidth", dims.w, "images", dims.imgs);
        await page.close();
      }
      const pdf = await htmlToPdf(html);
      writeFileSync(join(outDir, name + ".pdf"), pdf);
      console.log(name, "pdf bytes", pdf.length);
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
