// Yellowdig pagination and HTTP failure handling. Documented response: { data, limit, offset, record-count, cursor, at-end }.
// The cursor is preferred over offset (per the API spec), so pages are followed by cursor only.
import { MAX_PAGE_SIZE, SourceError, type FailureCode, type FallbackReason, type SourceMode } from "./constants";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export type PageBody = { data: unknown[]; atEnd: boolean; cursor: string | null; recordCount: number | null };

/** Parses and shape-checks one page body (object or JSON text). */
export function parsePage(body: unknown): PageBody {
  let b = body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch {
      throw new SourceError("MALFORMED_RESPONSE", "a Yellowdig page is not valid JSON");
    }
  }
  if (!isObj(b) || !Array.isArray(b.data) || typeof b["at-end"] !== "boolean") {
    throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "a Yellowdig page has no data array or at-end flag");
  }
  const rc = b["record-count"];
  if (rc !== undefined && (typeof rc !== "number" || rc !== b.data.length)) {
    throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "record-count does not match the number of records");
  }
  if (b.data.length > MAX_PAGE_SIZE) throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "a page has more than " + MAX_PAGE_SIZE + " records");
  const cursor = typeof b.cursor === "string" && b.cursor ? b.cursor : null;
  return { data: b.data, atEnd: b["at-end"], cursor, recordCount: typeof rc === "number" ? rc : null };
}

const MAX_EMPTY_PAGES_IN_A_ROW = 2;

/** Feeds pages one by one and stops on loops, empty runs and the page limit. */
export class PageAssessor {
  private seenCursors = new Set<string>();
  private seenFingerprints = new Set<string>();
  private emptyRun = 0;
  readonly events: unknown[] = [];
  pages = 0;
  done = false;
  nextCursor: string | null = null;

  constructor(private readonly maxPages: number) {}

  add(body: unknown): void {
    if (this.done) throw new SourceError("PAGINATION_LOOP_DETECTED", "a page arrived after at-end");
    const page = parsePage(body);
    this.pages += 1;
    this.events.push(...page.data);

    if (page.data.length) {
      const fp = page.data.length + ":" + idHint(page.data[0]) + ":" + idHint(page.data[page.data.length - 1]);
      if (this.seenFingerprints.has(fp)) throw new SourceError("PAGINATION_LOOP_DETECTED", "page " + this.pages + " repeats an earlier page");
      this.seenFingerprints.add(fp);
      this.emptyRun = 0;
    } else if (!page.atEnd && ++this.emptyRun > MAX_EMPTY_PAGES_IN_A_ROW) {
      throw new SourceError("PAGINATION_LOOP_DETECTED", "too many empty pages in a row before at-end");
    }

    if (page.atEnd) {
      this.done = true;
      this.nextCursor = null;
      return;
    }
    if (!page.cursor) throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "page " + this.pages + " is not at-end but has no cursor");
    if (this.seenCursors.has(page.cursor)) throw new SourceError("PAGINATION_LOOP_DETECTED", "cursor repeated on page " + this.pages);
    this.seenCursors.add(page.cursor);
    this.nextCursor = page.cursor;
    if (this.pages >= this.maxPages) {
      throw new SourceError("PAGINATION_LIMIT_EXCEEDED", "reached the " + this.maxPages + "-page safety limit before at-end");
    }
  }

  /** Call after the last page; fails if the run stopped before at-end. */
  finish(): { events: unknown[]; pagesFetched: number } {
    if (!this.done) {
      if (this.pages >= this.maxPages) throw new SourceError("PAGINATION_LIMIT_EXCEEDED", "reached the " + this.maxPages + "-page safety limit before at-end");
      throw new SourceError("UNEXPECTED_RESPONSE_SHAPE", "pagination ended before at-end");
    }
    return { events: this.events, pagesFetched: this.pages };
  }
}

function idHint(ev: unknown): string {
  if (!isObj(ev)) return "?";
  const v = ev["event/squuid"] ?? ev["event/id"] ?? ev.squuid ?? ev.id;
  return typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(ev).slice(0, 64);
}

/** Assesses a complete list of pages (as returned by n8n's paginated HTTP Request). */
export function assessPages(bodies: unknown[], maxPages: number): { events: unknown[]; pagesFetched: number } {
  const a = new PageAssessor(maxPages);
  bodies.forEach((b) => a.add(b));
  return a.finish();
}

// ---------- Failure classification ----------
export type HttpFailure = { status?: number | null; message?: string | null; retryAfter?: string | number | null };
export type Classified = { code: FailureCode; retryable: boolean; httpStatus: number | null; retryAfterMs: number | null };

