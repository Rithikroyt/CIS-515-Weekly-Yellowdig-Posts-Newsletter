// Byte helpers that work in Node and in the n8n Code-node sandbox (no Buffer, TextEncoder or URL assumed).
import { createHash } from "node:crypto";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX: Record<string, number> = (() => {
  const m: Record<string, number> = { "-": 62, _: 63 }; // base64url too
  for (let i = 0; i < B64.length; i++) m[B64[i]] = i;
  return m;
})();

/** Decoded size of a base64 string without decoding it (for early size rejection). */
export function base64DecodedLength(b64: string): number {
  const s = b64.replace(/\s+/g, "");
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}

/** Strict base64 decoder. Returns null on any invalid character or length. */
export function decodeBase64(b64: string): Uint8Array | null {
  const s = b64.replace(/\s+/g, "").replace(/=+$/, "");
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64_INDEX[s[i]], b = B64_INDEX[s[i + 1]];
    const c = i + 2 < s.length ? B64_INDEX[s[i + 2]] : 0;
    const d = i + 3 < s.length ? B64_INDEX[s[i + 3]] : 0;
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.slice(0, o);
}

/** Decodes UTF-8 bytes to a string (invalid sequences become U+FFFD). */
export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp = 0xfffd, len = 1;
    if (b < 0x80) { cp = b; }
    else if (b >= 0xc2 && b < 0xe0 && i + 1 < bytes.length) { cp = ((b & 31) << 6) | (bytes[i + 1] & 63); len = 2; }
    else if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) { cp = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); len = 3; }
    else if (b >= 0xf0 && b < 0xf5 && i + 3 < bytes.length) { cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); len = 4; }
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

/** UTF-8 byte length of a string. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

export function sha256OfText(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function sha256OfBytes(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}
