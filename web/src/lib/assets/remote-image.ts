// Safety rules for downloading original Yellowdig attachment images to the user's own computer
// (scripts/download-yellowdig-images.ts). Pure: no network here.

/** Hosts an attachment URL (or any redirect hop) may use: yellowdig.app and its subdomains such as cdn-v2. */
export function isAllowedAssetUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const h = u.hostname.toLowerCase();
  // A DNS name under yellowdig.app only; IP literals (including private or local addresses) never match.
  return h === "yellowdig.app" || (h.endsWith(".yellowdig.app") && /^[a-z0-9.-]+$/.test(h));
}

export type Sniffed = { mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; ext: ".png" | ".jpg" | ".webp" | ".gif" };

/** The real image type from the file's first bytes; the server's content-type and the file name are not trusted. */
export function sniffImage(buf: Uint8Array): Sniffed | null {
  const b = (i: number) => buf[i];
  if (buf.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return { mime: "image/png", ext: ".png" };
  if (buf.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  if (buf.length >= 12 && String.fromCharCode(b(0), b(1), b(2), b(3)) === "RIFF" && String.fromCharCode(b(8), b(9), b(10), b(11)) === "WEBP") return { mime: "image/webp", ext: ".webp" };
  if (buf.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(b(0), b(1), b(2), b(3), b(4), b(5)))) return { mime: "image/gif", ext: ".gif" };
  return null;
}

/** Slot ids the finalizer understands: "hero" or "spotlight-<n>". */
export const SLOT_ID = /^(hero|spotlight-[1-9][0-9]?)$/;

/** Local file names: "spotlight-1.png" for a single image, "spotlight-1-2.png" when a slot has several. */
export const localName = (slot: string, index: number, count: number, ext: string) => slot + (count > 1 ? "-" + (index + 1) : "") + ext;