/** Maps an HTTP status or transport error to a failure code. Messages are only pattern-matched, never stored. */
export function classifyFailure(f: HttpFailure): Classified {
  let status = typeof f.status === "number" ? f.status : null;
  const msg = String(f.message ?? "");
  if (status === null) {
    // Only where a status is expected ("401 - …", "status code 429", "HTTP 503", "(429)"); never ports like ":443".
    const m = /(?:^\s*|\bstatus(?:\s*code)?\s*[:=]?\s*|\bHTTP\/?[\d.]*\s+|\()([45]\d\d)(?![\d:])/i.exec(msg);
    if (m) status = Number(m[1]);
  }
  const ra = f.retryAfter == null ? null : Number(f.retryAfter);
  const retryAfterMs = ra !== null && Number.isFinite(ra) && ra >= 0 ? ra * 1000 : null;
  const out = (code: FailureCode, retryable: boolean): Classified => ({ code, retryable, httpStatus: status, retryAfterMs });

  if (status === 401) return out("YELLOWDIG_UNAUTHORIZED", false);
  if (status === 403) return out("YELLOWDIG_FORBIDDEN", false);
  if (status === 404) return out("YELLOWDIG_NOT_FOUND", false);
  if (status === 429) return out("YELLOWDIG_RATE_LIMITED", true);
  if (status !== null && [500, 502, 503, 504].includes(status)) return out("YELLOWDIG_TEMPORARY_FAILURE", true);
  if (status !== null && status >= 400 && status < 500) return out("YELLOWDIG_BAD_REQUEST", false);
  if (status !== null && status >= 500) return out("YELLOWDIG_TEMPORARY_FAILURE", false);
  if (/credential/i.test(msg) && /(not|no|missing|set|found)/i.test(msg)) return out("YELLOWDIG_CREDENTIAL_NOT_CONFIGURED", false);
  if (/(json|unexpected token|parse)/i.test(msg)) return out("MALFORMED_RESPONSE", false);
  if (/(timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|network)/i.test(msg)) return out("YELLOWDIG_NETWORK_ERROR", true);
  return out("YELLOWDIG_TEMPORARY_FAILURE", false);
}

/** Exponential backoff without jitter (deterministic): 1s, 2s, 4s … capped; Retry-After wins when present. */
export function backoffMs(attempt: number, retryAfterMs: number | null = null, baseMs = 1000, capMs = 30000): number {
  if (retryAfterMs !== null) return Math.min(capMs, retryAfterMs);
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

const FALLBACK_FOR: Partial<Record<FailureCode, FallbackReason>> = {
  YELLOWDIG_CREDENTIAL_NOT_CONFIGURED: "YELLOWDIG_CREDENTIAL_NOT_CONFIGURED",
  YELLOWDIG_UNAUTHORIZED: "YELLOWDIG_UNAUTHORIZED",
  YELLOWDIG_FORBIDDEN: "YELLOWDIG_FORBIDDEN",
  YELLOWDIG_RATE_LIMITED: "YELLOWDIG_RATE_LIMITED",
  YELLOWDIG_TEMPORARY_FAILURE: "YELLOWDIG_TEMPORARY_FAILURE",
  YELLOWDIG_NETWORK_ERROR: "YELLOWDIG_TEMPORARY_FAILURE",
};

export type FailureDecision =
  | { action: "retry"; waitMs: number; attempt: number; code: FailureCode }
  | { action: "fallback"; fallbackReason: FallbackReason; code: FailureCode }
  | { action: "fail"; error: SourceError };

/**
 * attempt = number of failed attempts so far (1 on the first failure).
 * Retryable failures retry up to maxRetries times. After that, or for permanent failures:
 *  - auto mode falls back to the fixture for access/availability failures, with the reason recorded;
 *  - yellowdig mode always fails;
 *  - malformed or unexpected data always fails loudly in every mode.
 */
export function decideOnFailure(mode: SourceMode, c: Classified, attempt: number, maxRetries: number): FailureDecision {
  if (c.retryable && attempt <= maxRetries) return { action: "retry", waitMs: backoffMs(attempt, c.retryAfterMs), attempt, code: c.code };
  const reason = FALLBACK_FOR[c.code];
  if (mode === "auto" && reason) return { action: "fallback", fallbackReason: reason, code: c.code };
  const why = c.retryable ? " after " + (attempt - 1) + " retries" : "";
  return { action: "fail", error: new SourceError(c.code, "Yellowdig request failed" + (c.httpStatus ? " with HTTP " + c.httpStatus : "") + why, c.httpStatus) };
}

// ---------- Async driver (scripts and tests; n8n uses its HTTP Request node instead) ----------
export type FetchPage = (req: { url: string; query: Record<string, string> }) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;

/** Fetches every page with per-page retries. Throws SourceError on permanent failure; callers decide fallback. */
export async function fetchAllPages(
  url: string,
  opts: { pageSize: number; maxPages: number; maxRetries: number },
  fetchPage: FetchPage,
  sleep: (ms: number) => Promise<void>,
): Promise<{ events: unknown[]; pagesFetched: number; retries: number }> {
  const a = new PageAssessor(opts.maxPages);
  let retries = 0;
  while (!a.done) {
    const query: Record<string, string> = { limit: String(Math.min(opts.pageSize, MAX_PAGE_SIZE)) };
    if (a.nextCursor) query.cursor = a.nextCursor;
    for (let attempt = 1; ; attempt++) {
      let res: { status: number; body: unknown; headers?: Record<string, string> } | null = null;
      let failure: HttpFailure | null = null;
      try {
        res = await fetchPage({ url, query });
        if (res.status < 200 || res.status >= 300) failure = { status: res.status, retryAfter: res.headers?.["retry-after"] ?? null };
      } catch (e) {
        failure = { message: e instanceof Error ? e.message : String(e) };
      }
      if (!failure && res) { a.add(res.body); break; }
      const c = classifyFailure(failure!);
      if (c.retryable && attempt <= opts.maxRetries) {
        retries += 1;
        await sleep(backoffMs(attempt, c.retryAfterMs));
        continue;
      }
      throw new SourceError(c.code, "Yellowdig request failed" + (c.httpStatus ? " with HTTP " + c.httpStatus : "") + (c.retryable ? " after " + (attempt - 1) + " retries" : ""), c.httpStatus);
    }
  }
  const r = a.finish();
  return { ...r, retries };
}
