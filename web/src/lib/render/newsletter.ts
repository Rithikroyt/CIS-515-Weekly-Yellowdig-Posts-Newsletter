// Renders the CIS 515 Community Dispatch from the reviewed editorial draft and the deterministic input package.
// Section order and design follow the Week 2 reference issue (docs/newsletter-quality-gap.md): ~640px email-safe
// tables, gray canvas, white body, black rules, maroon accents, Georgia headlines and Arial labels.
// Deterministic: the same draft, input and images give the same bytes. Every value is escaped; model text is data
// and never markup. Claims withheld by evidence review are omitted. No scripts, handlers or external resources.
import { WITHHELD_TEXT } from "../editorial/checks";
import { OTHER_BUILDS, SPOTLIGHT_MIN } from "../editorial/curate";
import type { EditorialDraft } from "../editorial/machine";
import type { Claim, EditorialInput, PostNote, StepCategory } from "../editorial/types";

/** A real post screenshot, already optimized and embedded (see scripts/assets-upload.ts). */
export type RenderImage = { src: string; alt: string };

export type RenderOptions = {
  input: EditorialInput;
  draft: EditorialDraft;
  /** Post URLs keyed by postRef. Only https://yellowdig.app/ links are used. */
  postUrls?: Record<string, string>;
  /** One screenshot per post, keyed by postRef. Only data:image/png|jpeg|webp base64 URIs are used. */
  images?: Record<string, RenderImage>;
  /** A screenshot chosen as the hero. Without one, a collage of up to three spotlight screenshots is used. */
  hero?: RenderImage | null;
};

