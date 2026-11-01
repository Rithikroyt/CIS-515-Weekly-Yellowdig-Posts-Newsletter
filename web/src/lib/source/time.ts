// Timezone-aware date windows. A course day starts at local midnight in the course timezone, not UTC midnight.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when s is a real calendar date in YYYY-MM-DD form. */
export function isCalendarDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of tz from UTC at the given instant, in ms (local - UTC). */
function tzOffsetMs(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const p: Record<string, number> = {};
  parts.forEach((x) => { if (x.type !== "literal") p[x.type] = Number(x.value); });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
}

/** UTC instant of local midnight at the start of `date` in `tz`. */
export function localMidnightUtc(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffsetMs(tz, guess);
  const second = guess - tzOffsetMs(tz, first); // corrects across a DST change
  return second;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Canonical ISO 8601 UTC string without zero milliseconds, e.g. 2026-10-23T16:00:00Z. */
export function canonicalIso(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

export type DateWindow = { start: string; end: string; timezone: string; startUtc: string; endUtcExclusive: string };

/** Inclusive local dates [start, end] become the half-open UTC window [startUtc, endUtcExclusive). */
export function dateWindow(start: string, end: string, timezone: string): DateWindow {
  return {
    start, end, timezone,
    startUtc: canonicalIso(localMidnightUtc(start, timezone)),
    endUtcExclusive: canonicalIso(localMidnightUtc(addDays(end, 1), timezone)),
  };
}

/** Parses an ISO string or epoch number (seconds or ms) to epoch ms; NaN when unparseable or offset-less. */
export function parseTimestamp(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v !== "string") return NaN;
  // Require an explicit offset so a bare local time is never read as UTC.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) return NaN;
  return Date.parse(v);
}
