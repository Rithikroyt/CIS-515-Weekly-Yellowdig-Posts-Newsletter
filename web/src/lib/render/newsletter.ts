// Renders the standalone CIS 515 Community Dispatch from an approved issue.json. Deterministic: the same issue
// gives the same bytes. Every value is escaped; the output has no scripts, no event handlers and no external
// resources, so it is safe to open directly or inside a sandboxed iframe. AI never writes this HTML.
import type { Issue } from "../contracts";
import { METRIC_LABELS, SIGNAL_LABELS, STATUS_TEXT, pad2 } from "../issues/labels";

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only https://yellowdig.app/ links survive (the schema enforces it too). */
const safeHref = (u: string | null) => (u && /^https:\/\/yellowdig\.app\//.test(u) ? esc(u) : null);
const badge = (t: string) => '<span class="badge">' + esc(t) + "</span>";
const fmt = (n: number | null) => (n === null ? "Unavailable" : esc(n));

const CSS = [
  ":root{--ink:#172032;--ink2:#465065;--muted:#667085;--line:#ded8cf;--canvas:#f6f3ee;--maroon:#8c1d40;--gold:#ffc627;--teal:#0f766e;--amber:#9a5b08}",
  "*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.6 Georgia,'Times New Roman',serif}",
  ".page{max-width:760px;margin:0 auto;padding:32px 20px 48px;background:#fff}",
  "header.mast{border-bottom:3px solid var(--maroon);padding-bottom:16px;margin-bottom:24px}",
  ".kicker{font:600 12px/1.4 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--maroon)}",
  "h1{font-size:34px;line-height:1.15;margin:8px 0}h2{font-size:22px;margin:36px 0 8px;border-top:1px solid var(--line);padding-top:20px}h3{font-size:18px;margin:16px 0 4px}",
  ".dek{font-size:19px;color:var(--ink2)}.meta,.small{font:13px/1.5 system-ui,sans-serif;color:var(--muted)}",
  ".notice{border:2px solid var(--amber);background:#fff7e6;padding:12px 14px;font:14px/1.5 system-ui,sans-serif;margin:16px 0}",
  ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}",
  ".stat{border:1px solid var(--line);padding:10px 12px}.stat b{display:block;font:700 26px/1.2 system-ui,sans-serif}.stat span{font:13px/1.4 system-ui,sans-serif;color:var(--ink2)}",
  ".card{border:1px solid var(--line);border-left:4px solid var(--maroon);padding:12px 14px;margin:12px 0}",
  ".fail{border-left-color:#b42318}.badge{display:inline-block;font:600 11px/1.6 system-ui,sans-serif;letter-spacing:.04em;border:1px solid var(--line);padding:0 6px;margin-right:4px;color:var(--ink2)}",
  "table{border-collapse:collapse;width:100%;font:14px/1.5 system-ui,sans-serif}th,td{text-align:left;border-bottom:1px solid var(--line);padding:6px 4px;vertical-align:top}",
  "a{color:var(--maroon)}ul{padding-left:20px}footer{margin-top:40px;border-top:1px solid var(--line);padding-top:12px}",
  "@media print{body{background:#fff}.page{padding:0}a{color:var(--ink)}}",
].join("");