export type QualityReport = {
  spotlights: number; everyBuild: number; groups: number; images: number;
  headlineWords: number; dekWords: number; introWords: number; takeaways: number; nextSteps: number;
  introSource: "ai" | "repaired" | "deterministic" | null;
};
export type RenderResult = {
  html: string; status: "ready" | "ready_with_omissions"; omittedClaims: number; quality: QualityReport;
};

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const clipWords = (s: string, n: number) => { const w = s.trim().split(/\s+/); return w.length > n ? w.slice(0, n).join(" ").replace(/[,;:.]$/, "") + "…" : s.trim(); };
const safeHref = (u: string | undefined) => (u && /^https:\/\/yellowdig\.app\/[^\s"'<>]*$/.test(u) ? esc(u) : null);
const safeImage = (i: RenderImage | null | undefined) =>
  i && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.src) ? { src: i.src, alt: trunc(String(i.alt ?? ""), 200) } : null;
const firstName = (name: string) => trunc(name.trim().split(/\s+/)[0] || name, 40);

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";
const INK = "#1A1A1A", MUTED = "#555555", BODY2 = "#3D3D3D", MAROON = "#8C1D40", RULE = "#D4D4D4";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The last week of the course: the closing section looks forward, not to a next week. */
const FINAL_WEEK = 5;

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
const imgTag = (i: { src: string; alt: string }, maxH: number) =>
  '<div style="max-height:' + maxH + 'px;overflow:hidden;border:1px solid ' + RULE + '"><img src="' + i.src + '" width="544" alt="' + esc(i.alt) +
  '" style="display:block;width:100%;max-width:544px;height:auto;border:0"></div>';

const STYLE = [
  "@media only screen and (max-width: 620px) { .pad { padding: 24px 18px 32px !important; } .h1 { font-size: 32px !important; } .dek { font-size: 17px !important; } .num { font-size: 24px !important; } .lbl { font-size: 9px !important; letter-spacing: 0 !important; } .stat { padding-left: 8px !important; } .mast td { display: block !important; text-align: left !important; padding-bottom: 4px !important; } .two td { display: block !important; width: 100% !important; padding: 0 0 18px !important; } img { width: 100% !important; } }",
  // Pagination rules apply to screen-media PDF rendering too, so they are not inside @media print.
  ".keep { break-inside: avoid; page-break-inside: avoid; }",
  "@media print { body { background: #FFFFFF !important; } }",
].join(" ");

export function renderNewsletter(o: RenderOptions): RenderResult {
  const { input, draft } = o;
  const nl = draft.newsletter;
  if (!nl) throw new Error("renderNewsletter: the draft has no newsletter (status " + draft.status + ")");
  let omitted = 0;
  // A newsletter claim: withheld text counts as an omission.
  const ok = (c: Claim | null | undefined): c is Claim => {
    if (!c) return false;
    if (c.text === WITHHELD_TEXT || !c.text.trim()) { omitted++; return false; }
    return true;
  };
  // A fallback claim from the notes or discussion: already screened by code, withheld ones are simply skipped.
  const usable = (c: Claim | null | undefined): c is Claim => !!c && c.text !== WITHHELD_TEXT && !!c.text.trim();

  const posts = new Map(input.posts.map((p) => [p.postRef, p]));
  const profiles = new Map(input.workflowProfiles.map((p) => [p.workflowProfileRef, p]));
  const notes = new Map<string, PostNote>(draft.postNotes.map((n) => [n.postRef, n]));
  const commentPost = new Map(input.posts.flatMap((p) => p.comments.map((c) => [c.commentRef, p.postRef] as const)));
  const metric = (ref: string) => input.metrics.find((m) => m.ref === ref)?.value ?? null;
  const href = (ref: string) => safeHref(o.postUrls?.[ref]);
  const image = (ref: string) => safeImage(o.images?.[ref]);
  const week = input.week;
  const range = formatRange(input.dateRange.start, input.dateRange.end);
  const synthetic = input.sourceStatus.provider === "synthetic-fixture";

  const title = ok(nl.hero.title) ? nl.hero.title.text : "CIS 515 Community Dispatch · Week " + week;
  const dek = ok(nl.hero.dek) ? nl.hero.dek.text : "";
  const out: string[] = [];
  const push = (s: string) => out.push(s);

  // 1. Preview text, then the canvas.
  push("<!doctype html>");
  push('<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">');
  push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">');
  push("<title>" + esc(title) + "</title>");
  push("<style>" + STYLE + "</style>");
  push('</head><body style="margin:0;padding:0;background:#F2F2F2">');
  if (dek) push('<div style="display:none;max-height:0;overflow:hidden">' + esc(trunc(dek, 200)) + "</div>");
  push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F2F2"><tr><td align="center" style="padding:24px 12px">');
  push('<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#FFFFFF">');
  push('<tr><td class="pad" style="padding:36px 48px 48px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">');

  // 2–3. Masthead with week and date range.
  push('<tr><td style="border-bottom:3px solid ' + INK + ';padding:0 0 10px"><table role="presentation" class="mast" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
  push('<td style="font-family:' + SANS + ";font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:" + INK + '">ASU &middot; ' + esc(input.course.code) + " &middot; Community Dispatch</td>");
  push('<td align="right" style="font-family:' + SANS + ";font-size:11px;letter-spacing:1px;text-transform:uppercase;color:" + MUTED + '">Week ' + esc(week) + (range ? " &middot; " + esc(range) : "") + "</td>");
  push("</tr></table></td></tr>");

  if (synthetic) {
    push('<tr><td style="padding:16px 0 0"><div style="border:2px solid ' + MAROON + ";padding:10px 12px;font-family:" + SANS + ";font-size:13px;line-height:1.5;color:" + INK + '"><strong>Synthetic test issue.</strong> Every name, post and number here is invented to test the format. It is not real CIS 515 class data.</div></td></tr>');
  }

  // Spotlights are decided by code (draft.selection); the editor's copy is merged in when it exists.
  const nlSpot = new Map(nl.spotlights.map((s) => [s.postRef, s]));
  const groupOf = new Map((draft.buildGroups?.groups ?? []).flatMap((g) => g.postRefs.map((r) => [r, g.title] as const)));
  const spots = draft.selection.spotlights.filter((s) => posts.has(s.postRef));

  // 4–7. Headline, dek, hero (chosen image, else a collage of up to three spotlight screenshots), credibility line.
  push('<tr><td style="padding:26px 0 0">');
  push('<h1 class="h1" style="font-family:' + SERIF + ";font-weight:normal;font-size:44px;line-height:1.08;color:" + INK + ';margin:0 0 14px">' + esc(title) + "</h1>");
  if (dek) push('<p class="dek" style="font-family:' + SERIF + ";font-size:19px;line-height:1.45;color:" + BODY2 + ';margin:0 0 14px">' + esc(dek) + "</p>");
  const hero = safeImage(o.hero);
  const collage = spots.map((s) => image(s.postRef)).filter((i): i is { src: string; alt: string } => !!i).slice(0, 3);
  let imagesShown = 0;
  if (hero) { push('<div style="margin:6px 0 18px">' + imgTag(hero, 360) + "</div>"); imagesShown++; }
  else if (collage.length >= 3) {
    push('<table role="presentation" class="collage" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr>' +
      collage.map((i, k) => '<td width="33%" valign="top" style="padding:0 ' + (k < 2 ? "6px" : "0") + ' 0 0"><div style="height:120px;overflow:hidden;border:1px solid ' + RULE + '"><img src="' + i.src + '" width="176" alt="' + esc(i.alt) + '" style="display:block;width:100%;height:auto;border:0"></div></td>').join("") +
      "</tr></table>");
    imagesShown += collage.length;
  }
  push('<p style="font-family:' + SANS + ";font-size:12px;color:" + MUTED + ';margin:0 0 24px">Built with n8n &mdash; drafted by AI, checked by code against the week&#39;s posts.</p>');
  push("</td></tr>");

  // 8. Four metrics, all computed by code. Unknown coverage shows a dash, never zero.
  const stats = [
    ["builds", metric("metric:posts")], ["comments", metric("metric:comments")],
    ["workflow files", metric("metric:workflowFiles")], ["images", metric("metric:screenshots")],
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

  // 9. Narrative introduction.
  const intro = nl.executiveSummary.filter(ok).map((c) => c.text).join(" ");
  if (intro) push('<tr><td style="padding:26px 0 36px"><p style="font-family:' + SERIF + ";font-size:17px;line-height:1.6;color:" + INK + ';margin:0">' + esc(intro) + "</p></td></tr>");

  // 10. 01 — Spotlights. Missing editor copy falls back to the screened post notes and discussion, never to nothing.
  const spotlightRefs = new Set<string>();
  const shown: string[] = [];
  for (const s of spots) {
    const p = posts.get(s.postRef)!;
    const e = nlSpot.get(s.postRef);
    const n = notes.get(s.postRef);
    const prof = p.workflowProfileRef ? profiles.get(p.workflowProfileRef) : undefined;
    const fp = nl.failurePath && nl.failurePath.postRef === s.postRef ? nl.failurePath : null;
    const pickText = (...cs: Array<Claim | null | undefined>) => cs.find((c, i) => (i === 0 ? ok(c) : usable(c)))?.text ?? null;
    const text = pickText(e?.text, n?.workflowPurpose, n?.summary);
    if (!text) continue;
    const fpTest = fp ? [fp.failure, fp.recovery].filter(ok).map((c) => c.text).join(" ") : "";
    const test = pickText(e?.testResult) ?? (fpTest || null) ?? pickText(null, n?.testPerformed, n?.failureOrLimitation);
    const threadFallback = draft.discussion.insights.find((i) => i.insight.evidenceRefs.some((r) => commentPost.get(r) === s.postRef))?.insight;
    const thread = pickText(e?.threadInsight, threadFallback);
    const borrow = pickText(e?.worthBorrowing, n?.reusableLesson);
    const control = fp && ok(fp.control) ? fp.control.text : usable(n?.humanControl) ? n!.humanControl!.text : null;
    const img = image(s.postRef);
    const link = href(s.postRef);
    spotlightRefs.add(s.postRef);
    const b: string[] = [];
    b.push('<tr><td class="keep" style="padding:24px 0 30px;border-bottom:1px solid ' + RULE + '">');
    const group = groupOf.get(s.postRef);
    b.push('<div style="font-family:' + SANS + ";font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:" + MAROON + ';margin:0 0 6px">' + (group && group !== OTHER_BUILDS ? esc(trunc(group, 60)) + " &middot; " : "") + esc(s.label) + "</div>");
    b.push('<h2 style="font-family:' + SERIF + ";font-weight:normal;font-size:27px;line-height:1.15;color:" + INK + ';margin:4px 0 6px">' + esc(trunc(p.title, 140)) + "</h2>");
    b.push('<div style="font-family:' + SANS + ";font-size:13px;color:" + MUTED + ';margin:0 0 16px">' + esc(trunc(p.authorName, 80)) + " &middot; " + esc(p.commentCount) + (p.commentCount === 1 ? " comment" : " comments") +
      " &middot; " + (prof ? "pipeline read from the workflow file" : "pipeline as described in the post") + "</div>");
    if (img) { b.push('<div style="margin:0 0 16px">' + (link ? '<a href="' + link + '" style="text-decoration:none">' + imgTag(img, 340) + "</a>" : imgTag(img, 340)) + "</div>"); imagesShown++; }
    b.push(para(text, 15));
    if (prof) b.push(chips(prof.mainPath));
    if (control) b.push('<p style="font-family:' + SANS + ";font-size:12px;font-style:italic;color:" + MUTED + ';margin:0 0 18px">' + esc(control) + "</p>");
    if (test) b.push(smallHead("What the test showed") + para(test));
    if (thread) b.push(smallHead("From the thread") + para(thread));
    if (borrow) b.push('<p style="font-family:' + SERIF + ";font-size:16px;font-style:italic;color:" + BODY2 + ';margin:6px 0 14px">Worth borrowing: ' + esc(borrow) + "</p>");
    if (link) b.push('<a href="' + link + '" style="font-family:' + SANS + ";font-size:13px;font-weight:bold;color:" + MAROON + ';text-decoration:none">Read ' + esc(firstName(p.authorName)) + "&#39;s post &rarr;</a>");
    b.push("</td></tr>");
    shown.push(b.join("\n"));
  }
  let n = 1;
  if (shown.length) {
    push(sectionRule(String(n++).padStart(2, "0") + " — Spotlights"));
    shown.forEach(push);
    push('<tr><td style="height:40px"></td></tr>');
  }

  // 11. 02 — In brief: every build, each exactly once, in code-validated groups.
  const seen = new Set<string>();
  const groups = (draft.buildGroups?.groups ?? []).map((g) => ({ title: g.title, refs: g.postRefs.filter((r) => posts.has(r) && !seen.has(r) && (seen.add(r), true)) })).filter((g) => g.refs.length);
  const left = input.posts.map((p) => p.postRef).filter((r) => !seen.has(r));
  if (left.length) {
    const other = groups.find((g) => g.title === OTHER_BUILDS);
    if (other) other.refs.push(...left); else groups.push({ title: groups.length ? OTHER_BUILDS : "Every build", refs: left });
  }
  let everyBuild = 0;
  if (input.posts.length) {
    push(sectionRule(String(n++).padStart(2, "0") + " — In brief: every build this week"));
    push('<tr><td style="padding:10px 0 0"><p style="font-family:' + SERIF + ";font-size:15px;font-style:italic;color:" + BODY2 + ';margin:0 0 6px">All ' + esc(input.posts.length) + " builds, grouped by what they do. Red numbers are comment counts.</p></td></tr>");
    for (const g of groups) {
      push('<tr><td class="keep" style="padding:26px 0 6px;border-bottom:1px solid ' + INK + ";font-family:" + SERIF + ";font-size:21px;color:" + INK + '">' + esc(trunc(g.title, 90)) +
        ' <span style="font-family:' + SANS + ";font-size:12px;color:" + MUTED + ';padding-left:6px">' + esc(g.refs.length) + (g.refs.length === 1 ? " build" : " builds") + "</span></td></tr>");
      for (const ref of g.refs) {
        const p = posts.get(ref)!;
        const link = href(ref);
        const name = link ? '<a href="' + link + '" style="font-weight:bold;color:' + INK + ';text-decoration:none">' + esc(trunc(p.authorName, 80)) + "</a>" : "<b>" + esc(trunc(p.authorName, 80)) + "</b>";
        const sum = notes.get(ref)?.summary;
        const line = usable(sum) ? " " + esc(clipWords(sum.text, 45)) : "";
        push('<tr><td class="keep" style="padding:10px 0;border-bottom:1px solid #E5E5E5;font-family:' + SANS + ";font-size:13px;line-height:1.5;color:" + INK + '">' + name +
          " &mdash; <i>" + esc(trunc(p.title, 160)) + "</i>." + line + (spotlightRefs.has(ref) ? ' <span style="color:' + MAROON + '">See the spotlight above.</span>' : "") +
          (p.commentCount ? ' <span style="color:' + MAROON + '">' + esc(p.commentCount) + "</span>" : "") + "</td></tr>");
        everyBuild++;
      }
    }
  }

  // 12. Most discussed and most generous commenters (computed by code).
  const discussed = input.discussionSignals.mostDiscussed.filter((d) => posts.has(d.postRef) && d.commentCount > 0).slice(0, 4);
  const generous = input.discussionSignals.generousCommenters.filter((g) => g.commentsOnOthers > 0).slice(0, 3);
  if (discussed.length || generous.length) {
    const col = (head: string, rows: string[]) => '<td width="50%" valign="top" style="padding:0 16px 0 0">' + smallHead(head) +
      rows.map((r) => '<div style="font-family:' + SANS + ";font-size:14px;line-height:1.9;color:" + INK + '">' + r + "</div>").join("") + "</td>";
    push('<tr><td class="keep" style="padding:36px 0 40px"><table role="presentation" class="two" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
    if (discussed.length) push(col("Most discussed", discussed.map((d) => { const p = posts.get(d.postRef)!; return esc(firstName(p.authorName)) + " &mdash; " + esc(trunc(p.title, 90)) + ' <span style="color:' + MAROON + '">' + esc(d.commentCount) + "</span>"; })));
    if (generous.length) push(col("Most generous commenters", generous.map((g) => esc(trunc(g.name, 60)) + ' <span style="color:' + MAROON + '">' + esc(g.commentsOnOthers) + "</span>")));
    push("</tr></table></td></tr>");
  }

  // 13. 03 — What to carry into next week: three titled lessons, then numbered actions.
  const takeaways = nl.takeaways.filter((t) => ok(t.text)).slice(0, 3);
  const steps = (nl.nextSteps ?? []).filter(ok).slice(0, 5);
  if (takeaways.length || steps.length) {
    push(sectionRule(String(n++).padStart(2, "0") + " — " + (week >= FINAL_WEEK ? "What to carry forward" : "What to carry into Week " + (week + 1))));
    if (takeaways.length) {
      push('<tr><td style="padding:18px 0 6px">');
      takeaways.forEach((t) => push('<div class="keep"><div style="font-family:' + SERIF + ";font-size:18px;color:" + INK + ';margin:0 0 4px">' + esc(trunc(t.title, 120)) + "</div>" +
        '<p style="font-family:' + SANS + ";font-size:14px;line-height:1.55;color:" + BODY2 + ';margin:0 0 16px">' + esc(t.text.text) + "</p></div>"));
      push("</td></tr>");
    }
    if (steps.length) {
      push('<tr><td class="keep" style="padding:0 0 40px"><ol style="font-family:' + SERIF + ";font-size:17px;line-height:1.7;color:" + INK + ';margin:0;padding-left:22px">' +
        steps.map((c) => "<li>" + esc(c.text) + "</li>").join("") + "</ol></td></tr>");
    }
  }

  // 14. Footer and provenance.
  const posts_ = metric("metric:posts"), comments = metric("metric:comments");
  const prov = [
    "Generated from " + (posts_ ?? input.posts.length) + " Week " + week + " posts" + (comments !== null ? " and " + comments + " comments" : "") + (synthetic ? " in a synthetic test dataset." : " on Yellowdig."),
    "Numbers are counted in code. Summaries are AI-drafted and evidence-checked against the posts; they have not been reviewed by an instructor.",
    draft.introSource === "deterministic" ? "The introduction was assembled by code from checked facts because the AI-written one did not pass evidence review." : "",
    omitted ? omitted + (omitted === 1 ? " statement that did" : " statements that did") + " not pass evidence review " + (omitted === 1 ? "was" : "were") + " left out." : "",
  ].filter(Boolean).join(" ");
  push('<tr><td style="border-top:1px solid ' + INK + ";padding:14px 0 0;font-family:" + SANS + ";font-size:11px;line-height:1.6;color:" + MUTED + '">' + esc(prov) + "</td></tr>");

  push("</table></td></tr></table></td></tr></table></body></html>");
  const quality: QualityReport = {
    spotlights: shown.length, everyBuild, groups: groups.length, images: imagesShown,
    headlineWords: words(title), dekWords: words(dek), introWords: words(intro), takeaways: takeaways.length, nextSteps: steps.length,
    introSource: draft.introSource ?? null,
  };
  return { html: out.join("\n") + "\n", status: omitted ? "ready_with_omissions" : "ready", omittedClaims: omitted, quality };
}

/**
 * Publication gate used by workflow 05. A week with at least SPOTLIGHT_MIN posts must render at least that many
 * spotlights. Without workflow files or screenshots the fix is supplying assets (NEEDS_ASSETS); otherwise the run
 * did not produce enough usable copy (NEWSLETTER_QUALITY_INCOMPLETE). Every post must appear in the every-build list.
 */
export function assertPublicationQuality(input: EditorialInput, r: RenderResult): void {
  if (r.quality.everyBuild !== input.posts.length) throw new Error("[NEWSLETTER_QUALITY_INCOMPLETE] every-build list has " + r.quality.everyBuild + " of " + input.posts.length + " posts");
  if (input.posts.length < SPOTLIGHT_MIN || r.quality.spotlights >= SPOTLIGHT_MIN) return;
  const files = input.metrics.find((m) => m.ref === "metric:workflowFiles")?.value ?? null;
  const shots = input.metrics.find((m) => m.ref === "metric:screenshots")?.value ?? null;
  if (!files && !shots) throw new Error("[NEEDS_ASSETS] only " + r.quality.spotlights + " spotlights without workflow files or screenshots");
  throw new Error("[NEWSLETTER_QUALITY_INCOMPLETE] only " + r.quality.spotlights + " spotlights");
}
