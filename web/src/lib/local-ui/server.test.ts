// The local finalize UI: localhost-only binding, request guards, slots for any spotlight count, downloads (from a
// stand-in Yellowdig CDN, no network), hero fit warnings, and offline final HTML and PDF. Synthetic data only.
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../editorial";
import { referenceWeek } from "../editorial/synthetic-reference";
import { heroFit } from "../assets/remote-download";
import { findSlots } from "../render/finalize";
import { renderNewsletter } from "../render/newsletter";
import { LOCAL_HOST, createFinalizeServer } from "./server";

const REPO = resolve(__dirname, "../../../..");
const NOW = () => "2026-11-01T12:00:00Z";

/** A generated issue with no images and `count` spotlights, as a real week arrives. */
async function issue(count = 6) {
  const week = referenceWeek();
  const input = E.buildEditorialInput({ dataset: week.dataset, manifest: week.manifest, profiles: week.profiles, images: [], course: { ...E.SYNTHETIC_COURSE }, coverageComplete: false });
  const draft = await E.runEditorial({ input, provider: E.createMockProvider(week.scenario), now: NOW });
  draft.selection.spotlights = draft.selection.spotlights.slice(0, count);
  const postUrls = Object.fromEntries(input.posts.map((p) => [p.postRef, "https://yellowdig.app/n/x/community/c?postId=" + p.postRef.slice(5)]));
  return renderNewsletter({ input, draft, postUrls }).html;
}

/** Stand-in for the Yellowdig CDN: drawn images by URL, with one redirect hop like the real service. */
async function fakeCdn() {
  const wide = await sharp({ create: { width: 1600, height: 600, channels: 3, background: "#3366AA" } }).png().toBuffer();
  const tall = await sharp({ create: { width: 900, height: 1500, channels: 3, background: "#AA6633" } }).withMetadata({ exif: { IFD0: { Artist: "Synthetic Student" } } }).jpeg().toBuffer();
  const files: Record<string, Buffer> = { "/wide.png": wide, "/tall.jpg": tall };
  return (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    if (u.hostname === "galactus.yellowdig.app") return new Response(null, { status: 302, headers: { location: "https://cdn-v2.yellowdig.app" + u.pathname } });
    const body = files[u.pathname];
    return body ? new Response(new Uint8Array(body), { status: 200 }) : new Response("nope", { status: 404 });
  }) as typeof fetch;
}

const running: Array<() => Promise<void>> = [];
afterEach(async () => { while (running.length) await running.pop()!(); });

