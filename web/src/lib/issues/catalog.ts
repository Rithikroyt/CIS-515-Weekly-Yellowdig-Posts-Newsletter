// Server-only issue loader. Reads the frozen issue files committed under web/public/issues/week-XX/ and the
// workflow profiles under web/content/week-XX/. Nothing here calls Yellowdig, n8n or an LLM, and nothing
// recomputes metrics: pages show exactly what the approved issue.json says.
import fs from "node:fs";
import path from "node:path";
import { issueSchema, workflowProfileSchema, type Issue, type WorkflowProfile } from "../contracts";
import { COURSE_WEEKS, pad2 } from "./labels";

export type WeekKind =
  | "published" // approved and published, real data
  | "approved" // approved, real data, not yet published
  | "reference" // approved synthetic fixture: shows the format, never real class data
  | "in-review" // exists but not approved: nothing is shown publicly
  | "draft"
  | "failed"
  | "invalid" // file exists but does not match the contract
  | "not-generated";

export type WeekEntry = {
  week: number;
  kind: WeekKind;
  /** Present only for displayable kinds (published, approved, reference). */
  issue: Issue | null;
  newsletterAvailable: boolean;
  pdfAvailable: boolean;
  errors: string[];
};

export const DISPLAYABLE: ReadonlySet<WeekKind> = new Set(["published", "approved", "reference"]);

const ROOT = process.cwd();
const issueDir = (week: number) => path.join(ROOT, "public", "issues", "week-" + pad2(week));
const contentDir = (week: number) => path.join(ROOT, "content", "week-" + pad2(week));

function classify(issue: Issue): WeekKind {
  if (issue.status === "approved" || issue.status === "published") {
    if (issue.provenance.synthetic || !issue.sourceSummary.verified) return "reference";
    return issue.status;
  }
  if (issue.status === "failed") return "failed";
  if (issue.status === "draft") return "draft";
  return "in-review";
}

/** Pure part of loading, so tests can feed raw JSON without touching the filesystem. */
export function entryFromRaw(week: number, raw: unknown, files: { newsletter: boolean; pdf: boolean }): WeekEntry {
  const parsed = issueSchema.safeParse(raw);
  if (!parsed.success) {
    // Paths only, never the offending values.
    const errors = parsed.error.issues.slice(0, 5).map((i) => (i.path.join("/") || "/") + ": " + i.message);
    return { week, kind: "invalid", issue: null, newsletterAvailable: false, pdfAvailable: false, errors };
  }
  if (parsed.data.week !== week) {
    return { week, kind: "invalid", issue: null, newsletterAvailable: false, pdfAvailable: false, errors: ["week: file is in week-" + pad2(week) + " but says week " + parsed.data.week] };
  }
  const kind = classify(parsed.data);
  const show = DISPLAYABLE.has(kind);
  return { week, kind, issue: show ? parsed.data : null, newsletterAvailable: show && files.newsletter, pdfAvailable: show && files.pdf, errors: [] };
}

const cache = new Map<number, WeekEntry>();

export function loadWeek(week: number): WeekEntry {
  const hit = cache.get(week);
  if (hit) return hit;
  const dir = issueDir(week);
  const file = path.join(dir, "issue.json");
  let entry: WeekEntry;
  if (!fs.existsSync(file)) {
    entry = { week, kind: "not-generated", issue: null, newsletterAvailable: false, pdfAvailable: false, errors: [] };
  } else {
    let raw: unknown = null;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      raw = null;
    }
    entry = entryFromRaw(week, raw, {
      newsletter: fs.existsSync(path.join(dir, "newsletter.html")),
      pdf: fs.existsSync(path.join(dir, "newsletter.pdf")),
    });
  }
  cache.set(week, entry);
  return entry;
}

export function loadAllWeeks(): WeekEntry[] {
  return COURSE_WEEKS.map((w) => loadWeek(w));
}

/** Profiles referenced by a displayable issue. Unreferenced or invalid profiles are never returned. */
export function loadProfiles(entry: WeekEntry): WorkflowProfile[] {
  if (!entry.issue) return [];
  const file = path.join(contentDir(entry.week), "workflow-profiles.json");
  if (!fs.existsSync(file)) return [];
  const referenced = new Set(entry.issue.allBuilds.map((b) => b.workflowProfileId).filter(Boolean));
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown[];
  return raw
    .map((p) => workflowProfileSchema.safeParse(p))
    .filter((r) => r.success)
    .map((r) => r.data!)
    .filter((p) => referenced.has(p.profileId));
}

/** Whether a screenshot referenced by the issue was actually published next to it. */
export function screenshotExists(week: number, src: string): boolean {
  return /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(src) && fs.existsSync(path.join(issueDir(week), src));
}

export const issueBasePath = (week: number) => "/issues/week-" + pad2(week) + "/";
