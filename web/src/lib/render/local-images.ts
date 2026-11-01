// Local image preparation for the finalizer: check, normalize, strip metadata, resize without cropping, encode.
// Runs only on the user's computer (sharp is a development dependency); nothing is uploaded anywhere.
import sharp from "sharp";

export const LOCAL_IMAGE_LIMITS = {
  /** Largest input file accepted. */
  inputBytes: 15 * 1024 * 1024,
  /** Largest decoded image (guards against decompression bombs). */
  inputPixels: 60_000_000,
  /** Output width: twice the 544px column, for sharp text on high-density screens. */
  maxWidth: 1088,
  /** Largest embedded data URI. */
  dataUriBytes: 900_000,
} as const;

export type PreparedImage = { src: string; width: number; height: number; format: "png" | "jpeg"; bytes: number };

/**
 * Returns a data URI for one local image. The file must really be a PNG, JPEG or WebP (decoded, not trusted by its
 * name). EXIF orientation is applied, then all metadata (EXIF, GPS, ICC, XMP, IPTC) is dropped. The image is only
 * scaled down, never cropped. PNG is kept when it stays small (sharper screenshot text), otherwise JPEG.
 */
export async function prepareLocalImage(buf: Buffer): Promise<PreparedImage> {
  if (buf.length === 0) throw new Error("[IMAGE_INVALID] empty file");
  if (buf.length > LOCAL_IMAGE_LIMITS.inputBytes) throw new Error("[IMAGE_TOO_LARGE] file is over " + LOCAL_IMAGE_LIMITS.inputBytes / 1024 / 1024 + " MB");
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(buf, { limitInputPixels: LOCAL_IMAGE_LIMITS.inputPixels }).metadata();
  } catch {
    throw new Error("[IMAGE_INVALID] not a readable image");
  }
  if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format)) throw new Error("[IMAGE_INVALID] only PNG, JPEG or WebP images are accepted");
  const base = () => sharp(buf, { limitInputPixels: LOCAL_IMAGE_LIMITS.inputPixels }).rotate().resize({ width: LOCAL_IMAGE_LIMITS.maxWidth, withoutEnlargement: true, fit: "inside" });
  const candidates: Array<{ format: "png" | "jpeg"; run: () => Promise<Buffer> }> = [];
  if (meta.format === "png") candidates.push({ format: "png", run: () => base().png({ compressionLevel: 9, palette: true }).toBuffer() });
  for (const q of [82, 70, 58]) candidates.push({ format: "jpeg", run: () => base().flatten({ background: "#FFFFFF" }).jpeg({ quality: q, mozjpeg: true }).toBuffer() });
  for (const c of candidates) {
    const out = await c.run();
    const src = "data:image/" + c.format + ";base64," + out.toString("base64");
    if (src.length > LOCAL_IMAGE_LIMITS.dataUriBytes) continue;
    const m = await sharp(out).metadata();
    if (m.exif || m.icc || m.xmp || m.iptc) throw new Error("[IMAGE_METADATA] metadata survived re-encoding");
    return { src, width: m.width ?? 0, height: m.height ?? 0, format: c.format, bytes: out.length };
  }
  throw new Error("[IMAGE_TOO_LARGE] image stays over the embed limit after re-encoding");
}
