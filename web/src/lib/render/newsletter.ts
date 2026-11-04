// Renders the CIS 515 Community Dispatch from the reviewed editorial draft and the deterministic input package.
// Section order follows the Week 2 reference issue (docs/newsletter-quality-gap.md); the visual design is the
// Dispatch magazine layout (docs/newsletter-generator.md): an ASU maroon hero band with a gold rule, stat cards,
// spotlight cards with colour-coded pipelines, a build map and a dark closing panel. Email-safe: ~640px tables,
// inline styles, one 620px breakpoint, no scripts, handlers or external resources.
// Deterministic: the same draft, input and images give the same bytes. Every value is escaped; model text is data
// and never markup. Claims withheld by evidence review are omitted.
import { WITHHELD_TEXT } from "../editorial/checks";
import { shortenWords } from "../text/shorten";
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
  /**
   * Image bank: assetRef → data:image/png|jpeg|webp;base64 URI of a real post image. Which image appears where is
   * decided by code in the draft (draft.images); anything else in the bank is ignored, and other URIs are refused.
   */
  imageBank?: Record<string, string>;
  /** Intake alt text by assetRef, used when the curator gave none. */
  altText?: Record<string, string>;
};

export type QualityReport = {
  spotlights: number; everyBuild: number; groups: number; images: number;
  headlineWords: number; dekWords: number; introWords: number; takeaways: number; nextSteps: number;
  introSource: "ai" | "repaired" | "deterministic" | null;
  lessonsSource: "ai" | "validated_ai" | "deterministic_fallback" | null;
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
/** One-liner length: complete sentences within n words (shortenWords), never a half sentence where avoidable. */
const clipWords = (s: string, n: number) => shortenWords(s, n);
const safeHref = (u: string | undefined) => (u && /^https:\/\/yellowdig\.app\/[^\s"'<>]*$/.test(u) ? esc(u) : null);
const safeImage = (i: RenderImage | null | undefined) =>
  i && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.src) ? { src: i.src, alt: trunc(String(i.alt ?? ""), 200) } : null;
const firstName = (name: string) => trunc(name.trim().split(/\s+/)[0] || name, 40);
/** Up to two initials for the byline badge, letters only. */
const initials = (name: string) => name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "·";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";
const INK = "#1A1A1A", MUTED = "#5E5E5E", BODY2 = "#3D3D3D", MAROON = "#8C1D40", RULE = "#E4DED3";
const DEEP = "#5A1028", GOLD = "#FFC627", GOLD_SOFT = "#FFF6DC", CREAM = "#FAF7F2", CANVAS = "#ECE8E1";
/** Build-map colours, one per group in order: maroon to gold to slate, each distinct from its neighbours. */
const GROUP_COLORS = ["#8C1D40", "#FFC627", "#C2546F", "#5C6B73", "#E59A2F", "#3E7C74", "#B9A9C9", "#9AA5AB"];
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

/** Pipeline chip label and colours per step category: models blue, tools teal, logic gold, people maroon. */
const CHIP: Record<StepCategory, { label: string; bg: string; fg: string }> = {
  trigger: { label: "Trigger", bg: "#EFEFEF", fg: "#333333" },
  ai: { label: "Model", bg: "#E8EEFB", fg: "#1F3F8F" }, judge: { label: "Judge", bg: "#E8EEFB", fg: "#1F3F8F" },
  code: { label: "Logic", bg: GOLD_SOFT, fg: "#7A5300" }, validator: { label: "Logic", bg: GOLD_SOFT, fg: "#7A5300" }, gate: { label: "Logic", bg: GOLD_SOFT, fg: "#7A5300" },
  approval: { label: "Human", bg: MAROON, fg: "#FFFFFF" },
  action: { label: "Action", bg: INK, fg: "#FFFFFF" },
  storage: { label: "Storage", bg: "#E2F3EF", fg: "#0B6B5D" }, tool: { label: "Tool", bg: "#E2F3EF", fg: "#0B6B5D" },
  errorPath: { label: "Fallback", bg: "#FBE9E7", fg: "#9A2A1A" }, other: { label: "Step", bg: "#EFEFEF", fg: "#333333" },
};

function chips(path: Array<{ category: StepCategory; label: string }>): string {
  const items = path.slice(0, 7).map((c) => {
    const k = CHIP[c.category] ?? CHIP.other;
    return '<span style="display:inline-block;vertical-align:middle;background:' + k.bg + ";color:" + k.fg + ';border-radius:6px;padding:6px 10px;margin:0 0 6px">' +
      '<span style="display:block;font-family:' + SANS + ';font-size:9px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;opacity:0.8">' + esc(k.label) + "</span>" +
      '<span style="display:block;font-family:' + SANS + ';font-size:12px;font-weight:bold">' + esc(trunc(c.label, 40)) + "</span></span>";
  });
  const arrow = '<span style="display:inline-block;vertical-align:middle;font-family:' + SANS + ";font-size:14px;color:#A89F94;padding:0 5px 6px\">&rsaquo;</span>";
  return items.length
    ? '<div style="background:' + CREAM + ";border:1px solid " + RULE + ';border-radius:8px;padding:12px 14px 8px;margin:0 0 16px">' +
      '<div style="font-family:' + SANS + ";font-size:10px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:" + MUTED + ';margin:0 0 8px">Pipeline &middot; read from the workflow file</div>' +
      items.join(arrow) + "</div>"
    : "";
}

const kicker = (t: string, color = MAROON) =>
  '<div style="font-family:' + SANS + ";font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:" + color + ';margin:0 0 6px">' + t + "</div>";
const smallHead = (t: string, color = INK) => kicker(esc(t), color);
/** Section heading: a large maroon number, the title, and a short rule. data-section carries the full label. */
const sectionHead = (num: string, title: string, sub?: string) =>
  '<div data-section="' + esc(num + " — " + title) + '" style="margin:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
  '<td width="62" valign="bottom" style="font-family:' + SERIF + ";font-size:44px;line-height:0.9;color:" + MAROON + '">' + esc(num) + "</td>" +
  '<td valign="bottom" style="border-bottom:2px solid ' + INK + ';padding:0 0 6px"><div style="font-family:' + SANS + ";font-size:13px;letter-spacing:2.5px;text-transform:uppercase;font-weight:bold;color:" + INK + '">' + esc(title) + "</div></td></tr></table>" +
  (sub ? '<p style="font-family:' + SERIF + ";font-size:15px;font-style:italic;line-height:1.5;color:" + BODY2 + ';margin:12px 0 0">' + esc(sub) + "</p>" : "") + "</div>";
const para = (t: string, size = 14, cls = "") =>
  '<p' + (cls ? ' class="' + cls + '"' : "") + ' style="font-family:' + SANS + ";font-size:" + size + "px;line-height:1.6;color:" + INK + ';margin:0 0 14px">' + esc(t) + "</p>";
/** A tinted panel with a small coloured heading. */
const panel = (head: string, body: string, accent: string) =>
  '<div style="background:' + CREAM + ";border-top:3px solid " + accent + ';padding:12px 14px 2px">' + smallHead(head, accent === GOLD ? "#7A5300" : accent) +
  '<p style="font-family:' + SANS + ";font-size:14px;line-height:1.55;color:" + INK + ';margin:0 0 12px">' + esc(body) + "</p></div>";
/** The whole screenshot, scaled to fit the column and a height cap; never cropped. */
const imgTag = (i: { src: string; alt: string }, maxH: number) =>
  '<div style="text-align:center;background:#F4F1EC;border:1px solid ' + RULE + ';border-radius:6px;padding:6px"><img src="' + i.src + '" alt="' + esc(i.alt) +
  '" style="display:inline-block;max-width:100%;max-height:' + maxH + 'px;width:auto;height:auto;border:0;vertical-align:top"></div>';
const pill = (t: string, bg: string, fg: string) =>
  '<span style="display:inline-block;background:' + bg + ";color:" + fg + ";font-family:" + SANS + ';font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;border-radius:10px;padding:3px 9px">' + t + "</span>";
const button = (href: string, label: string) =>
  '<a href="' + href + '" style="display:inline-block;background:' + MAROON + ";color:#FFFFFF;font-family:" + SANS + ';font-size:13px;font-weight:bold;text-decoration:none;border-radius:4px;padding:10px 18px">' + label + "</a>";
/** Integer percentages that sum to exactly 100 (largest remainder), for bar widths. */
function percents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (v * 100) / total);
  const out = raw.map(Math.floor);
  let rest = 100 - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i).forEach(({ i }) => { if (rest > 0) { out[i]++; rest--; } });
  return out;
}