async function start(pdf?: (html: string) => Promise<Uint8Array>) {
  const ui = createFinalizeServer({ port: 0, repoRoot: REPO, fetchImpl: await fakeCdn(), pdf: pdf ?? (async () => new TextEncoder().encode("%PDF-1.7 test")) });
  const info = await ui.listen();
  running.push(ui.close);
  const call = (path: string, body: unknown, headers: Record<string, string> = {}) => new Promise<{ status: number; json: Record<string, unknown> }>((ok, fail) => {
    const data = JSON.stringify(body);
    const req = request({ host: LOCAL_HOST, port: info.port, path, method: "POST", headers: { "content-type": "application/json", host: LOCAL_HOST + ":" + info.port, "x-finalize-token": ui.token, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => ok({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") }));
    });
    req.on("error", fail);
    req.end(data);
  });
  const get = (headers: Record<string, string> = {}) => new Promise<{ status: number; body: string }>((ok, fail) => {
    request({ host: LOCAL_HOST, port: info.port, path: "/", headers: { host: LOCAL_HOST + ":" + info.port, ...headers } }, (res) => {
      let s = ""; res.on("data", (c) => (s += c)); res.on("end", () => ok({ status: res.statusCode ?? 0, body: s }));
    }).on("error", fail).end();
  });
  return { ui, info, call, get };
}
const workdir = () => mkdtempSync(join(tmpdir(), "finalize-ui-"));

describe("local finalize UI: binding and guards", () => {
  it("listens on 127.0.0.1 only and serves the page with its token", async () => {
    const { info, get, ui } = await start();
    expect(info.address).toBe("127.0.0.1");
    expect(info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await get();
    expect(page.status).toBe(200);
    expect(page.body).toContain(ui.token);
    expect(page.body).not.toMatch(/<script[^>]+src=|<link[^>]+href="http|https?:\/\/(?!yellowdig)/);
  });

  it("refuses other host names, foreign origins and requests without the token", async () => {
    const { get, call } = await start();
    expect((await get({ host: "evil.example:80" })).status).toBe(403);
    expect((await call("/api/open", {}, { "x-finalize-token": "wrong" })).status).toBe(403);
    expect((await call("/api/open", {}, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call("/api/nope", {})).status).toBe(404);
  });

  it("refuses a working folder inside the repository and a file that is not a newsletter", async () => {
    const { call } = await start();
    const html = await issue(4);
    expect((await call("/api/open", { html, workdir: join(REPO, "visual-compare") })).json.error).toMatch(/PRIVATE_FILES_IN_REPO/);
    expect((await call("/api/open", { html: "<html>hello</html>", workdir: workdir() })).json.error).toMatch(/BAD_HTML/);
  });
});

describe("local finalize UI: slots, downloads and hero", () => {
  it.each([4, 5, 6])("lists the hero and %i spotlight slots of a generated issue", async (n) => {
    const { call } = await start();
    const r = await call("/api/open", { html: await issue(n), workdir: workdir() });
    const slots = r.json.slots as Array<{ slot: string; author: string; title: string; href: string }>;
    expect(slots.map((s) => s.slot)).toEqual(["hero", ...Array.from({ length: n }, (_, i) => "spotlight-" + (i + 1))]);
    slots.slice(1).forEach((s) => { expect(s.author).toBeTruthy(); expect(s.title).toBeTruthy(); expect(s.href).toMatch(/^https:\/\/yellowdig\.app\//); });
  });

  it("downloads several images for one spotlight, unchanged, and flags portrait images for the hero", async () => {
    const { call } = await start();
    const dir = workdir();
    await call("/api/open", { html: await issue(4), workdir: dir });
    expect((await call("/api/download", { slot: "spotlight-1", urls: ["http://cdn-v2.yellowdig.app/wide.png"] })).json.error).toMatch(/URL_NOT_ALLOWED/);
    expect((await call("/api/download", { slot: "spotlight-1", urls: ["https://evil.example/wide.png"] })).json.error).toMatch(/URL_NOT_ALLOWED/);
    expect((await call("/api/download", { slot: "spotlight-9", urls: ["https://cdn-v2.yellowdig.app/wide.png"] })).json.error).toMatch(/UNKNOWN_SLOT/);
    const r = await call("/api/download", { slot: "spotlight-1", urls: ["https://galactus.yellowdig.app/tall.jpg", "https://cdn-v2.yellowdig.app/wide.png"] });
    const imgs = r.json.images as Array<{ file: string; width: number; height: number; host: string; fit: { fit: string; note: string } }>;
    expect(imgs.map((x) => [x.file, x.width, x.height, x.host])).toEqual([["spotlight-1-1.jpg", 900, 1500, "cdn-v2.yellowdig.app"], ["spotlight-1-2.png", 1600, 600, "cdn-v2.yellowdig.app"]]);
    expect(imgs[0].fit).toMatchObject({ fit: "poor", note: "Poor hero fit — portrait image" });
    expect(imgs[1].fit.fit).toBe("good");
    expect(r.json.suggestedHero).toBe("spotlight-1-2.png");
    expect(readdirSync(dir).sort()).toEqual(["spotlight-1-1.jpg", "spotlight-1-2.png"]);
    // Saved unchanged: the original EXIF is still in the downloaded file (it is stripped only when embedding).
    expect((await sharp(readFileSync(join(dir, "spotlight-1-1.jpg"))).metadata()).exif).toBeTruthy();
  });

  it("rates hero fit by aspect ratio", () => {
    expect(heroFit(1088, 1847).fit).toBe("poor");
    expect(heroFit(1000, 900).fit).toBe("weak");
    expect(heroFit(1600, 600)).toMatchObject({ fit: "good", ratio: 2.67 });
  });
});

describe("local finalize UI: finalize", () => {
  it("embeds the chosen images without metadata, removes the slots, and writes HTML and PDF locally", async () => {
    let pdfInput = "";
    const { call } = await start(async (html) => { pdfInput = html; return new TextEncoder().encode("%PDF-1.7 synthetic"); });
    const dir = workdir();
    await call("/api/open", { html: await issue(4), workdir: dir });
    for (const slot of ["spotlight-1", "spotlight-2", "spotlight-3", "spotlight-4"]) await call("/api/download", { slot, urls: ["https://cdn-v2.yellowdig.app/" + (slot === "spotlight-2" ? "tall.jpg" : "wide.png")] });
    expect((await call("/api/finalize", { spotlights: { "spotlight-1": "../../secret.png" } })).json.error).toMatch(/UNKNOWN_FILE/);
    const r = await call("/api/finalize", { spotlights: { "spotlight-1": "spotlight-1.png", "spotlight-2": "spotlight-2.jpg", "spotlight-3": "spotlight-3.png", "spotlight-4": "spotlight-4.png" }, hero: { file: "spotlight-3.png", from: "spotlight-3" }, name: "CIS515-Week2-Final", pdf: true });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ filled: ["hero", "spotlight-1", "spotlight-2", "spotlight-3", "spotlight-4"], empty: [], images: 5, remoteImages: 0, pdfError: null });
    const html = readFileSync(String(r.json.html), "utf8");
    expect(String(r.json.html)).toBe(join(dir, "CIS515-Week2-Final.html"));
    expect(readFileSync(String(r.json.pdf), "utf8")).toContain("%PDF");
    expect(pdfInput).toBe(html);
    expect(findSlots(html)).toEqual([]);
    expect(html).not.toMatch(/src="https?:|<script|url\(/i);
    // Every embedded image is re-encoded without metadata.
    for (const m of html.matchAll(/src="data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)"/g)) {
      const meta = await sharp(Buffer.from(m[1], "base64")).metadata();
      expect([meta.exif, meta.icc, meta.xmp]).toEqual([undefined, undefined, undefined]);
    }
    expect(Buffer.from(html).toString("latin1")).not.toContain("Synthetic Student");
  });

  it("adds the review credit only when the review box is ticked", async () => {
    const { call } = await start();
    await call("/api/open", { html: await issue(4), workdir: workdir() });
    const plain = await call("/api/finalize", { spotlights: {}, hero: null, pdf: false, name: "plain" });
    expect(plain.json.reviewedBy).toBeNull();
    expect(readFileSync(String(plain.json.html), "utf8")).not.toMatch(/reviewed by [A-Z]/);
    expect((await call("/api/finalize", { spotlights: {}, hero: null, pdf: false, reviewed: true, reviewer: "" })).json.error).toMatch(/BAD_REVIEWER/);
    const ok = await call("/api/finalize", { spotlights: {}, hero: null, pdf: false, name: "reviewed", reviewed: true, reviewer: "Rithik Roy Thati" });
    expect(ok.json.reviewedBy).toBe("Rithik Roy Thati");
    expect(readFileSync(String(ok.json.html), "utf8")).toContain("reviewed by Rithik Roy Thati before sending");
  });

  it("leaves slots without a chosen image invisible and still finishes", async () => {
    const { call } = await start();
    await call("/api/open", { html: await issue(5), workdir: workdir() });
    await call("/api/download", { slot: "spotlight-2", urls: ["https://cdn-v2.yellowdig.app/wide.png"] });
    const r = await call("/api/finalize", { spotlights: { "spotlight-2": "spotlight-2.png" }, hero: null, pdf: false });
    expect(r.json).toMatchObject({ filled: ["spotlight-2"], images: 1, pdf: null });
    expect((r.json.empty as string[]).length).toBe(5);
  });
});
