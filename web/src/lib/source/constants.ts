// Source-layer constants and the structured error type. No I/O.

export const YELLOWDIG_BASE_URL = "https://data.yellowdig.app";
export const MAX_PAGE_SIZE = 250; // documented hard maximum
export const DEFAULT_TIMEZONE = "America/Phoenix";
export const DEFAULT_MAX_PAGES = 400;
export const DEFAULT_MAX_RETRIES = 3;
export const PROBE_PAGE_SIZE = 10;

export const SOURCE_MODES = ["fixture", "yellowdig", "auto"] as const;
export type SourceMode = (typeof SOURCE_MODES)[number];

export const FALLBACK_REASONS = [
  "NONE",
  "FIXTURE_FORCED",
  "YELLOWDIG_CREDENTIAL_NOT_CONFIGURED",
  "YELLOWDIG_UNAUTHORIZED",
  "YELLOWDIG_FORBIDDEN",
  "YELLOWDIG_RATE_LIMITED",
  "YELLOWDIG_TEMPORARY_FAILURE",
] as const;
export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export const FAILURE_CODES = [
  "CONFIG_INVALID",
  "INVALID_WEEK",
  "INVALID_DATE_RANGE",
  "YELLOWDIG_CREDENTIAL_NOT_CONFIGURED",
  "YELLOWDIG_UNAUTHORIZED",
  "YELLOWDIG_FORBIDDEN",
  "YELLOWDIG_NOT_FOUND",
  "YELLOWDIG_BAD_REQUEST",
  "YELLOWDIG_RATE_LIMITED",
  "YELLOWDIG_TEMPORARY_FAILURE",
  "YELLOWDIG_NETWORK_ERROR",
  "MALFORMED_RESPONSE",
  "UNEXPECTED_RESPONSE_SHAPE",
  "FIELD_MAPPING_UNVERIFIED",
  "PAGINATION_LIMIT_EXCEEDED",
  "PAGINATION_LOOP_DETECTED",
  "NO_MATCHING_POSTS",
  "CONTRACT_VIOLATION",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/** Event types documented in the Yellowdig API spec (EventsFilter.types). */
export const KNOWN_EVENT_TYPES = ["post", "comment", "reaction", "view", "badge", "points-granted"] as const;
/** The subset the normalized contract uses. */
export const USED_EVENT_TYPES = ["post", "comment", "reaction", "view"] as const;

/** A classified failure. The message never contains secrets or raw payloads. */
export class SourceError extends Error {
  readonly code: FailureCode;
  readonly httpStatus: number | null;
  constructor(code: FailureCode, message: string, httpStatus: number | null = null) {
    super("[" + code + "] " + message);
    this.name = "SourceError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