/** Credibility line and footer sentence before anyone has reviewed the issue (escaped HTML, as rendered). */
export const UNREVIEWED_CREDIBILITY = "Built with n8n &mdash; drafted by AI, checked by code against the week&#39;s posts.";
export const UNREVIEWED_FOOTER = "Summaries are AI-drafted and evidence-checked against the posts; they have not been reviewed by an instructor.";
/** Lead spotlight image height cap (the other spotlights use 340px). */
export const LEAD_IMAGE_MAX = 420;
const SPOT_WORDS = 70, BRIEF_WORDS = 32;

/** The hero image with its credit line; shared with the local image finalizer so both produce identical markup. */
export function heroBlock(img: { src: string; alt: string }, credit: string | null, href: string | null): string {
  return '<div class="keep" style="margin:0 0 22px">' + (href ? '<a href="' + href + '" style="text-decoration:none">' + imgTag(img, 360) + "</a>" : imgTag(img, 360)) +
    (credit ? '<div style="font-family:' + SANS + ";font-size:11px;color:" + MUTED + ';padding-top:7px"><b style="color:' + MAROON + ';letter-spacing:1px;text-transform:uppercase">Cover</b> &nbsp;' + credit + "</div>" : "") + "</div>";
}

/** A spotlight's image, linked to its post when the link is verified; shared with the local image finalizer. */
export function spotlightImageBlock(img: { src: string; alt: string }, href: string | null, maxH = 340): string {
  return '<div style="margin:0 0 16px">' + (href ? '<a href="' + href + '" style="text-decoration:none">' + imgTag(img, maxH) + "</a>" : imgTag(img, maxH)) + "</div>";
}

