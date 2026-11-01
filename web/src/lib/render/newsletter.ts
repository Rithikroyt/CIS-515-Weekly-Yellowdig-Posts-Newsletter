// Renders the CIS 515 Community Dispatch from the reviewed editorial draft and the deterministic input package.
// The layout follows the Week 2 reference issue: ~640px email-safe tables, gray canvas, white body, black rules,
// maroon accents, Georgia headlines and Arial labels. Deterministic: the same draft and input give the same bytes.
// Every value is escaped; model text is data and never markup. Claims withheld by evidence review are omitted.
// The output has no scripts, no event handlers and no external resources.
import { WITHHELD_TEXT } from "../editorial/checks";
import type { EditorialDraft } from "../editorial/machine";
import type { Claim, EditorialInput, StepCategory } from "../editorial/types";

export type RenderOptions = {
  input: EditorialInput;
  draft: EditorialDraft;
  /** Post URLs keyed by postRef. Only https://yellowdig.app/ links are used. */
  postUrls?: Record<string, string>;
  /** Optional hero image; only data:image/png|jpeg|webp base64 URIs are used. */
  heroImage?: string;
};

export type RenderResult = { html: string; status: "ready" | "ready_with_omissions"; omittedClaims: number };

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const safeHref = (u: string | undefined) => (u && /^https:\/\/yellowdig\.app\/[^\s"'<>]*$/.test(u) ? esc(u) : null);
const safeImage = (u: string | undefined) => (u && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : null);
const firstName = (name: string) => trunc(name.trim().split(/\s+/)[0] || name, 40);

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";
const INK = "#1A1A1A", MUTED = "#555555", BODY2 = "#3D3D3D", MAROON = "#8C1D40", RULE = "#D4D4D4";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 23–28, 2026" from ISO dates, computed from the date part only so it does not depend on the server locale. */
export function formatRange(start: string, end: string): string {
  const p = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return { y, m, d }; };
  const a = p(start), b = p(end);
  if (![a.y, a.m, a.d, b.y, b.m, b.d].every(Number.isFinite)) return "";
  if (a.y !== b.y) return MONTHS[a.m - 1] + " " + a.d + ", " + a.y + "–" + MONTHS[b.m - 1] + " " + b.d + ", " + b.y;
  if (a.m !== b.m) return MONTHS[a.m - 1] + " " + a.d + "–" + MONTHS[b.m - 1] + " " + b.d + ", " + b.y;
  return MONTHS[a.m - 1] + " " + a.d + "–" + b.d + ", " + b.y;
}

const CHIP: Record<StepCategory, string> = {
  trigger: "Trigger", ai: "Model", judge: "Judge", code: "Logic", validator: "Logic", gate: "Logic",
  approval: "Human", action: "Action", storage: "Storage", tool: "Tool", errorPath: "Fallback", other: "Step",
};

function chips(path: Array<{ category: StepCategory; label: string }>): string {
  const items = path.slice(0, 7).map((c) => {
    const human = c.category === "approval";
    const box = human ? "border:1px solid " + MAROON + ";background:" + MAROON + ";color:#FFFFFF" : "border:1px solid " + INK + ";background:#FFFFFF;color:" + INK;
    return '<span style="display:inline-block;vertical-align:middle;' + box + ';padding:5px 8px;margin:0 0 6px">' +
      '<span style="display:block;font-family:' + SANS + ';font-size:9px;letter-spacing:1px;text-transform:uppercase;color:' + (human ? "#FFFFFF" : MUTED) + '">' + esc(CHIP[c.category] ?? "Step") + "</span>" +
      '<span style="display:block;font-family:' + SANS + ';font-size:12px">' + esc(trunc(c.label, 40)) + "</span></span>";
  });
  const arrow = '<span style="display:inline-block;vertical-align:middle;font-family:' + SANS + ';font-size:12px;color:' + MUTED + ';padding:0 5px 6px">&rarr;</span>';
  return items.length ? '<div style="margin:0 0 14px">' + items.join(arrow) + "</div>" : "";
}

const sectionRule = (label: string) =>
  '<tr><td style="border-top:3px solid ' + INK + ";padding:10px 0 0;font-family:" + SANS + ";font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:" + MAROON + '">' + esc(label) + "</td></tr>";
const smallHead = (t: string) =>
  '<div style="font-family:' + SANS + ";font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:" + INK + ';margin:0 0 6px">' + esc(t) + "</div>";
const para = (t: string, size = 14) =>
  '<p style="font-family:' + SANS + ";font-size:" + size + "px;line-height:1.55;color:" + INK + ';margin:0 0 14px">' + esc(t) + "</p>";

export function renderNewsletter(o: RenderOptions): RenderResult {
  const { input, draft } = o;
  const nl = draft.newsletter;
  if (!nl) throw new Error("renderNewsletter: the draft has no newsletter (status " + draft.status + ")");
  let omitted = 0;
  const ok = (c: Claim | null | undefined): c is Claim => {
    if (!c) return false;
    if (c.text === WITHHELD_TEXT || !c.text.trim()) { omitted++; return false; }
    return true;
  };

  const posts = new Map(input.posts.map((p) => [p.postRef, p]));
  const profiles = new Map(input.workflowProfiles.map((p) => [p.workflowProfileRef, p]));
  const metric = (ref: string) => input.metrics.find((m) => m.ref === ref)?.value ?? null;
  const week = input.week;
  const range = formatRange(input.dateRange.start, input.dateRange.end);
  const synthetic = input.sourceStatus.provider === "synthetic-fixture";

  const title = ok(nl.hero.title) ? nl.hero.title.text : "CIS 515 Community Dispatch · Week " + week;
  const dek = ok(nl.hero.dek) ? nl.hero.dek.text : "";
  const out: string[] = [];
  const push = (s: string) => out.push(s);

  push("<!doctype html>");
  push('<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">');
  push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">');
  push("<title>" + esc(title) + "</title>");
  push("<style>@media only screen and (max-width: 620px) { .pad { padding: 24px 18px 32px !important; } .h1 { font-size: 32px !important; } .dek { font-size: 17px !important; } .num { font-size: 24px !important; } .lbl { font-size: 9px !important; letter-spacing: 0 !important; } .stat { padding-left: 8px !important; } .mast td { display: block !important; text-align: left !important; padding-bottom: 4px !important; } .two td { display: block !important; width: 100% !important; padding: 0 0 18px !important; } img { width: 100% !important; } }</style>");
  push('</head><body style="margin:0;padding:0;background:#F2F2F2">');
  if (dek) push('<div style="display:none;max-height:0;overflow:hidden">' + esc(trunc(dek, 200)) + "</div>");
  push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F2F2"><tr><td align="center" style="padding:24px 12px">');
  push('<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#FFFFFF">');
  push('<tr><td class="pad" style="padding:36px 48px 48px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">');

  // Masthead
  push('<tr><td style="border-bottom:3px solid ' + INK + ';padding:0 0 10px"><table role="presentation" class="mast" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
  push('<td style="font-family:' + SANS + ";font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:" + INK + '">ASU &middot; ' + esc(input.course.code) + " &middot; Community Dispatch</td>");
  push('<td align="right" style="font-family:' + SANS + ";font-size:11px;letter-spacing:1px;text-transform:uppercase;color:" + MUTED + '">Week ' + esc(week) + (range ? " &middot; " + esc(range) : "") + "</td>");
  push("</tr></table></td></tr>");

  if (synthetic) {
    push('<tr><td style="padding:16px 0 0"><div style="border:2px solid ' + MAROON + ";padding:10px 12px;font-family:" + SANS + ";font-size:13px;line-height:1.5;color:" + INK + '"><strong>Synthetic test issue.</strong> Every name, post and number here is invented to test the format. It is not real CIS 515 class data.</div></td></tr>');
  }

  // Hero
  push('<tr><td style="padding:26px 0 0">');
  push('<h1 class="h1" style="font-family:' + SERIF + ";font-weight:normal;font-size:44px;line-height:1.08;color:" + INK + ';margin:0 0 14px">' + esc(title) + "</h1>");
  if (dek) push('<p class="dek" style="font-family:' + SERIF + ";font-size:19px;line-height:1.45;color:" + BODY2 + ';margin:0 0 14px">' + esc(dek) + "</p>");
  const hero = safeImage(o.heroImage);
  if (hero) push('<img src="' + hero + '" width="544" alt="" style="display:block;width:100%;max-width:544px;height:auto;border:0;margin:6px 0 18px">');
  push('<p style="font-family:' + SANS + ";font-size:12px;color:" + MUTED + ';margin:0 0 24px">Built with n8n &mdash; drafted by AI, checked by code against the week&#39;s posts.</p>');
  push("</td></tr>");

  // Stats row: deterministic metrics only.
  const stats = [
    ["builds", metric("metric:posts")], ["comments", metric("metric:comments")],
    ["workflow files", metric("metric:workflowFiles")], ["people posting", metric("metric:uniqueAuthors")],
  ] as const;
  push('<tr><td style="border-top:1px solid ' + INK + ";border-bottom:1px solid " + INK + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
  stats.forEach(([label, value], i) => {
    const pad = i === 0 ? "padding:14px 0 14px 0;" : "padding:14px 0 14px 14px;";
    const border = i < stats.length - 1 ? "border-right:1px solid " + RULE + ";" : "";
    push('<td width="25%" valign="top" class="' + (i ? "stat" : "") + '" style="' + pad + border + '">' +
      '<div class="num" style="font-family:' + SERIF + ";font-size:32px;line-height:1;color:" + INK + '">' + (value === null ? "&ndash;" : esc(value)) + "</div>" +
      '<div class="lbl" style="font-family:' + SANS + ";font-size:11px;letter-spacing:1px;text-transform:uppercase;color:" + MUTED + ';padding-top:6px">' + esc(label) + "</div></td>");
  });
  push("</tr></table></td></tr>");

  // Introduction
  const intro = nl.executiveSummary.filter(ok).map((c) => c.text).join(" ");
  if (intro) push('<tr><td style="padding:26px 0 36px"><p style="font-family:' + SERIF + ";font-size:17px;line-height:1.6;color:" + INK + ';margin:0">' + esc(intro) + "</p></td></tr>");

  // 01 — Spotlights
  const spotlightRefs = new Set<string>();
  const spots = nl.spotlights.filter((s) => posts.has(s.postRef));
  let n = 1;
  if (spots.length) {
    push(sectionRule(String(n++).padStart(2, "0") + " — Spotlights"));
    for (const s of spots) {
      const p = posts.get(s.postRef)!;
      const text = ok(s.text) ? s.text.text : null;
      const borrow = ok(s.worthBorrowing) ? s.worthBorrowing.text : null;
      if (!text && !borrow) continue;
      spotlightRefs.add(s.postRef);
      const prof = p.workflowProfileRef ? profiles.get(p.workflowProfileRef) : undefined;
      const fp = nl.failurePath && nl.failurePath.postRef === s.postRef ? nl.failurePath : null;
      push('<tr><td style="padding:24px 0 30px;border-bottom:1px solid ' + RULE + '">');
      push('<div style="font-family:' + SANS + ";font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:" + MAROON + ';margin:0 0 6px">' + esc(s.label) + "</div>");
      push('<h2 style="font-family:' + SERIF + ";font-weight:normal;font-size:27px;line-height:1.15;color:" + INK + ';margin:4px 0 6px">' + esc(trunc(p.title, 140)) + "</h2>");
      push('<div style="font-family:' + SANS + ";font-size:13px;color:" + MUTED + ';margin:0 0 16px">' + esc(trunc(p.authorName, 80)) + " &middot; " + esc(p.commentCount) + (p.commentCount === 1 ? " comment" : " comments") + (prof ? " &middot; pipeline read from the workflow file" : "") + "</div>");
      if (text) push(para(text, 15));
      if (prof) push(chips(prof.mainPath));
      if (fp && ok(fp.control)) push('<p style="font-family:' + SANS + ";font-size:12px;font-style:italic;color:" + MUTED + ';margin:0 0 18px">' + esc(fp.control.text) + "</p>");
      if (fp) {
        const shown = [fp.failure, fp.recovery].filter(ok).map((c) => c.text).join(" ");
        if (shown) push(smallHead("What the test showed") + para(shown));
        if (ok(fp.lesson)) push(smallHead("Lesson") + para(fp.lesson.text));
      }
      if (borrow) push('<p style="font-family:' + SERIF + ";font-size:16px;font-style:italic;color:" + BODY2 + ';margin:6px 0 14px">Worth borrowing: ' + esc(borrow) + "</p>");
      const href = safeHref(o.postUrls?.[s.postRef]);
      if (href) push('<a href="' + href + '" style="font-family:' + SANS + ";font-size:13px;font-weight:bold;color:" + MAROON + ';text-decoration:none">Read ' + esc(firstName(p.authorName)) + "&#39;s post &rarr;</a>");
      push("</td></tr>");
    }
    push('<tr><td style="height:40px"></td></tr>');
  }

  // Themes
  const themes = nl.themes.filter((t) => ok(t.text));
  if (themes.length) {
    push(sectionRule(String(n++).padStart(2, "0") + " — Themes this week"));
    push('<tr><td style="padding:18px 0 30px">');
    themes.forEach((t) => push('<div style="font-family:' + SERIF + ";font-size:18px;color:" + INK + ';margin:0 0 4px">' + esc(trunc(t.title, 120)) + "</div>" +
      '<p style="font-family:' + SANS + ";font-size:14px;line-height:1.55;color:" + BODY2 + ';margin:0 0 16px">' + esc(t.text.text) + "</p>"));
    push("</td></tr>");
  }

  // In brief: every build, deterministic facts only (title, author, comment count).
  if (input.posts.length) {
    push(sectionRule(String(n++).padStart(2, "0") + " — In brief: every build this week"));
    push('<tr><td style="padding:10px 0 0"><p style="font-family:' + SERIF + ";font-size:15px;font-style:italic;color:" + BODY2 + ';margin:0 0 6px">All ' + esc(input.posts.length) + " builds. Red numbers are comment counts.</p></td></tr>");
    for (const p of input.posts) {
      const href = safeHref(o.postUrls?.[p.postRef]);
      const name = href ? '<a href="' + href + '" style="font-weight:bold;color:' + INK + ';text-decoration:none">' + esc(trunc(p.authorName, 80)) + "</a>" : "<b>" + esc(trunc(p.authorName, 80)) + "</b>";
      push('<tr><td style="padding:10px 0;border-bottom:1px solid #E5E5E5;font-family:' + SANS + ";font-size:13px;line-height:1.5;color:" + INK + '">' + name +
        " &mdash; <i>" + esc(trunc(p.title, 160)) + "</i>" + (spotlightRefs.has(p.postRef) ? ' <span style="color:' + MAROON + '">See the spotlight above.</span>' : "") +
        (p.commentCount ? ' <span style="color:' + MAROON + '">' + esc(p.commentCount) + "</span>" : "") + "</td></tr>");
    }
  }

  // Most discussed and most generous commenters (computed by code).
  const discussed = input.discussionSignals.mostDiscussed.filter((d) => posts.has(d.postRef) && d.commentCount > 0).slice(0, 4);
  const generous = input.discussionSignals.generousCommenters.filter((g) => g.commentsOnOthers > 0).slice(0, 3);
  if (discussed.length || generous.length) {
    const col = (head: string, rows: string[]) => '<td width="50%" valign="top" style="padding:0 16px 0 0">' + smallHead(head) +
      rows.map((r) => '<div style="font-family:' + SANS + ";font-size:14px;line-height:1.9;color:" + INK + '">' + r + "</div>").join("") + "</td>";
    push('<tr><td style="padding:36px 0 40px"><table role="presentation" class="two" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
    if (discussed.length) push(col("Most discussed", discussed.map((d) => { const p = posts.get(d.postRef)!; return esc(firstName(p.authorName)) + " &mdash; " + esc(trunc(p.title, 90)) + ' <span style="color:' + MAROON + '">' + esc(d.commentCount) + "</span>"; })));
    if (generous.length) push(col("Most generous commenters", generous.map((g) => esc(trunc(g.name, 60)) + ' <span style="color:' + MAROON + '">' + esc(g.commentsOnOthers) + "</span>")));
    push("</tr></table></td></tr>");
  }

  // From the discussion
  const highlights = nl.discussionHighlights.filter(ok);
  if (highlights.length) {
    push(sectionRule(String(n++).padStart(2, "0") + " — From the discussion"));
    push('<tr><td style="padding:18px 0 30px">' + highlights.map((h) => para(h.text)).join("") + "</td></tr>");
  }

  // What to carry forward
  const takeaways = nl.takeaways.filter((t) => ok(t.text));
  const patterns = nl.borrowThisPattern.filter((p) => ok(p.why));
  if (takeaways.length || patterns.length) {
    push(sectionRule(String(n++).padStart(2, "0") + " — What to carry into Week " + (week + 1)));
    if (takeaways.length) {
      push('<tr><td style="padding:18px 0 6px">');
      takeaways.forEach((t) => push('<div style="font-family:' + SERIF + ";font-size:18px;color:" + INK + ';margin:0 0 4px">' + esc(trunc(t.title, 120)) + "</div>" +
        '<p style="font-family:' + SANS + ";font-size:14px;line-height:1.55;color:" + BODY2 + ';margin:0 0 16px">' + esc(t.text.text) + "</p>"));
      push("</td></tr>");
    }
    if (patterns.length) {
      push('<tr><td style="padding:0 0 40px"><ol style="font-family:' + SERIF + ";font-size:17px;line-height:1.7;color:" + INK + ';margin:0;padding-left:22px">' +
        patterns.map((p) => "<li>" + esc(trunc(p.title, 120)) + ": " + esc(p.why.text) + "</li>").join("") + "</ol></td></tr>");
    }
  }

  // Provenance
  const posts_ = metric("metric:posts"), comments = metric("metric:comments");
  const prov = [
    "Generated from " + (posts_ ?? input.posts.length) + " Week " + week + " posts" + (comments !== null ? " and " + comments + " comments" : "") + (synthetic ? " in a synthetic test dataset." : " on Yellowdig."),
    "Numbers are counted in code. Summaries are AI-drafted and evidence-checked against the posts; they have not been reviewed by an instructor.",
    omitted ? omitted + (omitted === 1 ? " statement that did" : " statements that did") + " not pass evidence review " + (omitted === 1 ? "was" : "were") + " left out." : "",
  ].filter(Boolean).join(" ");
  push('<tr><td style="border-top:1px solid ' + INK + ";padding:14px 0 0;font-family:" + SANS + ";font-size:11px;line-height:1.6;color:" + MUTED + '">' + esc(prov) + "</td></tr>");

  push("</table></td></tr></table></td></tr></table></body></html>");
  return { html: out.join("\n") + "\n", status: omitted ? "ready_with_omissions" : "ready", omittedClaims: omitted };
}
