// Private asset intake: manifest validation and reading the stored rows back. Synthetic values only.
import { describe, expect, it } from "vitest";
import { bareId, collectWeekAssets, parseIntakeManifest } from "./intake";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const shot = (over: Record<string, unknown> = {}) => ({ postRef: "post:syn-1", kind: "post_image", path: "shots/a.png", role: "spotlight", altText: "Canvas with a judge step", ...over });

describe("parseIntakeManifest", () => {
  it("accepts explicit post ids, with or without the post: prefix", () => {
    const m = parseIntakeManifest({ week: 2, assets: [shot(), { postRef: "syn-2", kind: "workflow_json", path: "wf/b.json" }] }, 2);
    expect(m.assets.map((a) => [a.postId, a.kind, a.role])).toEqual([["syn-1", "post_image", "spotlight"], ["syn-2", "workflow_json", "supporting"]]);
  });
  it.each([
    [{ week: 3, assets: [shot()] }, /does not match/],
    [{ week: 2, assets: [] }, /non-empty/],
    [{ week: 2, assets: [shot({ postRef: undefined })] }, /postRef/],
    [{ week: 2, assets: [shot({ postRef: "post:../x" })] }, /postRef/],
    [{ week: 2, assets: [shot({ kind: "pdf" })] }, /kind/],
    [{ week: 2, assets: [shot({ path: "../secret.png" })] }, /relative/],
    [{ week: 2, assets: [shot({ path: "C:/Users/x.png" })] }, /relative/],
    [{ week: 2, assets: [shot({ altText: "img" })] }, /altText/],
    [{ week: 2, assets: [shot({ role: "hero" }), shot({ role: "hero" })] }, /one hero/],
    [{ week: 2, assets: [{ postRef: "syn-2", kind: "workflow_json", path: "b.json", role: "hero" }] }, /only a post_image/],
  ])("rejects an invalid manifest (%#)", (m, re) => {
    expect(() => parseIntakeManifest(m, 2)).toThrow(re);
  });
  it("normalizes ids", () => {
    expect(bareId("post:abc-1")).toBe("abc-1");
    expect(bareId("post:post:abc")).toBeNull();
    expect(bareId("a b")).toBeNull();
  });
});

describe("collectWeekAssets", () => {
  const bundle = { week: 2, kind: "bundle", post_id: "", role: "", alt: "", payload: JSON.stringify({ manifest: { week: 2, assets: [] }, profiles: [] }) };
  it("returns unknown coverage when nothing was uploaded", () => {
    const a = collectWeekAssets([{}], 2);
    expect([a.manifest, a.images, a.bank]).toEqual([null, [], {}]);
  });
  it("reads the bundle and keeps only valid data-URI images for the week, with ids and dimensions", () => {
    const img = (post_id: string, role: string, payload: string, week = 2, asset_id = "asset_" + post_id.replace(/\W/g, "")) => ({ week, kind: "image", post_id, role, alt: "Canvas", payload, asset_id, width: 1600, height: 900 });
    const rows = [bundle, img("syn-1", "spotlight", PNG), img("syn-2", "hero", PNG), img("syn-3", "spotlight", "https://example.com/x.png"), img("syn-4", "spotlight", PNG, 3)];
    const a = collectWeekAssets(rows, 2);
    expect(a.manifest).toEqual({ week: 2, assets: [] });
    expect(a.images.map((i) => [i.postRef, i.role])).toEqual([["post:syn-1", "spotlight"], ["post:syn-2", "hero"]]);
  });
  it("fails loudly on a corrupt bundle instead of silently reporting zero files", () => {
    expect(() => collectWeekAssets([{ ...bundle, payload: "{" }], 2)).toThrow(/ASSETS_INVALID/);
  });
});
