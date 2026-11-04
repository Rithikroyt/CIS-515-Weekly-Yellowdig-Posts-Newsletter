// Reference-quality structure: section order, spotlights, every-build coverage, metrics, images and the quality
// gate. Synthetic data only.
import { describe, expect, it } from "vitest";
import * as E from "../editorial";
import { chooseSpotlights, scorePost, validateBuildGroups, SPOTLIGHT_MAX, SPOTLIGHT_MIN } from "../editorial/curate";
import { indexInput } from "../editorial/checks";
import { assertPublicationQuality, esc, renderNewsletter } from "./newsletter";

const NOW = () => "2026-11-01T12:00:00Z";
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

async function draftFor(scenario: E.MockScenario = E.NAMED_SCENARIOS.clean) {
  const input = E.syntheticEditorialInput();
  const draft = await E.runEditorial({ input, provider: E.createMockProvider(scenario), now: NOW });
  return { input, draft };
}
const headings = (html: string) => [...html.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);

describe("reference section order", () => {
  it("renders the reference sections, in order, with no separate themes or discussion sections", async () => {
    const { input, draft } = await draftFor();
    const { html, quality } = renderNewsletter({ input, draft });
    expect(headings(html)).toEqual(["01 — Spotlights", "02 — In brief: every build this week", "03 — What to carry into Week 3"]);
    const order = ["display:none;max-height:0", "Community Dispatch", "Week 2 &middot; Oct", 'class="h1"', 'class="dek"', "Built with n8n", ">builds<", "01 — Spotlights", "02 — In brief", "Most discussed", "03 — What to carry", "Generated from"];
    const at = order.map((s) => html.indexOf(s));
    at.forEach((i, k) => expect(i, order[k]).toBeGreaterThan(-1));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).not.toMatch(/Themes this week|From the discussion/);
    expect(quality).toMatchObject({ spotlights: 6, everyBuild: input.posts.length, takeaways: 3, nextSteps: 4 });
  });

  it("keeps a structural snapshot", async () => {
    const { input, draft } = await draftFor();
    const { html } = renderNewsletter({ input, draft });
    const outline = [...html.matchAll(/<(h1|h2)[^>]*>([^<]+)<|data-section="(\d\d — [^"]+)"|class="grp"[^>]*><span[^>]*><\/span>([^<]+) </g)].map((m) => (m[2] ?? m[3] ?? m[4]).trim());
    expect(outline).toMatchSnapshot();
  });

  it("closes week 5 with \"What to carry forward\"", async () => {
    const { input, draft } = await draftFor();
    input.week = 5;
    expect(headings(renderNewsletter({ input, draft }).html)).toContain("03 — What to carry forward");
  });
});

describe("spotlights", () => {
  it("chooses 4–6 spotlights with valid, mostly distinct labels and at most two per build group", async () => {
    const { input, draft } = await draftFor();
    const s = draft.selection.spotlights;
    expect(s.length).toBeGreaterThanOrEqual(SPOTLIGHT_MIN);
    expect(s.length).toBeLessThanOrEqual(SPOTLIGHT_MAX);
    const idx = indexInput(input);
    s.forEach((x) => { const need = E.LABEL_REQUIRES[x.label]; if (need) expect(need(idx.profileOfPost.get(x.postRef)!)).toBe(true); });
    const group = new Map(draft.buildGroups.groups.flatMap((g) => g.postRefs.map((r) => [r, g.title] as const)));
    const perGroup = s.reduce<Record<string, number>>((m, x) => ((m[group.get(x.postRef)!] = (m[group.get(x.postRef)!] ?? 0) + 1), m), {});
    Object.values(perGroup).forEach((n) => expect(n).toBeLessThanOrEqual(2));
    expect(new Set(s.map((x) => x.label)).size).toBeGreaterThanOrEqual(3);
  });

  it("scores evidence, never comment counts or views", () => {
    const input = E.syntheticEditorialInput();
    const p = copy(input.posts[0]);
    const base = scorePost({ ...p, comments: [], commentCount: 999, screenshotCount: 0, sourceUrlVerified: false }, undefined, undefined);
    expect(base.score).toBe(0);
    const image = { postRef: p.postRef, assetRef: "asset:x", classification: "workflow_canvas" as const, altText: "", source: "curator" as const };
    const full = scorePost({ ...p, sourceUrlVerified: true, comments: [1, 2].map((i) => ({ ...p.comments[0], commentRef: "comment:x" + i, body: "x".repeat(80) })) }, undefined, indexInput(input).profileOfPost.get(p.postRef), image);
    expect(full.reasons.join(" ")).toMatch(/suitable image \+5.*workflow file \+4.*substantive comments \+2.*verified link \+1/);
  });

  it("falls back to the post notes when the editor leaves a spotlight out, and never drops the section", async () => {
    const nl = copy(E.MOCK_FIXTURE.newsletterClean);
    nl.spotlights = [];
    const { input, draft } = await draftFor({ ...E.NAMED_SCENARIOS.clean, "newsletter-editor": [{ json: nl }] });
    const r = renderNewsletter({ input, draft });
    expect(r.quality.spotlights).toBe(draft.selection.spotlights.length);
    const note = draft.postNotes.find((n) => n.postRef === draft.selection.spotlights[0].postRef)!;
    expect(r.html).toContain(esc((note.workflowPurpose ?? note.summary).text));
  });

  it("still picks spotlights in code when the selector stage fails", async () => {
    const { draft } = await draftFor({ ...E.NAMED_SCENARIOS.clean, "spotlight-pattern-selector": [{ raw: "not json" }] });
    expect(draft.selection.spotlights.length).toBeGreaterThanOrEqual(SPOTLIGHT_MIN);
  });
});

