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
    expect(collectWeekAssets([{}], 2)).toEqual({ manifest: null, profiles: [], images: {}, hero: null });
  });
  it("reads the bundle and keeps only valid data-URI images for the week", () => {
    const rows = [
      bundle,
      { week: 2, kind: "image", post_id: "syn-1", role: "spotlight", alt: "Canvas", payload: PNG },
      { week: 2, kind: "image", post_id: "syn-2", role: "hero", alt: "Hero", payload: PNG },
      { week: 2, kind: "image", post_id: "syn-3", role: "spotlight", alt: "Remote", payload: "https://example.com/x.png" },
      { week: 3, kind: "image", post_id: "syn-4", role: "spotlight", alt: "Other week", payload: PNG },
    ];
    const a = collectWeekAssets(rows, 2);
    expect(a.manifest).toEqual({ week: 2, assets: [] });
    expect(Object.keys(a.images).sort()).toEqual(["post:syn-1", "post:syn-2"]);
    expect(a.hero).toEqual({ src: PNG, alt: "Hero" });
  });
  it("fails loudly on a corrupt bundle instead of silently reporting zero files", () => {
    expect(() => collectWeekAssets([{ ...bundle, payload: "{" }], 2)).toThrow(/ASSETS_INVALID/);
  });
});
