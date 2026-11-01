// Writes the frozen web copies of each issue:
//   web/public/issues/week-XX/issue.json        (copied from the source only for the synthetic reference week)
//   web/public/issues/week-XX/newsletter.html   (rendered from issue.json by lib/render/newsletter.ts)
//   web/content/week-XX/workflow-profiles.json  (only the profiles the issue references; server-only)
// Real issues will be written to web/public/issues by the Phase 5 publish step; this script then only renders.
// Usage (from web/): npm run issues:render
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { issueSchema } from "../src/lib/contracts";
import { renderNewsletter } from "../src/lib/render/newsletter";
import { COURSE_WEEKS, pad2 } from "../src/lib/issues/labels";
import { REPO_ROOT } from "./schemas";

const WEB = join(REPO_ROOT, "web");
/** The synthetic Week 2 fixture is shown as a clearly labelled reference issue. */
const REFERENCE_SOURCES: Record<number, string> = { 2: join(REPO_ROOT, "fixtures", "synthetic", "week-02") };

for (const week of COURSE_WEEKS) {
  const pub = join(WEB, "public", "issues", "week-" + pad2(week));
  const src = REFERENCE_SOURCES[week];
  if (src) {
    mkdirSync(pub, { recursive: true });
    copyFileSync(join(src, "issue.json"), join(pub, "issue.json"));
  }
  const issueFile = join(pub, "issue.json");
  if (!existsSync(issueFile)) continue;
  const issue = issueSchema.parse(JSON.parse(readFileSync(issueFile, "utf8")));
  writeFileSync(join(pub, "newsletter.html"), renderNewsletter(issue), "utf8");

  const profileSrc = src ? join(src, "workflow-profiles.json") : null;
  if (profileSrc && existsSync(profileSrc)) {
    const ids = new Set(issue.allBuilds.map((b) => b.workflowProfileId).filter(Boolean));
    const profiles = (JSON.parse(readFileSync(profileSrc, "utf8")) as Array<{ profileId: string }>).filter((p) => ids.has(p.profileId));
    const dir = join(WEB, "content", "week-" + pad2(week));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "workflow-profiles.json"), JSON.stringify(profiles, null, 2) + "\n", "utf8");
  }
  console.log("week " + week + ": " + issue.status + (issue.provenance.synthetic ? " (synthetic reference)" : ""));
}
