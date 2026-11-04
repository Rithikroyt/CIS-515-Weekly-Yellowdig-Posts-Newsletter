// The mixed design (reference layout + 60-second brief + lead spotlight + compact text) and the review credit.
// Synthetic data only.
import { describe, expect, it } from "vitest";
import * as E from "../editorial";
import { referenceWeek } from "../editorial/synthetic-reference";
import { applyReviewer, fillSlots, findSlots } from "./finalize";
import { LEAD_IMAGE_MAX, UNREVIEWED_CREDIBILITY, UNREVIEWED_FOOTER, renderNewsletter } from "./newsletter";

const NOW = () => "2026-11-04T12:00:00Z";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, "x").trim().split(/\s+/).filter(Boolean).length;

async function issue() {
  const week = referenceWeek();
  const input = E.buildEditorialInput({ dataset: week.dataset, manifest: week.manifest, profiles: week.profiles, images: [], course: { ...E.SYNTHETIC_COURSE }, coverageComplete: false });
  const draft = await E.runEditorial({ input, provider: E.createMockProvider(week.scenario), now: NOW });
  return { input, draft, r: renderNewsletter({ input, draft }) };
}

describe("60-second brief", () => {
  it("sits under the metrics with code-counted contents and the checked lesson titles", async () => {
    const { draft, r } = await issue();
    const html = r.html;
    const box = html.slice(html.indexOf("This week in 60 seconds"), html.indexOf("</ol>", html.indexOf("This week in 60 seconds")));
    expect(html.indexOf(">images<")).toBeLessThan(html.indexOf("This week in 60 seconds"));
    expect(html.indexOf("This week in 60 seconds")).toBeLessThan(html.indexOf("01 — Spotlights"));
    expect(box).toContain("In this issue: " + r.quality.spotlights + " spotlights · 27 builds in " + r.quality.groups + " groups · 3 lessons to carry forward");
    draft.newsletter!.takeaways.slice(0, 3).forEach((t) => expect(box).toContain("<li>" + t.title.replace(/'/g, "&#39;") + "</li>"));
    expect(html).not.toContain("__BRIEF__");
  });

  it("omits the lesson list, not the box, when there are no lessons", async () => {
    const { input, draft } = await issue();
    draft.newsletter!.takeaways = [];
    const html = renderNewsletter({ input, draft }).html;
    expect(html).toContain("This week in 60 seconds");
    expect(html).not.toMatch(/to carry forward/);
  });
});

describe("lead spotlight and compact text", () => {
  it("marks the first spotlight as the lead (taller image) and shows its thread insight as a pull quote", async () => {
    const { draft, r } = await issue();
    const slots = findSlots(r.html);
    expect(slots.find((s) => s.slot === "spotlight-1")!.lead).toBe(true);
    expect(slots.filter((s) => s.lead)).toHaveLength(1);
    const filled = fillSlots(r.html, { images: { "spotlight-1": { src: PNG, alt: "Lead canvas" }, "spotlight-2": { src: PNG, alt: "Second canvas" } } }).html;
    expect(filled).toContain("max-height:" + LEAD_IMAGE_MAX + "px");
    expect(filled).toContain("max-height:340px");
    const lead = draft.selection.spotlights[0].postRef;
    const thread = draft.newsletter!.spotlights.find((s) => s.postRef === lead)?.threadInsight;
    if (thread) expect(r.html).toMatch(/border-left:3px solid #8C1D40[^>]*><p style="[^"]*font-style:italic/);
  });

  it("keeps spotlight descriptions to about seventy words and every-build lines to about thirty, at sentence ends", async () => {
    const { r } = await issue();
    for (const m of r.html.matchAll(/<p style="font-family:Arial[^"]*font-size:1[56]px;line-height:1.55;color:#1A1A1A;margin:0 0 14px">([^<]*)<\/p>/g)) expect(words(m[1])).toBeLessThanOrEqual(70);
    const brief = r.html.slice(r.html.indexOf("02 — In brief"), r.html.indexOf("Most discussed"));
    for (const m of brief.matchAll(/<\/i>\.([^<]*)</g)) expect(words(m[1])).toBeLessThanOrEqual(32);
  });
});

describe("review credit", () => {
  it("is never claimed by a generated issue", async () => {
    const { r } = await issue();
    expect(r.html).toContain(UNREVIEWED_CREDIBILITY);
    expect(r.html).toContain(UNREVIEWED_FOOTER);
    expect(r.html).not.toMatch(/reviewed by [A-Z]/);
  });

  it("is added only by applyReviewer, in the credibility line and the footer", async () => {
    const { r } = await issue();
    const out = applyReviewer(r.html, "  Rithik   Roy Thati ");
    expect(out).toContain("drafted by AI, checked by code, reviewed by Rithik Roy Thati before sending.");
    expect(out).toContain("Summaries are AI-drafted, evidence-checked against the posts, and reviewed by Rithik Roy Thati before sending.");
    expect(out).not.toContain(UNREVIEWED_FOOTER);
    expect(() => applyReviewer(out, "Someone Else")).toThrow(/ALREADY_REVIEWED/);
    expect(() => applyReviewer(r.html, "<script>alert(1)</script>")).toThrow(/BAD_REVIEWER/);
    expect(() => applyReviewer(r.html, "x")).toThrow(/BAD_REVIEWER/);
    expect(applyReviewer(r.html, "Siobhán O'Neil-Ruiz")).toContain("reviewed by Siobhán O&#39;Neil-Ruiz before sending");
  });
});
