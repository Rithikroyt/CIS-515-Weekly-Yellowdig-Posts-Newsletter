// Renders an existing newsletter HTML string to PDF with headless Chromium. The HTML always comes from the
// run's stored artifact, never from the browser. JavaScript is disabled and every network request is blocked,
// so the page can only use its own inline styles and data: images.
//  - Vercel: @sparticuz/chromium-min downloads its Chromium pack from CHROMIUM_PACK_URL (server-only).
//  - Local: set CHROME_EXECUTABLE_PATH to an installed Chrome or Chromium.
import puppeteer from "puppeteer-core";

export class PdfError extends Error {
  constructor(public code: "PDF_NOT_CONFIGURED" | "PDF_RENDER_FAILED") { super(code); }
}

/**
 * The environment for a local browser. A Windows compatibility layer (__COMPAT_LAYER, set by some shells) makes
 * current Edge exit at once, so it is not passed on.
 */
export const localBrowserEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "__COMPAT_LAYER"));

async function launch() {
  const local = process.env.CHROME_EXECUTABLE_PATH;
  if (local) return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-sandbox", "--disable-gpu"], env: localBrowserEnv() });
  const pack = process.env.CHROMIUM_PACK_URL;
  if (!pack || !/^https:\/\//.test(pack)) throw new PdfError("PDF_NOT_CONFIGURED");
  const chromium = (await import("@sparticuz/chromium-min")).default;
  return puppeteer.launch({ executablePath: await chromium.executablePath(pack), args: chromium.args, headless: true });
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  let browser: Awaited<ReturnType<typeof launch>> | null = null;
  try {
    browser = await launch();
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (r) => (r.url().startsWith("data:") ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 20000 });
    await page.emulateMediaType("screen");
    return await page.pdf({ format: "Letter", printBackground: true, margin: { top: "0.4in", bottom: "0.4in", left: "0.3in", right: "0.3in" } });
  } catch (e) {
    if (e instanceof PdfError) throw e;
    throw new PdfError("PDF_RENDER_FAILED");
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
