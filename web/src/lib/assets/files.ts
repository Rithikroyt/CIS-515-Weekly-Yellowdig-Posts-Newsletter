// File-level checks for one uploaded asset: extension + MIME + content signature + size.
// Nothing here parses workflow JSON; that happens later, only for files that pass.
import type { AssetReason } from "./types";
import { ASSET_LIMITS } from "./limits";
import { base64DecodedLength, decodeBase64, sha256OfBytes, sha256OfText, utf8Decode, utf8Length } from "./bytes";

/** One uploaded file as received. Content is untrusted data. */
export type AssetInput = {
  postRef?: string | null;
  originalFilename: string;
  mimeType?: string;
  /** Workflow JSON as text. */
  contentText?: string;
  /** Any file as base64 (required for screenshots). */
  contentBase64?: string;
  uploadedAt?: string | null;
};

export type AssetKind = "n8n_workflow_json" | "workflow_screenshot";

const IMAGE_TYPES: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  jpeg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  webp: ["image/webp"],
};
/** Browsers report .json as any of these; the content check is what decides. */
const JSON_MIME = ["application/json", "text/json", "text/plain", "application/octet-stream", ""];

export type FileCheck =
  | { ok: true; kind: AssetKind; filename: string; mimeType: string; sizeBytes: number; sha256: string; text: string | null }
  | { ok: false; reason: AssetReason; kind: AssetKind | null; filename: string; mimeType: string; sizeBytes: number; sha256: string | null };

/** Basename only, unsafe characters replaced, starts with a letter or digit, max 120 characters. */
export function safeFilename(name: unknown): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  let s = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  if (s.length > ASSET_LIMITS.maxFilenameLength) {
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 ? s.slice(dot) : "";
    s = s.slice(0, ASSET_LIMITS.maxFilenameLength - ext.length) + ext;
  }
  return s || "unnamed";
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

function imageSignature(b: Uint8Array): "png" | "jpeg" | "webp" | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

/** Validates extension, MIME and content, and size against the limits. Never parses JSON. */
export function checkFile(input: AssetInput): FileCheck {
  const filename = safeFilename(input.originalFilename);
  const mimeType = String(input.mimeType ?? "").toLowerCase().split(";")[0].trim().slice(0, 80);
  const ext = extOf(String(input.originalFilename ?? ""));
  const fail = (reason: AssetReason, kind: AssetKind | null, sizeBytes = 0, sha256: string | null = null): FileCheck =>
    ({ ok: false, reason, kind, filename, mimeType, sizeBytes, sha256 });

  if (ext === "json") {
    if (!JSON_MIME.includes(mimeType)) return fail("MIME_MISMATCH", "n8n_workflow_json");
    let text: string;
    if (typeof input.contentText === "string") {
      const size = utf8Length(input.contentText);
      if (size > ASSET_LIMITS.workflowJsonMaxBytes) return fail("WORKFLOW_TOO_LARGE", "n8n_workflow_json", size);
      text = input.contentText;
    } else if (typeof input.contentBase64 === "string") {
      const est = base64DecodedLength(input.contentBase64);
      if (est > ASSET_LIMITS.workflowJsonMaxBytes) return fail("WORKFLOW_TOO_LARGE", "n8n_workflow_json", est);
      const bytes = decodeBase64(input.contentBase64);
      if (!bytes) return fail("CONTENT_MISMATCH", "n8n_workflow_json");
      text = utf8Decode(bytes);
    } else return fail("INVALID_ASSET_METADATA", "n8n_workflow_json");
    const size = utf8Length(text);
    if (size === 0 || !text.trim()) return fail("EMPTY_FILE", "n8n_workflow_json", size);
    // A JSON workflow must start with "{" (after an optional BOM and whitespace).
    if (!/^﻿?\s*\{/.test(text)) return fail("CONTENT_MISMATCH", "n8n_workflow_json", size, sha256OfText(text));
    return { ok: true, kind: "n8n_workflow_json", filename, mimeType: mimeType || "application/json", sizeBytes: size, sha256: sha256OfText(text), text };
  }

  if (ext in IMAGE_TYPES) {
    if (!IMAGE_TYPES[ext].includes(mimeType)) return fail("MIME_MISMATCH", "workflow_screenshot");
    if (typeof input.contentBase64 !== "string") return fail("INVALID_ASSET_METADATA", "workflow_screenshot");
    const est = base64DecodedLength(input.contentBase64);
    if (est > ASSET_LIMITS.screenshotMaxBytes) return fail("IMAGE_TOO_LARGE", "workflow_screenshot", est);
    const bytes = decodeBase64(input.contentBase64);
    if (!bytes) return fail("CONTENT_MISMATCH", "workflow_screenshot");
    if (bytes.length === 0) return fail("EMPTY_FILE", "workflow_screenshot");
    const sig = imageSignature(bytes);
    const expected = ext === "jpg" ? "jpeg" : ext;
    if (sig !== expected) return fail("CONTENT_MISMATCH", "workflow_screenshot", bytes.length, sha256OfBytes(bytes));
    return { ok: true, kind: "workflow_screenshot", filename, mimeType, sizeBytes: bytes.length, sha256: sha256OfBytes(bytes), text: null };
  }

  // .exe .js .ts .py .sh .bat .ps1 .html .svg .zip and anything else.
  return fail("UNSUPPORTED_FILE_TYPE", null);
}
