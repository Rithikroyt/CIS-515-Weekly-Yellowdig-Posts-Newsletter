// The one place that maps a course week to its Yellowdig topic. Posts are selected by the structured
// post/topics label, never by searching post text for a week number.
// Labels are recorded only after they were observed in live data (scripts/probe-yellowdig-topics.ts, 2026-11-01).
// Weeks whose topic has not been observed yet stay null, and generation refuses them with WEEK_NOT_CONFIGURED.
// Date windows are generous on purpose (late posts still carry the week's topic); the topic is the real filter.

export const WEEKS = [1, 2, 3, 4, 5] as const;
export type Week = (typeof WEEKS)[number];

export type WeekConfig = {
  week: Week;
  /** Exact structured post/topics label, or null until observed in live Yellowdig data. */
  topic: string | null;
  startDate: string | null;
  endDate: string | null;
  verifiedOn: string | null;
};

export const WEEK_TOPICS: Record<Week, WeekConfig> = {
  1: { week: 1, topic: "Week 1 - Weekly Workflow Show-and-Tell on Yellowdig", startDate: "2026-10-14", endDate: "2026-10-28", verifiedOn: "2026-11-01" },
  2: { week: 2, topic: "Week 2 - Weekly Workflow Show-and-Tell on Yellowdig", startDate: "2026-10-23", endDate: "2026-10-28", verifiedOn: "2026-11-01" },
  3: { week: 3, topic: null, startDate: null, endDate: null, verifiedOn: null },
  4: { week: 4, topic: null, startDate: null, endDate: null, verifiedOn: null },
  5: { week: 5, topic: null, startDate: null, endDate: null, verifiedOn: null },
};

export const DEFAULT_WEEK: Week = 4;

export const COURSE = { code: "CIS 515", name: "AI and Data Analytics Strategy", term: "2026 Fall B" } as const;
/** Yellowdig location and timezone (configuration, not secrets). */
export const YELLOWDIG_SOURCE = { network: "carey-school-of-business", communityId: "6acd2896-76e7-400f-9a00-cfd657470859", timezone: "America/Phoenix" } as const;

/** Server-side week check: an integer from 1 to 5. Strings, floats and anything else are rejected. */
export function parseWeek(v: unknown): Week | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? (v as Week) : null;
}

export function weekConfig(week: Week): WeekConfig {
  return WEEK_TOPICS[week];
}
