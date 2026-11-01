// Download safety rules for original Yellowdig attachment images. No network.
import { describe, expect, it } from "vitest";
import { SLOT_ID, isAllowedAssetUrl, localName, sniffImage } from "./remote-image";

describe("isAllowedAssetUrl", () => {
  it.each([
    ["https://cdn-v2.yellowdig.app/a/b.png", true],
    ["https://yellowdig.app/api/assets/x", true],
    ["http://cdn-v2.yellowdig.app/a.png", false],
    ["https://yellowdig.app.evil.example/a.png", false],
    ["https://evilyellowdig.app/a.png", false],
    ["https://user:pw" + "0040" + "cdn-v2.yellowdig.app/a.png", false],
    ["https://cdn-v2.yellowdig.app:8443/a.png", false],
    ["https://127.0.0.1/a.png", false],
    ["https://10.0.0.5/a.png", false],
    ["https://[::1]/a.png", false],
    ["file:///C:/a.png", false],
    ["javascript:alert(1)", false],
    ["not a url", false],
  ])("%s → %s", (url, ok) => expect(isAllowedAssetUrl(url)).toBe(ok));
});

describe("sniffImage", () => {
  it("detects the real type from the bytes, not the name", () => {
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ mime: "image/png", ext: ".png" });
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: "image/jpeg", ext: ".jpg" });
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toEqual({ mime: "image/webp", ext: ".webp" });
    expect(sniffImage(Buffer.from("GIF89a..."))).toEqual({ mime: "image/gif", ext: ".gif" });
    expect(sniffImage(Buffer.from("<html>not an image</html>"))).toBeNull();
    expect(sniffImage(Buffer.from('{"nodes":[]}'))).toBeNull();
  });
});

describe("names and slots", () => {
  it("uses deterministic local names", () => {
    expect(localName("spotlight-1", 0, 1, ".png")).toBe("spotlight-1.png");
    expect(localName("spotlight-1", 1, 3, ".jpg")).toBe("spotlight-1-2.jpg");
    expect(["hero", "spotlight-1", "spotlight-12"].every((s) => SLOT_ID.test(s))).toBe(true);
    expect(["spotlight-0", "../x", "hero2", "spotlight-1/../../x"].some((s) => SLOT_ID.test(s))).toBe(false);
  });
});
