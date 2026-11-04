// Reference quality on a 27-post synthetic week: real-path images (canonical assets → curator → code's choice →
// Base64 HTML), spotlights, every-build coverage, code-counted metrics and safety. Invented data only.
import { describe, expect, it } from "vitest";
import * as E from "../editorial";
import { indexInput } from "../editorial/checks";
import { CURATOR_LIMITS, SPOTLIGHT_MAX, SPOTLIGHT_MIN, chooseImage, validateImageCuration } from "../editorial/curate";
import { geminiRequest, withImageBytes } from "../editorial/providers";
import { REFERENCE_CANDIDATES, referenceWeek } from "../editorial/synthetic-reference";
import { collectWeekAssets, mergeAssetSources, privateAssetStoreAdapter, yellowdigAttachmentAdapter } from "../assets/intake";
import { assertPublicationQuality, renderNewsletter } from "./newsletter";

const NOW = () => "2026-11-01T12:00:00Z";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** A distinct tiny PNG per asset, so every embedded image can be traced back to its asset. */
function bankFor(week: ReturnType<typeof referenceWeek>) {
  return Object.fromEntries(week.images.map((i, n) => [i.assetRef, "data:image/png;base64," + Buffer.concat([Buffer.from(PNG, "base64"), Buffer.from("#" + n)]).toString("base64")]));
}

async function issue(scenario?: (w: ReturnType<typeof referenceWeek>) => E.MockScenario) {
  const week = referenceWeek();
  const imageBank = bankFor(week);
  const provider = E.createMockProvider(scenario ? scenario(week) : week.scenario);
  const draft = await E.runEditorial({ input: week.input, provider, imageBank, now: NOW });
  const r = renderNewsletter({ input: week.input, draft, imageBank, altText: Object.fromEntries(week.images.map((i) => [i.assetRef, i.altText])) });
  return { week, draft, r, imageBank, provider };
}

