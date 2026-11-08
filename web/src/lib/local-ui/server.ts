// Local finalize UI: a small web page served only on 127.0.0.1 for adding class images to a generated newsletter.
// Images are downloaded from Yellowdig or chosen from the user's own screenshots, kept in a folder the user chooses,
// embedded, and saved as HTML and PDF on this computer. Nothing is uploaded; there is no analytics or telemetry and no external script. State lives in memory.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isAbsolute, join, resolve, sep } from "node:path";
import sharp from "sharp";
import { downloadAsset, heroFit } from "../assets/remote-download";
import { SLOT_ID, isAllowedAssetUrl, localName } from "../assets/remote-image";
import { applyReviewer, defaultAlt, fillSlots, findSlots, type Slot, type SlotImage } from "../render/finalize";
import { prepareLocalImage } from "../render/local-images";
import { PAGE } from "./page";

export const LOCAL_HOST = "127.0.0.1";
const MAX_BODY = 40 * 1024 * 1024;
const FILE_NAME = /^(hero|spotlight-[1-9][0-9]?)(-[1-9][0-9]?|-own-[1-9][0-9]?)?\.(png|jpg|webp|gif)$/;
/** The user's own screenshots: at most this many per request and per slot, each within the intake limits. */
const OWN_PER_REQUEST = 4, OWN_PER_SLOT = 8, OWN_MAX_BYTES = 15 * 1024 * 1024, OWN_MAX_PIXELS = 60_000_000;
const OWN_FORMATS: Record<string, string> = { png: "png", jpeg: "jpg", webp: "webp" };
const OUT_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,80}$/;

export type FinalizeServerOptions = {
  port?: number;
  /** The repository root: working folders inside it are refused (class images must not land in Git). */
  repoRoot: string;
  fetchImpl?: typeof fetch;
  /** HTML → PDF. Defaults to the app's PDF path (scripts off, network blocked) with a local Chrome or Edge. */
  pdf?: (html: string) => Promise<Uint8Array>;
};

type Image = { file: string; width: number; height: number; format: string; kb: number; host: string; fit: ReturnType<typeof heroFit>; thumb: string };
type Session = { html: string; slots: Slot[]; workdir: string; images: Record<string, Image[]> };

/** The host shown for the user's own screenshots. */
const OWN_HOST = "this computer";
const widestFile = (s: Session) => Object.values(s.images).flat().reduce<Image | null>((best, x) => (!best || x.fit.ratio > best.fit.ratio ? x : best), null)?.file ?? null;

const LOCAL_BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium",
];

async function defaultPdf(html: string): Promise<Uint8Array> {
  if (!process.env.CHROME_EXECUTABLE_PATH) {
    const found = LOCAL_BROWSERS.find((p) => existsSync(p));
    if (!found) throw new Error("[PDF_NOT_CONFIGURED] no local Chrome or Edge found; set CHROME_EXECUTABLE_PATH");
    process.env.CHROME_EXECUTABLE_PATH = found;
  }
  const { htmlToPdf } = await import("../server/pdf");
  return htmlToPdf(html);
}

/** The page's record of one saved image: size, hero fit and a small JPEG preview. */
async function imageRecord(buf: Buffer, file: string, host: string, ext: string): Promise<Image> {
  const meta = await sharp(buf).metadata();
  const w = meta.autoOrient?.width ?? meta.width ?? 0, h = meta.autoOrient?.height ?? meta.height ?? 0;
  const thumb = "data:image/jpeg;base64," + (await sharp(buf).rotate().resize({ width: 360, height: 240, fit: "inside" }).flatten({ background: "#FFFFFF" }).jpeg({ quality: 70 }).toBuffer()).toString("base64");
  return { file, width: w, height: h, format: ext, kb: Math.round(buf.length / 1024), host, fit: heroFit(w, h), thumb };
}