describe("every build", () => {
  it("lists every post exactly once, in validated groups", async () => {
    const { input, draft } = await draftFor();
    const { html } = renderNewsletter({ input, draft });
    const brief = html.slice(html.indexOf("02 — In brief"), html.indexOf("Most discussed"));
    input.posts.forEach((p) => expect(brief.split("<i>" + esc(p.title) + "</i>").length - 1, p.postRef).toBe(1));
    expect(draft.buildGroups.groups.at(-1)!.title).toBe("Other builds");
  });

  it("rejects bad group titles and unknown or repeated posts; every post still appears once", () => {
    const input = E.syntheticEditorialInput();
    const idx = indexInput(input);
    const refs = input.posts.map((p) => p.postRef);
    const r = validateBuildGroups(idx, { groups: [
      { title: "Top 3 builds", postRefs: [refs[0]] },
      { title: "Planning", postRefs: [refs[1], refs[1], "post:nope"] },
      { title: "The best workflows", postRefs: [refs[2]] },
    ] });
    expect(r.buildGroups.groups.map((g) => g.title)).toContain("Planning");
    expect(r.buildGroups.groups.map((g) => g.title)).not.toContain("Top 3 builds");
    expect(r.diagnostics.titles.filter((t) => !t.accepted).map((t) => t.reason)).toEqual(["contains a number", expect.stringMatching(/names a student, ranks or uses hype/)]);
    expect(r.buildGroups.groups.flatMap((g) => g.postRefs).sort()).toEqual([...refs].sort());
  });

  it("caps the number of groups at eight", () => {
    const input = E.syntheticEditorialInput();
    const groups = input.posts.map((p, i) => ({ title: ["Recipes", "Calendars", "News feeds", "Expenses", "Support desks", "Flights", "Lectures", "Meetings"][i], postRefs: [p.postRef] }));
    const r = validateBuildGroups(indexInput(input), { groups });
    expect(r.buildGroups.groups.length).toBeLessThanOrEqual(8);
    expect(r.buildGroups.groups.flatMap((g) => g.postRefs)).toHaveLength(input.posts.length);
  });
});

describe("metrics and images", () => {
  it("shows other code-counted totals, never zero, when no assets were supplied, and a dash only when none exist", async () => {
    const { input, draft } = await draftFor();
    const m = (ref: string) => input.metrics.find((x) => x.ref === ref)!.value;
    input.metrics.forEach((x) => { if (x.ref === "metric:workflowFiles" || x.ref === "metric:screenshots") x.value = null; });
    const cells = (html: string) => [...html.slice(html.indexOf('class="num"'), html.indexOf(">commenters<")).matchAll(/class="num"[^>]*>([^<]+)</g)].map((x) => x[1]);
    let html = renderNewsletter({ input, draft }).html;
    expect(html).not.toMatch(/>workflow files<|>images</);
    expect(cells(html).slice(2)).toEqual([String(m("metric:uniqueAuthors")), String(m("metric:uniqueCommenters"))]);
    input.metrics.forEach((x) => { if (x.ref === "metric:uniqueAuthors" || x.ref === "metric:uniqueCommenters") x.value = null; });
    html = renderNewsletter({ input, draft }).html;
    expect(cells(html).slice(2)).toEqual(["&ndash;", "&ndash;"]);
  });

  it("marks spotlight and every-build blocks to stay on one PDF page", async () => {
    const { input, draft } = await draftFor();
    const { html } = renderNewsletter({ input, draft });
    expect(html).toContain(".keep { break-inside: avoid; page-break-inside: avoid; }");
    expect(html.match(/class="keep"/g)!.length).toBeGreaterThanOrEqual(draft.selection.spotlights.length + input.posts.length);
  });
});

describe("publication gate", () => {
  it("passes a complete issue and refuses one with too few spotlights", async () => {
    const { input, draft } = await draftFor();
    const ok = renderNewsletter({ input, draft });
    expect(() => assertPublicationQuality(input, ok)).not.toThrow();
    const thin = { ...ok, quality: { ...ok.quality, spotlights: 2 } };
    expect(() => assertPublicationQuality(input, thin)).toThrow(/NEWSLETTER_QUALITY_INCOMPLETE/);
    const bare = copy(input);
    bare.workflowProfiles = [];
    bare.posts.forEach((p) => { p.workflowProfileRef = null; p.images = []; });
    expect(() => assertPublicationQuality(bare, thin)).toThrow(/NEEDS_ASSETS/);
    expect(() => assertPublicationQuality(input, { ...ok, quality: { ...ok.quality, everyBuild: 3 } })).toThrow(/NEWSLETTER_QUALITY_INCOMPLETE/);
  });

  it("chooseSpotlights reports how many posts were eligible", async () => {
    const { input, draft } = await draftFor();
    const r = chooseSpotlights(indexInput(input), draft.postNotes, draft.buildGroups, []);
    expect(r.eligible).toBeGreaterThanOrEqual(r.spotlights.length);
    expect(r.scores).toHaveLength(input.posts.length);
  });
});
