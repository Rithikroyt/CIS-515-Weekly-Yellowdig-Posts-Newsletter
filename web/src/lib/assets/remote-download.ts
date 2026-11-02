// Downloads one original Yellowdig attachment image to memory, for the user's own computer only (shared by
// scripts/download-yellowdig-images.ts and the local finalize UI). No credentials, cookies or session are sent.
import { isAllowedAssetUrl, sniffImage, type Sniffed } from "./remote-image";

export const DOWNLOAD_LIMITS = { bytes: 25 * 1024 * 1024, redirects: 3, timeoutMs: 60_000 } as const;

export type Downloaded = { buf: Buffer; host: string; kind: Sniffed };

/** GET with manual redirects: every hop must be HTTPS on a Yellowdig host; the body must really be an image. */
export async function downloadAsset(url: string, fetchImpl: typeof fetch = fetch): Promise<Downloaded> {
  let current = url;
  for (let hop = 0; hop <= DOWNLOAD_LIMITS.redirects; hop++) {
    if (!isAllowedAssetUrl(current)) throw new Error("[URL_NOT_ALLOWED] only https URLs on yellowdig.app hosts are downloaded");
    const r = await fetchImpl(current, { redirect: "manual", credentials: "omit", headers: { accept: "image/*" }, signal: AbortSignal.timeout(DOWNLOAD_LIMITS.timeoutMs) });
    if (r.status >= 300 && r.status < 400) {
      const next = r.headers.get("location");
      if (!next) throw new Error("[DOWNLOAD_FAILED] redirect without a location");
      current = new URL(next, current).toString();
      continue;
    }
    if (!r.ok) throw new Error("[DOWNLOAD_FAILED] HTTP " + r.status);
    if (Number(r.headers.get("content-length") ?? "0") > DOWNLOAD_LIMITS.bytes) throw new Error("[IMAGE_TOO_LARGE] over " + DOWNLOAD_LIMITS.bytes / 1024 / 1024 + " MB");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > DOWNLOAD_LIMITS.bytes) throw new Error("[IMAGE_TOO_LARGE] over " + DOWNLOAD_LIMITS.bytes / 1024 / 1024 + " MB");
    const kind = sniffImage(buf);
    if (!kind) throw new Error("[NOT_AN_IMAGE] the file is not a PNG, JPEG, WebP or GIF image");
    return { buf, host: new URL(current).hostname, kind };
  }
  throw new Error("[DOWNLOAD_FAILED] more than " + DOWNLOAD_LIMITS.redirects + " redirects");
}

export type HeroFit = { ratio: number; fit: "good" | "weak" | "poor"; note: string };

/** How well an image suits the wide hero area (about 3:1 in the reference). Never used to crop; only to warn. */
export function heroFit(width: number, height: number): HeroFit {
  const ratio = height > 0 ? Math.round((width / height) * 100) / 100 : 0;
  if (ratio < 1) return { ratio, fit: "poor", note: "Poor hero fit — portrait image" };
  if (ratio < 1.3) return { ratio, fit: "weak", note: "Weak hero fit — nearly square" };
  return { ratio, fit: "good", note: "Good hero fit — wide image" };
}