export function createFinalizeServer(o: FinalizeServerOptions) {
  const token = randomBytes(24).toString("hex");
  const repo = resolve(o.repoRoot) + sep;
  let session: Session | null = null;
  let port = 0;

  const allowedHost = (h: string | undefined) => h === LOCAL_HOST + ":" + port || h === "localhost:" + port;
  const send = (res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) => new Promise<Record<string, unknown>>((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => { size += c.length; if (size > MAX_BODY) { fail(new Error("[TOO_LARGE] request body")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { fail(new Error("[BAD_REQUEST] body must be JSON")); } });
    req.on("error", fail);
  });

  const workdirOf = (raw: unknown) => {
    if (typeof raw !== "string" || !raw.trim() || !isAbsolute(raw.trim())) throw new Error("[BAD_FOLDER] give the full path of a folder for this week's images");
    const dir = resolve(raw.trim());
    if ((dir + sep).startsWith(repo)) throw new Error("[PRIVATE_FILES_IN_REPO] choose a folder outside the project repository");
    mkdirSync(dir, { recursive: true });
    if (!statSync(dir).isDirectory()) throw new Error("[BAD_FOLDER] not a folder");
    return dir;
  };

  const handlers: Record<string, (b: Record<string, unknown>) => Promise<unknown>> = {
    // Reads the generated issue (sent from the page) and lists its image slots.
    async open(b) {
      if (typeof b.html !== "string" || !b.html.includes("Community Dispatch")) throw new Error("[BAD_HTML] choose a newsletter HTML file generated by the newsletter generator");
      const slots = findSlots(b.html);
      if (!slots.length) throw new Error("[NO_SLOTS] this file has no empty image slots (already finalized?)");
      session = { html: b.html, slots, workdir: workdirOf(b.workdir), images: {} };
      return { slots: slots.map(({ slot, postRef, author, title, href }) => ({ slot, postRef, author, title, href })) };
    },
    // Downloads the pasted Yellowdig image addresses for one slot into the working folder, unchanged.
    async download(b) {
      if (!session) throw new Error("[NO_SESSION] open a newsletter first");
      const slot = String(b.slot ?? "");
      if (!SLOT_ID.test(slot) || !session.slots.some((s) => s.slot === slot)) throw new Error("[UNKNOWN_SLOT] " + slot);
      const urls = (Array.isArray(b.urls) ? b.urls : []).map((u) => String(u).trim()).filter(Boolean);
      if (!urls.length || urls.length > 8) throw new Error("[BAD_URLS] paste one to eight image addresses");
      const bad = urls.findIndex((u) => !isAllowedAssetUrl(u));
      if (bad >= 0) throw new Error("[URL_NOT_ALLOWED] address " + (bad + 1) + " is not an https Yellowdig image address");
      const images: Image[] = [];
      for (let i = 0; i < urls.length; i++) {
        const d = await downloadAsset(urls[i], o.fetchImpl);
        const file = localName(slot, i, urls.length, d.kind.ext);
        writeFileSync(join(session.workdir, file), d.buf);
        images.push(await imageRecord(d.buf, file, d.host, d.kind.ext.slice(1)));
      }
      // New downloads replace earlier downloads for the slot; the user's own screenshots stay.
      session.images[slot] = [...(session.images[slot] ?? []).filter((x) => x.host === OWN_HOST), ...images];
      return { slot, images: session.images[slot], suggestedHero: widestFile(session) };
    },
    // Adds screenshots the user took, sent from the page as base64. Each must decode as PNG, JPEG or WebP within the
    // intake limits; it is saved unchanged and re-encoded (metadata dropped) only when the issue is finalized.
    async add(b) {
      if (!session) throw new Error("[NO_SESSION] open a newsletter first");
      const slot = String(b.slot ?? "");
      if (!SLOT_ID.test(slot) || !session.slots.some((s) => s.slot === slot)) throw new Error("[UNKNOWN_SLOT] " + slot);
      const files = Array.isArray(b.files) ? b.files : [];
      if (!files.length || files.length > OWN_PER_REQUEST) throw new Error("[BAD_FILES] choose one to " + OWN_PER_REQUEST + " screenshots at a time");
      const current = session.images[slot] ?? [];
      const own = current.filter((x) => x.host === OWN_HOST).length;
      if (own + files.length > OWN_PER_SLOT) throw new Error("[TOO_MANY_FILES] at most " + OWN_PER_SLOT + " of your own screenshots per slot");
      const added: Image[] = [];
      for (let i = 0; i < files.length; i++) {
        const raw = String((files[i] as { data?: unknown })?.data ?? "").replace(/^data:image\/[a-z+.-]+;base64,/i, "");
        if (!/^[A-Za-z0-9+/=]+$/.test(raw)) throw new Error("[BAD_IMAGE] screenshot " + (i + 1) + " could not be read");
        const buf = Buffer.from(raw, "base64");
        if (!buf.length || buf.length > OWN_MAX_BYTES) throw new Error("[BAD_IMAGE] screenshot " + (i + 1) + " must be under 15 MB");
        const meta = await sharp(buf).metadata().catch(() => null);
        const ext = meta?.format ? OWN_FORMATS[meta.format] : undefined;
        if (!meta || !ext) throw new Error("[BAD_IMAGE] screenshot " + (i + 1) + " is not a PNG, JPEG or WebP image");
        if ((meta.width ?? 0) * (meta.height ?? 0) > OWN_MAX_PIXELS) throw new Error("[BAD_IMAGE] screenshot " + (i + 1) + " is larger than 60 megapixels");
        const file = slot + "-own-" + (own + i + 1) + "." + ext;
        writeFileSync(join(session.workdir, file), buf);
        added.push(await imageRecord(buf, file, OWN_HOST, ext));
      }
      session.images[slot] = [...current, ...added];
      return { slot, images: session.images[slot], suggestedHero: widestFile(session) };
    },
    // Embeds the chosen images and writes the standalone HTML (and PDF) into the working folder.
    async finalize(b) {
      if (!session) throw new Error("[NO_SESSION] open a newsletter first");
      const s = session;
      const known = new Map(Object.values(s.images).flat().map((x) => [x.file, x]));
      const pick = (file: unknown) => {
        const f = String(file ?? "");
        if (!FILE_NAME.test(f) || !known.has(f)) throw new Error("[UNKNOWN_FILE] " + f);
        return f;
      };
      const chosen = (b.spotlights && typeof b.spotlights === "object" ? b.spotlights : {}) as Record<string, unknown>;
      const images: Record<string, SlotImage> = {};
      for (const [slot, file] of Object.entries(chosen)) {
        if (!file) continue;
        const target = s.slots.find((x) => x.slot === slot);
        if (!target || slot === "hero") throw new Error("[UNKNOWN_SLOT] " + slot);
        images[slot] = { src: (await prepareLocalImage(readFileSync(join(s.workdir, pick(file))))).src, alt: defaultAlt(target) };
      }
      const hero = b.hero && typeof b.hero === "object" ? (b.hero as { file?: unknown; from?: unknown }) : null;
      let heroFrom: string | null = null;
      if (hero?.file && s.slots.some((x) => x.slot === "hero")) {
        heroFrom = typeof hero.from === "string" && s.slots.some((x) => x.slot === hero.from) ? hero.from : null;
        images.hero = { src: (await prepareLocalImage(readFileSync(join(s.workdir, pick(hero.file))))).src, alt: defaultAlt(s.slots.find((x) => x.slot === heroFrom) ?? null) };
      }
      const r = fillSlots(s.html, { images, heroFrom });
      // The review credit is added only when the person confirms they reviewed this issue.
      if (b.reviewed === true) r.html = applyReviewer(r.html, String(b.reviewer ?? ""));
      const name = typeof b.name === "string" && OUT_NAME.test(b.name.trim()) ? b.name.trim().replace(/\.html?$/i, "") : "newsletter-final";
      const htmlPath = join(s.workdir, name + ".html");
      writeFileSync(htmlPath, r.html);
      let pdfPath: string | null = null, pdfError: string | null = null;
      if (b.pdf !== false) {
        try { pdfPath = join(s.workdir, name + ".pdf"); writeFileSync(pdfPath, await (o.pdf ?? defaultPdf)(r.html)); }
        catch (e) { pdfPath = null; pdfError = e instanceof Error ? e.message : "PDF failed"; }
      }
      return { html: htmlPath, pdf: pdfPath, pdfError, reviewedBy: b.reviewed === true ? String(b.reviewer).trim() : null, filled: r.filled, empty: r.missing, images: (r.html.match(/<img /g) ?? []).length, remoteImages: (r.html.match(/src="https?:/g) ?? []).length };
    },
  };

  const server: Server = createServer(async (req, res) => {
    try {
      // Only this computer, addressed as itself: blocks other devices and DNS-rebinding pages.
      if (!allowedHost(req.headers.host)) return send(res, 403, { error: "forbidden host" });
      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
        res.setHeader("content-security-policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; form-action 'none'; frame-ancestors 'none'");
        return send(res, 200, PAGE.replace("__TOKEN__", token), "text/html; charset=utf-8");
      }
      const m = /^\/api\/(open|download|add|finalize)$/.exec(req.url ?? "");
      if (req.method !== "POST" || !m) return send(res, 404, { error: "not found" });
      const origin = req.headers.origin;
      if (origin && origin !== "http://" + req.headers.host) return send(res, 403, { error: "forbidden origin" });
      if (req.headers["x-finalize-token"] !== token) return send(res, 403, { error: "missing or wrong token" });
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, { error: "JSON only" });
      return send(res, 200, await handlers[m[1]](await readBody(req)));
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : "failed" });
    }
  });

  return {
    token,
    /** Starts listening on 127.0.0.1 only. Port 0 picks a free port. */
    listen: () => new Promise<{ url: string; address: string; port: number }>((ok, fail) => {
      server.once("error", fail);
      server.listen(o.port ?? 0, LOCAL_HOST, () => {
        const a = server.address();
        if (!a || typeof a === "string") return fail(new Error("no address"));
        port = a.port;
        ok({ url: "http://" + LOCAL_HOST + ":" + port + "/", address: a.address, port });
      });
    }),
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