export function renderNewsletter(issue: Issue): string {
  const m = issue.metrics;
  const out: string[] = [];
  const push = (s: string) => out.push(s);
  const title = "CIS 515 Community Dispatch · Week " + issue.week;

  push("<!doctype html>");
  push('<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
  push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">');
  push("<title>" + esc(title + " — " + issue.hero.headline) + "</title><style>" + CSS + "</style></head><body><main class=\"page\">");

  push('<header class="mast"><div class="kicker">' + esc(issue.course.code) + " · " + esc(issue.term) + " · Week " + esc(issue.week) + "</div>");
  push('<div class="kicker" style="color:var(--ink)">CIS 515 Community Dispatch</div>');
  push("<h1>" + esc(issue.hero.headline) + "</h1>");
  push('<p class="dek">' + esc(issue.hero.dek) + "</p>");
  push('<p class="meta">' + esc(issue.dateRange.label) + " · Status: " + esc(STATUS_TEXT[issue.status]));
  if (issue.approvedAt) push(" · Approved " + esc(issue.approvedAt.slice(0, 10)) + (issue.approvedBy ? " by " + esc(issue.approvedBy) : ""));
  push("</p></header>");

  if (issue.provenance.synthetic || !issue.sourceSummary.verified) {
    push('<div class="notice"><strong>Reference issue — synthetic data.</strong> Every name, post and number in this issue is invented to demonstrate the format. It is not real CIS 515 class data.</div>');
  }

  push("<p>" + esc(issue.hero.intro) + "</p><p class=\"small\">" + badge("AI-DRAFTED") + badge("HUMAN-APPROVED") + "</p>");

  push("<h2>This week by the numbers</h2><p class=\"small\">" + badge("CODE-COUNTED") + "Counted by code from the source data.</p><div class=\"grid\">");
  METRIC_LABELS.forEach((d) => push('<div class="stat"><b>' + fmt(m[d.key]) + "</b><span>" + esc(d.label) + "</span></div>"));
  push("</div>");

  push("<h3>Reliability signals in " + esc(m.signals.profiledBuilds) + " profiled builds</h3><table><thead><tr><th>Signal</th><th>Builds</th><th>Meaning</th></tr></thead><tbody>");
  (Object.keys(SIGNAL_LABELS) as Array<keyof typeof SIGNAL_LABELS>).forEach((k) => {
    const v = (m.signals as Record<string, number>)[k];
    if (v === undefined) return;
    push("<tr><td>" + esc(SIGNAL_LABELS[k].label) + "</td><td>" + esc(v) + "</td><td>" + esc(SIGNAL_LABELS[k].definition) + "</td></tr>");
  });
  push("</tbody></table>");
  if (m.externalServices.length) {
    push('<p class="small">External services: ' + m.externalServices.map((s) => esc(s.name) + " (" + esc(s.builds) + ")").join(", ") + "</p>");
  }

  if (issue.themes.length) {
    push("<h2>Themes</h2>");
    issue.themes.forEach((t) => push('<div class="card"><h3>' + esc(t.title) + "</h3><p>" + esc(t.description) + '</p><p class="small">' + esc(t.postIds.length) + " builds</p></div>"));
  }

  if (issue.spotlights.length) {
    push("<h2>Spotlights</h2>");
    issue.spotlights.forEach((s) => {
      push('<div class="card"><div class="kicker">' + esc(s.category) + "</div><h3>" + esc(s.title) + '</h3><p class="small">' + esc(s.author) + " · " + esc(s.commentCount) + " comments</p>");
      push("<p>" + esc(s.narrative) + "</p>");
      if (s.testResult) push("<p><strong>Test result.</strong> " + esc(s.testResult) + "</p>");
      if (s.fromTheThread) push("<p><strong>From the thread.</strong> " + esc(s.fromTheThread) + "</p>");
      push("<p><strong>Worth borrowing.</strong> " + esc(s.worthBorrowing) + "</p>");
      if (s.chips.length) push('<p class="small">Path: ' + s.chips.map((c) => esc(c.label)).join(" → ") + "</p>");
      const href = safeHref(s.sourceUrl);
      if (href) push('<p class="small"><a href="' + href + '">Open the Yellowdig post</a></p>');
      push("</div>");
    });
  }

  if (issue.failurePath) {
    const f = issue.failurePath;
    push('<h2>Failure path of the week</h2><div class="card fail"><h3>' + esc(f.title) + '</h3><p class="small">' + esc(f.author) + "</p>");
    push("<p><strong>What failed.</strong> " + esc(f.whatFailed) + "</p><p><strong>What caught it.</strong> " + esc(f.whatCaughtIt) + "</p><p><strong>Lesson.</strong> " + esc(f.lesson) + "</p></div>");
  }

  const dh = issue.discussionHighlights;
  push("<h2>Discussion pulse</h2>");
  dh.synthesis.forEach((s) => push("<p>" + esc(s.text) + "</p>"));
  if (dh.mostDiscussed.length) {
    push("<h3>Most discussed</h3><table><thead><tr><th>Post</th><th>Author</th><th>Comments</th></tr></thead><tbody>");
    dh.mostDiscussed.forEach((p) => push("<tr><td>" + esc(p.title) + "</td><td>" + esc(p.author) + "</td><td>" + esc(p.commentCount) + "</td></tr>"));
    push("</tbody></table>");
  }
  if (dh.generousCommenters.length) {
    push("<h3>Generous commenters</h3><p class=\"small\">Comments on other people's posts. A count of participation, not a grade.</p><ul>");
    dh.generousCommenters.forEach((c) => push("<li>" + esc(c.name) + " — " + esc(c.commentsOnOthers) + "</li>"));
    push("</ul>");
  }

  if (issue.allBuilds.length) {
    push("<h2>All builds</h2><table><thead><tr><th>Build</th><th>Author</th><th>Signals</th></tr></thead><tbody>");
    issue.allBuilds.forEach((b) => {
      const sig = b.signals.map((k) => esc(SIGNAL_LABELS[k].label)).join(", ") || "—";
      push("<tr><td><strong>" + esc(b.title) + "</strong><br>" + esc(b.oneLine) + "</td><td>" + esc(b.author) + "</td><td>" + sig + "</td></tr>");
    });
    push("</tbody></table>");
  }

  if (issue.takeaways.length) {
    push("<h2>What to carry forward</h2>");
    issue.takeaways.forEach((t) => push("<h3>" + esc(t.title) + "</h3><p>" + esc(t.text) + "</p>"));
  }

  const meth = issue.methodology;
  push("<h2>Methodology and provenance</h2><ul class=\"small\">");
  push("<li>Source: " + esc(issue.sourceSummary.provider) + (issue.sourceSummary.verified ? " (verified)" : " (not verified)") + ", " + esc(issue.sourceSummary.eventCount) + " events, topic “" + esc(issue.sourceSummary.topic) + "”.</li>");
  push("<li>Numbers are counted by code. Prose is drafted by AI (" + esc(meth.llmProvider) + ") with evidence references checked by code, then approved by a person.</li>");
  push("<li>Revisions: " + esc(meth.revisionCount) + " of 2 allowed. Reviewer score: " + (meth.reviewerScore === null ? "none" : esc(meth.reviewerScore)) + ".</li>");
  meth.codeChecks.forEach((c) => push("<li>" + (c.passed ? "Passed: " : "Failed: ") + esc(c.name) + "</li>"));
  meth.notes.forEach((n) => push("<li>" + esc(n) + "</li>"));
  push("<li>Run " + esc(issue.provenance.runId) + " · input hash " + esc(issue.provenance.inputHash.slice(0, 16)) + "</li></ul>");

  push('<footer class="small">CIS 515 Community Dispatch · Week ' + esc(pad2(issue.week)) + " · " + esc(issue.course.name) + "</footer>");
  push("</main></body></html>\n");
  return out.join("");
}
