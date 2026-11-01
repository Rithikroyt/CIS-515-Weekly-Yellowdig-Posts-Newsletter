// Run configuration: validation and source-mode resolution. Pure; the caller supplies all input.
import {
  DEFAULT_MAX_PAGES, DEFAULT_MAX_RETRIES, DEFAULT_TIMEZONE, MAX_PAGE_SIZE, SOURCE_MODES, SourceError,
  type FallbackReason, type SourceMode,
} from "./constants";
import { dateWindow, isCalendarDate, isValidTimeZone, localMidnightUtc, type DateWindow } from "./time";

export type RunConfig = {
  sourceMode: SourceMode;
  week: number;
  startDate: string;
  endDate: string;
  timezone: string;
  network: string;
  communityId: string;
  topic: string;
  topicId: string | null;
  /** Set by the operator once an n8n "Yellowdig API key" credential is attached. The key itself never appears here. */
  yellowdigCredentialConfigured: boolean;
  pageSize: number;
  maxPages: number;
  maxRetries: number;
  /** When false (default), a week with no matching posts fails with NO_MATCHING_POSTS. */
  allowEmpty: boolean;
  window: DateWindow;
};

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function bad(code: "CONFIG_INVALID" | "INVALID_WEEK" | "INVALID_DATE_RANGE", msg: string): never {
  throw new SourceError(code, msg);
}

function intIn(v: unknown, def: number, min: number, max: number, name: string): number {
  if (v === undefined || v === null || v === "") return def;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) bad("CONFIG_INVALID", name + " must be an integer from " + min + " to " + max);
  return n;
}

/** Validates untrusted run input. Throws SourceError on anything missing or out of range. */
export function validateRunConfig(input: unknown): RunConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) bad("CONFIG_INVALID", "run config must be an object");
  const c = input as Record<string, unknown>;

  const sourceMode = (c.sourceMode ?? "auto") as SourceMode;
  if (!SOURCE_MODES.includes(sourceMode)) bad("CONFIG_INVALID", "sourceMode must be one of " + SOURCE_MODES.join(", "));

  const week = typeof c.week === "string" ? Number(c.week) : c.week;
  if (typeof week !== "number" || !Number.isInteger(week) || week < 1 || week > 16) bad("INVALID_WEEK", "week must be an integer from 1 to 16");

  const timezone = (c.timezone ?? DEFAULT_TIMEZONE) as string;
  if (!isValidTimeZone(timezone)) bad("CONFIG_INVALID", "timezone is not a valid IANA zone");

  const { startDate, endDate } = c;
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) bad("INVALID_DATE_RANGE", "startDate and endDate must be real dates in YYYY-MM-DD form");
  if (startDate > endDate) bad("INVALID_DATE_RANGE", "startDate is after endDate");
  const spanDays = (localMidnightUtc(endDate, timezone) - localMidnightUtc(startDate, timezone)) / 86_400_000;
  if (spanDays > 31) bad("INVALID_DATE_RANGE", "date range is longer than 31 days");

  const network = c.network;
  const communityId = c.communityId;
  if (typeof network !== "string" || !SLUG.test(network)) bad("CONFIG_INVALID", "network is missing or has invalid characters");
  if (typeof communityId !== "string" || !SLUG.test(communityId)) bad("CONFIG_INVALID", "communityId is missing or has invalid characters");

  const topic = typeof c.topic === "string" ? c.topic.trim() : "";
  if (!topic || topic.length > 200) bad("CONFIG_INVALID", "topic is required (max 200 characters)");
  const topicId = c.topicId == null || c.topicId === "" ? null : String(c.topicId);

  const cred = c.yellowdigCredentialConfigured;
  if (cred !== undefined && typeof cred !== "boolean") bad("CONFIG_INVALID", "yellowdigCredentialConfigured must be a boolean");

  return {
    sourceMode, week, startDate, endDate, timezone, network, communityId, topic, topicId,
    yellowdigCredentialConfigured: cred === true,
    pageSize: intIn(c.pageSize, MAX_PAGE_SIZE, 1, MAX_PAGE_SIZE, "pageSize"),
    maxPages: intIn(c.maxPages, DEFAULT_MAX_PAGES, 1, 2000, "maxPages"),
    maxRetries: intIn(c.maxRetries, DEFAULT_MAX_RETRIES, 0, 5, "maxRetries"),
    allowEmpty: c.allowEmpty === true,
    window: dateWindow(startDate, endDate, timezone),
  };
}

export type SourceRoute = { route: "fixture" | "yellowdig"; fallbackReason: FallbackReason };

/**
 * fixture   → fixture, FIXTURE_FORCED
 * yellowdig → yellowdig, or fails when no credential is configured
 * auto      → yellowdig when a credential is configured, otherwise fixture with an explicit reason
 */
export function resolveSourceMode(config: RunConfig): SourceRoute {
  if (config.sourceMode === "fixture") return { route: "fixture", fallbackReason: "FIXTURE_FORCED" };
  if (config.yellowdigCredentialConfigured) return { route: "yellowdig", fallbackReason: "NONE" };
  if (config.sourceMode === "yellowdig") {
    throw new SourceError("YELLOWDIG_CREDENTIAL_NOT_CONFIGURED", "sourceMode is yellowdig but no Yellowdig credential is configured");
  }
  return { route: "fixture", fallbackReason: "YELLOWDIG_CREDENTIAL_NOT_CONFIGURED" };
}

export function eventsUrl(config: Pick<RunConfig, "network" | "communityId">, base: string): string {
  return base + "/network/" + encodeURIComponent(config.network) + "/community/" + encodeURIComponent(config.communityId) + "/events";
}