/** Credit line under the hero: "From <author>'s post, <title>". Inputs are plain text and escaped here. */
export const heroCredit = (author: string, title: string) => "From " + esc(trunc(author, 80)) + "&#39;s post, <i>" + esc(trunc(title, 120)) + "</i>";

/**
 * An image slot: an invisible marker where a real class image can be inserted later on the user's own computer
 * (scripts/finalize-newsletter-images.ts). It takes no space, so the issue reads as finished without images.
 * Slot ids are deterministic: "hero", then "spotlight-1" … in spotlight order.
 */
export function slotMarker(slot: string, attrs: Record<string, string | null>): string {
  const a = Object.entries(attrs).filter(([, v]) => v !== null).map(([k, v]) => " data-" + k + '="' + esc(v) + '"').join("");
  return '<div class="img-slot" data-slot="' + esc(slot) + '"' + a + ' style="display:none"></div>';
}

const STYLE = [
  "@media only screen and (max-width: 620px) { .pad { padding: 26px 18px 32px !important; } .hero-pad { padding: 26px 20px 24px !important; } .card-pad { padding: 20px 16px 18px !important; } .h1 { font-size: 31px !important; } .dek { font-size: 17px !important; } .num { font-size: 24px !important; } .lbl { font-size: 9px !important; letter-spacing: 0 !important; } .stat { padding: 12px 6px !important; } .mast td { display: block !important; text-align: left !important; padding-bottom: 4px !important; } .two td { display: block !important; width: 100% !important; padding: 0 0 12px !important; } .h2 { font-size: 23px !important; } .lead-h2 { font-size: 26px !important; } img { max-width: 100% !important; height: auto !important; } }",
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
  const author = (ref: string) => posts.get(ref)?.authorName ?? "a student";
  // An image is shown only for its own post: the choice's postRef must match, and the bytes must be in the bank.
  const imageFor = (c: { postRef: string; assetRef: string; altText: string } | null | undefined, postRef: string) =>
    c && c.postRef === postRef && o.imageBank?.[c.assetRef]
      ? safeImage({ src: o.imageBank[c.assetRef], alt: c.altText || o.altText?.[c.assetRef] || "Screenshot from " + author(postRef) + "'s post" })
      : null;
  const choiceOf = new Map((draft.images?.choices ?? []).map((c) => [c.postRef, c]));
  const image = (ref: string) => imageFor(choiceOf.get(ref), ref);
  const week = input.week;
  const range = formatRange(input.dateRange.start, input.dateRange.end);
  const synthetic = input.sourceStatus.provider === "synthetic-fixture";

  const title = ok(nl.hero.title) ? nl.hero.title.text : "CIS 515 Community Dispatch · Week " + week;
  const dek = ok(nl.hero.dek) ? nl.hero.dek.text : "";
  const out: string[] = [];
  const push = (s: string) => out.push(s);

  // 1. Preview text, then the canvas and the card.
  push("<!doctype html>");
  push('<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">');
  push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">');
  push("<title>" + esc(title) + "</title>");
  push("<style>" + STYLE + "</style>");
  push('</head><body style="margin:0;padding:0;background:' + CANVAS + '">');
  if (dek) push('<div style="display:none;max-height:0;overflow:hidden">' + esc(trunc(dek, 200)) + "</div>");
  push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + CANVAS + '"><tr><td align="center" style="padding:24px 12px">');
  push('<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#FFFFFF">');

  // 2–7. Hero band: gold rule, masthead with week and date range, headline, dek, credibility line.
  push('<tr><td style="height:6px;line-height:6px;font-size:0;background:' + GOLD + '">&nbsp;</td></tr>');
  push('<tr><td class="hero-pad" style="background:' + DEEP + ";background-image:linear-gradient(135deg," + DEEP + " 0%," + MAROON + ' 62%,#A8325A 100%);padding:30px 44px 32px">');
  push('<table role="presentation" class="mast" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
  push('<td style="font-family:' + SANS + ";font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:bold;color:" + GOLD + '">ASU &middot; ' + esc(input.course.code) + " &middot; Community Dispatch</td>");
  push('<td align="right" style="font-family:' + SANS + ';font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#F1D3DD">Week ' + esc(week) + (range ? " &middot; " + esc(range) : "") + "</td>");
  push("</tr></table>");
  push('<div style="padding:26px 0 0">' + pill("Issue " + esc(String(week).padStart(2, "0")), GOLD, INK) + "</div>");
  push('<h1 class="h1" style="font-family:' + SERIF + ';font-weight:normal;font-size:42px;line-height:1.1;color:#FFFFFF;margin:14px 0 14px">' + esc(title) + "</h1>");
  if (dek) push('<p class="dek" style="font-family:' + SERIF + ';font-size:19px;line-height:1.5;color:#F6E3EA;margin:0 0 18px">' + esc(dek) + "</p>");
  push('<div style="border-top:1px solid #B4587A;padding:12px 0 0;font-family:' + SANS + ';font-size:12px;color:#EBC7D3">' + UNREVIEWED_CREDIBILITY + "</div>");
  push("</td></tr>");

  push('<tr><td class="pad" style="padding:30px 44px 44px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">');

  if (synthetic) {
    push('<tr><td style="padding:0 0 18px"><div style="border:2px solid ' + MAROON + ";padding:10px 12px;font-family:" + SANS + ";font-size:13px;line-height:1.5;color:" + INK + '"><strong>Synthetic test issue.</strong> Every name, post and number here is invented to test the format. It is not real CIS 515 class data.</div></td></tr>');
  }

  // Spotlights are decided by code (draft.selection); the editor's copy is merged in when it exists.
  const nlSpot = new Map(nl.spotlights.map((s) => [s.postRef, s]));
  const groupOf = new Map((draft.buildGroups?.groups ?? []).flatMap((g) => g.postRefs.map((r) => [r, g.title] as const)));
  const spots = draft.selection.spotlights.filter((s) => posts.has(s.postRef));

  // Cover image: one real post image chosen by code, credited to its post.
  const heroChoice = draft.images?.hero ?? null;
  const hero = heroChoice && posts.has(heroChoice.postRef) ? imageFor(heroChoice, heroChoice.postRef) : null;
  let imagesShown = 0;
  push("<tr><td>");
  if (hero) {
    push(heroBlock(hero, heroCredit(author(heroChoice!.postRef), posts.get(heroChoice!.postRef)!.title), href(heroChoice!.postRef)));
    imagesShown++;
  } else push(slotMarker("hero", {}));
  push("</td></tr>");

  // 8. Four stat cards, all computed by code. When asset coverage is unknown, the file and image counts give way to
  // other code-counted totals; a dash appears only when no counted value is available at all.
  const files = metric("metric:workflowFiles"), shots = metric("metric:screenshots");
  const stats: Array<[string, number | string | null]> = [
    ["builds", metric("metric:posts")], ["comments", metric("metric:comments")],
    files !== null ? ["workflow files", files] : ["people posting", metric("metric:uniqueAuthors")],
    shots !== null ? ["images", shots] : ["commenters", metric("metric:uniqueCommenters")],
  ];
  push('<tr><td style="padding:0 0 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
  stats.forEach(([label, value], i) => {
    if (i) push('<td width="8" style="font-size:0">&nbsp;</td>');
    push('<td width="25%" valign="top" class="stat" style="background:' + CREAM + ";border-top:3px solid " + (i % 2 ? GOLD : MAROON) +';padding:14px 12px">' +
      '<div class="num" style="font-family:' + SERIF + ";font-size:34px;line-height:1;color:" + MAROON + '">' + (value === null ? "&ndash;" : esc(value)) + "</div>" +
      '<div class="lbl" style="font-family:' + SANS + ";font-size:10px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:" + MUTED + ';padding-top:7px">' + esc(label) + "</div></td>");
  });
  push("</tr></table></td></tr>");

  // 8b. "This week in 60 seconds": counts from code and the checked lesson titles. Filled in once the sections below
  // are built, so every number is the one actually rendered.
  push("__BRIEF__");

  // 9. Narrative introduction, opened with a drop cap.
  const intro = nl.executiveSummary.filter(ok).map((c) => c.text).join(" ");
  if (intro) {
    const first = Array.from(intro)[0];
    const cap = /\p{L}/u.test(first)
      ? '<span style="float:left;font-family:' + SERIF + ";font-size:58px;line-height:0.85;color:" + MAROON + ';padding:6px 8px 0 0">' + esc(first) + "</span>" + esc(intro.slice(first.length))
      : esc(intro);
    push('<tr><td style="padding:28px 0 40px"><p style="font-family:' + SERIF + ";font-size:18px;line-height:1.65;color:" + INK + ';margin:0">' + cap + "</p></td></tr>");
  }

  // 10. 01 — Spotlights. Missing editor copy falls back to the screened post notes and discussion, never to nothing.
  const spotlightRefs = new Set<string>();
  const shown: string[] = [];
  let n = 1;
  const num = () => String(n).padStart(2, "0");
  for (const s of spots) {
    const p = posts.get(s.postRef)!;
    const e = nlSpot.get(s.postRef);
    const nt = notes.get(s.postRef);
    const prof = p.workflowProfileRef ? profiles.get(p.workflowProfileRef) : undefined;
    const fp = nl.failurePath && nl.failurePath.postRef === s.postRef ? nl.failurePath : null;
    const pickText = (...cs: Array<Claim | null | undefined>) => cs.find((c, i) => (i === 0 ? ok(c) : usable(c)))?.text ?? null;
    const text = pickText(e?.text, nt?.workflowPurpose, nt?.summary);
    if (!text) continue;
    const fpTest = fp ? [fp.failure, fp.recovery].filter(ok).map((c) => c.text).join(" ") : "";
    const test = pickText(e?.testResult) ?? (fpTest || null) ?? pickText(null, nt?.testPerformed, nt?.failureOrLimitation);
    const threadFallback = draft.discussion.insights.find((i) => i.insight.evidenceRefs.some((r) => commentPost.get(r) === s.postRef))?.insight;
    const thread = pickText(e?.threadInsight, threadFallback);
    const borrow = pickText(e?.worthBorrowing, nt?.reusableLesson);
    const control = fp && ok(fp.control) ? fp.control.text : usable(nt?.humanControl) ? nt!.humanControl!.text : null;
    const img = image(s.postRef);
    const link = href(s.postRef);
    const lead = shown.length === 0;
    spotlightRefs.add(s.postRef);
    const b: string[] = [];
    b.push('<tr><td style="padding:0 0 22px">');
    b.push('<div class="keep">' + (lead ? sectionHead(num(), "Spotlights", "Builds worth a closer look, chosen in code for the evidence they show: a workflow file, a real test, a useful thread. Not a ranking.") : ""));
    b.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ' + RULE + ";border-top:4px solid " + (lead ? MAROON : GOLD) + ';background:#FFFFFF"><tr><td class="card-pad" style="padding:24px 26px 22px">');
    const group = groupOf.get(s.postRef);
    b.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top">' +
      kicker(esc("Spotlight " + (shown.length + 1)) + ' <span style="color:#B8AFA3">/</span> ' + (group && group !== OTHER_BUILDS ? esc(trunc(group, 60)) + " &middot; " : "") + esc(s.label)) + "</td>" +
      (lead ? '<td align="right" valign="top" style="padding-left:8px">' + pill("Lead story", GOLD, INK) + "</td>" : "") + "</tr></table>");
    b.push('<h2 class="' + (lead ? "lead-h2" : "h2") + '" style="font-family:' + SERIF + ";font-weight:normal;font-size:" + (lead ? 32 : 26) + "px;line-height:1.15;color:" + INK + ';margin:4px 0 12px">' + esc(trunc(p.title, 140)) + "</h2>");
    b.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr>' +
      '<td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border-radius:17px;background:' + MAROON + ";color:#FFFFFF;font-family:" + SANS + ';font-size:12px;font-weight:bold;letter-spacing:0.5px">' + esc(initials(p.authorName)) + "</td>" +
      '<td style="padding-left:10px;font-family:' + SANS + ";font-size:13px;line-height:1.35;color:" + MUTED + '"><b style="color:' + INK + '">' + esc(trunc(p.authorName, 80)) + "</b><br>" +
      esc(p.commentCount) + (p.commentCount === 1 ? " comment" : " comments") + " &middot; " + (prof ? "pipeline read from the workflow file" : "pipeline as described in the post") + "</td></tr></table>");
    if (img) { b.push(spotlightImageBlock(img, link, lead ? LEAD_IMAGE_MAX : 340)); imagesShown++; }
    else b.push(slotMarker("spotlight-" + (shown.length + 1), { "post-ref": s.postRef, author: p.authorName, title: p.title, href: link ? o.postUrls![s.postRef] : null, size: lead ? "lead" : null }));
    b.push("</div>");
    b.push(para(clipWords(text, SPOT_WORDS), lead ? 16 : 15, "spot-text"));
    if (prof) b.push(chips(prof.mainPath));
    if (control) b.push('<p style="font-family:' + SANS + ";font-size:13px;font-style:italic;line-height:1.5;color:" + MUTED + ";border-left:2px solid " + GOLD + ';padding:0 0 0 10px;margin:0 0 18px">' + esc(control) + "</p>");
    // The lead spotlight shows its checked thread insight as a pull quote; the others pair test and thread side by side.
    if (lead) {
      if (test) b.push('<div class="keep" style="margin:0 0 16px">' + panel("What the test showed", test, MAROON) + "</div>");
      if (thread) b.push('<div class="keep pull" style="border-left:4px solid ' + MAROON + ';margin:4px 0 18px;padding:2px 0 2px 18px"><p style="font-family:' + SERIF + ";font-size:20px;line-height:1.45;font-style:italic;color:" + INK + ';margin:0 0 8px">&ldquo;' + esc(clipWords(thread, 45)) + '&rdquo;</p><div style="font-family:' + SANS + ";font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:" + MAROON + '">From the thread</div></div>');
    } else if (test && thread) {
      b.push('<div class="keep" style="margin:0 0 16px"><table role="presentation" class="two" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="50%" valign="top" style="padding:0 6px 0 0">' + panel("What the test showed", test, MAROON) + "</td>" +
        '<td width="50%" valign="top" style="padding:0 0 0 6px">' + panel("From the thread", thread, GOLD) + "</td></tr></table></div>");
    } else if (test) b.push('<div class="keep" style="margin:0 0 16px">' + panel("What the test showed", test, MAROON) + "</div>");
    else if (thread) b.push('<div class="keep" style="margin:0 0 16px">' + panel("From the thread", thread, GOLD) + "</div>");
    if (borrow) b.push('<div class="keep" style="background:' + GOLD_SOFT + ";border-left:4px solid " + GOLD + ';padding:12px 16px;margin:0 0 18px">' + kicker("Worth borrowing", "#7A5300") +
      '<p style="font-family:' + SERIF + ";font-size:16px;line-height:1.5;font-style:italic;color:" + INK + ';margin:0">' + esc(borrow) + "</p></div>");
    if (link) b.push(button(link, "Read " + esc(firstName(p.authorName)) + "&#39;s post &rarr;"));
    b.push("</td></tr></table></td></tr>");
    shown.push(b.join("\n"));
  }
  if (shown.length) {
    n++;
    shown.forEach(push);
    push('<tr><td style="height:26px;font-size:0">&nbsp;</td></tr>');
  }

  // 11. 02 — In brief: every build, each exactly once, in code-validated groups, opened by a build map.
  const seen = new Set<string>();
  const groups = (draft.buildGroups?.groups ?? []).map((g) => ({ title: g.title, refs: g.postRefs.filter((r) => posts.has(r) && !seen.has(r) && (seen.add(r), true)) })).filter((g) => g.refs.length);
  const left = input.posts.map((p) => p.postRef).filter((r) => !seen.has(r));
  if (left.length) {
    const other = groups.find((g) => g.title === OTHER_BUILDS);
    if (other) other.refs.push(...left); else groups.push({ title: groups.length ? OTHER_BUILDS : "Every build", refs: left });
  }
  const color = (k: number) => GROUP_COLORS[k % GROUP_COLORS.length];
  const swatch = (k: number) => '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + color(k) + ';vertical-align:middle;margin-right:7px"></span>';
  let everyBuild = 0;
  if (input.posts.length) {
    const widths = percents(groups.map((g) => g.refs.length));
    const legend = groups.map((g, k) => '<td width="50%" valign="top" style="padding:0 10px 6px 0;font-family:' + SANS + ";font-size:12px;line-height:1.4;color:" + INK + '">' + swatch(k) + esc(trunc(g.title, 60)) + ' <b style="color:' + MAROON + '">' + esc(g.refs.length) + "</b></td>");
    const legendRows: string[] = [];
    for (let i = 0; i < legend.length; i += 2) legendRows.push("<tr>" + legend[i] + (legend[i + 1] ?? '<td width="50%"></td>') + "</tr>");
    const map = '<div style="background:' + CREAM + ";border:1px solid " + RULE + ';padding:14px 16px 8px;margin:0 0 8px">' + kicker("Build map", MUTED) +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>' +
      groups.map((g, k) => '<td width="' + widths[k] + '%" style="height:14px;line-height:14px;font-size:0;background:' + color(k) + (k ? ";border-left:2px solid " + CREAM : "") + '">&nbsp;</td>').join("") + "</tr></table>" +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + legendRows.join("") + "</table></div>";
    let lead = sectionHead(num(), "In brief: every build this week", "All " + input.posts.length + " builds, grouped by what they do. Numbers on the right are comment counts.") + map;
    n++;
    groups.forEach((g, gi) => {
      // A group heading is never left alone at a page bottom: it shares a keep block with its first entry.
      const head = lead + '<div class="grp" style="padding:26px 0 8px;border-bottom:2px solid ' + color(gi) + ";font-family:" + SERIF + ";font-size:21px;color:" + INK + '">' + swatch(gi) + esc(trunc(g.title, 90)) +
        ' <span style="font-family:' + SANS + ";font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:" + MUTED + ';padding-left:6px">' + esc(g.refs.length) + (g.refs.length === 1 ? " build" : " builds") + "</span></div>";
      lead = "";
      g.refs.forEach((ref, k) => {
        const p = posts.get(ref)!;
        const link = href(ref);
        const name = link ? '<a href="' + link + '" style="font-weight:bold;color:' + INK + ';text-decoration:none">' + esc(trunc(p.authorName, 80)) + "</a>" : "<b>" + esc(trunc(p.authorName, 80)) + "</b>";
        const sum = notes.get(ref)?.summary;
        const line = usable(sum) ? " " + esc(clipWords(sum.text, BRIEF_WORDS)) : "";
        const star = spotlightRefs.has(ref) ? " " + pill("&#9733; Spotlight", GOLD_SOFT, "#7A5300") : "";
        const count = p.commentCount
          ? '<span style="display:inline-block;min-width:22px;text-align:center;background:' + CREAM + ";border:1px solid " + RULE + ";border-radius:11px;font-family:" + SANS + ";font-size:12px;font-weight:bold;color:" + MAROON + ';padding:2px 6px">' + esc(p.commentCount) + "</span>"
          : "";
        const entry = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #EEE9E1"><tr>' +
          '<td valign="top" style="padding:11px 0;font-family:' + SANS + ";font-size:13px;line-height:1.55;color:" + INK + '">' + name + star +
          "<br><i>" + esc(trunc(p.title, 160)) + "</i>." + line + "</td>" +
          '<td width="40" align="right" valign="top" style="padding:11px 0 11px 8px">' + count + "</td></tr></table>";
        push('<tr><td class="keep" style="padding:0">' + (k === 0 ? head : "") + entry + "</td></tr>");
        everyBuild++;
      });
    });
  }

  // 12. Most discussed and most generous commenters (computed by code), with bars scaled to the top count.
  const discussed = input.discussionSignals.mostDiscussed.filter((d) => posts.has(d.postRef) && d.commentCount > 0).slice(0, 4);
  const generous = input.discussionSignals.generousCommenters.filter((g) => g.commentsOnOthers > 0).slice(0, 3);
  if (discussed.length || generous.length) {
    const bar = (v: number, max: number) => {
      const w = Math.max(4, Math.round((v / max) * 100));
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0"><tr><td width="' + w + '%" style="height:5px;line-height:5px;font-size:0;background:' + MAROON + '">&nbsp;</td>' +
        (w < 100 ? '<td style="height:5px;line-height:5px;font-size:0;background:#E9E3DA">&nbsp;</td>' : "") + "</tr></table>";
    };
    const row = (rank: number, label: string, v: number, max: number) =>
      '<div style="padding:0 0 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td width="22" valign="top" style="font-family:' + SERIF + ";font-size:16px;color:" + MAROON + '">' + rank + "</td>" +
      '<td valign="top" style="font-family:' + SANS + ";font-size:13px;line-height:1.4;color:" + INK + '">' + label + "</td>" +
      '<td width="30" align="right" valign="top" style="font-family:' + SANS + ";font-size:13px;font-weight:bold;color:" + MAROON + '">' + esc(v) + "</td></tr>" +
      '<tr><td></td><td colspan="2">' + bar(v, max) + "</td></tr></table></div>";
    const col = (head: string, rows: string[], pad: string) => '<td width="50%" valign="top" style="padding:' + pad + '"><div style="background:' + CREAM + ";border:1px solid " + RULE + ';padding:14px 16px 4px">' + smallHead(head, MAROON) + rows.join("") + "</div></td>";
    push('<tr><td class="keep" style="padding:36px 0 42px"><table role="presentation" class="two" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
    const dMax = Math.max(...discussed.map((d) => d.commentCount), 1), gMax = Math.max(...generous.map((g) => g.commentsOnOthers), 1);
    if (discussed.length) push(col("Most discussed", discussed.map((d, i) => { const p = posts.get(d.postRef)!; return row(i + 1, "<b>" + esc(firstName(p.authorName)) + "</b> &mdash; " + esc(trunc(p.title, 90)), d.commentCount, dMax); }), generous.length ? "0 6px 0 0" : "0"));
    if (generous.length) push(col("Most generous commenters", generous.map((g, i) => row(i + 1, "<b>" + esc(trunc(g.name, 60)) + "</b>", g.commentsOnOthers, gMax)), discussed.length ? "0 0 0 6px" : "0"));
    push("</tr></table></td></tr>");
  }

  // 13. 03 — What to carry into next week: a dark panel with up to three titled lessons, then numbered actions.
  const takeaways = nl.takeaways.filter((t) => ok(t.text)).slice(0, 3);
  const steps = (nl.nextSteps ?? []).filter(ok).slice(0, 5);
  if (takeaways.length || steps.length) {
    const label = sectionHead(num(), week >= FINAL_WEEK ? "What to carry forward" : "What to carry into Week " + (week + 1));
    n++;
    const dark = "background:#2B0A16;background-image:linear-gradient(160deg,#2B0A16 0%," + DEEP + " 100%)";
    push('<tr><td class="keep" style="padding:0">' + label + "</td></tr>");
    if (takeaways.length) {
      push('<tr><td style="' + dark + ';padding:10px 26px 6px">');
      takeaways.forEach((t, k) => push('<div class="keep" style="padding:16px 0;' + (k ? "border-top:1px solid #6B2A40;" : "") + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="44" valign="top" style="font-family:' + SERIF + ";font-size:34px;line-height:1;color:" + GOLD + '">' + (k + 1) + "</td>" +
        '<td valign="top"><div style="font-family:' + SERIF + ';font-size:19px;line-height:1.3;color:#FFFFFF;margin:0 0 6px">' + esc(trunc(t.title, 120)) + "</div>" +
        '<p style="font-family:' + SANS + ';font-size:14px;line-height:1.6;color:#EBD3DB;margin:0">' + esc(t.text.text) + "</p></td></tr></table></div>"));
      push("</td></tr>");
    }
    if (steps.length) {
      push('<tr><td class="keep" style="background:' + GOLD_SOFT + ";border-left:4px solid " + GOLD + ';padding:18px 24px 14px">' + kicker("Try this week", "#7A5300") +
        '<ol style="font-family:' + SERIF + ";font-size:16px;line-height:1.65;color:" + INK + ';margin:0;padding-left:22px">' +
        steps.map((c) => '<li style="margin:0 0 6px">' + esc(c.text) + "</li>").join("") + "</ol></td></tr>");
    }
    push('<tr><td style="height:36px;font-size:0">&nbsp;</td></tr>');
  }

  // 14. Footer and provenance.
  const posts_ = metric("metric:posts"), comments = metric("metric:comments");
  const prov = [
    "Generated from " + (posts_ ?? input.posts.length) + " Week " + week + " posts" + (comments !== null ? " and " + comments + " comments" : "") + (synthetic ? " in a synthetic test dataset." : " on Yellowdig."),
    "Numbers are counted in code. " + UNREVIEWED_FOOTER,
    draft.introSource === "deterministic" ? "The introduction was assembled by code from checked facts because the AI-written one did not pass evidence review." : "",
    draft.lessonsSource === "deterministic_fallback" ? "Some closing lessons were assembled by code from checked statements in the spotlights." : "",
    omitted ? omitted + (omitted === 1 ? " statement that did" : " statements that did") + " not pass evidence review " + (omitted === 1 ? "was" : "were") + " left out." : "",
  ].filter(Boolean).join(" ");
  push('<tr><td style="border-top:2px solid ' + INK + ';padding:16px 0 0">' +
    '<div style="font-family:' + SERIF + ";font-size:16px;color:" + INK + ';margin:0 0 6px">' + esc(input.course.code) + ' Community Dispatch <span style="font-family:' + SANS + ";font-size:11px;letter-spacing:1px;text-transform:uppercase;color:" + MAROON + '">&middot; Week ' + esc(week) + "</span></div>" +
    '<div style="font-family:' + SANS + ";font-size:11px;line-height:1.6;color:" + MUTED + '">' + esc(prov) + "</div></td></tr>");

  const briefAt = out.indexOf("__BRIEF__");
  const briefLessons = nl.takeaways.filter((t) => usable(t.text)).slice(0, 3).map((t) => t.title);
  const issueLine = [shown.length ? shown.length + (shown.length === 1 ? " spotlight" : " spotlights") : "", everyBuild + " builds in " + groups.length + (groups.length === 1 ? " group" : " groups"), briefLessons.length ? briefLessons.length + (briefLessons.length === 1 ? " lesson" : " lessons") + " to carry forward" : ""].filter(Boolean).join(" · ");
  out[briefAt] = '<tr><td style="padding:20px 0 0"><div class="keep" style="background:' + GOLD_SOFT + ";border-left:5px solid " + GOLD + ';padding:16px 20px">' +
    '<div style="font-family:' + SANS + ";font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:" + MAROON + ';margin:0 0 4px">This week in 60 seconds</div>' +
    '<div style="font-family:' + SANS + ";font-size:12px;color:" + MUTED + ";margin:0 0 " + (briefLessons.length ? "10px" : "0") + '">In this issue: ' + esc(issueLine) + "</div>" +
    (briefLessons.length ? '<ol style="font-family:' + SERIF + ";font-size:17px;line-height:1.55;color:" + INK + ';margin:0;padding-left:22px">' + briefLessons.map((t) => "<li>" + esc(trunc(t, 90)) + "</li>").join("") + "</ol>" : "") +
    "</div></td></tr>";

  push("</table></td></tr>");
  push('<tr><td style="height:6px;line-height:6px;font-size:0;background:' + MAROON + '">&nbsp;</td></tr>');
  push("</table></td></tr></table></body></html>");
  const quality: QualityReport = {
    spotlights: shown.length, everyBuild, groups: groups.length, images: imagesShown,
    headlineWords: words(title), dekWords: words(dek), introWords: words(intro), takeaways: takeaways.length, nextSteps: steps.length,
    introSource: draft.introSource ?? null,
    lessonsSource: draft.lessonsSource ?? null,
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
  const hasAssets = input.workflowProfiles.length > 0 || input.posts.some((p) => (p.images ?? []).length > 0);
  if (!hasAssets) throw new Error("[NEEDS_ASSETS] only " + r.quality.spotlights + " spotlights without workflow files or screenshots");
  throw new Error("[NEWSLETTER_QUALITY_INCOMPLETE] only " + r.quality.spotlights + " spotlights");
}
