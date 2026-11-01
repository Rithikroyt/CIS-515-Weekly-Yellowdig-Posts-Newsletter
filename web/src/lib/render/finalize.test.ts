// Image slots and local image finalization. Images here are generated in memory; nothing is read from or written
// to the repository, and nothing leaves the machine.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import * as E from "../editorial";
import { referenceWeek } from "../editorial/synthetic-reference";
import { fillSlots, findSlots } from "./finalize";
import { LOCAL_IMAGE_LIMITS, prepareLocalImage } from "./local-images";
import { assertPublicationQuality, renderNewsletter } from "./newsletter";

const NOW = () => "2026-11-01T12:00:00Z";
const URL_OF = (postRef: string) => "https://yellowdig.app/n/carey-school-of-business/community/c-1?postId=" + postRef.slice(5);

/** A real-week shaped issue: no images reach the generator, so every image position is a slot. */
async function issueWithoutImages() {
  const week = referenceWeek();
  const input = E.buildEditorialInput({ dataset: week.dataset, manifest: week.manifest, profiles: week.profiles, images: [], course: { ...E.SYNTHETIC_COURSE }, coverageComplete: false });
  const draft = await E.runEditorial({ input, provider: E.createMockProvider(week.scenario), now: NOW });
  const postUrls = Object.fromEntries(input.posts.map((p) => [p.postRef, URL_OF(p.postRef)]));
  return { input, draft, r: renderNewsletter({ input, draft, postUrls }) };
}

const png = (w: number, h: number, color = "#3366AA") => sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();
const jpeg = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#AA6633" } }).withMetadata({ orientation: 1, exif: { IFD0: { Copyright: "class photo", Artist: "Student Name" } } }).jpeg().toBuffer();

