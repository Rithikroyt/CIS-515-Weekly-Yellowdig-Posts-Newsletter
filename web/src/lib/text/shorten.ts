// Shortening prose to a limit without leaving a half sentence. Only ever removes text, so evidence checks on the
// original stay valid for the result.

/** A sentence ends at . ! or ? (optionally followed by a closing quote or bracket) before whitespace or the end. */
const SENTENCE_END = /[.!?]["'”’)\]]*(?=\s|$)/g;

/**
 * Text no longer than `max` characters. Keeps the longest run of complete sentences that fits. If no complete
 * sentence fits (rare: one very long sentence, or a title), cuts at the last word boundary and adds "…", never
 * inside a word or an HTML entity such as "&amp;". Text within the limit is returned unchanged.
 */
export function shortenProse(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = chars.slice(0, max).join("");
  let end = -1;
  for (const m of head.matchAll(SENTENCE_END)) {
    const stop = (m.index ?? 0) + m[0].length;
    // The terminator must also end a sentence in the full text (not a decimal or an abbreviation cut by the limit).
    if (stop <= head.length && (stop === text.length || /\s/.test(text[stop]))) end = stop;
  }
  if (end > 0) return head.slice(0, end).trimEnd();
  const room = chars.slice(0, Math.max(1, max - 1)).join("");
  const space = room.search(/\s\S*$/);
  let cut = (space > max / 3 ? room.slice(0, space) : room).trimEnd().replace(/[,;:–—-]+$/, "").trimEnd();
  cut = cut.replace(/&[A-Za-z0-9#]*$/, "").trimEnd();
  return cut + "…";
}

/** The first `n` words, shortened like shortenProse: complete sentences where possible. */
export function shortenWords(text: string, n: number): string {
  const t = text.trim();
  const words = t.split(/\s+/);
  if (words.length <= n) return t;
  // Character position just after the n-th word.
  let pos = 0;
  for (let i = 0; i < n; i++) { pos = t.indexOf(words[i], pos) + words[i].length; }
  return shortenProse(t, pos);
}
