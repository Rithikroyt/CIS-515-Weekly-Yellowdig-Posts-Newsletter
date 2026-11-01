// Stable hashing and identifiers. Server and test use only (node:crypto).
import { createHash } from "node:crypto";

/** JSON.stringify with object keys sorted at every level, so equal data always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Hash of the source content for one run. Used in the idempotency key. */
export function inputHash(sourceContent: unknown): string {
  return sha256Hex(stableStringify(sourceContent));
}

/** course + term + week + source-content-hash. A repeated request with the same input maps to the same key. */
export function idempotencyKey(courseCode: string, term: string, week: number, contentHash: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [slug(courseCode), slug(term), "week-" + String(week).padStart(2, "0"), contentHash.slice(0, 16)].join(":");
}

/** Pseudonymous actor id: no Yellowdig user id leaves normalization. The salt is a server secret. */
export function pseudonymousId(sourceUserId: string, salt: string): string {
  return "u_" + sha256Hex(salt + ":" + sourceUserId).slice(0, 12);
}

export function issueIdFor(courseCode: string, term: string, week: number): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [slug(courseCode), slug(term), "week", String(week).padStart(2, "0")].join("-");
}