describe("image slots in the generated issue", () => {
  it("publishes without images, with one invisible slot per image position, in a fixed order", async () => {
    const { input, draft, r } = await issueWithoutImages();
    expect(r.html).not.toContain("data:image/");
    expect(r.quality.images).toBe(0);
    const slots = findSlots(r.html);
    expect(slots.map((s) => s.slot)).toEqual(["hero", ...draft.selection.spotlights.map((_, i) => "spotlight-" + (i + 1))]);
    expect(slots.slice(1).map((s) => s.postRef)).toEqual(draft.selection.spotlights.map((s) => s.postRef));
    slots.slice(1).forEach((s) => { expect(s.author).toBeTruthy(); expect(s.title).toBeTruthy(); expect(s.href).toMatch(/^https:\/\/yellowdig\.app\//); });
    expect(r.html.match(/class="img-slot"[^>]*style="display:none"/g)).toHaveLength(slots.length);
    expect(() => assertPublicationQuality(input, r)).not.toThrow();
    // The selection never curates images for real-week input (privacy); only synthetic input reaches the curator.
    expect(draft.run.modelCalls.some((c) => c.promptId === "image-curator")).toBe(false);
  });
});

describe("privacy: real class images never reach a model", () => {
  it("skips the image curator for live Yellowdig input even when images are present", async () => {
    const week = referenceWeek();
    const input = JSON.parse(JSON.stringify(week.input)) as typeof week.input;
    input.sourceStatus.provider = "yellowdig-api";
    const provider = E.createMockProvider(week.scenario);
    const draft = await E.runEditorial({ input, provider, imageBank: { [week.images[0].assetRef]: "data:image/png;base64,AAAA" }, now: NOW });
    expect(provider.calls.some((c) => c.promptId === "image-curator")).toBe(false);
    expect(provider.calls.every((c) => !(c.images ?? []).length)).toBe(true);
    expect(draft.images.curation.posts).toEqual([]);
    expect(draft.images.choices.every((c) => c.source === "deterministic")).toBe(true);
  });
});

describe("local image preparation", () => {
  it("re-encodes a PNG, keeps the aspect ratio and only scales down", async () => {
    const wide = await prepareLocalImage(await png(2000, 500));
    expect([wide.width, wide.height]).toEqual([1088, 272]);
    expect(wide.src).toMatch(/^data:image\/png;base64,/);
    const small = await prepareLocalImage(await png(600, 400));
    expect([small.width, small.height]).toEqual([600, 400]);
  });

  it("strips EXIF and other metadata from a JPEG", async () => {
    const src = await jpeg(1200, 800);
    expect((await sharp(src).metadata()).exif).toBeTruthy();
    const out = await prepareLocalImage(src);
    const meta = await sharp(Buffer.from(out.src.split(",")[1], "base64")).metadata();
    expect([meta.exif, meta.icc, meta.xmp, meta.iptc]).toEqual([undefined, undefined, undefined, undefined]);
    expect(out.src).toMatch(/^data:image\/jpeg;base64,/);
    expect(Buffer.from(out.src.split(",")[1], "base64").toString("latin1")).not.toContain("Student Name");
  });

  it("refuses files that are not images, empty files and oversized files", async () => {
    await expect(prepareLocalImage(Buffer.from('{"nodes": []}'))).rejects.toThrow(/IMAGE_INVALID/);
    await expect(prepareLocalImage(Buffer.alloc(0))).rejects.toThrow(/IMAGE_INVALID/);
    await expect(prepareLocalImage(Buffer.alloc(LOCAL_IMAGE_LIMITS.inputBytes + 1))).rejects.toThrow(/IMAGE_TOO_LARGE/);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    await expect(prepareLocalImage(gif)).rejects.toThrow(/only PNG, JPEG or WebP/);
  });
});

describe("filling slots", () => {
  it("embeds a hero and six spotlight images as Base64, with no external references", async () => {
    const { draft, r } = await issueWithoutImages();
    const n = draft.selection.spotlights.length;
    const images: Record<string, { src: string; alt: string }> = {};
    for (let i = 1; i <= n; i++) images["spotlight-" + i] = { src: (await prepareLocalImage(await png(1600, 900, i % 2 ? "#336699" : "#996633"))).src, alt: "Canvas " + i };
    images.hero = { src: (await prepareLocalImage(await jpeg(1600, 600))).src, alt: "Hero canvas" };
    const out = fillSlots(r.html, { images, heroFrom: "spotlight-2" });
    expect(out.filled).toEqual(["hero", ...Array.from({ length: n }, (_, i) => "spotlight-" + (i + 1))]);
    expect(out.missing).toEqual([]);
    expect(findSlots(out.html)).toEqual([]);
    expect(out.html.match(/<img /g)).toHaveLength(n + 1);
    expect(out.html).not.toMatch(/src="https?:|url\(|<script|\son[a-z]+=/i);
    // The hero is credited to the post it came from, and links to it.
    const second = draft.selection.spotlights[1].postRef;
    expect(out.html).toContain(">From ");
    expect(out.html).toContain('<a href="' + URL_OF(second).replace(/&/g, "&amp;") + '" style="text-decoration:none"><div style="text-align:center');
    // Same markup as the renderer's own image blocks: alt text escaped, whole image scaled to fit.
    expect(out.html).toContain('alt="Canvas 1"');
    expect(out.html).toMatch(/max-height:340px;width:auto;height:auto/);
  });

  it("accepts post refs as keys, leaves unfilled slots invisible, and reports unknown keys", async () => {
    const { draft, r } = await issueWithoutImages();
    const src = (await prepareLocalImage(await png(800, 450))).src;
    const ref = draft.selection.spotlights[0].postRef;
    const out = fillSlots(r.html, { images: { [ref]: { src, alt: "x canvas" }, "spotlight-99": { src, alt: "y" }, "post:nope": { src, alt: "z" } } });
    expect(out.filled).toEqual(["spotlight-1"]);
    expect(out.missing).toContain("hero");
    expect(out.unknown).toEqual(["spotlight-99", "post:nope"]);
    expect(findSlots(out.html)).toHaveLength(findSlots(r.html).length - 1);
  });

  it("refuses anything that is not an embedded image", async () => {
    const { r } = await issueWithoutImages();
    expect(() => fillSlots(r.html, { images: { hero: { src: "https://cdn.example.com/x.png", alt: "x" } } })).toThrow(/IMAGE_INVALID/);
    expect(() => fillSlots(r.html, { images: { hero: { src: "data:image/svg+xml;base64,PHN2Zz4=", alt: "x" } } })).toThrow(/IMAGE_INVALID/);
  });
});
