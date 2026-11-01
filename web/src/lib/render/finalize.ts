// Local image finalization: fills the invisible image slots of a generated issue with real class images chosen by a
// person. Pure (no files, no network); scripts/finalize-newsletter-images.ts does the file work on the user's own
// computer. Class images never leave that computer: nothing here uploads or fetches anything.
import { esc, heroBlock, heroCredit, spotlightImageBlock } from "./newsletter";

export type Slot = { slot: string; postRef: string | null; author: string | null; title: string | null; href: string | null; marker: string };
export type SlotImage = { src: string; alt: string };

const SLOT_RE = /<div class="img-slot" data-slot="([^"]+)"([^>]*) style="display:none"><\/div>/g;
const ATTR_RE = / data-([a-z-]+)="([^"]*)"/g;
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const HREF_RE = /^https:\/\/yellowdig\.app\/[^\s"'<>]*$/;

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Every slot in a generated issue, in document order ("hero", then "spotlight-1" …). */
export function findSlots(html: string): Slot[] {
  return [...html.matchAll(SLOT_RE)].map((m) => {
    const a: Record<string, string> = {};
    for (const x of m[2].matchAll(ATTR_RE)) a[x[1]] = unesc(x[2]);
    return { slot: unesc(m[1]), postRef: a["post-ref"] ?? null, author: a.author ?? null, title: a.title ?? null, href: a.href && HREF_RE.test(a.href) ? a.href : null, marker: m[0] };
  });
}

export type Fill = {
  /** Images keyed by slot id ("hero", "spotlight-2") or by a spotlight's post ref ("post:…"). */
  images: Record<string, SlotImage>;
  /** The spotlight slot (or post ref) the hero image comes from, for its credit line and link. */
  heroFrom?: string | null;
};

export type FillResult = { html: string; filled: string[]; missing: string[]; unknown: string[] };

/**
 * Replaces slot markers with image blocks identical to the renderer's own. Unknown keys are reported, never guessed;
 * slots without an image keep their invisible marker, so the issue still reads as complete.
 */
export function fillSlots(html: string, fill: Fill): FillResult {
  const slots = findSlots(html);
  const bySlot = new Map(slots.map((s) => [s.slot, s]));
  const byPost = new Map(slots.filter((s) => s.postRef).map((s) => [s.postRef!, s]));
  const resolve = (key: string) => bySlot.get(key) ?? byPost.get(key) ?? null;
  const images = new Map<string, SlotImage>();
  const unknown: string[] = [];
  for (const [key, img] of Object.entries(fill.images)) {
    const s = resolve(key);
    if (!s) { unknown.push(key); continue; }
    if (!IMAGE_RE.test(img.src)) throw new Error("[IMAGE_INVALID] " + key + ": only data:image/png|jpeg|webp base64 images can be embedded");
    images.set(s.slot, img);
  }
  const from = fill.heroFrom ? resolve(fill.heroFrom) : null;
  if (fill.heroFrom && !from) unknown.push("heroFrom:" + fill.heroFrom);
  let out = html;
  const filled: string[] = [];
  for (const s of slots) {
    const img = images.get(s.slot);
    if (!img) continue;
    const block = s.slot === "hero"
      ? heroBlock(img, from?.author && from.title ? heroCredit(from.author, from.title) : null, from?.href ? esc(from.href) : null)
      : spotlightImageBlock(img, s.href ? esc(s.href) : null);
    out = out.replace(s.marker, block);
    filled.push(s.slot);
  }
  return { html: out, filled, missing: slots.map((s) => s.slot).filter((x) => !filled.includes(x)), unknown };
}

/** Default alt text when the person gave none: names whose post the image comes from. */
export function defaultAlt(slot: Slot | null): string {
  return slot?.author ? "Screenshot from " + slot.author + "'s post" : "Screenshot from a student's post this week";
}