describe("reference-quality synthetic week", () => {
  it("renders a complete, image-led issue that passes the publication gate", async () => {
    const { week, draft, r } = await issue();
    expect(draft.status).toBe("human_review");
    expect(draft.introSource).toBe("ai");
    expect(r.status).toBe("ready");
    expect(r.quality.spotlights).toBeGreaterThanOrEqual(SPOTLIGHT_MIN);
    expect(r.quality.spotlights).toBeLessThanOrEqual(SPOTLIGHT_MAX);
    expect(r.quality.everyBuild).toBe(27);
    expect(r.quality.groups).toBe(6);
    expect(r.quality.introWords).toBeGreaterThanOrEqual(90);
    expect(r.quality.takeaways).toBe(3);
    expect(r.quality.nextSteps).toBeGreaterThanOrEqual(3);
    expect(() => assertPublicationQuality(week.input, r)).not.toThrow();
    draft.selection.spotlights.forEach((s) => expect(REFERENCE_CANDIDATES).toContain(s.postRef));
  });

  it("gives every spotlight a real image from its own post, embedded as Base64", async () => {
    const { week, draft, r, imageBank } = await issue();
    const owner = new Map(week.images.map((i) => [i.assetRef, i.postRef]));
    for (const s of draft.selection.spotlights) {
      const c = draft.images.choices.find((x) => x.postRef === s.postRef)!;
      expect(c, s.postRef).toBeTruthy();
      expect(owner.get(c.assetRef)).toBe(s.postRef);
      expect(c.classification).toBe("workflow_canvas");
      expect(r.html).toContain('src="' + imageBank[c.assetRef] + '"');
    }
    // Hero: a real image, from a post in the week, credited to it, and not repeating a spotlight image.
    const hero = draft.images.hero!;
    expect(owner.get(hero.assetRef)).toBe(hero.postRef);
    expect(draft.images.choices.map((c) => c.assetRef)).not.toContain(hero.assetRef);
    expect(r.html).toContain("From " + week.input.posts.find((p) => p.postRef === hero.postRef)!.authorName);
    expect(r.quality.images).toBe(r.quality.spotlights + 1);
    const imgs = [...r.html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    expect(imgs).toHaveLength(r.quality.images);
    imgs.forEach((t) => { expect(t).toMatch(/src="data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+"/); expect(t).toMatch(/alt="[^"]{8,}"/); });
  });

  it("never uses an irrelevant image (the curator marks the avatar), and never one from another post", async () => {
    const { week, draft } = await issue();
    const avatar = week.imageSpecs.find((s) => s.cls === "irrelevant")!;
    expect(draft.images.choices.map((c) => c.assetRef)).not.toContain(avatar.assetRef);
    const idx = indexInput(week.input);
    const other = week.images.find((i) => i.postRef !== avatar.postRef)!;
    const v = validateImageCuration(idx, { posts: [{ postRef: avatar.postRef, recommendedAssetRef: other.assetRef, recommendationReason: "x",
      evaluations: [{ assetRef: other.assetRef, classification: "workflow_canvas", relevanceScore: 5, readabilityScore: 5, spotlightSuitability: 5, reason: "x", altText: "A canvas.", caption: "", evidenceRefs: [] }] }] }, [avatar.postRef]);
    expect(v.posts[0].evaluations).toEqual([]);
    expect(v.posts[0].recommendedAssetRef).toBeNull();
    expect(v.issues.map((i) => i.code)).toContain("MODEL_UNKNOWN_REFERENCE");
  });

  it("sends real image bytes only with curator calls, capped per call", async () => {
    const { provider, imageBank } = await issue();
    const curator = provider.calls.filter((c) => c.promptId === "image-curator");
    expect(curator.length).toBeGreaterThan(0);
    curator.forEach((c) => expect(c.images!.length).toBeLessThanOrEqual(CURATOR_LIMITS.imagesPerCall));
    provider.calls.filter((c) => c.promptId !== "image-curator").forEach((c) => expect(c.images ?? []).toEqual([]));
    const body = geminiRequest(withImageBytes(curator[0], imageBank)).body;
    const parts = body.contents[0].parts as Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
    expect(parts.filter((p) => p.inlineData)).toHaveLength(curator[0].images!.length);
    expect(parts.find((p) => p.text?.startsWith("Image asset:"))).toBeTruthy();
  });

  it("falls back to deterministic image choices when the curator fails, and still publishes", async () => {
    const { week, draft, r } = await issue((w) => ({ ...w.scenario, "image-curator": [{ error: "provider" }] }));
    expect(draft.review.stageIssues.some((i) => i.stage === "image-curator")).toBe(true);
    expect(draft.images.choices.every((c) => c.source === "deterministic")).toBe(true);
    expect(r.quality.spotlights).toBeGreaterThanOrEqual(SPOTLIGHT_MIN);
    expect(() => assertPublicationQuality(week.input, r)).not.toThrow();
  });

  it("uses code-counted metrics only: files, profiles and images come from the manifest", async () => {
    const { week, r } = await issue();
    const m = (ref: string) => week.input.metrics.find((x) => x.ref === ref)!.value;
    expect([m("metric:posts"), m("metric:workflowFiles"), m("metric:profiledWorkflows"), m("metric:screenshots")]).toEqual([27, 14, 14, 18]);
    const row = r.html.slice(r.html.indexOf('class="num"'), r.html.indexOf(">images<"));
    expect([...row.matchAll(/class="num"[^>]*>([^<]+)</g)].map((x) => x[1])).toEqual(["27", String(m("metric:comments")), "14", "18"]);
  });

  it("has no scripts, handlers, remote resources or secrets", async () => {
    const { r } = await issue();
    expect(r.html).not.toMatch(/<script|\son[a-z]+=|javascript:|src="https?:|url\(|@import/i);
    expect(r.html).not.toMatch(/AIza[0-9A-Za-z_-]{20,}|x-goog-api-key|apikey|N8N_API_KEY|PSEUDONYMIZATION_SALT|Bearer\s/i);
    expect(r.html).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
  });
});

describe("partial asset coverage", () => {
  it("replaces unknown week totals with other counted totals while still showing the known spotlight images", async () => {
    const week = referenceWeek();
    const input = E.buildEditorialInput({ dataset: week.dataset, manifest: week.manifest, profiles: week.profiles, images: week.images, course: { ...E.SYNTHETIC_COURSE }, coverageComplete: false });
    const m = (ref: string) => input.metrics.find((x) => x.ref === ref)!.value;
    expect([m("metric:workflowFiles"), m("metric:screenshots"), m("metric:profiledWorkflows")]).toEqual([null, null, null]);
    expect(input.assetCoverage).toEqual({ complete: false, knownImages: 18, knownWorkflowFiles: 14, profiledWorkflows: 14 });
    const imageBank = bankFor(week);
    const draft = await E.runEditorial({ input, provider: E.createMockProvider(week.scenario), imageBank, now: NOW });
    const r = renderNewsletter({ input, draft, imageBank });
    const row = r.html.slice(r.html.indexOf('class="num"'), r.html.indexOf(">commenters<"));
    expect([...row.matchAll(/class="num"[^>]*>([^<]+)</g)].map((x) => x[1])).toEqual(["27", String(m("metric:comments")), String(m("metric:uniqueAuthors")), String(m("metric:uniqueCommenters"))]);
    expect(r.quality.images).toBe(r.quality.spotlights + 1);
    expect(() => assertPublicationQuality(input, r)).not.toThrow();
  });

  it("reads the coverage flag from the stored bundle", () => {
    const rows = (complete: unknown) => [{ week: 2, kind: "bundle", post_id: "", role: "", alt: "", payload: JSON.stringify({ manifest: { week: 2, assets: [] }, profiles: [], coverageComplete: complete }) }];
    expect(collectWeekAssets(rows(true), 2).coverageComplete).toBe(true);
    expect(collectWeekAssets(rows("true"), 2).coverageComplete).toBe(false);
    expect(collectWeekAssets(rows(undefined), 2).coverageComplete).toBe(false);
  });
});

describe("asset sources", () => {
  const row = (over: Record<string, unknown>) => ({ week: 2, kind: "image", post_id: "p-1", role: "spotlight", alt: "A canvas", payload: "data:image/png;base64," + PNG, asset_id: "asset_aa11", width: 1600, height: 900, source: "private_asset_store", ...over });
  const bundle = { week: 2, kind: "bundle", post_id: "", role: "", alt: "", payload: JSON.stringify({ manifest: { week: 2, assets: [] }, profiles: [] }) };

  it("reports the Yellowdig attachment source as unavailable (verified: the events API has no attachments)", () => {
    const y = yellowdigAttachmentAdapter();
    expect(y.assets).toBeNull();
    expect(y.status).toMatchObject({ source: "yellowdig_attachment", available: false });
  });

  it("turns private-store rows into canonical images with provenance, and refuses bad rows", () => {
    const a = collectWeekAssets([bundle, row({}), row({ asset_id: "bad id" }), row({ payload: "https://x/y.png", asset_id: "asset_b" }), row({ width: 0, asset_id: "asset_c" })], 2);
    expect(a.images).toEqual([{ assetRef: "asset:asset_aa11", postRef: "post:p-1", kind: "image", source: "private_asset_store", mimeType: "image/png", width: 1600, height: 900, role: "spotlight", altText: "A canvas" }]);
    expect(Object.keys(a.bank)).toEqual(["asset:asset_aa11"]);
    expect(a.sources.map((s) => [s.source, s.available])).toEqual([["yellowdig_attachment", false], ["private_asset_store", true]]);
    expect(collectWeekAssets([{}], 2).manifest).toBeNull();
  });

  it("prefers a post's Yellowdig attachments over its private-store assets", () => {
    const store = privateAssetStoreAdapter([bundle, row({})], 2);
    const yd = { assets: { ...store.assets!, images: [{ ...store.assets!.images[0], assetRef: "asset:yd_1", source: "yellowdig_attachment" as const }], bank: { "asset:yd_1": "data:image/png;base64," + PNG } },
      status: { source: "yellowdig_attachment" as const, available: true, reason: "test" } };
    const merged = mergeAssetSources(yd, store);
    expect(merged.images.map((i) => i.assetRef)).toEqual(["asset:yd_1"]);
  });

  it("chooses deterministically without curator evaluations, skipping unreadably small images", () => {
    const p = { ...referenceWeek().input.posts[0] };
    p.images = [
      { assetRef: "asset:tiny", source: "private_asset_store", mimeType: "image/png", width: 120, height: 80, role: "spotlight" },
      { assetRef: "asset:big", source: "private_asset_store", mimeType: "image/png", width: 1600, height: 900, role: "supporting" },
    ];
    expect(chooseImage(p, undefined)).toMatchObject({ assetRef: "asset:big", source: "deterministic", classification: null });
  });
});
